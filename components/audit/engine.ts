/**
 * Orchard Inspector engine — runs an account audit CLIENT-SIDE from the report
 * and entity data the app already fetches, exactly as the optimize tools do.
 *
 * Window is FIXED at the last 45 days.
 *
 * There are no keywords, search terms or negatives on this platform, so the
 * audit is built from what it actually publishes. Two of these checks need no
 * inference at all, because the platform hands us typed codes:
 *
 *   servingBlocks   — entities that CANNOT deliver, by root cause
 *   reviewFailures  — rejected ads, grouped by an enumerated reason
 *
 * Both work on a freshly connected account with no history at all.
 *
 * Every threshold below is a volume gate, and they exist for one reason: at
 * $3-5 CPCs a small advertiser produces a handful of conversions a month, so an
 * ungated check would confidently report noise.
 */

import { api } from "@/lib/api";
import { money, percent } from "@/lib/format";
import { AUDIT_WIDGETS, type AuditWidgetDef, type AuditWidgetKey } from "@/lib/audit/widgets";
import { describeServingIssues, rootCause, type ServingIssueInfo } from "@/lib/openai/servingIssues";
import { describeReviewReason } from "@/lib/openai/reviewReasons";
import { analyzePacing } from "@/lib/optimize/budgetPacing";
import { findWastedSpend, DEFAULT_WASTED_CONFIG } from "@/lib/optimize/wastedSpend";
import type { ReportData } from "@/types/reportsDetails";

/* ── Tunables ──────────────────────────────────────────────────────────────── */

export const AUDIT_DAYS = 45;

/** Clicks required before "no conversions" is treated as a finding. */
const WASTE_MIN_CLICKS = 40;
/** Spend (micros) below which a finding isn't worth anyone's attention. */
const MIN_SPEND_MICROS = 5_000_000;
/** Conversions required before a campaign is judged worth more budget. */
const MIN_CONVERSIONS = 5;
/** Impressions required before CTR is judged. */
const WEAK_HOOK_MIN_IMPRESSIONS = 5_000;
/** CTR floor for the creative-fatigue and weak-creative checks. */
const WEAK_CTR = 0.002;

/* ── Result types ──────────────────────────────────────────────────────────── */

export type CellFormat = "text" | "int" | "money" | "percent";
export type AuditColumn = { key: string; label: string; format: CellFormat };

export type WidgetResult = {
  key: AuditWidgetKey;
  name: string;
  description: string;
  columns: AuditColumn[];
  rows: Record<string, string | number>[];
  count: number;
  metricLabel: string;
  metricValue: string;
  /** Threshold and scope notes shown under the card title. */
  notes: string[];
  error?: string;
};

export type HealthFactor = { label: string; detail: string; penalty: number; max: number };

export type AuditRunResult = {
  generatedAt: string;
  startTime: string;
  endTime: string;
  currency: string;
  healthScore: number;
  healthFactors: HealthFactor[];
  widgets: WidgetResult[];
  totalFindings: number;
  headline: string[];
  warnings: string[];
};

/* ── Runner ────────────────────────────────────────────────────────────────── */

export async function runAudit(
  adAccountId: string,
  widgetKeys: AuditWidgetKey[]
): Promise<AuditRunResult> {
  const selected = AUDIT_WIDGETS.filter((w) => widgetKeys.includes(w.key));
  const warnings: string[] = [];
  const widgets: WidgetResult[] = [];

  const endTime = new Date().toISOString().slice(0, 10);
  const startTime = new Date(Date.now() - AUDIT_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Three report calls cover every widget: the insights endpoints take an
  // aggregation level inside an account-wide scope, so there is no per-campaign
  // fan-out and no risk of exhausting the customer's rate limit.
  const [campaignReport, adGroupReport, adReport] = await Promise.all([
    fetchReport(adAccountId, "/reports/campaign", { days: AUDIT_DAYS, daily: true }),
    fetchReport(adAccountId, "/reports/adgroup", { days: AUDIT_DAYS, daily: false }),
    fetchReport(adAccountId, "/reports/ad", { days: AUDIT_DAYS, daily: false }),
  ]);

  const currency = campaignReport?.currency ?? "USD";
  if (!campaignReport) warnings.push("Campaign performance couldn't be loaded; some checks were skipped.");

  const campaigns = campaignReport?.campaigns ?? [];
  const adGroups = adGroupReport?.adGroups ?? [];
  const ads = adReport?.ads ?? [];

  if (campaignReport && !campaignReport.revenueModelled) {
    warnings.push(
      "No value per conversion is configured, so revenue and ROAS aren't shown. CPA and conversion rate are unaffected."
    );
  }

  /* ── Precomputed finding sets ───────────────────────────────────────────── */

  // Serving blocks, collapsed to one row per root cause per entity.
  type Blocked = { level: string; name: string; cause: ServingIssueInfo };
  const blocked: Blocked[] = [];
  for (const c of campaigns) {
    if (c.campaignStatus === "archived") continue;
    const cause = rootCause(c.servingIssues);
    if (cause && cause.severity === "blocking") {
      blocked.push({ level: "Campaign", name: c.campaignName, cause });
    }
  }
  for (const g of adGroups) {
    if (g.adGroupStatus === "archived") continue;
    const cause = rootCause(g.servingIssues);
    if (cause && cause.severity === "blocking") {
      blocked.push({ level: "Ad group", name: g.adGroupName, cause });
    }
  }

  // Review failures, grouped by reason — one WAF rule can reject every ad.
  const rejected = ads.filter((a) => a.reviewStatus === "rejected");
  const byReason = new Map<string, typeof rejected>();
  for (const ad of rejected) {
    const k = ad.reviewReason || "unknown";
    byReason.set(k, [...(byReason.get(k) ?? []), ad]);
  }

  // Wasted spend.
  const wasted = findWastedSpend(
    campaigns.map((c) => ({
      id: c.campaignId,
      name: c.campaignName,
      spendMicros: c.performance.spendMicros,
      clicks: c.performance.clicks,
      conversions: c.performance.conversions,
    })),
    { ...DEFAULT_WASTED_CONFIG, minClicks: WASTE_MIN_CLICKS, minSpendMicros: MIN_SPEND_MICROS }
  );
  const totalWastedMicros = wasted.reduce((s, w) => s + w.wastedMicros, 0);

  // Budget exhaustion, split by whether the campaign earned a top-up.
  const exhausted = campaigns.filter(
    (c) => c.campaignStatus === "active" && (c.servingIssues ?? []).includes("campaign_budget_exhausted")
  );
  const exhaustedEarned = exhausted.filter((c) => c.performance.conversions >= MIN_CONVERSIONS);

  // Structure gaps.
  const structureRows: Record<string, string | number>[] = [];
  const groupsByCampaign = new Map<string, number>();
  for (const g of adGroups) groupsByCampaign.set(g.campaignId, (groupsByCampaign.get(g.campaignId) ?? 0) + 1);
  const adsByGroup = new Map<string, number>();
  for (const a of ads) adsByGroup.set(a.adGroupId, (adsByGroup.get(a.adGroupId) ?? 0) + 1);

  for (const c of campaigns) {
    if (c.campaignStatus === "archived") continue;
    if (!groupsByCampaign.get(c.campaignId)) {
      structureRows.push({ entity: c.campaignName, level: "Campaign", problem: "No ad groups" });
    }
  }
  for (const g of adGroups) {
    if (g.adGroupStatus === "archived") continue;
    if (!adsByGroup.get(g.adGroupId)) {
      structureRows.push({ entity: g.adGroupName, level: "Ad group", problem: "No ads" });
    }
  }

  // Tracking gaps.
  const trackingRows = campaigns
    .filter(
      (c) =>
        c.campaignStatus === "active" &&
        c.biddingType === "conversions" &&
        c.performance.clicks >= 50 &&
        c.performance.conversions === 0
    )
    .map((c) => ({
      campaign: c.campaignName,
      clicks: c.performance.clicks,
      spend: c.performance.spendMicros,
      problem: "Optimizing for conversions but recording none",
    }));

  // Pacing.
  const pacing = analyzePacing(
    campaigns
      .filter((c) => c.campaignStatus === "active" && c.lifetimeBudgetMicros)
      .map((c) => ({
        id: c.campaignId,
        name: c.campaignName,
        budgetMicros: c.lifetimeBudgetMicros!,
        spendMicros: c.performance.spendMicros,
        days: AUDIT_DAYS,
      }))
  );

  // Weak creatives.
  const weakAds = ads.filter(
    (a) =>
      a.status === "active" &&
      a.performance.impressions >= WEAK_HOOK_MIN_IMPRESSIONS &&
      (a.performance.ctr ?? 1) < WEAK_CTR
  );

  /* ── Health score ───────────────────────────────────────────────────────── */

  const healthFactors: HealthFactor[] = [];
  const activeCampaigns = campaigns.filter((c) => c.campaignStatus === "active");

  const blockedShare = activeCampaigns.length ? blocked.filter((b) => b.level === "Campaign").length / activeCampaigns.length : 0;
  healthFactors.push({
    label: "Delivery",
    detail: blocked.length
      ? `${blocked.length} entit${blocked.length === 1 ? "y" : "ies"} can't deliver`
      : "Everything active is able to deliver",
    penalty: Math.round(blockedShare * 35),
    max: 35,
  });

  const rejectShare = ads.length ? rejected.length / ads.length : 0;
  healthFactors.push({
    label: "Ad approval",
    detail: rejected.length ? `${rejected.length} of ${ads.length} ads rejected` : "No rejected ads",
    penalty: Math.round(rejectShare * 20),
    max: 20,
  });

  const totalSpend = campaigns.reduce((s, c) => s + c.performance.spendMicros, 0);
  const wasteShare = totalSpend > 0 ? totalWastedMicros / totalSpend : 0;
  healthFactors.push({
    label: "Spend efficiency",
    detail: totalWastedMicros
      ? `${money(currency, totalWastedMicros)} of ${money(currency, totalSpend)} produced no conversions`
      : "No obviously wasted spend",
    penalty: Math.round(wasteShare * 25),
    max: 25,
  });

  healthFactors.push({
    label: "Tracking",
    detail: trackingRows.length
      ? `${trackingRows.length} conversion campaign${trackingRows.length === 1 ? "" : "s"} recording nothing`
      : "Conversion tracking looks consistent",
    penalty: trackingRows.length ? Math.min(20, trackingRows.length * 7) : 0,
    max: 20,
  });

  const healthScore = Math.max(
    0,
    100 - healthFactors.reduce((s, f) => s + f.penalty, 0)
  );

  /* ── Widget assembly ────────────────────────────────────────────────────── */

  const push = (def: AuditWidgetDef, partial: Omit<WidgetResult, "key" | "name" | "description" | "count">) => {
    widgets.push({
      key: def.key,
      name: def.name,
      description: def.description,
      count: partial.rows.length,
      ...partial,
    });
  };

  for (const def of selected) {
    try {
      switch (def.key) {
        case "servingBlocks":
          push(def, {
            columns: [
              { key: "entity", label: "Entity", format: "text" },
              { key: "level", label: "Level", format: "text" },
              { key: "cause", label: "Cause", format: "text" },
              { key: "fixableBy", label: "Fixed by", format: "text" },
              { key: "fix", label: "Fix", format: "text" },
            ],
            rows: blocked.map((b) => ({
              entity: b.name,
              level: b.level,
              cause: b.cause.title,
              fixableBy: b.cause.fixableBy,
              fix: b.cause.fix,
            })),
            metricLabel: "Blocked entities",
            metricValue: String(blocked.length),
            notes: [
              "Read directly from the platform's serving-issue codes — no inference, no history needed.",
            ],
          });
          break;

        case "reviewFailures":
          push(def, {
            columns: [
              { key: "reason", label: "Reason", format: "text" },
              { key: "ads", label: "Ads", format: "int" },
              { key: "category", label: "Category", format: "text" },
              { key: "fix", label: "First thing to try", format: "text" },
            ],
            rows: [...byReason.entries()].map(([code, group]) => {
              const info = describeReviewReason(code)!;
              return {
                reason: info.title,
                ads: group.length,
                category: info.category,
                fix: info.fix[0] ?? "",
              };
            }),
            metricLabel: "Rejected ads",
            metricValue: String(rejected.length),
            notes: [
              "Grouped by cause: one blocked crawler or robots.txt rule usually rejects every ad at once.",
            ],
          });
          break;

        case "structureGaps":
          push(def, {
            columns: [
              { key: "entity", label: "Entity", format: "text" },
              { key: "level", label: "Level", format: "text" },
              { key: "problem", label: "Problem", format: "text" },
            ],
            rows: structureRows,
            metricLabel: "Incomplete branches",
            metricValue: String(structureRows.length),
            notes: [
              "An ad only serves when the ad, its ad group and its campaign are all active and approved.",
            ],
          });
          break;

        case "trackingGaps":
          push(def, {
            columns: [
              { key: "campaign", label: "Campaign", format: "text" },
              { key: "clicks", label: "Clicks", format: "int" },
              { key: "spend", label: "Spend", format: "money" },
              { key: "problem", label: "Problem", format: "text" },
            ],
            rows: trackingRows,
            metricLabel: "Tracking problems",
            metricValue: String(trackingRows.length),
            notes: [
              "Until this is fixed, every CPA figure for these campaigns is unreliable — don't cut their budgets on it.",
            ],
          });
          break;

        case "budgetExhaustion":
          push(def, {
            columns: [
              { key: "campaign", label: "Campaign", format: "text" },
              { key: "budget", label: "Lifetime budget", format: "money" },
              { key: "spend", label: "Spent", format: "money" },
              { key: "conversions", label: "Conversions", format: "int" },
              { key: "verdict", label: "Verdict", format: "text" },
            ],
            rows: exhausted.map((c) => ({
              campaign: c.campaignName,
              budget: c.lifetimeBudgetMicros ?? 0,
              spend: c.performance.spendMicros,
              conversions: c.performance.conversions,
              verdict:
                c.performance.conversions >= MIN_CONVERSIONS
                  ? "Worth topping up"
                  : "Review before adding budget",
            })),
            metricLabel: "Out of budget",
            metricValue: String(exhausted.length),
            notes: [
              `${exhaustedEarned.length} of these have at least ${MIN_CONVERSIONS} conversions and are the safe ones to fund.`,
              "A lifetime budget stops delivery entirely when it's spent — there's no automatic top-up.",
            ],
          });
          break;

        case "wastedSpend":
          push(def, {
            columns: [
              { key: "campaign", label: "Campaign", format: "text" },
              { key: "spend", label: "Spend", format: "money" },
              { key: "clicks", label: "Clicks", format: "int" },
            ],
            rows: wasted.map((w) => ({ campaign: w.name, spend: w.spendMicros, clicks: w.clicks })),
            metricLabel: "Potentially recoverable",
            metricValue: money(currency, totalWastedMicros),
            notes: [
              `Only counts campaigns with at least ${WASTE_MIN_CLICKS} clicks and ${money(currency, MIN_SPEND_MICROS)} spend, so a new campaign isn't flagged for having no results yet.`,
              "Check Tracking first: a broken pixel looks exactly like a campaign that doesn't convert.",
            ],
          });
          break;

        case "pacingRisk":
          push(def, {
            columns: [
              { key: "campaign", label: "Campaign", format: "text" },
              { key: "dailyRate", label: "Daily rate", format: "money" },
              { key: "daysLeft", label: "Days of budget left", format: "int" },
              { key: "verdict", label: "Verdict", format: "text" },
            ],
            rows: pacing.map((p) => ({
              campaign: p.name,
              dailyRate: p.dailyRateMicros,
              daysLeft: p.daysToExhaust,
              verdict: p.verdict,
            })),
            metricLabel: "Pacing warnings",
            metricValue: String(pacing.length),
            notes: ["Projected from the observed daily rate against the remaining lifetime budget."],
          });
          break;

        case "creativeFatigue":
          push(def, {
            columns: [
              { key: "ad", label: "Ad", format: "text" },
              { key: "impressions", label: "Impressions", format: "int" },
              { key: "ctr", label: "CTR", format: "percent" },
              { key: "spend", label: "Spend", format: "money" },
            ],
            rows: weakAds.map((a) => ({
              ad: a.adName,
              impressions: a.performance.impressions,
              ctr: a.performance.ctr ?? 0,
              spend: a.performance.spendMicros,
            })),
            metricLabel: "Weak creatives",
            metricValue: String(weakAds.length),
            notes: [
              `Ads with at least ${WEAK_HOOK_MIN_IMPRESSIONS.toLocaleString()} impressions and a click-through rate under ${percent(WEAK_CTR, 2)}.`,
              "Rewriting the title and body is a lower-risk fix than changing bids.",
            ],
          });
          break;

        case "healthScore":
          push(def, {
            columns: [
              { key: "factor", label: "Factor", format: "text" },
              { key: "detail", label: "Detail", format: "text" },
              { key: "penalty", label: "Points lost", format: "int" },
            ],
            rows: healthFactors.map((f) => ({
              factor: f.label,
              detail: f.detail,
              penalty: f.penalty,
            })),
            metricLabel: "Health score",
            metricValue: `${healthScore}/100`,
            notes: ["Every deduction is shown, so the number can be checked rather than trusted."],
          });
          break;
      }
    } catch (err) {
      widgets.push({
        key: def.key,
        name: def.name,
        description: def.description,
        columns: [],
        rows: [],
        count: 0,
        metricLabel: "",
        metricValue: "—",
        notes: [],
        error: err instanceof Error ? err.message : "Failed to compute this check.",
      });
    }
  }

  /* Headline fragments for the summary bar. */
  const headline: string[] = [];
  const has = (k: AuditWidgetKey) => selected.some((w) => w.key === k);
  if (has("servingBlocks") && blocked.length) headline.push(`${blocked.length} not delivering`);
  if (has("reviewFailures") && rejected.length) headline.push(`${rejected.length} ads rejected`);
  if (has("wastedSpend") && totalWastedMicros) headline.push(`${money(currency, totalWastedMicros)} unproductive`);
  if (has("budgetExhaustion") && exhausted.length) headline.push(`${exhausted.length} out of budget`);
  if (has("trackingGaps") && trackingRows.length) headline.push(`${trackingRows.length} tracking gap${trackingRows.length === 1 ? "" : "s"}`);

  const totalFindings = widgets
    .filter((w) => w.key !== "healthScore")
    .reduce((s, w) => s + w.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    startTime,
    endTime,
    currency,
    healthScore,
    healthFactors,
    widgets,
    totalFindings,
    headline,
    warnings,
  };
}

async function fetchReport(
  adAccountId: string,
  path: string,
  body: Record<string, unknown>
): Promise<ReportData | null> {
  try {
    const res = await api.post(path, { adAccountId, ...body });
    return res.data.report as ReportData;
  } catch {
    // One failed report shouldn't abort the audit — the widgets that depend on
    // it report an error, the rest still run.
    return null;
  }
}

/** Format one audit cell for display. Money values are micros. */
export function formatCell(
  value: string | number | undefined,
  format: CellFormat,
  currency: string
): string {
  if (value === undefined || value === null || value === "") return "—";
  switch (format) {
    case "money":
      return money(currency, Number(value));
    case "percent":
      return percent(Number(value), 2);
    case "int":
      return Math.round(Number(value)).toLocaleString();
    default:
      return String(value);
  }
}
