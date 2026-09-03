/**
 * Chart metric registry — one definition per plottable dashboard metric over
 * the daily campaign series. Native Apple metrics are summed; derived
 * metrics (CPA, CPT, CPM, CVR, TTR) are recomputed per day / per range from
 * the raw fields so range aggregates stay correct (never averaged averages).
 *
 * Division-by-zero yields `null` → rendered as "—" (or a gap in a line).
 */

import type { DailyData } from "@/types/reportsDetails";
import { money } from "@/lib/format";

export type MetricKind = "money" | "count" | "percent";

export interface ChartMetric {
  key: string;
  label: string;
  /** Short explanation shown in tooltips/subtitles. */
  hint: string;
  kind: MetricKind;
  /** Whether the range headline is a sum ("total") or a ratio ("average"). */
  aggregate: "sum" | "ratio";
  /** Per-day value; null when undefined for that day (e.g. ÷0). */
  daily: (d: DailyData) => number | null;
  /** Aggregate over the whole range; null when undefined. */
  range: (days: DailyData[]) => number | null;
}

const sum = (days: DailyData[], f: (d: DailyData) => number) =>
  days.reduce((s, d) => s + (Number(f(d)) || 0), 0);

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export const CHART_METRICS: ChartMetric[] = [
  {
    key: "spendMicros",
    label: "Spend",
    hint: "Total spend",
    kind: "money",
    aggregate: "sum",
    daily: (d) => d.spendMicros,
    range: (days) => sum(days, (d) => d.spendMicros),
  },
  {
    key: "conversions",
    label: "Conversions",
    hint: "Total conversions (tap + view-through)",
    kind: "count",
    aggregate: "sum",
    daily: (d) => d.conversions,
    range: (days) => sum(days, (d) => d.conversions),
  },
  {
    key: "clicks",
    label: "Clicks",
    hint: "Total clicks",
    kind: "count",
    aggregate: "sum",
    daily: (d) => d.clicks,
    range: (days) => sum(days, (d) => d.clicks),
  },
  {
    key: "impressions",
    label: "Impressions",
    hint: "Total impressions",
    kind: "count",
    aggregate: "sum",
    daily: (d) => d.impressions,
    range: (days) => sum(days, (d) => d.impressions),
  },
  {
    key: "cpa",
    label: "Cost per Install",
    hint: "Spend ÷ conversions",
    kind: "money",
    aggregate: "ratio",
    daily: (d) => ratio(d.spendMicros, d.conversions),
    range: (days) => ratio(sum(days, (d) => d.spendMicros), sum(days, (d) => d.conversions)),
  },
  {
    key: "cpt",
    label: "Cost per Tap",
    hint: "Spend ÷ clicks",
    kind: "money",
    aggregate: "ratio",
    daily: (d) => ratio(d.spendMicros, d.clicks),
    range: (days) => ratio(sum(days, (d) => d.spendMicros), sum(days, (d) => d.clicks)),
  },
  {
    key: "cpm",
    label: "CPM",
    hint: "Spend ÷ impressions × 1,000",
    kind: "money",
    aggregate: "ratio",
    daily: (d) => {
      const r = ratio(d.spendMicros, d.impressions);
      return r === null ? null : r * 1000;
    },
    range: (days) => {
      const r = ratio(sum(days, (d) => d.spendMicros), sum(days, (d) => d.impressions));
      return r === null ? null : r * 1000;
    },
  },
  {
    key: "cvr",
    label: "Conversion Rate",
    hint: "Conversions ÷ clicks",
    kind: "percent",
    aggregate: "ratio",
    daily: (d) => ratio(d.conversions, d.clicks),
    range: (days) => ratio(sum(days, (d) => d.conversions), sum(days, (d) => d.clicks)),
  },
  {
    key: "ctr",
    label: "Tap-through Rate",
    hint: "Clicks ÷ impressions",
    kind: "percent",
    aggregate: "ratio",
    daily: (d) => ratio(d.clicks, d.impressions),
    range: (days) => ratio(sum(days, (d) => d.clicks), sum(days, (d) => d.impressions)),
  },
];

export const getChartMetric = (key: string): ChartMetric =>
  CHART_METRICS.find((m) => m.key === key) ?? CHART_METRICS[0];

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Exact value for tooltips/headlines — money in the org currency, never "$". */
export function formatMetricValue(metric: ChartMetric, currency: string, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (metric.kind === "money") return money(currency, v);
  if (metric.kind === "percent") return `${(v * 100).toFixed(2)}%`;
  return Math.round(v).toLocaleString();
}

/** Compact value for axis ticks. */
export function formatMetricTick(metric: ChartMetric, v: number): string {
  if (!Number.isFinite(v)) return "";
  if (metric.kind === "percent") return `${(v * 100).toFixed(v * 100 >= 10 ? 0 : 1)}%`;
  return compact.format(v);
}
