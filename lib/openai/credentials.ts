import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { AppError } from "./errors";
import type { OpenAiAdsConnection } from "@prisma/client";

/**
 * Credential layer for the OpenAI Ads API.
 *
 * WHY THIS IS AN INTERFACE
 * ------------------------
 * The only documented way to authenticate is a bearer API key the advertiser
 * issues themselves in Ads Manager (Settings), scoped to exactly one ad account.
 *
 * But the official OpenAPI spec ALSO defines a complete `AdsOAuth`
 * authorization-code flow (authorize/token at auth.openai.com, scopes
 * ads.admin.all.read / .write / offline_access), together with `GET /me`,
 * `GET /ad_accounts`, `POST /ad_account_creation_sessions`, `POST /api_keys`
 * and an `OpenAI-Ad-Account` header on nearly every endpoint — i.e. a
 * Google-Ads-style multi-account linking flow. None of it appears in any prose
 * documentation and there is no published client registration, so there is no
 * client_id to obtain and we must not invent the flow.
 *
 * So: every request goes through a CredentialProvider. `ApiKeyProvider` ships
 * today; `OAuthProvider` is a stub that throws until OpenAI confirms the flow.
 * Swapping them later is one new class plus one callback route — not a rewrite
 * of every call site.
 *
 * See docs/research/openai-ads-api-analysis.md §0.2 and
 * docs/research/partner-access-checklist.md questions #1-#4.
 */

export type AuthHeaders = Record<string, string>;

export interface CredentialProvider {
  readonly kind: "api_key" | "oauth";
  /** Headers to attach to an upstream request. `forceRefresh` is set after a 401. */
  authHeaders(forceRefresh?: boolean): Promise<AuthHeaders>;
  /** True when a 401 might be fixed by refreshing rather than by the user reconnecting. */
  readonly canRefresh: boolean;
}

/**
 * BYO API key. The key is a static bearer token with no expiry, no scopes and
 * full write access to one ad account — the most dangerous credential class we
 * hold. It is decrypted in memory for the duration of one request and never
 * stored, logged, or returned anywhere else.
 */
export class ApiKeyProvider implements CredentialProvider {
  readonly kind = "api_key" as const;
  readonly canRefresh = false;

  constructor(private readonly connection: OpenAiAdsConnection) {}

  async authHeaders(): Promise<AuthHeaders> {
    if (!this.connection.apiKey) {
      throw new AppError("This connection has no API key. Reconnect the ad account in Settings.", 404);
    }
    return { Authorization: `Bearer ${decryptSecret(this.connection.apiKey)}` };
  }
}

/**
 * Placeholder for the spec-defined OAuth flow. Deliberately non-functional:
 * shipping a half-guessed OAuth implementation against undocumented endpoints
 * would be worse than not shipping one.
 */
export class OAuthProvider implements CredentialProvider {
  readonly kind = "oauth" as const;
  readonly canRefresh = true;

  async authHeaders(): Promise<AuthHeaders> {
    throw new AppError(
      "OAuth connections aren't available yet. OpenAI has not published a client-registration process for the Ads OAuth flow.",
      501
    );
  }
}

export function providerFor(connection: OpenAiAdsConnection): CredentialProvider {
  return new ApiKeyProvider(connection);
}

/**
 * Resolve which connection a request should use:
 *  - an explicit connectionId, or
 *  - the connection that owns the target ad account, or
 *  - the user's only connection (single-account users).
 *
 * The mapping is exact rather than cached, because each OpenAI Ads API key is
 * scoped to exactly one ad account.
 */
export async function resolveConnection(
  userId: string,
  { adAccountId, connectionId }: { adAccountId?: string | null; connectionId?: string | null }
): Promise<OpenAiAdsConnection> {
  if (connectionId) {
    const conn = await prisma.openAiAdsConnection.findFirst({ where: { id: connectionId, userId } });
    if (!conn) throw new AppError("Ad account connection not found.", 404);
    return conn;
  }

  if (adAccountId) {
    const owner = await prisma.openAiAdsConnection.findFirst({ where: { userId, adAccountId } });
    if (owner) return owner;
    throw new AppError(
      "No connected ad account matches that ID. Connect it in Settings, or pick a different account.",
      404
    );
  }

  const conns = await prisma.openAiAdsConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (conns.length === 0) {
    throw new AppError("No OpenAI Ads account is connected. Add one in Settings to continue.", 404);
  }
  if (conns.length === 1) return conns[0];

  throw new AppError("Several ad accounts are connected — pick one to continue.", 400);
}

/** Encrypt and persist a key. The plaintext never touches the database. */
export function sealApiKey(plaintext: string): { apiKey: string; apiKeyLast4: string } {
  const trimmed = plaintext.trim();
  if (!trimmed) throw new AppError("Enter your OpenAI Ads API key.", 400);
  return { apiKey: encryptSecret(trimmed), apiKeyLast4: trimmed.slice(-4) };
}

/**
 * Redact anything that looks like a credential before it can reach a log line,
 * an audit row, or an error response.
 */
export function redact<T>(value: T): T {
  const SENSITIVE = /^(authorization|api[-_]?key|apikey|secret|token|password|cookie)$/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE.test(k) ? "[redacted]" : walk(val);
      }
      return out;
    }
    if (typeof v === "string" && /^Bearer\s+\S+/i.test(v)) return "Bearer [redacted]";
    return v;
  };
  return walk(value) as T;
}
