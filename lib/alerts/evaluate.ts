/**
 * Pure alert evaluation. No network, no DB — given typed report rows (or a daily
 * series) plus an alert config, return the entities that fire. Shared by the
 * manual "Run now" path and the scheduled cron so behaviour is identical.
 *
 * Two OpenAI Ads realities shape this:
 *
 *  - There is no KEYWORD scope. Targeting is free-text `context_hints` on the ad
 *    group, so the scopes are ACCOUNT / CAMPAIGN / ADGROUP / AD.
 *  - Derived metrics are NULLABLE. A campaign with no clicks has no CPC — not a
 *    CPC of zero. Every evaluator below skips null rather than coercing, because
 *    a coerced zero would fire "CPC below your limit" on every idle campaign in
 *    the account.
 */

import {
  AlertMetricKey,
  readMetric,
  metricDef,
  formatMetric,
  higherIsWorse,
} from "./metrics";
import { detectAnomalies, DailyPoint, AnomalyMetric } from "@/lib/optimize/anomalies";
import type { Performance } from "@/types/reportsDetails";

export type AlertScope = "ACCOUNT" | "CAMPAIGN" | "ADGROUP" | "AD";
export type AlertComparator = "ABOVE" | "BELOW" | "CHANGE_UP" | "CHANGE_DOWN";

export type EvalConfig = {
  kind: "METRIC" | "BUDGET" | "ANOMALY" | "SERVING" | "REVIEW";
  scope: AlertScope;
  metric?: AlertMetricKey | null;
  comparator?: AlertComparator | null;
  threshold?: number | null;
  sensitivity?: number | null;
};

/** A row any evaluator can read: an id, a name, and a Performance block. */
export type EvalRow = {
  entityId: string;
  entityName: string;
  campaignId?: string;
  adGroupId?: string;
  performance: Performance;
  /** Present on campaign rows; used by BUDGET alerts. */
  lifetimeBudgetMicros?: number | null;
  dailyBudgetMicros?: number | null;
  /** Present when the row came from a synced entity. */
  servingIssues?: string[];
  reviewStatus?: string;
  reviewReason?: string | null;
};

export type EvalMatch = {
  entityType: AlertScope;
  entityId: string;
  entityName: string;
  campaignId?: string;
  adGroupId?: string;
  metric: string;
  value: number;
  baseline: number | null;
  threshold: number | null;
  changePct: number | null;
  currency: string;
  message: string;
};

const scopeLabel: Record<AlertScope, string> = {
  ACCOUNT: "account",
  CAMPAIGN: "campaign",
  ADGROUP: "ad group",
  AD: "ad",
};

/** METRIC alert with an ABOVE/BELOW absolute threshold. */
export function evaluateThreshold(rows: EvalRow[], cfg: EvalConfig): EvalMatch[] {
  const metric = cfg.metric!;
  const threshold = Number(cfg.threshold);
  const above = cfg.comparator === "ABOVE";
  const out: EvalMatch[] = [];

  for (const row of rows || []) {
    const value = readMetric(row.performance, metric);
    // Null means the metric has no value for this entity (no clicks, no
    // conversions, or no configured conversion value). Never treat that as 0.
    if (value === null) continue;

    const breach = above ? value > threshold : value < threshold;
    if (!breach) continue;

    const currency = row.performance.currency;
    out.push({
      entityType: cfg.scope,
      entityId: row.entityId,
      entityName: row.entityName,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      metric,
      value,
      baseline: null,
      threshold,
      changePct: null,
      currency,
      message: `${metricDef(metric)?.label} on ${scopeLabel[cfg.scope]} "${row.entityName}" is ${formatMetric(
        metric,
        value,
        currency
      )} — ${above ? "above" : "below"} your ${formatMetric(metric, threshold, currency)} limit.`,
    });
  }

  return out.sort((a, b) => Math.abs(b.value - (b.threshold || 0)) - Math.abs(a.value - (a.threshold || 0)));
}

/**
 * METRIC alert comparing a current period to the immediately-preceding one.
 * Fires when the % change crosses the threshold in the chosen direction.
 */
export function evaluateChange(curRows: EvalRow[], priorRows: EvalRow[], cfg: EvalConfig): EvalMatch[] {
  const metric = cfg.metric!;
  const threshold = Number(cfg.threshold); // percent, e.g. 30
  const up = cfg.comparator === "CHANGE_UP";

  const priorById = new Map(priorRows?.map((r) => [r.entityId, r]) ?? []);
  const out: EvalMatch[] = [];

  for (const row of curRows || []) {
    const prior = priorById.get(row.entityId);
    const prev = prior ? readMetric(prior.performance, metric) : null;
    const value = readMetric(row.performance, metric);

    // No baseline to compare against — a new campaign is not a 100% increase.
    if (prev === null || prev <= 0 || value === null) continue;

    const changePct = ((value - prev) / prev) * 100;
    const breach = up ? changePct >= threshold : changePct <= -threshold;
    if (!breach) continue;

    const currency = row.performance.currency;
    out.push({
      entityType: cfg.scope,
      entityId: row.entityId,
      entityName: row.entityName,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      metric,
      value,
      baseline: prev,
      threshold,
      changePct,
      currency,
      message: `${metricDef(metric)?.label} on ${scopeLabel[cfg.scope]} "${row.entityName}" ${
        changePct >= 0 ? "rose" : "fell"
      } ${Math.abs(changePct).toFixed(0)}% (${formatMetric(metric, prev, currency)} to ${formatMetric(
        metric,
        value,
        currency
      )}) vs the prior period.${
        higherIsWorse(metric) === changePct >= 0 ? "" : " That's the direction you want."
      }`,
    });
  }

  return out.sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0));
}

/**
 * BUDGET alert. `threshold` is a pace percentage (e.g. 90).
 *
 * OpenAI Ads campaigns carry a required LIFETIME budget and an optional daily
 * one, so pacing is measured against whichever the campaign actually uses:
 *  - daily budget present  -> average daily spend vs that daily budget
 *  - lifetime only         -> spend to date vs the lifetime limit
 *
 * The lifetime case is the one that matters most here: a lifetime budget silently
 * stops delivery the moment it's consumed, and the API tells us about it after
 * the fact via the `campaign_budget_exhausted` serving issue.
 */
export function evaluateBudget(rows: EvalRow[], cfg: EvalConfig, days: number): EvalMatch[] {
  const pacePct = Number(cfg.threshold); // e.g. 90
  const over = cfg.comparator !== "BELOW"; // default ABOVE
  const out: EvalMatch[] = [];

  for (const row of rows || []) {
    const currency = row.performance.currency;
    const spend = row.performance.spendMicros;

    const daily = row.dailyBudgetMicros ?? null;
    const lifetime = row.lifetimeBudgetMicros ?? null;

    let pace: number;
    let baseline: number;
    let value: number;
    let description: string;

    if (daily && daily > 0) {
      const avgDaily = spend / Math.max(1, days);
      pace = (avgDaily / daily) * 100;
      baseline = daily;
      value = avgDaily;
      description = `${formatMetric("SPEND", avgDaily, currency)}/day against a ${formatMetric(
        "SPEND",
        daily,
        currency
      )}/day budget`;
    } else if (lifetime && lifetime > 0) {
      pace = (spend / lifetime) * 100;
      baseline = lifetime;
      value = spend;
      description = `${formatMetric("SPEND", spend, currency)} of a ${formatMetric(
        "SPEND",
        lifetime,
        currency
      )} lifetime budget`;
    } else {
      continue;
    }

    const breach = over ? pace >= pacePct : pace <= pacePct;
    if (!breach) continue;

    out.push({
      entityType: "CAMPAIGN",
      entityId: row.entityId,
      entityName: row.entityName,
      campaignId: row.entityId,
      metric: "SPEND",
      value,
      baseline,
      threshold: pacePct,
      changePct: pace,
      currency,
      message: `Campaign "${row.entityName}" is at ${pace.toFixed(0)}% of budget — ${description}. ${
        over
          ? "It stops delivering entirely once the budget is gone."
          : "It is on track to leave budget unspent."
      }`,
    });
  }

  return out.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
}

const ANOMALY_METRIC_MAP: Record<string, AnomalyMetric> = {
  SPEND: "spend",
  CONVERSIONS: "conversions",
  CLICKS: "clicks",
  IMPRESSIONS: "impressions",
  CPA: "cpa",
  CTR: "ctr",
};

/**
 * ANOMALY alert. `series` is one entity's daily points; `sensitivity` is the
 * z-score magnitude required to fire.
 */
export function evaluateAnomaly(
  entity: { id: string; name: string; campaignId?: string },
  series: DailyPoint[],
  cfg: EvalConfig,
  currency: string
): EvalMatch[] {
  const z = Number(cfg.sensitivity) || 2.5;
  const anomalies = detectAnomalies(series, { window: 14, threshold: z, recentDays: 3, minSamples: 7 });
  const wanted = cfg.metric ? ANOMALY_METRIC_MAP[cfg.metric] : null;

  const out: EvalMatch[] = [];
  for (const a of anomalies) {
    if (wanted && a.metric !== wanted) continue;

    const isMoney = a.metric === "spend" || a.metric === "cpa";
    const show = (v: number) =>
      isMoney
        ? formatMetric("SPEND", v, currency)
        : a.metric === "ctr"
          ? `${(v * 100).toFixed(2)}%`
          : Math.round(v).toLocaleString();

    out.push({
      entityType: cfg.scope,
      entityId: entity.id,
      entityName: entity.name,
      campaignId: entity.campaignId,
      metric: a.metric.toUpperCase(),
      value: a.value,
      baseline: a.expected,
      threshold: z,
      changePct: a.changePct * 100,
      currency,
      message: `${a.direction === "spike" ? "Spike" : "Drop"} in ${a.metric} on ${
        scopeLabel[cfg.scope]
      } "${entity.name}" (${a.date}): ${show(a.value)} vs ~${show(a.expected)} expected (${
        a.changePct >= 0 ? "+" : ""
      }${(a.changePct * 100).toFixed(0)}%).`,
    });
  }
  return out;
}

/**
 * SERVING alert: an entity that can no longer deliver.
 *
 * This needs no statistics — the platform hands us
 * typed codes. It is the highest-signal alert in the product because a blocked
 * campaign produces nothing at all, silently.
 */
export function evaluateServing(rows: EvalRow[], cfg: EvalConfig): EvalMatch[] {
  const out: EvalMatch[] = [];
  for (const row of rows || []) {
    const issues = row.servingIssues ?? [];
    if (!issues.length) continue;

    out.push({
      entityType: cfg.scope,
      entityId: row.entityId,
      entityName: row.entityName,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      metric: "SERVING",
      value: issues.length,
      baseline: null,
      threshold: null,
      changePct: null,
      currency: row.performance.currency,
      message: `${scopeLabel[cfg.scope]} "${row.entityName}" can't deliver: ${issues.join(", ")}. Open Serving Doctor for the fix.`,
    });
  }
  return out;
}

/** REVIEW alert: an ad was rejected. */
export function evaluateReview(rows: EvalRow[], cfg: EvalConfig): EvalMatch[] {
  const out: EvalMatch[] = [];
  for (const row of rows || []) {
    if (row.reviewStatus !== "rejected") continue;
    out.push({
      entityType: "AD",
      entityId: row.entityId,
      entityName: row.entityName,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      metric: "REVIEW",
      value: 1,
      baseline: null,
      threshold: null,
      changePct: null,
      currency: row.performance.currency,
      message: `Ad "${row.entityName}" was rejected${
        row.reviewReason ? ` (${row.reviewReason})` : ""
      }. Review Doctor has the specific fix.`,
    });
  }
  return out;
}
