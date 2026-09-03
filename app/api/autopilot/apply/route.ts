import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { applySuggestions } from "@/lib/autopilot/run";
import type { Suggestion } from "@/lib/autopilot/types";
import { NextResponse } from "next/server";

/**
 * Apply selected suggestions from a preview. The client sends the exact
 * suggestion objects the user checked (each carries its scope + ids + target
 * value), so apply is self-contained and needs no re-evaluation.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "autopilot");

  const { adAccountId, strategyId, suggestions } = await req.json();
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  if (!Array.isArray(suggestions) || suggestions.length === 0) throw new AppError("No suggestions to apply", 400);

  // Never apply NOTIFY rows (report-only).
  const toApply = (suggestions as Suggestion[]).filter((s) => s.actionType !== "NOTIFY");
  if (toApply.length === 0) throw new AppError("Selected suggestions are report-only — nothing to apply", 400);

  const { applied, failed, results } = await applySuggestions(userId, String(adAccountId), toApply);

  if (strategyId) {
    const owns = await prisma.strategy.findFirst({ where: { id: strategyId, userId }, select: { id: true } });
    if (owns) {
      await prisma.strategyRun.create({
        data: { strategyId, userId, adAccountId: String(adAccountId), mode: "APPLY", matchedCount: toApply.length, appliedCount: applied, failedCount: failed, suggestions: results as any },
      }).catch(() => {});
      await prisma.strategy.update({ where: { id: strategyId }, data: { lastRunAt: new Date() } }).catch(() => {});
    }
  }

  return NextResponse.json({ applied, failed, results }, { status: 200 });
});
