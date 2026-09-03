import { prisma } from "@/lib/prisma";
import { describeServingIssues, rootCause } from "@/lib/openai/servingIssues";
import { describeReviewReason } from "@/lib/openai/reviewReasons";
import { applyPercent, fromMicros } from "@/lib/openai/money";
import { daysBetween, todayIn } from "@/lib/openai/time";
import { assess, DEFAULT_GUARDRAILS, type ActionType, type RiskBand } from "@/lib/risk/engine";
import type { OpenAiAdsConnection } from "@prisma/client";

/**
 * The recommendation engine.
 *
 * DETERMINISTIC BY DESIGN. Every candidate below is produced by arithmetic over
 * stored facts — no model call, no sampling, no randomness. The LLM's only job
 * (in lib/ai) is to narrate what this file already decided, and it is forbidden
 * from inventing a number that isn't in `evidence`.
 *
 * Two reasons this matters, not one:
 *  - Cost. The variable cost of this product is tokens. A deterministic engine
 *    means the free tier costs us nothing and the paid tiers stay ~90% margin.
 *  - Trust. A recommendation that moves someone's budget must be reproducible
 *    and explainable. "The model said so" is not a defensible answer when a
 *    customer asks why their spend was cut.
 *
 * HONESTY RULES enforced here:
 *  - Every statistical claim is gated on sample size; below the gate we say
 *    "not enough data" rather than lowering our confidence bar.
 *  - CPA comparisons use the MEDIAN, not the mean. One runaway campaign drags a
 *    mean far enough to make healthy campaigns look bad.
 *  - Nothing referencing revenue or ROAS is emitted unless the advertiser has
 *    configured a value per conversion, because otherwise those numbers do not
 *    exist. See docs/research/BLOCKERS.md RED-1.
 */

export type RecommendationKind =
  | "SERVING_ISSUE"
  | "REVIEW_ISSUE"
  | "WASTED_SPEND"
  | "BUDGET_EXHAUSTED"
  | "UNDERFUNDED_WINNER"
  | "OVERSPENDING_LOSER"
  | "BID_TOO_HIGH"
  | "BID_TOO_LOW"
  | "CREATIVE_FATIGUE"
  | "TRACKING_GAP"
  | "ORPHANED_ENTITY"
  | "PACING_RISK";

export type Candidate = {
  kind: RecommendationKind;
  entityType: "ACCOUNT" | "CAMPAIGN" | "ADGROUP" | "AD";
  entityId: string;
  entityName: string;
  title: string;
  reasoning: string;
  /** Every number quoted in `reasoning` must appear here. */
  evidence: Record<string, unknown>;
  actionType?: ActionType;
  field?: string;
  currentValue?: number | null;
  proposedValue?: number | null;
  /** Signed micros. Negative = money saved. */
  estimatedImpactMicros?: number | null;
  confidence?: number | null;
  riskBand: RiskBand;
  approvalRequired: boolean;
  /** Stable key so a standing condition doesn't re-notify every run. */
  dedupeKey: string;
};

export type EngineOptions = {
  /** Analysis window. */
  days?: number;
  /** Conversions required before any CPA-shaped claim is made. */
  minConversions?: number;
  /** Spend floor below which an entity isn't worth a recommendation. */
  minSpendMicros?: number;
};

type EntityMetrics = {
  entityId: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  days: number;
};

export async function generateRecommendations(
  connection: OpenAiAdsConnection,
  { days = 30, minConversions = 5, minSpendMicros = 5_000_000 }: EngineOptions = {}
): Promise<Candidate[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [campaigns, adGroups, ads, facts] = await Promise.all([
    prisma.cachedCampaign.findMany({ where: { connectionId: connection.id } }),
    prisma.cachedAdGroup.findMany({ where: { connectionId: connection.id } }),
    prisma.cachedAd.findMany({ where: { connectionId: connection.id } }),
    prisma.metricFact.findMany({
      where: { adAccountId: connection.adAccountId, date: { gte: since } },
    }),
  ]);

  const byEntity = aggregate(facts);
  const accountSpend = sumSpend(facts.filter((f) => f.entityType === "ACCOUNT"));
  const currency = connection.currencyCode;

  const context = {
    currency,
    windowSpendMicros: accountSpend,
    windowConversions: sumConversions(facts.filter((f) => f.entityType === "ACCOUNT")),
    actionsToday: 0,
    hoursSinceLastChange: null,
  };

  const out: Candidate[] = [];

  // ── 1. Serving issues ─────────────────────────────────────────────────────
  // First, always. A campaign that cannot deliver makes every performance
  // recommendation about it meaningless, and this needs no history at all —
  // it is the value we can show on the day a key is pasted.

  for (const c of campaigns) {
    if (c.status === "archived" || !c.servingIssues.length) continue;
    const cause = rootCause(c.servingIssues);
    if (!cause || cause.severity === "warning") continue;

    const m = byEntity.get(key("CAMPAIGN", c.externalId));
    const dailySpend = m && m.days > 0 ? m.spendMicros / m.days : 0;

    out.push({
      kind: "SERVING_ISSUE",
      entityType: "CAMPAIGN",
      entityId: c.externalId,
      entityName: c.name,
      title: `${c.name} isn't delivering — ${cause.title.toLowerCase()}`,
      reasoning: `${cause.meaning} ${cause.fix}${
        dailySpend > 0
          ? ` It was averaging ${fmt(dailySpend, currency)}/day before this started, so that delivery is currently going nowhere.`
          : ""
      }`,
      evidence: {
        code: cause.code,
        severity: cause.severity,
        fixableBy: cause.fixableBy,
        allIssues: c.servingIssues,
        priorDailySpendMicros: Math.round(dailySpend),
      },
      // Most serving issues are fixed in Ads Manager or on the advertiser's own
      // site, not through the API. Everything here is advisory: we diagnose
      // precisely and hand over the fix rather than showing an Apply button that
      // does nothing. Where a fix IS an API call (budget exhausted, campaign
      // ended), the dedicated rules below emit an executable action for it.
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: 1,
      dedupeKey: `serving:${c.externalId}:${cause.code}`,
    });
  }

  // ── 2. Ad review failures ─────────────────────────────────────────────────
  // Grouped by cause, because one misconfigured WAF rule rejects every ad on the
  // account and thirty identical rows is a worse answer than one.

  const rejected = ads.filter((a) => a.reviewStatus === "rejected" && a.status !== "archived");
  const byReason = new Map<string, typeof rejected>();
  for (const ad of rejected) {
    const k = ad.reviewReason || "unknown";
    byReason.set(k, [...(byReason.get(k) ?? []), ad]);
  }

  for (const [code, group] of byReason) {
    const info = describeReviewReason(code);
    if (!info) continue;
    out.push({
      kind: "REVIEW_ISSUE",
      entityType: "AD",
      entityId: group[0].externalId,
      entityName: group.length === 1 ? group[0].name : `${group.length} ads`,
      title:
        group.length === 1
          ? `Ad rejected — ${info.title.toLowerCase()}`
          : `${group.length} ads rejected — ${info.title.toLowerCase()}`,
      reasoning: `${info.cause} Fix: ${info.fix.join(" ")}${
        info.autoRetries ? " Once the underlying problem is resolved, review runs again automatically." : ""
      }`,
      evidence: {
        code,
        adIds: group.map((a) => a.externalId),
        adCount: group.length,
        category: info.category,
        targetUrls: [...new Set(group.map((a) => a.targetUrl).filter(Boolean))].slice(0, 5),
      },
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: 1,
      dedupeKey: `review:${code}:${group.length}`,
    });
  }

  // ── 3. Wasted spend ───────────────────────────────────────────────────────
  // Spend with zero conversions. Only claimed once enough clicks have accrued
  // that zero is meaningfully different from "too early to tell".

  for (const c of campaigns) {
    if (c.status !== "active") continue;
    const m = byEntity.get(key("CAMPAIGN", c.externalId));
    if (!m || m.spendMicros < minSpendMicros) continue;
    if (m.conversions > 0) continue;

    // The threshold is expressed in clicks, not spend: at a $3-5 CPC, ~40 clicks
    // with no conversion is a real signal; 5 clicks is not.
    const CLICK_THRESHOLD = 40;
    if (m.clicks < CLICK_THRESHOLD) continue;

    const current = c.lifetimeBudgetMicros ? Number(c.lifetimeBudgetMicros) : null;
    const proposed = current ? Number(applyPercent(BigInt(current), -30)) : null;

    const change = {
      actionType: "UPDATE_CAMPAIGN_BUDGET" as ActionType,
      entityType: "CAMPAIGN" as const,
      entityId: c.externalId,
      entityName: c.name,
      currentValue: current,
      proposedValue: proposed,
      reason: "No conversions despite meaningful click volume.",
      confidence: clamp(m.clicks / 200, 0.4, 0.9),
    };
    const risk = assess(change, context, DEFAULT_GUARDRAILS);

    out.push({
      kind: "WASTED_SPEND",
      entityType: "CAMPAIGN",
      entityId: c.externalId,
      entityName: c.name,
      title: `${c.name} spent ${fmt(m.spendMicros, currency)} with no conversions`,
      reasoning: `Over the last ${days} days this campaign spent ${fmt(
        m.spendMicros,
        currency
      )} across ${m.clicks} clicks and recorded no conversions. That is enough traffic for a converting campaign to have shown something. Before cutting budget, check Tracking: a campaign with no active conversion source will always read as zero.`,
      evidence: {
        windowDays: days,
        spendMicros: m.spendMicros,
        clicks: m.clicks,
        impressions: m.impressions,
        conversions: 0,
        clickThreshold: CLICK_THRESHOLD,
      },
      actionType: "UPDATE_CAMPAIGN_BUDGET",
      field: "budget.lifetime_spend_limit_micros",
      currentValue: current,
      proposedValue: proposed,
      estimatedImpactMicros: proposed && current ? -(current - proposed) : -m.spendMicros,
      confidence: change.confidence,
      riskBand: risk.band,
      approvalRequired: true,
      dedupeKey: `waste:${c.externalId}`,
    });
  }

  // ── 4. Budget exhausted ───────────────────────────────────────────────────

  for (const c of campaigns) {
    if (c.status !== "active") continue;
    if (!c.servingIssues.includes("campaign_budget_exhausted")) continue;

    const m = byEntity.get(key("CAMPAIGN", c.externalId));
    if (!m) continue;

    const cpa = m.conversions > 0 ? m.spendMicros / m.conversions : null;
    const current = c.lifetimeBudgetMicros ? Number(c.lifetimeBudgetMicros) : null;
    const proposed = current ? Number(applyPercent(BigInt(current), 25)) : null;

    // Only recommend MORE budget when the campaign has earned it. An exhausted
    // budget on a campaign with no conversions is a saving, not a problem.
    const earned = m.conversions >= minConversions;

    out.push({
      kind: earned ? "UNDERFUNDED_WINNER" : "BUDGET_EXHAUSTED",
      entityType: "CAMPAIGN",
      entityId: c.externalId,
      entityName: c.name,
      title: earned
        ? `${c.name} hit its budget while converting well`
        : `${c.name} has spent its budget`,
      reasoning: earned
        ? `This campaign consumed its lifetime budget and stopped delivering, having produced ${m.conversions} conversions at ${fmt(
            cpa!,
            currency
          )} CPA over ${days} days. It stops the moment the budget runs out, so every hour it stays exhausted is lost volume at a CPA you're already accepting.`
        : `This campaign consumed its lifetime budget and stopped delivering. It produced ${m.conversions} conversion${
            m.conversions === 1 ? "" : "s"
          } from ${fmt(m.spendMicros, currency)}, which isn't yet enough to justify more budget. Review the campaign before topping it up.`,
      evidence: {
        windowDays: days,
        spendMicros: m.spendMicros,
        conversions: m.conversions,
        cpaMicros: cpa,
        lifetimeBudgetMicros: current,
        minConversions,
      },
      ...(earned
        ? {
            actionType: "UPDATE_CAMPAIGN_BUDGET" as ActionType,
            field: "budget.lifetime_spend_limit_micros",
            currentValue: current,
            proposedValue: proposed,
            estimatedImpactMicros: proposed && current ? proposed - current : null,
          }
        : {}),
      confidence: earned ? clamp(m.conversions / 30, 0.4, 0.9) : 0.9,
      riskBand: earned ? "MEDIUM" : "ADVISORY",
      approvalRequired: earned,
      dedupeKey: `budget-exhausted:${c.externalId}`,
    });
  }

  // ── 5. CPA outliers ───────────────────────────────────────────────────────
  // Median-based, and only across campaigns that individually clear the sample
  // gate — otherwise the "median" is computed from noise.

  const cpaSamples = campaigns
    .filter((c) => c.status === "active")
    .map((c) => ({ c, m: byEntity.get(key("CAMPAIGN", c.externalId)) }))
    .filter((x): x is { c: (typeof campaigns)[number]; m: EntityMetrics } => !!x.m)
    .filter((x) => x.m.conversions >= minConversions)
    .map((x) => ({ ...x, cpa: x.m.spendMicros / x.m.conversions }));

  if (cpaSamples.length >= 3) {
    const medianCpa = median(cpaSamples.map((s) => s.cpa));

    for (const s of cpaSamples) {
      // Overspending loser: CPA 50%+ above the account median.
      if (s.cpa > medianCpa * 1.5) {
        const current = s.c.lifetimeBudgetMicros ? Number(s.c.lifetimeBudgetMicros) : null;
        const proposed = current ? Number(applyPercent(BigInt(current), -25)) : null;
        const excess = s.m.spendMicros - medianCpa * s.m.conversions;

        const change = {
          actionType: "UPDATE_CAMPAIGN_BUDGET" as ActionType,
          entityType: "CAMPAIGN" as const,
          entityId: s.c.externalId,
          entityName: s.c.name,
          currentValue: current,
          proposedValue: proposed,
          reason: "CPA well above the account median.",
          confidence: clamp(s.m.conversions / 40, 0.4, 0.85),
        };
        const risk = assess(change, context, DEFAULT_GUARDRAILS);

        out.push({
          kind: "OVERSPENDING_LOSER",
          entityType: "CAMPAIGN",
          entityId: s.c.externalId,
          entityName: s.c.name,
          title: `${s.c.name} converts at ${fmt(s.cpa, currency)} CPA vs ${fmt(medianCpa, currency)} account median`,
          reasoning: `Over ${days} days it spent ${fmt(s.m.spendMicros, currency)} for ${
            s.m.conversions
          } conversions — ${((s.cpa / medianCpa - 1) * 100).toFixed(0)}% more per conversion than the median campaign in this account. Moving that budget to campaigns already converting at the median would buy roughly the same volume for about ${fmt(
            excess,
            currency
          )} less.`,
          evidence: {
            windowDays: days,
            cpaMicros: Math.round(s.cpa),
            medianCpaMicros: Math.round(medianCpa),
            conversions: s.m.conversions,
            spendMicros: s.m.spendMicros,
            excessSpendMicros: Math.round(excess),
            comparedCampaigns: cpaSamples.length,
          },
          actionType: "UPDATE_CAMPAIGN_BUDGET",
          field: "budget.lifetime_spend_limit_micros",
          currentValue: current,
          proposedValue: proposed,
          estimatedImpactMicros: -Math.round(excess),
          confidence: change.confidence,
          riskBand: risk.band,
          approvalRequired: true,
          dedupeKey: `cpa-high:${s.c.externalId}`,
        });
      }

      // Underfunded winner: CPA well below median AND budget-constrained.
      if (s.cpa < medianCpa * 0.7 && s.c.servingIssues.includes("campaign_budget_exhausted")) {
        const current = s.c.lifetimeBudgetMicros ? Number(s.c.lifetimeBudgetMicros) : null;
        const proposed = current ? Number(applyPercent(BigInt(current), 25)) : null;

        out.push({
          kind: "UNDERFUNDED_WINNER",
          entityType: "CAMPAIGN",
          entityId: s.c.externalId,
          entityName: s.c.name,
          title: `${s.c.name} converts ${((1 - s.cpa / medianCpa) * 100).toFixed(0)}% cheaper than the median and is out of budget`,
          reasoning: `It produced ${s.m.conversions} conversions at ${fmt(
            s.cpa,
            currency
          )} CPA against an account median of ${fmt(
            medianCpa,
            currency
          )}, and it has exhausted its lifetime budget. This is the clearest case in the account for more money.`,
          evidence: {
            windowDays: days,
            cpaMicros: Math.round(s.cpa),
            medianCpaMicros: Math.round(medianCpa),
            conversions: s.m.conversions,
            spendMicros: s.m.spendMicros,
            budgetExhausted: true,
          },
          actionType: "UPDATE_CAMPAIGN_BUDGET",
          field: "budget.lifetime_spend_limit_micros",
          currentValue: current,
          proposedValue: proposed,
          estimatedImpactMicros: proposed && current ? proposed - current : null,
          confidence: clamp(s.m.conversions / 40, 0.5, 0.9),
          riskBand: "MEDIUM",
          approvalRequired: true,
          dedupeKey: `underfunded:${s.c.externalId}`,
        });
      }
    }
  }

  // ── 6. Bid outliers at ad-group level ─────────────────────────────────────

  const groupSamples = adGroups
    .filter((g) => g.status === "active" && g.maxBidMicros)
    .map((g) => ({ g, m: byEntity.get(key("ADGROUP", g.externalId)) }))
    .filter((x): x is { g: (typeof adGroups)[number]; m: EntityMetrics } => !!x.m)
    .filter((x) => x.m.conversions >= minConversions);

  if (groupSamples.length >= 3) {
    const medianCpa = median(groupSamples.map((s) => s.m.spendMicros / s.m.conversions));

    for (const s of groupSamples) {
      const cpa = s.m.spendMicros / s.m.conversions;
      const bid = Number(s.g.maxBidMicros);

      if (cpa > medianCpa * 1.5) {
        const proposed = Number(applyPercent(BigInt(bid), -20));
        out.push({
          kind: "BID_TOO_HIGH",
          entityType: "ADGROUP",
          entityId: s.g.externalId,
          entityName: s.g.name,
          title: `${s.g.name} is bidding above what its conversions justify`,
          reasoning: `Its CPA is ${fmt(cpa, currency)} against a ${fmt(
            medianCpa,
            currency
          )} median across ad groups with comparable volume. Lowering the max bid from ${fmt(
            bid,
            currency
          )} to ${fmt(
            proposed,
            currency
          )} should reduce cost per click while keeping the ad group in the auction.`,
          evidence: {
            windowDays: days,
            cpaMicros: Math.round(cpa),
            medianCpaMicros: Math.round(medianCpa),
            currentBidMicros: bid,
            conversions: s.m.conversions,
            clicks: s.m.clicks,
          },
          actionType: "UPDATE_ADGROUP_BID",
          field: "bidding_config.max_bid_micros",
          currentValue: bid,
          proposedValue: proposed,
          estimatedImpactMicros: -Math.round(s.m.spendMicros * 0.2),
          confidence: clamp(s.m.conversions / 40, 0.4, 0.85),
          riskBand: "MEDIUM",
          approvalRequired: true,
          dedupeKey: `bid-high:${s.g.externalId}`,
        });
      }
    }
  }

  // ── 7. Creative fatigue ───────────────────────────────────────────────────
  // CTR decay on a stable creative, measured as recent half vs earlier half.

  for (const ad of ads) {
    if (ad.status !== "active" || ad.reviewStatus !== "approved") continue;
    const decay = ctrDecay(facts, "AD", ad.externalId, days);
    if (!decay) continue;
    if (decay.recentImpressions < 2000 || decay.priorImpressions < 2000) continue;
    if (decay.dropPercent < 25) continue;

    out.push({
      kind: "CREATIVE_FATIGUE",
      entityType: "AD",
      entityId: ad.externalId,
      entityName: ad.name,
      title: `${ad.name} CTR fell ${decay.dropPercent.toFixed(0)}% over the window`,
      reasoning: `Click-through rate went from ${(decay.priorCtr * 100).toFixed(2)}% to ${(
        decay.recentCtr * 100
      ).toFixed(
        2
      )}% between the first and second half of the last ${days} days, on ${decay.recentImpressions.toLocaleString()} recent impressions. That pattern usually means the audience has seen this creative enough times. Testing a new title and body is a lower-risk move than changing bids.`,
      evidence: {
        windowDays: days,
        priorCtr: decay.priorCtr,
        recentCtr: decay.recentCtr,
        dropPercent: decay.dropPercent,
        priorImpressions: decay.priorImpressions,
        recentImpressions: decay.recentImpressions,
        title: ad.title,
      },
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: clamp(decay.recentImpressions / 20000, 0.4, 0.85),
      dedupeKey: `fatigue:${ad.externalId}`,
    });
  }

  // ── 8. Tracking gaps ──────────────────────────────────────────────────────
  // A campaign optimizing to conversions that records none is almost always a
  // measurement problem, not a performance one — and cutting its budget on the
  // strength of a broken pixel would be the worst thing we could do.

  for (const c of campaigns) {
    if (c.status !== "active" || c.biddingType !== "conversions") continue;
    const m = byEntity.get(key("CAMPAIGN", c.externalId));
    if (!m || m.clicks < 50 || m.conversions > 0) continue;

    out.push({
      kind: "TRACKING_GAP",
      entityType: "CAMPAIGN",
      entityId: c.externalId,
      entityName: c.name,
      title: `${c.name} optimizes for conversions but hasn't recorded any`,
      reasoning: `This campaign uses conversion bidding, so OpenAI needs conversion signal to optimize delivery — but ${m.clicks} clicks over ${days} days produced zero recorded conversions. Check the pixel or Conversions API is firing and that the campaign's event setting points at an active source. Until this is fixed, treat every CPA number for this campaign as unreliable, and don't cut its budget on the basis of them.`,
      evidence: {
        windowDays: days,
        clicks: m.clicks,
        conversions: 0,
        biddingType: c.biddingType,
        conversionEventSettingIds:
          (c.rawData as { conversion_event_setting_ids?: string[] } | null)?.conversion_event_setting_ids ?? [],
      },
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: 0.8,
      dedupeKey: `tracking:${c.externalId}`,
    });
  }

  // ── 9. Orphaned entities ──────────────────────────────────────────────────
  // Active children under a paused or ended parent: harmless but confusing, and
  // they make an account look like it is running more than it is.

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  for (const g of adGroups) {
    if (g.status !== "active") continue;
    const parent = campaignById.get(g.campaignId);
    if (!parent) continue;
    if (parent.status === "active" && !isEnded(parent.endTime, connection.timezone)) continue;

    out.push({
      kind: "ORPHANED_ENTITY",
      entityType: "ADGROUP",
      entityId: g.externalId,
      entityName: g.name,
      title: `${g.name} is active under a ${parent.status === "active" ? "finished" : parent.status} campaign`,
      reasoning: `This ad group is set to active but its campaign "${parent.name}" is ${
        parent.status === "active" ? "past its end date" : parent.status
      }, so nothing under it can deliver. Either the campaign should be restarted or this ad group should be paused to reflect reality.`,
      evidence: {
        campaignId: parent.externalId,
        campaignStatus: parent.status,
        campaignEndTime: parent.endTime,
      },
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: 1,
      dedupeKey: `orphan:${g.externalId}`,
    });
  }

  // ── 10. Pacing risk ───────────────────────────────────────────────────────
  // Lifetime budgets make this exact rather than estimated: we know the budget,
  // we know the spend to date, and we know the end date.

  for (const c of campaigns) {
    if (c.status !== "active" || !c.lifetimeBudgetMicros || !c.endTime) continue;
    const m = byEntity.get(key("CAMPAIGN", c.externalId));
    if (!m || m.days < 3 || m.spendMicros <= 0) continue;

    const budget = Number(c.lifetimeBudgetMicros);
    const spent = m.spendMicros;
    const dailyRate = spent / m.days;
    if (dailyRate <= 0) continue;

    const daysToExhaust = (budget - spent) / dailyRate;
    const daysRemaining = daysBetween(todayIn(connection.timezone), isoDate(c.endTime));
    if (daysRemaining <= 0) continue;

    // Only flag a meaningful mismatch in either direction.
    const ratio = daysToExhaust / daysRemaining;
    if (ratio > 0.7 && ratio < 1.4) continue;

    const runsOutEarly = ratio < 0.7;
    out.push({
      kind: "PACING_RISK",
      entityType: "CAMPAIGN",
      entityId: c.externalId,
      entityName: c.name,
      title: runsOutEarly
        ? `${c.name} will exhaust its budget ${Math.round(daysRemaining - daysToExhaust)} days early`
        : `${c.name} will underspend its budget by its end date`,
      reasoning: runsOutEarly
        ? `At its current rate of ${fmt(dailyRate, currency)}/day it has about ${daysToExhaust.toFixed(
            0
          )} days of budget left but ${daysRemaining} days to run. It will stop delivering before the campaign ends.`
        : `At ${fmt(dailyRate, currency)}/day it needs about ${daysToExhaust.toFixed(
            0
          )} days to spend its remaining budget, but only ${daysRemaining} days remain. Roughly ${fmt(
            budget - spent - dailyRate * daysRemaining,
            currency
          )} will go unspent.`,
      evidence: {
        budgetMicros: budget,
        spentMicros: spent,
        dailyRateMicros: Math.round(dailyRate),
        daysToExhaust: Math.round(daysToExhaust),
        daysRemaining,
        endTime: c.endTime,
      },
      riskBand: "ADVISORY",
      approvalRequired: false,
      confidence: clamp(m.days / 14, 0.4, 0.9),
      dedupeKey: `pacing:${c.externalId}:${runsOutEarly ? "early" : "under"}`,
    });
  }

  // Rank by absolute money at stake, then by risk band. A customer's attention
  // is the scarcest resource in the product; spend it on the biggest number.
  return out.sort((a, b) => Math.abs(b.estimatedImpactMicros ?? 0) - Math.abs(a.estimatedImpactMicros ?? 0));
}

// ── Aggregation helpers ─────────────────────────────────────────────────────

type Fact = {
  entityType: string;
  entityId: string;
  date: Date;
  impressions: bigint;
  clicks: bigint;
  spendMicros: bigint;
  conversions: number;
};

function key(entityType: string, entityId: string): string {
  return `${entityType}|${entityId}`;
}

function aggregate(facts: Fact[]): Map<string, EntityMetrics> {
  const out = new Map<string, EntityMetrics>();
  const dayCounts = new Map<string, Set<string>>();

  for (const f of facts) {
    const k = key(f.entityType, f.entityId);
    const acc =
      out.get(k) ??
      { entityId: f.entityId, impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, days: 0 };
    acc.impressions += Number(f.impressions);
    acc.clicks += Number(f.clicks);
    acc.spendMicros += Number(f.spendMicros);
    acc.conversions += f.conversions;
    out.set(k, acc);

    const days = dayCounts.get(k) ?? new Set<string>();
    days.add(f.date.toISOString().slice(0, 10));
    dayCounts.set(k, days);
  }

  for (const [k, acc] of out) acc.days = dayCounts.get(k)?.size ?? 0;
  return out;
}

function sumSpend(facts: Fact[]): number {
  return facts.reduce((a, f) => a + Number(f.spendMicros), 0);
}

function sumConversions(facts: Fact[]): number {
  return facts.reduce((a, f) => a + f.conversions, 0);
}

/** Split the window in half and compare CTR. Null when either half is empty. */
function ctrDecay(
  facts: Fact[],
  entityType: string,
  entityId: string,
  days: number
): {
  priorCtr: number;
  recentCtr: number;
  dropPercent: number;
  priorImpressions: number;
  recentImpressions: number;
} | null {
  const cutoff = new Date(Date.now() - (days / 2) * 86_400_000);
  const rows = facts.filter((f) => f.entityType === entityType && f.entityId === entityId);
  if (!rows.length) return null;

  const prior = rows.filter((f) => f.date < cutoff);
  const recent = rows.filter((f) => f.date >= cutoff);

  const pImp = prior.reduce((a, f) => a + Number(f.impressions), 0);
  const pClk = prior.reduce((a, f) => a + Number(f.clicks), 0);
  const rImp = recent.reduce((a, f) => a + Number(f.impressions), 0);
  const rClk = recent.reduce((a, f) => a + Number(f.clicks), 0);

  if (pImp === 0 || rImp === 0) return null;

  const priorCtr = pClk / pImp;
  const recentCtr = rClk / rImp;
  if (priorCtr === 0) return null;

  return {
    priorCtr,
    recentCtr,
    dropPercent: ((priorCtr - recentCtr) / priorCtr) * 100,
    priorImpressions: pImp,
    recentImpressions: rImp,
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function isEnded(endTime: Date | null, timezone: string): boolean {
  if (!endTime) return false;
  return isoDate(endTime) < todayIn(timezone);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(micros: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(fromMicros(micros));
  } catch {
    return `${currency} ${fromMicros(micros).toFixed(2)}`;
  }
}

export { describeServingIssues };
