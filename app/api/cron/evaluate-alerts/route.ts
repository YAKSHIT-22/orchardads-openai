import { prisma } from "@/lib/prisma";
import { runAlertsForOrg } from "@/lib/alerts/run";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled evaluation of every enabled Orchard Watch alert, across all users.
 * Invoked by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` — we reject anything that doesn't match
 * so the endpoint isn't publicly runnable.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alerts = await prisma.alert.findMany({ where: { enabled: true } });

  // Group by user+org so each group shares its Apple token + report cache.
  const groups = new Map<string, { userId: string; adAccountId: string; alerts: typeof alerts }>();
  for (const a of alerts) {
    const key = `${a.userId}:${a.adAccountId}`;
    if (!groups.has(key)) groups.set(key, { userId: a.userId, adAccountId: a.adAccountId, alerts: [] });
    groups.get(key)!.alerts.push(a);
  }

  // Resolve emails once per user.
  const userIds = [...new Set(alerts.map((a) => a.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  let alertsRun = 0;
  let eventsCreated = 0;
  let entitiesActioned = 0;
  const errors: string[] = [];

  for (const { userId, adAccountId, alerts: groupAlerts } of groups.values()) {
    try {
      const results = await runAlertsForOrg({
        userId, adAccountId, alerts: groupAlerts, persist: true, userEmail: emailById.get(userId),
      });
      alertsRun += results.length;
      eventsCreated += results.reduce((s, r) => s + r.newEvents, 0);
      entitiesActioned += results.reduce((s, r) => s + r.appliedCount, 0);
    } catch (e: any) {
      errors.push(`${userId}:${adAccountId} — ${e?.message || "failed"}`);
    }
  }

  return NextResponse.json(
    { message: "Alert evaluation complete", groups: groups.size, alertsRun, eventsCreated, entitiesActioned, errors },
    { status: 200 }
  );
}
