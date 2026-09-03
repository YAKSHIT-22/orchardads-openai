import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

/**
 * Triggered-alert events for the triggered-alerts tray. Filters: status
 * (default excludes DISMISSED), kind, severity. Snoozed events whose snooze has
 * elapsed are treated as active again.
 */
export const GET = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "alerts");

  const url = new URL(req.url);
  const adAccountId = url.searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const status = url.searchParams.get("status"); // new | all
  const severity = url.searchParams.get("severity");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  const now = new Date();
  const where: any = { userId, adAccountId: String(adAccountId) };
  where.NOT = { status: "DISMISSED" };
  if (status === "new") where.status = "NEW";
  if (severity) where.severity = severity;

  const events = await prisma.alertEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { alert: { select: { name: true, kind: true } } },
  });

  // A snooze that has elapsed shouldn't hide/mute the event any more.
  const normalized = events.map((e) => ({
    ...e,
    effectiveSnoozed: e.status === "SNOOZED" && e.snoozedUntil ? e.snoozedUntil > now : false,
  }));

  return NextResponse.json({ events: normalized }, { status: 200 });
});
