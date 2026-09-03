/**
 * Report Designer widget catalog — the blocks a user can drop into a report
 * template. Client-safe (no server imports): the designer UI reads this to
 * offer widgets and configure them; the server render (lib/reports/render.ts)
 * computes each widget's data from the report layer. Widget instances are stored
 * on ReportTemplate.widgets as `{ id, type, title, config }`.
 */

import type { AlertMetricKey } from "@/lib/alerts/metrics";

export type ReportWidgetType =
  | "kpiRow" // scorecard tiles for chosen metrics
  | "timeSeries" // daily line/area chart for one metric
  | "metricCompare" // two-metric comparison over time
  | "breakdownTable" // table of entities (campaign/adgroup/ad/country/device) with metric columns
  | "topPerformers" // ranked top-N entities by a metric
  | "distribution" // share of a metric across entities (pie/bar)
  | "funnel" // impressions → clicks → conversions
  | "narrative" // free-text / auto summary
  | "spacer"; // divider / page break

/**
 * Entities a report widget can break down by.
 *
 * No keyword or search-term entities: the OpenAI Ads API has neither. `country`
 * and `device` come from the insights `segments[]` parameter, which allows
 * exactly one segment per request.
 */
export type ReportEntity = "campaign" | "adgroup" | "ad" | "country" | "device";

export interface ReportWidgetDef {
  type: ReportWidgetType;
  name: string;
  description: string;
  icon: string; // lucide icon name (resolved in the UI)
  /** Config fields the designer should expose for this widget. */
  fields: ("metrics" | "metric" | "metricB" | "entity" | "limit" | "chartStyle" | "text")[];
  /** Whether it needs report data (narrative/spacer don't). */
  needsData: boolean;
}

export const REPORT_METRICS: AlertMetricKey[] = [
  "SPEND", "CONVERSIONS", "CLICKS", "IMPRESSIONS", "CPA", "CPC", "CPM", "CTR", "CONVERSION_RATE",
];

export const REPORT_ENTITIES: { key: ReportEntity; label: string }[] = [
  { key: "campaign", label: "Campaigns" },
  { key: "adgroup", label: "Ad groups" },
  { key: "ad", label: "Ads" },
  { key: "country", label: "Countries" },
  { key: "device", label: "Devices" },
];

export const REPORT_WIDGETS: ReportWidgetDef[] = [
  {
    type: "kpiRow",
    name: "KPI scorecards",
    description: "Headline totals for the metrics you pick (spend, conversions, CPA…).",
    icon: "LayoutGrid",
    fields: ["metrics"],
    needsData: true,
  },
  {
    type: "timeSeries",
    name: "Trend chart",
    description: "Daily performance of one metric over the report period.",
    icon: "LineChart",
    fields: ["metric", "chartStyle"],
    needsData: true,
  },
  {
    type: "metricCompare",
    name: "Metric comparison",
    description: "Two metrics on a dual-axis chart to spot correlation.",
    icon: "GitCompareArrows",
    fields: ["metric", "metricB"],
    needsData: true,
  },
  {
    type: "breakdownTable",
    name: "Performance table",
    description: "A table of campaigns, ad groups, ads, countries or devices.",
    icon: "Table",
    fields: ["entity", "metrics", "limit"],
    needsData: true,
  },
  {
    type: "topPerformers",
    name: "Top performers",
    description: "The top N entities ranked by a metric.",
    icon: "Trophy",
    fields: ["entity", "metric", "limit"],
    needsData: true,
  },
  {
    type: "distribution",
    name: "Distribution",
    description: "How a metric splits across your entities (pie / bar).",
    icon: "PieChart",
    fields: ["entity", "metric", "chartStyle"],
    needsData: true,
  },
  {
    type: "funnel",
    name: "Conversion funnel",
    description: "Impressions → clicks → conversions, with rates.",
    icon: "Filter",
    fields: [],
    needsData: true,
  },
  {
    type: "narrative",
    name: "Text / narrative",
    description: "A free-text block for context, commentary or an intro.",
    icon: "Text",
    fields: ["text"],
    needsData: false,
  },
  {
    type: "spacer",
    name: "Divider",
    description: "A section break to structure the report.",
    icon: "Minus",
    fields: [],
    needsData: false,
  },
];

export function reportWidgetDef(type: string): ReportWidgetDef | undefined {
  return REPORT_WIDGETS.find((w) => w.type === type);
}

export const REPORT_DATE_RANGES: { value: string; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

/** A single widget instance stored on a template. */
export interface ReportWidgetInstance {
  id: string;
  type: ReportWidgetType;
  title?: string;
  config?: {
    metrics?: AlertMetricKey[];
    metric?: AlertMetricKey;
    metricB?: AlertMetricKey;
    entity?: ReportEntity;
    limit?: number;
    chartStyle?: string;
    text?: string;
  };
}

export interface ReportCover {
  title?: string;
  subtitle?: string;
  accent?: string;
  logoText?: string;
  hideBranding?: boolean;
}
