/**
 * Paddle Billing (v2) integration.
 *
 * Paddle is the MERCHANT OF RECORD: it sells to the customer, not us. That
 * choice has consequences this module encodes:
 *   - Paddle collects and remits sales tax / VAT / GST, so nothing here
 *     computes tax and no invoice is issued by us.
 *   - The subscription lifecycle is owned by Paddle. Webhooks are the source of
 *     truth; the checkout response is not. A user who pays but whose webhook is
 *     delayed is still on their old plan for a few seconds, and that is
 *     correct — granting entitlements from a client-side success callback is
 *     how people get free plans by closing the tab at the right moment.
 *
 * Nothing here trusts the browser. Price ids are resolved server-side from our
 * own plan table, so a caller cannot post the Enterprise user id with the Basic
 * price, and `customData.userId` is stamped by us at transaction creation.
 */

import crypto from "crypto";
import type { PlanId } from "@/lib/billing/plans";

const SANDBOX = "https://sandbox-api.paddle.com";
const LIVE = "https://api.paddle.com";

/** Sandbox unless explicitly set to production — the safe default. */
export function paddleEnv(): "sandbox" | "production" {
  return process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
}

function apiBase(): string {
  return paddleEnv() === "production" ? LIVE : SANDBOX;
}

export function paddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY && priceIdFor("basic"));
}

/**
 * Our plan id -> Paddle price id.
 *
 * Kept in env rather than the code because the ids differ between sandbox and
 * production, and a hardcoded sandbox id shipped to production is a silent
 * failure — the checkout opens and charges nothing.
 */
export function priceIdFor(plan: PlanId): string | undefined {
  switch (plan) {
    case "basic":
      return process.env.PADDLE_PRICE_BASIC;
    case "pro":
      return process.env.PADDLE_PRICE_PRO;
    case "enterprise":
      return process.env.PADDLE_PRICE_ENTERPRISE;
    default:
      return undefined;
  }
}

/** Reverse lookup, for webhooks that tell us a price rather than a plan. */
export function planForPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.PADDLE_PRICE_BASIC) return "basic";
  if (priceId === process.env.PADDLE_PRICE_PRO) return "pro";
  if (priceId === process.env.PADDLE_PRICE_ENTERPRISE) return "enterprise";
  return null;
}

async function paddleFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Paddle returns { error: { detail, code } }. Log the code, never the key.
    const detail = body?.error?.detail || body?.error?.code || `HTTP ${res.status}`;
    throw new Error(`Paddle: ${detail}`);
  }
  return body as T;
}

/**
 * Create a transaction the browser can open in the Paddle overlay.
 *
 * We create it server-side rather than letting Paddle.js build one from a bare
 * price id so that `custom_data.user_id` is set by us. That field is what the
 * webhook uses to attribute a payment to an account, and it must not be
 * something the browser can choose.
 */
export async function createTransaction(opts: {
  plan: PlanId;
  userId: string;
  email: string;
  customerId?: string | null;
}): Promise<{ transactionId: string }> {
  const priceId = priceIdFor(opts.plan);
  if (!priceId) throw new Error(`No Paddle price configured for plan "${opts.plan}"`);

  const payload: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { user_id: opts.userId },
  };
  // Reuse the Paddle customer when we already have one, so a returning
  // subscriber isn't duplicated and keeps their billing history.
  if (opts.customerId) payload.customer_id = opts.customerId;

  const res = await paddleFetch<{ data: { id: string } }>("/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { transactionId: res.data.id };
}

/** Cancel at period end — never immediately; they paid for the month. */
export async function cancelSubscription(subId: string): Promise<void> {
  await paddleFetch(`/subscriptions/${subId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
}

/** Move an existing subscription to a different plan, prorated by Paddle. */
export async function changeSubscriptionPlan(subId: string, plan: PlanId): Promise<void> {
  const priceId = priceIdFor(plan);
  if (!priceId) throw new Error(`No Paddle price configured for plan "${plan}"`);
  await paddleFetch(`/subscriptions/${subId}`, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
    }),
  });
}

/**
 * Verify the `Paddle-Signature` header.
 *
 * Format: `ts=<unix>;h1=<hex hmac>`, where the HMAC is SHA-256 over
 * `<ts>:<raw request body>` keyed with the endpoint's secret. The RAW body
 * matters — re-serialising parsed JSON changes the bytes and the signature
 * will never match.
 *
 * Returns false rather than throwing, so the caller answers 400 without
 * leaking which part failed.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(";").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k.trim(), rest.join("=").trim()];
    })
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  // Reject stale signatures so a captured webhook can't be replayed later.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(h1, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
