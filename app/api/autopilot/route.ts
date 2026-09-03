import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { validateRules } from "@/lib/autopilot/validate";
import { scopeDef } from "@/lib/autopilot/scopes";
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

/** List the user's strategies for an org. */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const strategies = await prisma.strategy.findMany({
    where: { userId, adAccountId: String(adAccountId) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });
  return NextResponse.json({ strategies }, { status: 200 });
});

/** Create a strategy. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const b = await req.json();
  const { adAccountId, adAccountName, name, description, scope, campaignIds, lookbackDays, rules, automated, frequency, autoApply, notifyEmail } = b;

  if (!adAccountId) throw new AppError("adAccountId is required", 400);
  if (!name || !String(name).trim()) throw new AppError("A name is required", 400);
  if (!scopeDef(scope)) throw new AppError("Invalid scope", 400);

  const v = validateRules(scope, rules);
  if (!v.ok) throw new AppError(v.error, 400);

  const freq = FREQ.includes(frequency) ? frequency : "WEEKLY";
  const isAuto = Boolean(automated);

  const strategy = await prisma.strategy.create({
    data: {
      userId, adAccountId: String(adAccountId), adAccountName: adAccountName ? String(adAccountName) : null,
      name: String(name).trim().slice(0, 120),
      description: description ? String(description).trim().slice(0, 400) : null,
      scope,
      campaignIds: Array.isArray(campaignIds) ? campaignIds.map(String) : [],
      lookbackDays: Math.min(90, Math.max(1, Number(lookbackDays) || 30)),
      rules: v.rules as any,
      automated: isAuto,
      frequency: freq,
      autoApply: Boolean(autoApply),
      notifyEmail: Boolean(notifyEmail),
      nextRunAt: isAuto ? nextRun(freq) : null,
    },
  });
  return NextResponse.json({ strategy }, { status: 201 });
});
