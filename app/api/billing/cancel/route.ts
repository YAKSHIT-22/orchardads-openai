import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { cancelSubscription } from "@/lib/billing/paddle";

/**
 * Cancel at the end of the paid period.
 *
 * Never immediate: the month is already paid for, and cutting access on click
 * would be taking money for time not served. `effectivePlan` already keeps a
 * canceled subscription working until currentPeriodEnd.
 */
export const POST = withAdsRoute(async ({ userId }) => {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.providerSubId) throw new AppError("No active subscription to cancel.", 400);
  if (sub.cancelAtPeriodEnd) {
    throw new AppError("This subscription is already set to cancel.", 400);
  }

  await cancelSubscription(sub.providerSubId);

  // Reflect intent immediately; the webhook confirms and sets canceledAt.
  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId: null,
      action: "SUBSCRIPTION_CANCEL_SCHEDULED",
      entityType: "SUBSCRIPTION",
      entityId: sub.providerSubId,
      meta: { planId: sub.planId, effective: sub.currentPeriodEnd },
    },
  });

  return NextResponse.json(
    { message: "Cancelled. You keep access until the end of the period you've paid for." },
    { status: 200 }
  );
});
