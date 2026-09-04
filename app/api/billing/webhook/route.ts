import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, planForPriceId } from "@/lib/billing/paddle";
import type { PlanId } from "@/lib/billing/plans";

/**
 * Paddle webhook — the ONLY thing that grants or removes a paid plan.
 *
 * Deliberately not behind withAdsRoute: Paddle has no session cookie. Its
 * authentication IS the signature, computed over the raw body, so this route
 * reads text() and never req.json() — re-serialising parsed JSON changes the
 * bytes and the HMAC would never match.
 *
 * Always answers 200 once the signature is valid, even if we then fail to make
 * sense of the payload. A non-2xx makes Paddle retry with backoff and
 * eventually disable the endpoint, and an event we don't model is not a
 * failure worth losing the endpoint over. Genuine problems are logged.
 */
export const dynamic = "force-dynamic";

type PaddleEvent = {
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    scheduled_change?: { action?: string; effective_at?: string } | null;
    current_billing_period?: { starts_at?: string; ends_at?: string } | null;
    items?: { price?: { id?: string } }[];
    custom_data?: { user_id?: string } | null;
    subscription_id?: string;
  };
};

const d = (v: string | undefined | null): Date | null => (v ? new Date(v) : null);

export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifyWebhookSignature(raw, req.headers.get("paddle-signature"))) {
    // Covers a bad secret, a tampered body, and a replayed old signature.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let evt: PaddleEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  try {
    const type = evt.event_type ?? "";
    const data = evt.data ?? {};

    if (!type.startsWith("subscription.")) {
      return NextResponse.json({ received: true, ignored: type }, { status: 200 });
    }

    // Attribute the event. custom_data.user_id is stamped by us when the
    // transaction is created; fall back to the Paddle customer id for events
    // that don't carry it (a renewal, say).
    const userId =
      data.custom_data?.user_id ??
      (data.customer_id
        ? (
            await prisma.subscription.findFirst({
              where: { providerCustomerId: data.customer_id },
              select: { userId: true },
            })
          )?.userId
        : undefined);

    if (!userId) {
      console.error("Paddle webhook: cannot attribute event", type, data.id);
      return NextResponse.json({ received: true, unattributed: true }, { status: 200 });
    }

    const priceId = data.items?.[0]?.price?.id;
    const plan = planForPriceId(priceId);

    // Map Paddle's status onto ours. `paused` has no paid equivalent here, so
    // it reads as expired: access to their own data continues, writing stops.
    const statusMap: Record<string, "active" | "past_due" | "canceled" | "expired"> = {
      active: "active",
      trialing: "active",
      past_due: "past_due",
      paused: "expired",
      canceled: "canceled",
    };
    const status = statusMap[data.status ?? ""] ?? "active";

    const periodStart = d(data.current_billing_period?.starts_at);
    const periodEnd = d(data.current_billing_period?.ends_at);
    const cancelScheduled = data.scheduled_change?.action === "cancel";

    const base = {
      provider: "paddle",
      providerCustomerId: data.customer_id ?? undefined,
      providerSubId: data.id ?? undefined,
      status,
      cancelAtPeriodEnd: cancelScheduled,
      canceledAt: type === "subscription.canceled" ? new Date() : null,
      ...(plan ? { planId: plan as PlanId } : {}),
      ...(periodStart ? { currentPeriodStart: periodStart } : {}),
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    };

    await prisma.subscription.upsert({
      where: { userId },
      update: base,
      // A user always has a trial row by the time they check out, but upsert
      // keeps the webhook independent of that ordering.
      create: { userId, trialStartedAt: new Date(), ...base, planId: (plan ?? "basic") as PlanId },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        adAccountId: null,
        action: `PADDLE_${type.replace(/\./g, "_").toUpperCase()}`,
        entityType: "SUBSCRIPTION",
        entityId: data.id ?? "-",
        meta: { status, planId: plan, periodEnd: periodEnd?.toISOString() ?? null },
      },
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Signature was valid, so this is our bug, not a hostile caller. Swallow it
    // rather than let Paddle disable the endpoint over a retry storm.
    console.error("Paddle webhook handling failed:", err);
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }
}
