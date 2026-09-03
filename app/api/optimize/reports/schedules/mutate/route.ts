import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { runScheduledReport } from "@/lib/reports/runScheduledReport";
import { NextResponse } from "next/server";

/** Toggle-enabled, delete, or send-now a report schedule the caller owns. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "scheduled_reports");

  const { id, action, enabled } = await req.json();
  if (!id || !action) throw new AppError("id and action required", 400);

  const schedule = await prisma.reportSchedule.findFirst({ where: { id: String(id), userId } });
  if (!schedule) throw new AppError("Schedule not found", 404);

  if (action === "delete") {
    await prisma.reportSchedule.delete({ where: { id: schedule.id } });
    return NextResponse.json({ message: "Schedule deleted" }, { status: 200 });
  }
  if (action === "toggle") {
    const updated = await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { enabled: enabled === undefined ? !schedule.enabled : Boolean(enabled) },
    });
    return NextResponse.json({ schedule: updated }, { status: 200 });
  }
  if (action === "send") {
    const result = await runScheduledReport(schedule);
    if (!result.sent) throw new AppError(result.error || "Failed to send report", 502);
    return NextResponse.json({ message: "Report sent" }, { status: 200 });
  }

  throw new AppError("Unknown action", 400);
});
