import { prisma } from "@/lib/prisma";
import { runScheduledReport, isDue } from "@/lib/reports/runScheduledReport";
import { runStrategyAuto } from "@/lib/autopilot/run";
import { sendAutopilotEmail } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function nextRun(freq: string): Date {
  const d = new Date();
  if (freq === "DAILY") d.setDate(d.getDate() + 1);
  else if (freq === "MONTHLY") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Send all due scheduled reports. */
async function processReports() {
  const schedules = await prisma.reportSchedule.findMany({ where: { enabled: true } });
  const now = new Date();
  let sent = 0;
  const errors: string[] = [];
  for (const schedule of schedules) {
    if (!isDue(schedule, now)) continue;
    try {
      const res = await runScheduledReport(schedule);
      if (res.sent) sent++;
      else if (res.error) errors.push(`${schedule.id}: ${res.error}`);
    } catch (e: any) {
      errors.push(`${schedule.id}: ${e?.message || "failed"}`);
    }
  }
  return { considered: schedules.length, sent, errors };
}

/** Run all due automated Autopilot strategies (apply or notify per config). */
async function processStrategies() {
  const now = new Date();
  const due = await prisma.strategy.findMany({
    where: { automated: true, enabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
  });

  const emailById = new Map<string, string>();
  const userIds = [...new Set(due.map((s) => s.userId))];
  if (userIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
    for (const u of users) emailById.set(u.id, u.email);
  }

  let ran = 0, applied = 0;
  const errors: string[] = [];
  for (const strategy of due) {
    const res = await runStrategyAuto(strategy.userId, strategy.adAccountId, strategy);
    ran++; applied += res.applied;
    if (res.error) errors.push(`${strategy.id}: ${res.error}`);
    if (strategy.notifyEmail && res.suggestions.length > 0) {
      const to = emailById.get(strategy.userId);
      if (to) { try { await sendAutopilotEmail(to, strategy, res.suggestions, res.applied); } catch { /* non-fatal */ } }
    }
    await prisma.strategy.update({ where: { id: strategy.id }, data: { nextRunAt: nextRun(strategy.frequency) } }).catch(() => {});
  }
  return { ran, applied, errors };
}

/**
 * Combined daily cron: scheduled reports + automated Autopilot strategies.
 * Merged into one endpoint to stay within the Vercel Hobby 2-cron limit
 * (Orchard Watch alerts keep their own cron). Auth via CRON_SECRET; a failure in
 * one job doesn't stop the other. Invoked by Vercel Cron (see vercel.json).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await processReports().catch((e) => ({ considered: 0, sent: 0, errors: [`reports: ${e?.message || "failed"}`] }));
  const strategies = await processStrategies().catch((e) => ({ ran: 0, applied: 0, errors: [`strategies: ${e?.message || "failed"}`] }));

  return NextResponse.json({ message: "Reports + strategies processed", reports, strategies }, { status: 200 });
}
