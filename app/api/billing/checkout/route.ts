import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { createTransaction, paddleConfigured, changeSubscriptionPlan } from "@/lib/billing/paddle";
import { PURCHASABLE } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/billing/plans";

/**
 * Start a checkout, or move an existing subscription to another plan.
 *
 * The plan comes from the body but is validated against PURCHASABLE, and the
 * price id is resolved server-side — the browser never names a price. An
 * already-subscribed user is switched in place (Paddle prorates) rather than
 * being sold a second subscription.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  if (!paddleConfigured()) {
    throw new AppError("Payments aren't configured yet. Please contact support.", 503);
  }

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  const target = PURCHASABLE.find((p) => p.id === plan);
  if (!target) throw new AppError("Unknown plan", 400);

  const [user, sub] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.subscription.findUnique({ where: { userId } }),
  ]);
  if (!user) throw new AppError("User not found", 404);

  // Already paying: change the plan on the existing subscription so the
  // customer keeps one billing relationship and Paddle handles proration.
  if (sub?.providerSubId && (sub.status === "active" || sub.status === "past_due")) {
    if (sub.planId === target.id) {
      throw new AppError(`You're already on ${target.name}.`, 400);
    }
    await changeSubscriptionPlan(sub.providerSubId, target.id as PlanId);
    return NextResponse.json(
      { message: `Switched to ${target.name}. Your next invoice is prorated.`, changed: true },
      { status: 200 }
    );
  }

  const { transactionId } = await createTransaction({
    plan: target.id as PlanId,
    userId,
    email: user.email,
    customerId: sub?.providerCustomerId,
  });

  // The browser opens this transaction in the Paddle overlay. Entitlements are
  // NOT granted here — the webhook is the only thing that promotes a plan.
  return NextResponse.json({ transactionId }, { status: 200 });
});
