import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { runAlertsForOrg } from "@/lib/alerts/run";
import { NextResponse } from "next/server";

/**
 * Manually evaluate alerts for an org (or a single alert). Persists new firings
 * as AlertEvents and sends email for notifyEmail alerts — same path as the cron.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, alertId } = await req.json();
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const alerts = await prisma.alert.findMany({
    where: { userId, adAccountId: String(adAccountId), enabled: true, ...(alertId ? { id: alertId } : {}) },
  });
  if (alerts.length === 0) {
    return NextResponse.json({ results: [], message: "No enabled alerts to run" }, { status: 200 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const results = await runAlertsForOrg({
    userId, adAccountId: String(adAccountId), alerts, persist: true, userEmail: user?.email,
  });

  return NextResponse.json({ results }, { status: 200 });
});
