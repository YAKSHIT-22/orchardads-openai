/**
 * Server-side reCAPTCHA v2 verification.
 *
 * Three rules this centralises, because all three were wrong or missing in at
 * least one auth route before:
 *
 *  1. When a secret is configured the token is REQUIRED. Checking
 *     `if (recaptchaToken)` lets any caller skip the check by omitting the
 *     field, which is worse than having no captcha at all — it looks protected.
 *  2. The token goes in a form-encoded body, not interpolated into the URL.
 *     A token is attacker-supplied text; it does not belong in a query string.
 *  3. A verification that cannot reach Google FAILS CLOSED. Failing open means
 *     anyone able to block egress to google.com bypasses the control. Callers
 *     surface this as a 503, so an outage reads as an outage rather than as
 *     "invalid captcha".
 *
 * With no secret configured (local dev) verification is skipped entirely.
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const TIMEOUT_MS = 5000;

export type RecaptchaResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

export async function verifyRecaptcha(
  token: unknown,
  remoteIp?: string
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true }; // Not configured — nothing to enforce.

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, status: 400, error: "reCAPTCHA verification required" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    // Never log the token itself.
    console.error("reCAPTCHA verification unreachable:", err);
    return {
      ok: false,
      status: 503,
      error: "Could not verify reCAPTCHA right now. Please try again.",
    };
  }

  if (!data.success) {
    return { ok: false, status: 400, error: "Invalid reCAPTCHA" };
  }
  return { ok: true };
}
