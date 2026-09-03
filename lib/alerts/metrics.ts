import type { Performance } from "@/types/reportsDetails";

/**
 * Metric catalog for Orchard Watch alerts.
 *
 * Every metric an alert can watch. The list is deliberately short because it is
 * bounded by what the OpenAI Ads API actually returns:
 *
 *   delivery insights  -> impressions, clicks, spend, ctr, cpc, cpm
 *   conversions API    -> conversions (click-through only)
 *   derived            -> cpa, conversion rate
 *   modelled           -> revenue, roas
 *
 * REVENUE and ROAS are modelled from the advertiser's configured value per
 * conversion. There is no revenue field anywhere in the read API. An alert on
 * either is only offered once that value is configured; otherwise the metric is
 * unavailable rather than silently zero.
 *
 * Money is handled in MICROS throughout, matching the API, and converted only
 * for display.
 */

export type AlertMetricKey =
  | "SPEND"
  | "IMPRESSIONS"
  | "CLICKS"
  | "CTR"
  | "CPC"
  | "CPM"
  | "CONVERSIONS"
  | "CPA"
  | "CONVERSION_RATE"
  | "REVENUE"
  | "ROAS";

export type MetricUnit = "money" | "count" | "rate" | "ratio";

export interface MetricDef {
  key: AlertMetricKey;
  label: string;
  unit: MetricUnit;
  /** True for metrics we compute rather than read straight from the API. */
  calculated: boolean;
  /** True for metrics that only exist once a value per conversion is set. */
  modelled?: boolean;
  /** Short help shown next to the metric in the UI. */
  hint: string;
}

export const ALERT_METRICS: MetricDef[] = [
  { key: "SPEND", label: "Spend", unit: "money", calculated: false, hint: "Total ad spend" },
  { key: "IMPRESSIONS", label: "Impressions", unit: "count", calculated: false, hint: "Times your ad was shown" },
  { key: "CLICKS", label: "Clicks", unit: "count", calculated: false, hint: "Clicks on your ad" },
  { key: "CTR", label: "Click-through rate", unit: "rate", calculated: false, hint: "Clicks / impressions" },
  { key: "CPC", label: "Cost per click", unit: "money", calculated: false, hint: "Spend / clicks" },
  { key: "CPM", label: "Cost per 1k impressions", unit: "money", calculated: false, hint: "Spend / impressions x 1000" },
  {
    key: "CONVERSIONS",
    label: "Conversions",
    unit: "count",
    calculated: false,
    hint: "Click-through conversions. View-through is reported separately and never added.",
  },
  { key: "CPA", label: "Cost per conversion", unit: "money", calculated: true, hint: "Spend / conversions" },
  { key: "CONVERSION_RATE", label: "Conversion rate", unit: "rate", calculated: true, hint: "Conversions / clicks" },
  {
    key: "REVENUE",
    label: "Revenue (modelled)",
    unit: "money",
    calculated: true,
    modelled: true,
    hint: "Conversions x your value per conversion. OpenAI Ads doesn't report revenue.",
  },
  {
    key: "ROAS",
    label: "ROAS (modelled)",
    unit: "ratio",
    calculated: true,
    modelled: true,
    hint: "Modelled revenue / spend. Set a value per conversion to enable it.",
  },
];

export const ALERT_METRIC_KEYS: AlertMetricKey[] = ALERT_METRICS.map((m) => m.key);

export function metricDef(key: string): MetricDef | undefined {
  return ALERT_METRICS.find((m) => m.key === key);
}

/** Metrics available given whether the account has a value per conversion set. */
export function availableMetrics(hasConversionValue: boolean): MetricDef[] {
  return ALERT_METRICS.filter((m) => !m.modelled || hasConversionValue);
}

/**
 * Read a metric off a Performance row.
 *
 * Null-safe on purpose: derived metrics are null when their denominator is zero,
 * and a null must not silently become 0 — "no clicks yet" and "a CPC of zero"
 * are completely different facts, and only one of them should trigger an alert.
 * Returns null when the metric genuinely has no value.
 */
export function readMetric(p: Performance, metric: AlertMetricKey): number | null {
  switch (metric) {
    case "SPEND":
      return p.spendMicros;
    case "IMPRESSIONS":
      return p.impressions;
    case "CLICKS":
      return p.clicks;
    case "CTR":
      return p.ctr;
    case "CPC":
      return p.cpcMicros;
    case "CPM":
      return p.cpmMicros;
    case "CONVERSIONS":
      return p.conversions;
    case "CPA":
      return p.cpaMicros;
    case "CONVERSION_RATE":
      return p.cvr;
    case "REVENUE":
      return p.revenueMicros;
    case "ROAS":
      return p.roas;
  }
}

/** Same, but from raw daily aggregates rather than a Performance row. */
export function readMetricFromTotals(
  totals: { impressions: number; clicks: number; spendMicros: number; conversions: number },
  metric: AlertMetricKey,
  conversionValueMicros?: number | null
): number | null {
  const { impressions, clicks, spendMicros, conversions } = totals;
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const revenue = conversionValueMicros == null ? null : conversions * conversionValueMicros;

  switch (metric) {
    case "SPEND":
      return spendMicros;
    case "IMPRESSIONS":
      return impressions;
    case "CLICKS":
      return clicks;
    case "CTR":
      return div(clicks, impressions);
    case "CPC":
      return div(spendMicros, clicks);
    case "CPM":
      return impressions > 0 ? (spendMicros / impressions) * 1000 : null;
    case "CONVERSIONS":
      return conversions;
    case "CPA":
      return div(spendMicros, conversions);
    case "CONVERSION_RATE":
      return div(conversions, clicks);
    case "REVENUE":
      return revenue;
    case "ROAS":
      return revenue == null ? null : div(revenue, spendMicros);
  }
}

/** Format a metric value for human-readable alert messages. */
export function formatMetric(metric: AlertMetricKey, value: number | null, currency: string): string {
  if (value === null || value === undefined) return "n/a";
  const def = metricDef(metric);
  if (!def) return String(value);

  if (def.unit === "rate") return `${(value * 100).toFixed(2)}%`;
  if (def.unit === "ratio") return `${value.toFixed(2)}x`;
  if (def.unit === "money") {
    const units = value / 1_000_000;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(units);
    } catch {
      return `${currency} ${units.toFixed(2)}`;
    }
  }
  return Math.round(value).toLocaleString();
}

/** True when a higher value is worse — drives alert severity wording. */
export function higherIsWorse(metric: AlertMetricKey): boolean {
  return metric === "CPA" || metric === "CPC" || metric === "CPM" || metric === "SPEND";
}
