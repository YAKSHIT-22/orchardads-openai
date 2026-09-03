/**
 * Report render — server-side data computation for a report template.
 *
 * Fetches the reports each widget needs for the resolved date range and returns
 * a JSON payload the designer/preview renders as charts, and the email/PDF path
 * turns into HTML. Shared by the preview route and scheduled delivery.
 *
 * REBUILT ON THE NEW REPORT LAYER. The Apple version fanned out one report call
 * per campaign for ad groups, ads, keywords and search terms. Here:
 *
 *  - The insights endpoints take an aggregation level inside an account-wide
 *    scope, so every entity level is ONE call. That matters: rate limits are
 *    enforced per ad account and per IP, shared with the customer's own tools.
 *  - Keyword and search-term entities are gone; this API has neither.
 *  - Country and device come from `segments[]`, which allows exactly one
 *    segment per request — so those are separate calls, not a cross-tab.
 *
 * All money is MICROS.
 */

import { runCachedReport } from "@/lib/openai/report";
import { GET_CAMPAIGN_REPORTS, GET_ADGROUP_REPORTS, GET_AD_REPORTS, GET_SEGMENT_REPORTS } from "@/utils/redisExpire";
import { readMetric, type AlertMetricKey } from "@/lib/alerts/metrics";
import type { Performance, ReportData } from "@/types/reportsDetails";
import type { ReportEntity, ReportWidgetInstance, ReportCover } from "./widgets";

export type ResolvedPeriod = { startTime: string; endTime: string; days: number; label: string };

/** Resolve a report date-range key to a concrete window. */
export function resolveReportRange(key: string, now = new Date()): ResolvedPeriod {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dayCount = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

  if (key === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startTime: iso(start), endTime: iso(now), days: dayCount(start, now), label: "This month" };
  }
  if (key === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startTime: iso(start), endTime: iso(end), days: dayCount(start, end), label: "Last month" };
  }
  const days = Number(String(key).replace("d", "")) || 30;
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  return { startTime: iso(start), endTime: iso(now), days, label: `Last ${days} days` };
}

/* ── Aggregation ───────────────────────────────────────────────────────────── */

type Row = { name: string; performance: Performance };

/**
 * Aggregate a metric across rows.
 *
 * Rates are RECOMPUTED from summed counters, never averaged across rows —
 * averaging per-row CTRs would weight a campaign with 3 impressions the same as
 * one with 300,000. Returns null when the metric has no value (e.g. CPA with no
 * conversions) so the renderer can show a dash rather than a misleading zero.
 */
function aggregate(rows: Row[], metric: AlertMetricKey): number | null {
  const totals = rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.performance.impressions,
      clicks: a.clicks + r.performance.clicks,
      spendMicros: a.spendMicros + r.performance.spendMicros,
      conversions: a.conversions + r.performance.conversions,
      revenueMicros:
        r.performance.revenueMicros == null
          ? a.revenueMicros
          : (a.revenueMicros ?? 0) + r.performance.revenueMicros,
    }),
    { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, revenueMicros: null as number | null }
  );

  const div = (a: number, b: number) => (b > 0 ? a / b : null);

  switch (metric) {
    case "SPEND":
      return totals.spendMicros;
    case "IMPRESSIONS":
      return totals.impressions;
    case "CLICKS":
      return totals.clicks;
    case "CONVERSIONS":
      return totals.conversions;
    case "CPA":
      return div(totals.spendMicros, totals.conversions);
    case "CPC":
      return div(totals.spendMicros, totals.clicks);
    case "CPM":
      return totals.impressions > 0 ? (totals.spendMicros / totals.impressions) * 1000 : null;
    case "CTR":
      return div(totals.clicks, totals.impressions);
    case "CONVERSION_RATE":
      return div(totals.conversions, totals.clicks);
    case "REVENUE":
      return totals.revenueMicros;
    case "ROAS":
      return totals.revenueMicros == null ? null : div(totals.revenueMicros, totals.spendMicros);
    default:
      return null;
  }
}

/** Daily series keyed by metric name, for the time-series widgets. */
function dailySeries(report: ReportData): Record<string, number | null>[] {
  return report.dailyData.map((d) => ({
    date: d.date as unknown as number, // carried through untouched for the x-axis
    SPEND: d.spendMicros,
    CONVERSIONS: d.conversions,
    CLICKS: d.clicks,
    IMPRESSIONS: d.impressions,
    CPA: d.cpaMicros,
    CPC: d.cpcMicros,
    CPM: d.cpmMicros,
    CTR: d.ctr,
    CONVERSION_RATE: d.cvr,
    REVENUE: d.revenueMicros,
    ROAS: d.roas,
  })) as unknown as Record<string, number | null>[];
}

/* ── Entity loading ────────────────────────────────────────────────────────── */

function levelFor(entity: ReportEntity): "campaign" | "ad_group" | "ad" {
  if (entity === "adgroup") return "ad_group";
  if (entity === "ad") return "ad";
  return "campaign";
}

function ttlFor(entity: ReportEntity): number {
  if (entity === "adgroup") return GET_ADGROUP_REPORTS;
  if (entity === "ad") return GET_AD_REPORTS;
  if (entity === "country" || entity === "device") return GET_SEGMENT_REPORTS;
  return GET_CAMPAIGN_REPORTS;
}

async function entityRows(
  userId: string,
  adAccountId: string,
  entity: ReportEntity,
  period: ResolvedPeriod
): Promise<Row[]> {
  const isSegment = entity === "country" || entity === "device";

  const report = await runCachedReport({
    userId,
    adAccountId,
    reportType: `render-${entity}`,
    request: {
      level: isSegment ? "campaign" : levelFor(entity),
      days: period.days,
      daily: false,
      ...(isSegment ? { segment: entity as "country" | "device" } : {}),
      limit: 1000,
    },
    ttl: ttlFor(entity),
  });

  if (isSegment) {
    return report.segments.map((s) => ({
      name: s.segmentLabel || s.segmentValue,
      performance: s.performance,
    }));
  }
  if (entity === "adgroup") {
    return report.adGroups.map((g) => ({ name: g.adGroupName, performance: g.performance }));
  }
  if (entity === "ad") {
    return report.ads.map((a) => ({ name: a.adName, performance: a.performance }));
  }
  return report.campaigns.map((c) => ({ name: c.campaignName, performance: c.performance }));
}

/* ── Render ────────────────────────────────────────────────────────────────── */

/**
 * Widget payloads are shape-per-type, so they are typed loosely here and read
 * by the renderer that knows the type. The narrow types live with each widget.
 */
export type RenderedWidgetData = Record<string, any> | null;

export type RenderedWidget = { id: string; type: string; title: string; data: RenderedWidgetData };

export type RenderedReport = {
  name: string;
  adAccountName: string | null;
  cover: ReportCover | null;
  period: ResolvedPeriod;
  currency: string;
  /**
   * False when the account has no configured value per conversion, so Revenue
   * and ROAS widgets render an explanation instead of a number.
   */
  revenueModelled: boolean;
  widgets: RenderedWidget[];
};

const MODELLED = new Set<AlertMetricKey>(["REVENUE", "ROAS"]);

export async function renderReport(opts: {
  userId: string;
  adAccountId: string;
  adAccountName?: string | null;
  name: string;
  cover?: ReportCover | null;
  dateRange: string;
  widgets: ReportWidgetInstance[];
}): Promise<RenderedReport> {
  const period = resolveReportRange(opts.dateRange);

  // The campaign report (daily) backs KPI, funnel and time-series widgets, and
  // is fetched once and shared.
  const wantsCampaignDaily = opts.widgets.some((w) =>
    ["kpiRow", "funnel", "timeSeries", "metricCompare"].includes(w.type)
  );

  const campaignReport = wantsCampaignDaily
    ? await runCachedReport({
        userId: opts.userId,
        adAccountId: opts.adAccountId,
        reportType: "render-campaign-daily",
        request: { level: "campaign", days: period.days, daily: true, limit: 1000 },
        ttl: GET_CAMPAIGN_REPORTS,
      })
    : null;

  const currency = campaignReport?.currency ?? "USD";
  const revenueModelled = campaignReport?.revenueModelled ?? false;

  const campaignRows: Row[] =
    campaignReport?.campaigns.map((c) => ({ name: c.campaignName, performance: c.performance })) ?? [];
  const series = campaignReport ? dailySeries(campaignReport) : [];

  const entityCache = new Map<ReportEntity, Row[]>();
  const getEntity = async (e: ReportEntity): Promise<Row[]> => {
    if (e === "campaign" && campaignRows.length) return campaignRows;
    const cached = entityCache.get(e);
    if (cached) return cached;
    const rows = await entityRows(opts.userId, opts.adAccountId, e, period);
    entityCache.set(e, rows);
    return rows;
  };

  const rendered: RenderedWidget[] = [];

  for (const w of opts.widgets) {
    const cfg = (w.config ?? {}) as Record<string, unknown>;
    const title = w.title || w.type;
    let data: RenderedWidgetData = null;

    try {
      if (w.type === "narrative") {
        data = { text: (cfg.text as string) ?? "" };
      } else if (w.type === "spacer") {
        data = {};
      } else if (w.type === "kpiRow") {
        const metrics = ((cfg.metrics as AlertMetricKey[]) ?? []).filter(
          (m) => revenueModelled || !MODELLED.has(m)
        );
        data = {
          currency,
          metrics: metrics.map((m) => ({ key: m, value: aggregate(campaignRows, m) })),
          // Surfaced so the renderer can explain an omission rather than
          // silently dropping a metric the user asked for.
          omitted: ((cfg.metrics as AlertMetricKey[]) ?? []).filter(
            (m) => !revenueModelled && MODELLED.has(m)
          ),
        };
      } else if (w.type === "funnel") {
        data = {
          currency,
          impressions: aggregate(campaignRows, "IMPRESSIONS"),
          clicks: aggregate(campaignRows, "CLICKS"),
          conversions: aggregate(campaignRows, "CONVERSIONS"),
        };
      } else if (w.type === "timeSeries") {
        const metric = (cfg.metric as string) || "SPEND";
        data = {
          currency,
          metric,
          style: (cfg.chartStyle as string) || "area",
          series: series.map((p) => ({ date: p.date, value: p[metric] ?? null })),
        };
      } else if (w.type === "metricCompare") {
        const a = (cfg.metric as string) || "SPEND";
        const b = (cfg.metricB as string) || "CONVERSIONS";
        data = {
          currency,
          metricA: a,
          metricB: b,
          series: series.map((p) => ({ date: p.date, a: p[a] ?? null, b: p[b] ?? null })),
        };
      } else if (w.type === "breakdownTable" || w.type === "topPerformers" || w.type === "distribution") {
        const entity = ((cfg.entity as ReportEntity) || "campaign") as ReportEntity;
        const rows = await getEntity(entity);

        const metricList = (
          w.type === "breakdownTable"
            ? ((cfg.metrics as AlertMetricKey[]) ?? ["SPEND", "CONVERSIONS", "CLICKS", "CPA"])
            : [(cfg.metric as AlertMetricKey) ?? "SPEND"]
        ).filter((m) => revenueModelled || !MODELLED.has(m));

        // One group per named entity — the report layer already returns one row
        // per entity, so this only merges genuine name collisions.
        const byName = new Map<string, Row[]>();
        for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);

        const items = [...byName.entries()].map(([name, group]) => {
          const values: Record<string, number | null> = {};
          for (const m of metricList) values[m] = aggregate(group, m);
          return { name, values };
        });

        const sortKey = metricList[0];
        items.sort((x, y) => (y.values[sortKey] ?? 0) - (x.values[sortKey] ?? 0));

        const limit = (cfg.limit as number) || (w.type === "breakdownTable" ? 15 : 10);
        data = {
          currency,
          entity,
          metrics: metricList,
          items: items.slice(0, limit),
          total: items.length,
        };
      }
    } catch (e) {
      data = { error: e instanceof Error ? e.message : "Failed to load widget data" };
    }

    rendered.push({ id: w.id, type: w.type, title, data });
  }

  return {
    name: opts.name,
    adAccountName: opts.adAccountName || null,
    cover: opts.cover || null,
    period,
    currency,
    revenueModelled,
    widgets: rendered,
  };
}
