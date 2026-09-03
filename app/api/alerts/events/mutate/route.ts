import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { NextResponse } from "next/server";

/**
 * Act on triggered-alert events: mark read, snooze (days), dismiss, or bulk
 * mark-all-read for an org. Owner only.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { id, action, days, adAccountId } = await req.json();

  if (action === "readAll") {
    if (!adAccountId) throw new AppError("adAccountId required", 400);
    await prisma.alertEvent.updateMany({
      where: { userId, adAccountId: String(adAccountId), status: "NEW" },
      data: { status: "READ" },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!id) throw new AppError("id required", 400);
  const event = await prisma.alertEvent.findFirst({ where: { id, userId } });
  if (!event) throw new AppError("Event not found", 404);

  if (action === "read") {
    await prisma.alertEvent.update({ where: { id }, data: { status: "READ" } });
  } else if (action === "dismiss") {
    await prisma.alertEvent.update({ where: { id }, data: { status: "DISMISSED" } });
  } else if (action === "snooze") {
    const d = Math.min(28, Math.max(1, Number(days) || 7));
    const until = new Date(Date.now() + d * 86400000);
    await prisma.alertEvent.update({ where: { id }, data: { status: "SNOOZED", snoozedUntil: until } });
  } else if (action === "unsnooze") {
    await prisma.alertEvent.update({ where: { id }, data: { status: "READ", snoozedUntil: null } });
  } else {
    throw new AppError("Unknown action", 400);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
});
