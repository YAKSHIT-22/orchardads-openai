/**
 * Autopilot run orchestrator.
 *
 * Builds EntityRecords (metric snapshot + current bid/budget + status) for a
 * strategy's scope, evaluates its rules, and either returns the suggestions
 * (preview) or applies the selected ones.
 *
 * TWO THINGS CHANGED FROM THE APPLE BUILD, both for good reasons:
 *
 * 1. NO PER-CAMPAIGN FAN-OUT. The OpenAI Ads insights endpoints take an
 *    aggregation level inside an account-wide scope, so one call returns every
 *    ad group in the account. The old code made one report call per campaign,
 *    which against a 600 req/min-per-endpoint limit shared with the customer's
 *    other tools would be actively antisocial.
 *
 * 2. EVERY SUGGESTION GOES THROUGH THE RISK ENGINE before it is offered. A rule
 *    that says "cut budget 80%" doesn't get to do that silently just because a
 *    human wrote the rule; guardrails are evaluated per suggestion and blocked
 *    ones are surfaced with the reason rather than dropped.
 */

import { prisma } from "@/lib/prisma";
import { runCachedReport } from "@/lib/openai/report";
import { resolveConnection } from "@/lib/openai/credentials";
import { GET_CAMPAIGN_REPORTS, GET_ADGROUP_REPORTS, GET_AD_REPORTS } from "@/utils/redisExpire";
import { ALERT_METRIC_KEYS, readMetric, type AlertMetricKey } from "@/lib/alerts/metrics";
import { assess, DEFAULT_GUARDRAILS, type ActionType as RiskActionType } from "@/lib/risk/engine";
import { evaluateStrategy, type EntityRecord } from "./evaluate";
import { applySuggestion } from "./apply";
import { reportFor } from "./scopes";
import type { Rule, Suggestion, StrategyScope } from "./types";
import type { Strategy } from "@prisma/client";
import type { Performance, ReportData } from "@/types/reportsDetails";

function ttlFor(scope: StrategyScope): number {
  if (scope === "ADGROUP") return GET_ADGROUP_REPORTS;
  if (scope === "AD") return GET_AD_REPORTS;
  return GET_CAMPAIGN_REPORTS;
}

/** Snapshot every supported metric off a Performance row. */
function metricsFrom(p: Performance): Partial<Record<AlertMetricKey, number>> {
  const out: Partial<Record<AlertMetricKey, number>> = {};
  for (const k of ALERT_METRIC_KEYS) {
    const v = readMetric(p, k);
    // Null means the metric has no value (no clicks, no conversions, no
    // configured conversion value). Leave it absent so a rule like
    // "CPA > 50" simply doesn't match, rather than matching a coerced 0.
    if (v !== null) out[k] = v;
  }
  return out;
}

/** Which campaigns a strategy is scoped to (empty = all). */
function inScope(strategy: Strategy, campaignId: string): boolean {
  const ids = strategy.campaignIds || [];
  return ids.length === 0 || ids.includes(campaignId);
}

/**
 * Build the EntityRecords for a strategy's scope. One report call, account-wide.
 */
export async function buildRecords(
  userId: string,
  adAccountId: string,
  strategy: Strategy
): Promise<EntityRecord[]> {
  const scope = strategy.scope as StrategyScope;
  const days = strategy.lookbackDays;
  const { level, segment, type } = reportFor(scope);

  const report: ReportData = await runCachedReport({
    userId,
    adAccountId,
    reportType: `autopilot-${type}`,
    request: { level, days, daily: false, segment, limit: 1000 },
    ttl: ttlFor(scope),
  });

  const currency = report.currency;

  if (scope === "CAMPAIGN") {
    return report.campaigns
      .filter((c) => inScope(strategy, c.campaignId))
      .map<EntityRecord>((c) => ({
        scope,
        entityId: c.campaignId,
        entityName: c.campaignName,
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        status: c.campaignStatus,
        metrics: metricsFrom(c.performance),
        // Lifetime budget is the campaign's real spend control; the daily limit
        // is optional and often unset.
        currentValue: c.lifetimeBudgetMicros ?? null,
        currency,
      }));
  }

  if (scope === "ADGROUP") {
    return report.adGroups
      .filter((g) => inScope(strategy, g.campaignId))
      .map<EntityRecord>((g) => ({
        scope,
        entityId: g.adGroupId,
        entityName: g.adGroupName,
        campaignId: g.campaignId,
        campaignName: g.campaignName,
        adGroupId: g.adGroupId,
        status: g.adGroupStatus,
        metrics: metricsFrom(g.performance),
        currentValue: g.maxBidMicros ?? null,
        currency,
      }));
  }

  if (scope === "AD") {
    return report.ads
      .filter((a) => inScope(strategy, a.campaignId))
      .map<EntityRecord>((a) => ({
        scope,
        entityId: a.adId,
        entityName: a.adName,
        campaignId: a.campaignId,
        campaignName: a.campaignName,
        adGroupId: a.adGroupId,
        status: a.status,
        metrics: metricsFrom(a.performance),
        currentValue: null,
        currency,
      }));
  }

  // GEO — the country segment of the campaign report.
  return report.segments
    .filter((s) => s.segmentType === "country")
    .map<EntityRecord>((s) => ({
      scope,
      entityId: s.segmentValue,
      entityName: s.segmentLabel || s.segmentValue,
      geo: s.segmentValue,
      metrics: metricsFrom(s.performance),
      currentValue: null,
      currency,
    }));
}

/** Map an autopilot action to the risk engine's vocabulary. */
function riskActionFor(s: Suggestion): RiskActionType | null {
  switch (s.actionType) {
    case "SET_BUDGET":
    case "ADJUST_BUDGET":
      return "UPDATE_CAMPAIGN_BUDGET";
    case "SET_BID":
    case "ADJUST_BID":
      return "UPDATE_ADGROUP_BID";
    case "PAUSE":
      return "PAUSE_ENTITY";
    case "ENABLE":
      return "ACTIVATE_ENTITY";
    case "NOTIFY":
    case "EXCLUDE_GEO":
    default:
      return null;
  }
}

/**
 * Run every suggestion past the risk engine, annotating each with its band and
 * any guardrail violations.
 *
 * Blocked suggestions are RETAINED, not dropped: the user asked for this rule,
 * and silently discarding its output would leave them wondering why nothing
 * happened. They are shown, marked blocked, with the reason.
 */
async function annotateRisk(
  userId: string,
  adAccountId: string,
  strategy: Strategy,
  suggestions: Suggestion[]
): Promise<Suggestion[]> {
  const connection = await resolveConnection(userId, { adAccountId });

  // Account-window spend for blast-radius scoring.
  const since = new Date(Date.now() - strategy.lookbackDays * 86_400_000);
  const facts = await prisma.metricFact.findMany({
    where: { adAccountId: connection.adAccountId, entityType: "ACCOUNT", date: { gte: since } },
  });
  const windowSpendMicros = facts.reduce((a, f) => a + Number(f.spendMicros), 0);
  const windowConversions = facts.reduce((a, f) => a + f.conversions, 0);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const actionsToday = await prisma.auditLog.count({
    where: { userId, adAccountId: connection.adAccountId, createdAt: { gte: startOfDay } },
  });

  const guardrails = {
    ...DEFAULT_GUARDRAILS,
    maxIncreasePercent: strategy.maxChangePercent,
    maxDecreasePercent: strategy.maxChangePercent,
    maxDailyActions: strategy.maxActionsPerRun,
    cooldownHours: strategy.cooldownHours,
  };

  return suggestions.map((s) => {
    const actionType = riskActionFor(s);
    if (!actionType) return { ...s, riskBand: "ADVISORY" as const };

    const result = assess(
      {
        actionType,
        entityType:
          s.scope === "CAMPAIGN" ? "CAMPAIGN" : s.scope === "ADGROUP" ? "ADGROUP" : s.scope === "AD" ? "AD" : "ACCOUNT",
        entityId: s.entityId,
        entityName: s.entityName,
        currentValue: s.currentValue ?? null,
        proposedValue: s.newValue ?? null,
        reason: s.ruleName,
      },
      { currency: s.currency, windowSpendMicros, windowConversions, actionsToday, hoursSinceLastChange: null },
      guardrails,
      { automated: strategy.autoApply }
    );

    return {
      ...s,
      riskBand: result.band,
      ...(result.violations.length ? { blockedBy: result.violations } : {}),
    };
  });
}

/** Compute suggestions for a strategy (no changes applied). */
export async function previewStrategy(
  userId: string,
  adAccountId: string,
  strategy: Strategy
): Promise<Suggestion[]> {
  const records = await buildRecords(userId, adAccountId, strategy);
  const raw = evaluateStrategy(records, strategy.rules as unknown as Rule[]);
  return annotateRisk(userId, adAccountId, strategy, raw);
}

/** Apply a set of already-computed suggestions, returning per-item outcomes. */
export async function applySuggestions(
  userId: string,
  adAccountId: string,
  suggestions: Suggestion[]
): Promise<{ applied: number; failed: number; results: { key: string; ok: boolean; error?: string }[] }> {
  let applied = 0;
  let failed = 0;
  const results: { key: string; ok: boolean; error?: string }[] = [];

  for (const s of suggestions) {
    // A suggestion the risk engine blocked never executes, even if the caller
    // selected it — the UI can be wrong or stale; this check cannot.
    if (s.blockedBy?.length) {
      failed++;
      results.push({ key: s.key, ok: false, error: s.blockedBy.join(" ") });
      continue;
    }

    try {
      await applySuggestion(userId, adAccountId, s);
      applied++;
      results.push({ key: s.key, ok: true });

      await prisma.auditLog.create({
        data: {
          userId,
          adAccountId,
          action: `AUTOPILOT_${s.actionType}`,
          outcome: "SUCCESS",
          entityType: s.scope,
          entityId: s.entityId,
          entityName: s.entityName,
          before: { value: s.currentValue } as never,
          after: { value: s.newValue } as never,
          meta: { rule: s.ruleName, riskBand: s.riskBand, metrics: s.metrics },
        },
      });
    } catch (e) {
      failed++;
      const error = e instanceof Error ? e.message : "Apply failed";
      results.push({ key: s.key, ok: false, error });

      await prisma.auditLog
        .create({
          data: {
            userId,
            adAccountId,
            action: `AUTOPILOT_${s.actionType}`,
            outcome: "FAILURE",
            entityType: s.scope,
            entityId: s.entityId,
            entityName: s.entityName,
            meta: { rule: s.ruleName, error },
          },
        })
        .catch(() => {});
    }
  }

  return { applied, failed, results };
}

/**
 * Scheduled automation: preview, then apply if autoApply, and record a run.
 *
 * Note `maxActionsPerRun`: a rule that suddenly matches 400 entities is far more
 * likely to be a broken threshold or a bad sync than a genuine finding, so the
 * run is capped and the overflow is reported rather than executed.
 */
export async function runStrategyAuto(
  userId: string,
  adAccountId: string,
  strategy: Strategy
): Promise<{ matched: number; applied: number; failed: number; suggestions: Suggestion[]; error?: string }> {
  try {
    const suggestions = await previewStrategy(userId, adAccountId, strategy);

    let applied = 0;
    let failed = 0;

    if (strategy.autoApply && suggestions.length) {
      const executable = suggestions
        .filter((s) => s.actionType !== "NOTIFY" && !s.blockedBy?.length)
        .slice(0, strategy.maxActionsPerRun);

      const res = await applySuggestions(userId, adAccountId, executable);
      applied = res.applied;
      failed = res.failed;
    }

    await prisma.strategyRun.create({
      data: {
        strategyId: strategy.id,
        userId,
        adAccountId,
        mode: "AUTO",
        matchedCount: suggestions.length,
        appliedCount: applied,
        failedCount: failed,
        suggestions: suggestions as never,
      },
    });
    await prisma.strategy
      .update({ where: { id: strategy.id }, data: { lastRunAt: new Date() } })
      .catch(() => {});

    return { matched: suggestions.length, applied, failed, suggestions };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Run failed";
    await prisma.strategyRun
      .create({ data: { strategyId: strategy.id, userId, adAccountId, mode: "AUTO", error } })
      .catch(() => {});
    return { matched: 0, applied: 0, failed: 0, suggestions: [], error };
  }
}
