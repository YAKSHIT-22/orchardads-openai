import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { JWT_SECRET } from "@/utils/variableConstant";
import { prisma } from "@/lib/prisma";
import { resolveConnection, providerFor, redact } from "./credentials";
import { AppError, AdsApiError, normalizeAdsError, errorResponseBody, detectGatedCapability } from "./errors";
import { acquireRateLimitSlot } from "./rateLimit";
import type { OpenAiAdsConnection } from "@prisma/client";

export { AppError, AdsApiError };

/**
 * The single choke point for every call to the OpenAI Ads API.
 *
 * Nothing else in the codebase may call `api.ads.openai.com` directly — that
 * rule is what makes credential handling, rate limiting, retries, capability
 * detection and audit logging enforceable rather than aspirational.
 */

export const ADS_BASE = "https://api.ads.openai.com/v1";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Verify the session cookie and return the authenticated userId, or throw 401. */
export async function getUserId(): Promise<string> {
  const token = (await cookies()).get("token")?.value;
  if (!token) throw new AppError("Not authenticated", 401);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = (payload as Record<string, unknown>).userId;
    if (!userId) throw new Error("no userId");
    return userId as string;
  } catch {
    throw new AppError("User Login Expired", 401);
  }
}

export type AdsFetchOptions = {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  /** Ad account to route to. Omit when an explicit connectionId is given. */
  adAccountId?: string | null;
  /** Force a specific connection. */
  connectionId?: string | null;
  body?: unknown;
  /**
   * Query parameters. Values may be arrays — the OpenAI Ads API expects
   * repeated keys for `filters[]`, `sort[]`, `time_ranges[]`, `fields[]`,
   * `include[]` and `segments[]`, each carrying a JSON-encoded object.
   */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  /** Idempotency-Key header (bulk jobs, and any write we may retry). */
  idempotencyKey?: string;
  /** Skip the shared rate-limit governor. Only for connection validation. */
  skipRateLimit?: boolean;
};

/** Build a query string with repeated keys for array values. */
export function buildQuery(query: AdsFetchOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Perform an authenticated call to the OpenAI Ads API with:
 *  - credential resolution through the CredentialProvider (never a raw key here)
 *  - a rate-limit slot honouring the documented 600/min per-endpoint and
 *    1,200/min overall limits, which OpenAI enforces per ad account AND per IP
 *  - exponential backoff on 429 (honouring Retry-After) and 5xx
 *  - capability-gate detection, cached onto the connection so the UI can explain
 *    *why* something is unavailable instead of showing a bare 403/404
 *  - normalized errors (throws AdsApiError with field-level details)
 *
 * Returns the parsed JSON body on success.
 */
export async function adsFetch<T = unknown>(
  userId: string,
  path: string,
  {
    method = "GET",
    adAccountId,
    connectionId,
    body,
    query,
    idempotencyKey,
    skipRateLimit,
  }: AdsFetchOptions = {}
): Promise<T> {
  const connection = await resolveConnection(userId, { adAccountId, connectionId });
  return adsFetchWithConnection<T>(connection, path, {
    method,
    body,
    query,
    idempotencyKey,
    skipRateLimit,
  });
}

/**
 * Same as `adsFetch`, but against a connection already in hand. Used by the sync
 * worker, which resolves the connection once and then makes hundreds of calls.
 */
export async function adsFetchWithConnection<T = unknown>(
  connection: OpenAiAdsConnection,
  path: string,
  {
    method = "GET",
    body,
    query,
    idempotencyKey,
    skipRateLimit,
  }: Omit<AdsFetchOptions, "adAccountId" | "connectionId"> = {}
): Promise<T> {
  const url = `${ADS_BASE}${path}${buildQuery(query)}`;
  const provider = providerFor(connection);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (!skipRateLimit) {
      await acquireRateLimitSlot(connection.adAccountId, path);
    }

    const auth = await provider.authHeaders(attempt > 0 && provider.canRefresh);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          // FormData sets its own Content-Type WITH the multipart boundary.
          // Setting it here would produce a boundary-less header and the
          // upload would be rejected as malformed.
          ...(body !== undefined && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          ...auth,
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (networkErr) {
      // DNS/TLS/socket failure. Retry like a 5xx, then give up as 503.
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw new AppError("Couldn't reach the OpenAI Ads API. Please try again.", 503);
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json().catch(() => ({}))) as T;
    }

    const raw = await res.text().catch(() => "");
    let payload: unknown = raw;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      /* keep the text — the body may be HTML from a proxy */
    }

    // A 401 means the advertiser revoked or rotated the key in Ads Manager.
    // There is no refresh for an API key and OpenAI sends us no revocation
    // signal, so this 401 IS the signal: mark the connection and stop retrying.
    if (res.status === 401) {
      await markConnectionInvalid(connection.id, "OpenAI rejected this ad account's API key.");
      throw normalizeAdsError(401, payload, path);
    }

    // Cache a discovered capability gate so the UI can explain it without
    // re-provoking the same failure on every page load.
    const gated = detectGatedCapability(res.status, path, payload);
    if (gated) {
      await recordCapability(connection, gated, false);
      throw normalizeAdsError(res.status, payload, path);
    }

    const isTransient = res.status === 429 || res.status >= 500;
    if (isTransient && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter
        ? Math.max(1, parseInt(retryAfter, 10)) * 1000
        : BASE_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(delay);
      continue;
    }

    throw normalizeAdsError(res.status, payload, path);
  }

  throw new AppError("OpenAI Ads request failed after retries", 503);
}

async function markConnectionInvalid(connectionId: string | undefined, reason: string) {
  // Undefined during connect-time validation, where no row exists yet.
  if (!connectionId) return;
  await prisma.openAiAdsConnection
    .update({ where: { id: connectionId }, data: { status: "INVALID", lastError: reason } })
    .catch(() => {});
}

async function recordCapability(
  connection: OpenAiAdsConnection,
  capability: string,
  enabled: boolean
) {
  if (!connection.id) return;
  const current = (connection.capabilities as Record<string, boolean> | null) ?? {};
  if (current[capability] === enabled) return;
  await prisma.openAiAdsConnection
    .update({
      where: { id: connection.id },
      data: { capabilities: { ...current, [capability]: enabled } },
    })
    .catch(() => {});
}

type RouteHandler = (ctx: {
  userId: string;
  req: NextRequest;
  params?: Record<string, string>;
}) => Promise<NextResponse>;

/**
 * Wrap a route handler with authentication + consistent error responses.
 *
 * Note the 401 -> 403 remap: an upstream credential failure must NOT surface as
 * a 401, because the client interceptor treats 401 as an expired *app* session
 * and force-redirects to /signin, destroying in-progress work. (Carried over
 * this bug has bitten before.)
 */
export function withAdsRoute(handler: RouteHandler) {
  return async (
    req: NextRequest,
    ctx?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const userId = await getUserId();
      const params = ctx?.params ? await ctx.params : undefined;
      return await handler({ userId, req, params });
    } catch (err) {
      if (err instanceof AdsApiError) {
        const status = err.status === 401 ? 403 : err.status;
        return NextResponse.json(errorResponseBody(err), { status });
      }
      if (err instanceof AppError) {
        return NextResponse.json(errorResponseBody(err), { status: err.status });
      }
      console.error("Unhandled route error:", redact(err));
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  };
}

/**
 * Walk a cursor-paginated list endpoint to completion.
 *
 * Every list endpoint in this API uses the same envelope
 * ({ data[], has_more, last_id }) and the same `limit`/`after` params, so one
 * helper covers campaigns, ad groups, ads, audiences, feeds and insights.
 * `maxPages` is a safety valve: an account is capped at 5,000 entities, so
 * 50 pages of 100 covers the documented ceiling.
 */
export async function paginate<T>(
  connection: OpenAiAdsConnection,
  path: string,
  query: AdsFetchOptions["query"] = {},
  { limit = 100, maxPages = 50 }: { limit?: number; maxPages?: number } = {}
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await adsFetchWithConnection<{
      data?: T[];
      has_more?: boolean;
      last_id?: string | null;
    }>(connection, path, { query: { ...query, limit, ...(after ? { after } : {}) } });

    const batch = res?.data ?? [];
    out.push(...batch);

    if (!res?.has_more || !res?.last_id || batch.length === 0) break;
    after = res.last_id;
  }

  return out;
}
