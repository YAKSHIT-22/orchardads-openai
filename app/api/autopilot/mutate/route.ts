import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { validateRules } from "@/lib/autopilot/validate";
import { NextResponse } from "next/server";

const FREQ = ["DAILY", "WEEKLY", "MONTHLY"];

function nextRun(freq: string): Date {
  const d = new Date();
  if (freq === "DAILY") d.setDate(d.getDate() + 1);
  else if (freq === "MONTHLY") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Toggle, delete, or edit a strategy. Owner only. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { id, action, enabled, patch } = await req.json();
  if (!id) throw new AppError("id required", 400);

  const strategy = await prisma.strategy.findFirst({ where: { id, userId } });
  if (!strategy) throw new AppError("Strategy not found", 404);

  if (action === "delete") {
    await prisma.strategy.delete({ where: { id } });
    return NextResponse.json({ message: "Strategy deleted" }, { status: 200 });
  }

  if (action === "toggle") {
    const updated = await prisma.strategy.update({ where: { id }, data: { enabled: Boolean(enabled) } });
    return NextResponse.json({ strategy: updated }, { status: 200 });
  }

  if (action === "edit" && patch && typeof patch === "object") {
    const data: any = {};
    if (typeof patch.name === "string") data.name = patch.name.trim().slice(0, 120);
    if (typeof patch.description === "string") data.description = patch.description.trim().slice(0, 400);
    if (patch.lookbackDays != null) data.lookbackDays = Math.min(90, Math.max(1, Number(patch.lookbackDays) || 30));
    if (Array.isArray(patch.campaignIds)) data.campaignIds = patch.campaignIds.map(String);
    if (patch.rules !== undefined) {
      // Scope is immutable, so validate against the stored scope.
      const v = validateRules(strategy.scope as any, patch.rules);
      if (!v.ok) throw new AppError(v.error, 400);
      data.rules = v.rules as any;
    }
    if (patch.automated != null) data.automated = Boolean(patch.automated);
    if (patch.frequency && FREQ.includes(patch.frequency)) data.frequency = patch.frequency;
    if (patch.autoApply != null) data.autoApply = Boolean(patch.autoApply);
    if (patch.notifyEmail != null) data.notifyEmail = Boolean(patch.notifyEmail);

    const willAuto = data.automated ?? strategy.automated;
    const freq = data.frequency ?? strategy.frequency;
    data.nextRunAt = willAuto ? nextRun(freq) : null;

    const updated = await prisma.strategy.update({ where: { id }, data });
    return NextResponse.json({ strategy: updated }, { status: 200 });
  }

  throw new AppError("Unknown action", 400);
});
