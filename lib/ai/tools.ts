import { prisma } from "@/lib/prisma";
import { resolveConnection } from "@/lib/openai/credentials";
import { runCachedReport } from "@/lib/openai/report";
import { describeServingIssue } from "@/lib/openai/servingIssues";
import { describeReviewReason } from "@/lib/openai/reviewReasons";
import { generateRecommendations } from "@/lib/recommendations/engine";
import { money, percent } from "@/lib/format";

/**
 * Typed, READ-ONLY tools for the AI analyst.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE:
 *
 *     LLM -> typed tool -> validation -> our own data
 *
 * never
 *
 *     LLM -> arbitrary HTTP request -> the customer's ad account
 *
 * Every tool here reads. None of them writes, and none of them can be made to
 * write by any prompt, because no write path is reachable from this module. A
 * change to a live ad account happens only through the recommendation +
 * approval + risk-engine flow, initiated by a human clicking Apply.
 *
 * The second rule: tools return NUMBERS, and the model's job is to explain them.
 * The system prompt forbids arithmetic the tools didn't do, and every figure the
 * model can legitimately quote appears in a tool result. That is what makes an
 * answer checkable rather than plausible.
 */

export type ToolContext = { userId: string; adAccountId: string };

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
};

/** The tool catalog handed to the model. Read-only by construction. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_account_summary",
    description:
      "Totals for the ad account over a window: spend, impressions, clicks, CTR, CPC, CPM, conversions, CPA, conversion rate. Also reports whether revenue/ROAS are available.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "Window length in days, 1-365." } },
    },
  },
  {
    name: "list_campaigns",
    description:
      "Campaigns with performance and any serving issues, ranked by spend. Use this before answering anything about specific campaigns.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window length in days." },
        limit: { type: "number", description: "Max campaigns to return, default 25." },
      },
    },
  },
  {
    name: "list_ad_groups",
    description:
      "Ad groups with performance and their max bid. The max bid is the only bid on this platform.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window length in days." },
        campaignId: { type: "string", description: "Optional campaign to scope to." },
        limit: { type: "number", description: "Max rows, default 25." },
      },
    },
  },
  {
    name: "list_ads",
    description: "Ads with performance, review status and the reason for any rejection.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window length in days." },
        reviewStatus: {
          type: "string",
          description: "Filter by review outcome.",
          enum: ["approved", "in_review", "rejected"],
        },
        limit: { type: "number", description: "Max rows, default 25." },
      },
    },
  },
  {
    name: "get_serving_issues",
    description:
      "Everything that currently cannot deliver, grouped by root cause, with who can fix it and how. Needs no performance history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_recommendations",
    description:
      "The deterministic optimization engine's current findings, ranked by money at stake. Use this rather than inventing your own recommendations.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "Analysis window in days, default 30." } },
    },
  },
  {
    name: "get_trend",
    description:
      "Daily series for the account: spend, clicks, conversions, CPA. Use for questions about change over time.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "Window length in days, default 30." } },
    },
  },
  {
    name: "get_segment_breakdown",
    description:
      "Performance split by country or device. The API allows exactly one segment per request.",
    input_schema: {
      type: "object",
      properties: {
        segment: { type: "string", description: "Which breakdown.", enum: ["country", "device"] },
        days: { type: "number", description: "Window length in days." },
      },
      required: ["segment"],
    },
  },
];

const clampDays = (v: unknown, fallback = 30) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(365, Math.max(1, Math.round(n)));
};

const clampLimit = (v: unknown, fallback = 25) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.round(n)));
};

/**
 * Execute one tool call.
 *
 * `name` comes from the model, so it is matched against the catalog rather than
 * dispatched dynamically — an unknown name returns an error object instead of
 * throwing, so the model can recover in-conversation.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  rawInput: Record<string, unknown>
): Promise<unknown> {
  const connection = await resolveConnection(ctx.userId, { adAccountId: ctx.adAccountId });
  const currency = connection.currencyCode;

  switch (name) {
    case "get_account_summary": {
      const days = clampDays(rawInput.days);
      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: "ai-account",
        request: { level: "campaign", days, daily: false, limit: 500 },
      });

      const t = report.campaigns.reduce(
        (a, c) => ({
          impressions: a.impressions + c.performance.impressions,
          clicks: a.clicks + c.performance.clicks,
          spendMicros: a.spendMicros + c.performance.spendMicros,
          conversions: a.conversions + c.performance.conversions,
        }),
        { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0 }
      );

      const div = (x: number, y: number) => (y > 0 ? x / y : null);

      return {
        windowDays: days,
        currency,
        spend: money(currency, t.spendMicros),
        impressions: t.impressions,
        clicks: t.clicks,
        ctr: percent(div(t.clicks, t.impressions)),
        cpc: money(currency, div(t.spendMicros, t.clicks)),
        cpm: money(currency, t.impressions > 0 ? (t.spendMicros / t.impressions) * 1000 : null),
        conversions: t.conversions,
        cpa: money(currency, div(t.spendMicros, t.conversions)),
        conversionRate: percent(div(t.conversions, t.clicks)),
        campaignCount: report.campaigns.length,
        // Stated on every summary so the model never implies ROAS it can't have.
        revenueAvailable: report.revenueModelled,
        revenueNote: report.revenueModelled
          ? "Revenue and ROAS are MODELLED from the advertiser's configured value per conversion, not reported by OpenAI."
          : "OpenAI Ads does not report revenue. No value per conversion is configured, so revenue and ROAS are unavailable. Do not estimate them.",
      };
    }

    case "list_campaigns": {
      const days = clampDays(rawInput.days);
      const limit = clampLimit(rawInput.limit);
      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: "ai-campaigns",
        request: { level: "campaign", days, daily: false, limit: 500 },
      });

      return {
        windowDays: days,
        currency,
        campaigns: [...report.campaigns]
          .sort((a, b) => b.performance.spendMicros - a.performance.spendMicros)
          .slice(0, limit)
          .map((c) => ({
            id: c.campaignId,
            name: c.campaignName,
            status: c.campaignStatus,
            biddingType: c.biddingType,
            lifetimeBudget: money(currency, c.lifetimeBudgetMicros),
            spend: money(currency, c.performance.spendMicros),
            clicks: c.performance.clicks,
            conversions: c.performance.conversions,
            cpa: money(currency, c.performance.cpaMicros),
            ctr: percent(c.performance.ctr),
            servingIssues: (c.servingIssues ?? []).map((code) => describeServingIssue(code).title),
          })),
      };
    }

    case "list_ad_groups": {
      const days = clampDays(rawInput.days);
      const limit = clampLimit(rawInput.limit);
      const campaignId = typeof rawInput.campaignId === "string" ? rawInput.campaignId : undefined;

      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: "ai-adgroups",
        scopeKey: campaignId ?? "account",
        request: {
          level: "ad_group",
          scope: campaignId ? { level: "campaign", id: campaignId } : { level: "account" },
          days,
          daily: false,
          limit: 500,
        },
      });

      return {
        windowDays: days,
        currency,
        adGroups: [...report.adGroups]
          .sort((a, b) => b.performance.spendMicros - a.performance.spendMicros)
          .slice(0, limit)
          .map((g) => ({
            id: g.adGroupId,
            name: g.adGroupName,
            campaign: g.campaignName,
            status: g.adGroupStatus,
            maxBid: money(currency, g.maxBidMicros),
            spend: money(currency, g.performance.spendMicros),
            clicks: g.performance.clicks,
            conversions: g.performance.conversions,
            cpa: money(currency, g.performance.cpaMicros),
          })),
      };
    }

    case "list_ads": {
      const days = clampDays(rawInput.days);
      const limit = clampLimit(rawInput.limit);
      const reviewStatus =
        typeof rawInput.reviewStatus === "string" ? rawInput.reviewStatus : undefined;

      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: "ai-ads",
        request: { level: "ad", days, daily: false, limit: 500 },
      });

      const rows = reviewStatus
        ? report.ads.filter((a) => a.reviewStatus === reviewStatus)
        : report.ads;

      return {
        windowDays: days,
        currency,
        ads: [...rows]
          .sort((a, b) => b.performance.spendMicros - a.performance.spendMicros)
          .slice(0, limit)
          .map((a) => ({
            id: a.adId,
            name: a.adName,
            title: a.title,
            campaign: a.campaignName,
            adGroup: a.adGroupName,
            status: a.status,
            reviewStatus: a.reviewStatus,
            rejectionReason: a.reviewReason ? describeReviewReason(a.reviewReason)?.title : null,
            howToFix: a.reviewReason ? describeReviewReason(a.reviewReason)?.fix?.[0] : null,
            impressions: a.performance.impressions,
            clicks: a.performance.clicks,
            ctr: percent(a.performance.ctr),
            spend: money(currency, a.performance.spendMicros),
          })),
      };
    }

    case "get_serving_issues": {
      const [campaigns, adGroups, ads] = await Promise.all([
        prisma.cachedCampaign.findMany({
          where: { connectionId: connection.id, status: { not: "archived" } },
          select: { name: true, servingIssues: true },
        }),
        prisma.cachedAdGroup.findMany({
          where: { connectionId: connection.id, status: { not: "archived" } },
          select: { name: true, servingIssues: true },
        }),
        prisma.cachedAd.findMany({
          where: { connectionId: connection.id, status: { not: "archived" } },
          select: { name: true, servingIssues: true },
        }),
      ]);

      const byCode = new Map<string, { title: string; meaning: string; fix: string; fixableBy: string; entities: string[] }>();

      const collect = (level: string, rows: { name: string; servingIssues: string[] }[]) => {
        for (const r of rows) {
          for (const code of r.servingIssues) {
            const info = describeServingIssue(code);
            if (info.severity === "warning") continue;
            const e =
              byCode.get(code) ??
              {
                title: info.title,
                meaning: info.meaning,
                fix: info.fix,
                fixableBy: info.fixableBy,
                entities: [],
              };
            e.entities.push(`${level}: ${r.name}`);
            byCode.set(code, e);
          }
        }
      };

      collect("Campaign", campaigns);
      collect("Ad group", adGroups);
      collect("Ad", ads);

      return {
        blockedCauses: [...byCode.entries()].map(([code, v]) => ({
          code,
          ...v,
          affectedCount: v.entities.length,
          entities: v.entities.slice(0, 10),
        })),
        note:
          "These come from OpenAI's own serving-issue codes, not inference. Account-level causes repeat on every entity beneath them — report the cause once.",
      };
    }

    case "get_recommendations": {
      const days = clampDays(rawInput.days);
      const candidates = await generateRecommendations(connection, { days });

      return {
        windowDays: days,
        currency,
        recommendations: candidates.slice(0, 15).map((c) => ({
          kind: c.kind,
          entity: `${c.entityType}: ${c.entityName}`,
          title: c.title,
          reasoning: c.reasoning,
          estimatedImpact: c.estimatedImpactMicros
            ? money(currency, Math.abs(c.estimatedImpactMicros))
            : null,
          impactDirection: (c.estimatedImpactMicros ?? 0) < 0 ? "saving" : "growth",
          confidence: c.confidence,
          riskBand: c.riskBand,
          requiresApproval: c.approvalRequired,
          evidence: c.evidence,
        })),
        note:
          "These are produced by a deterministic engine over stored facts. Explain them; do not invent additional recommendations or new numbers.",
      };
    }

    case "get_trend": {
      const days = clampDays(rawInput.days);
      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: "ai-trend",
        request: { level: "campaign", days, daily: true, limit: 500 },
      });

      return {
        windowDays: days,
        currency,
        // Raw numbers, not formatted strings: the model compares these.
        daily: report.dailyData.map((d) => ({
          date: d.date,
          spend: d.spendMicros / 1_000_000,
          clicks: d.clicks,
          impressions: d.impressions,
          conversions: d.conversions,
          cpa: d.cpaMicros === null ? null : d.cpaMicros / 1_000_000,
          ctr: d.ctr,
        })),
        note: "Conversions are reported daily only. CPA at an hourly grain does not exist.",
      };
    }

    case "get_segment_breakdown": {
      const segment = rawInput.segment === "device" ? "device" : "country";
      const days = clampDays(rawInput.days);

      const report = await runCachedReport({
        userId: ctx.userId,
        adAccountId: ctx.adAccountId,
        reportType: `ai-segment-${segment}`,
        request: { level: "campaign", days, daily: false, segment, limit: 500 },
      });

      if (!report.segments.length) {
        return {
          segment,
          rows: [],
          note: "Segmented reporting is enabled per ad account by OpenAI and appears to be unavailable for this account.",
        };
      }

      return {
        segment,
        windowDays: days,
        currency,
        rows: report.segments.map((s) => ({
          value: s.segmentLabel || s.segmentValue,
          spend: money(currency, s.performance.spendMicros),
          clicks: s.performance.clicks,
          conversions: s.performance.conversions,
          cpa: money(currency, s.performance.cpaMicros),
        })),
      };
    }

    default:
      return { error: `Unknown tool "${name}". Use only the tools provided.` };
  }
}
