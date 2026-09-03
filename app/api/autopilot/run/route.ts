import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { previewStrategy } from "@/lib/autopilot/run";
import { NextResponse } from "next/server";

/**
 * Preview a strategy — compute suggestions without applying anything. Accepts a
 * saved `strategyId`, or an inline `strategy` (scope/lookbackDays/campaignIds/
 * rules) for the builder's live preview before saving. Records a PREVIEW run
 * only for saved strategies.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, strategyId, strategy: inline } = await req.json();
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  let strategy: any;
  if (strategyId) {
    strategy = await prisma.strategy.findFirst({ where: { id: strategyId, userId } });
    if (!strategy) throw new AppError("Strategy not found", 404);
  } else if (inline) {
    strategy = {
      id: "inline", scope: inline.scope, lookbackDays: Number(inline.lookbackDays) || 30,
      campaignIds: Array.isArray(inline.campaignIds) ? inline.campaignIds.map(String) : [],
      rules: inline.rules,
    };
  } else {
    throw new AppError("strategyId or strategy required", 400);
  }

  const suggestions = await previewStrategy(userId, String(adAccountId), strategy);

  if (strategyId) {
    await prisma.strategyRun.create({
      data: { strategyId, userId, adAccountId: String(adAccountId), mode: "PREVIEW", matchedCount: suggestions.length, suggestions: suggestions as any },
    }).catch(() => {});
    await prisma.strategy.update({ where: { id: strategyId }, data: { lastRunAt: new Date() } }).catch(() => {});
  }

  return NextResponse.json({ suggestions }, { status: 200 });
});
