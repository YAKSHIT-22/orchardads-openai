/**
 * Centralized OpenAI Ads API error handling.
 *
 * IMPORTANT: the OpenAI Ads API publishes **no error schema at all** — the official OpenAPI spec documents only 200 responses. So
 * this module is deliberately defensive: it probes several plausible envelope
 * shapes, and always produces a usable error even when the body is empty, HTML,
 * or something we have never seen.
 *
 * The four failure modes the official docs *do* describe are mapped explicitly,
 * because each one means "OpenAI has not enabled a capability for this ad
 * account" rather than "you sent a bad request" — a distinction the UI must
 * make, since the fix is "contact your OpenAI rep", not "change your input".
 * See docs/research/openai-ads-api-analysis.md §0.3.
 */

export type AdsFieldError = {
  /** Machine-readable code, ours or upstream's. */
  code: string;
  /** Human-readable message (friendly override when we have one). */
  message: string;
  /** Dot-path the error is attributed to, e.g. "budget.lifetime_spend_limit_micros". */
  field: string;
};

/** A generic application error carrying an HTTP status. */
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

/** Raised when the OpenAI Ads API rejects a request. */
export class AdsApiError extends AppError {
  errors: AdsFieldError[];
  /** Raw upstream payload, for logging. Never contains our credentials. */
  raw: unknown;
  /** True when the failure is "capability not enabled for this account". */
  capabilityGated: boolean;

  constructor(status: number, errors: AdsFieldError[], raw?: unknown, capabilityGated = false) {
    const summary = errors[0]?.message || "OpenAI Ads request failed";
    super(summary, status);
    this.name = "AdsApiError";
    this.errors = errors;
    this.raw = raw;
    this.capabilityGated = capabilityGated;
  }
}

/**
 * Capabilities OpenAI enables per ad account. Each entry pairs the detection
 * signal with the message we show, so a gated feature explains itself instead of
 * surfacing a bare 403/404.
 */
export type GatedCapability =
  | "brandUpdates"
  | "conversionPixels"
  | "conversionApiKeys"
  | "conversionBidding"
  | "bulkApi"
  | "insightsSegments";

const CAPABILITY_MESSAGES: Record<GatedCapability, string> = {
  brandUpdates:
    "Programmatic brand updates aren't enabled for this ad account. Ask your OpenAI partner representative to enable them, or set the brand icon in Ads Manager.",
  conversionPixels:
    "Pixel management isn't enabled for this ad account. Create the pixel in Ads Manager, or ask your OpenAI partner representative to enable API access.",
  conversionApiKeys:
    "Conversions API key creation isn't enabled for this ad account. Ask your OpenAI partner representative to enable it.",
  conversionBidding:
    "Conversion bidding isn't enabled for this ad account, so conversion-optimized campaigns can't be created. Ask your OpenAI partner representative to enable it.",
  bulkApi:
    "The Bulk API is in limited preview and isn't enabled for this ad account. We'll apply these changes one at a time instead.",
  insightsSegments:
    "Segmented insights (product / country / device breakdowns) aren't enabled for this ad account.",
};

/**
 * Detect the documented capability gates from the status + path + body.
 *
 * Documented signals (api-partner-setup, "Before you begin"):
 *   403 on POST /ad_account/brand                      -> brand updates
 *   404 "Not found" on /conversions/pixels             -> pixel management
 *   404 "Not found" on /conversions/api_keys           -> Conversions API keys
 *   403 "Conversion bidding is not enabled"            -> conversion bidding
 *   404 on any /bulk_mutation_jobs path                -> Bulk API (limited preview)
 */
export function detectGatedCapability(
  status: number,
  path: string,
  body: unknown
): GatedCapability | null {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");

  if (status === 403 && /conversion bidding is not enabled/i.test(text)) return "conversionBidding";
  if (status === 403 && path.startsWith("/ad_account/brand")) return "brandUpdates";
  if (status === 404 && path.startsWith("/conversions/pixels")) return "conversionPixels";
  if (status === 404 && path.startsWith("/conversions/api_keys")) return "conversionApiKeys";
  if (status === 404 && path.startsWith("/bulk_mutation_jobs")) return "bulkApi";

  return null;
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHORIZED:
    "OpenAI rejected this ad account's API key. It may have been revoked or rotated in Ads Manager — reconnect the account in Settings.",
  ACCESS_DENIED: "This API key isn't permitted to perform that action on this ad account.",
  RATE_LIMIT_EXCEEDED:
    "OpenAI Ads rate limit reached (600 requests/minute per endpoint, 1,200 overall). Retrying shortly.",
  NOT_FOUND: "That resource doesn't exist on this ad account, or the account can't see it.",
  CONFLICT:
    "This resource changed while the request was in flight. Reload the current values and try again.",
  VALIDATION_FAILED: "OpenAI Ads rejected the request values.",
  SERVER_ERROR: "OpenAI Ads returned a server error. This is usually transient.",
};

/** Pull a message out of any of the envelope shapes we might be handed. */
function extractMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 500) || null;

  const b = body as Record<string, any>;
  // Common OpenAI platform shape: { error: { message, code, param, type } }
  if (b.error && typeof b.error === "object") {
    if (typeof b.error.message === "string") return b.error.message;
  }
  if (typeof b.error === "string") return b.error;
  if (typeof b.message === "string") return b.message;
  if (typeof b.detail === "string") return b.detail;
  // FastAPI-style: { detail: [{ loc, msg, type }] }
  if (Array.isArray(b.detail) && b.detail.length) {
    const first = b.detail[0];
    if (typeof first?.msg === "string") return first.msg;
  }
  return null;
}

/** Pull a field path out of the same shapes, when one is present. */
function extractField(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, any>;
  if (typeof b.error?.param === "string") return b.error.param;
  if (Array.isArray(b.detail) && Array.isArray(b.detail[0]?.loc)) {
    return b.detail[0].loc.filter((p: unknown) => typeof p === "string").join(".");
  }
  return "";
}

function extractCode(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, any>;
    if (typeof b.error?.code === "string") return b.error.code.toUpperCase();
    if (typeof b.code === "string") return b.code.toUpperCase();
  }
  const byStatus: Record<number, string> = {
    400: "VALIDATION_FAILED",
    401: "UNAUTHORIZED",
    403: "ACCESS_DENIED",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "RATE_LIMIT_EXCEEDED",
  };
  return byStatus[status] || (status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED");
}

/**
 * Normalize any OpenAI Ads response body (or transport failure) into an
 * AdsApiError with a populated `errors` array.
 */
export function normalizeAdsError(status: number, body: unknown, path = ""): AdsApiError {
  const gated = detectGatedCapability(status, path, body);
  if (gated) {
    return new AdsApiError(
      status,
      [{ code: `CAPABILITY_NOT_ENABLED_${gated.toUpperCase()}`, message: CAPABILITY_MESSAGES[gated], field: "" }],
      body,
      true
    );
  }

  const code = extractCode(body, status);
  const upstream = extractMessage(body);
  const message = upstream || FRIENDLY_MESSAGES[code] || `OpenAI Ads request failed (HTTP ${status}).`;

  // A documented conflict on concurrent audience membership edits.
  if (status === 409 && /custom_audience_mutation_conflict/i.test(String(upstream ?? ""))) {
    return new AdsApiError(
      409,
      [
        {
          code: "CUSTOM_AUDIENCE_MUTATION_CONFLICT",
          message:
            "An audience membership update is still running, so this edit wasn't applied. Wait for it to finish, re-read the current settings, and retry.",
          field: "targeting.custom_audiences",
        },
      ],
      body
    );
  }

  return new AdsApiError(status, [{ code, message, field: extractField(body) }], body);
}

/** Shape returned to the client for any failed request. Never leaks credentials. */
export function errorResponseBody(err: unknown): {
  error: string;
  code?: string;
  errors?: AdsFieldError[];
  capabilityGated?: boolean;
} {
  if (err instanceof AdsApiError) {
    return {
      error: err.message,
      code: err.errors[0]?.code,
      errors: err.errors,
      ...(err.capabilityGated ? { capabilityGated: true } : {}),
    };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  return { error: "Internal Server Error" };
}
