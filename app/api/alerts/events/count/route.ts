import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

/**
 * Unread triggered-alert count for the navbar bell. Counts NEW events, plus
 * SNOOZED events whose snooze has already elapsed. Scoped to the selected org.
 */
export const GET = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "alerts");

  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const now = new Date();
  const [newCount, elapsedSnoozed] = await Promise.all([
    prisma.alertEvent.count({ where: { userId, adAccountId: String(adAccountId), status: "NEW" } }),
    prisma.alertEvent.count({ where: { userId, adAccountId: String(adAccountId), status: "SNOOZED", snoozedUntil: { lt: now } } }),
  ]);

  return NextResponse.json({ count: newCount + elapsedSnoozed }, { status: 200 });
});
