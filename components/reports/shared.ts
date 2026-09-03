/**
 * Shared client-side helpers for the Report Designer: template/draft types,
 * starter presets, widget defaults and formatting utilities. Catalog data
 * (widgets, metrics, entities, ranges) comes from lib/reports/widgets —
 * nothing is hardcoded here beyond preset compositions.
 */

import {
  REPORT_DATE_RANGES,
  REPORT_ENTITIES,
  reportWidgetDef,
  type ReportCover,
  type ReportWidgetInstance,
  type ReportWidgetType,
} from "@/lib/reports/widgets";
import { metricDef, type AlertMetricKey } from "@/lib/alerts/metrics";
import { money } from "@/lib/format";
import {
  Blocks,
  Filter,
  GitCompareArrows,
  LayoutGrid,
  LineChart,
  Minus,
  PieChart,
  Table,
  Text,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface ReportTemplateRow {
  id: string;
  name: string;
  description: string | null;
  dateRange: string;
  cover: ReportCover | null;
  widgets: ReportWidgetInstance[];
  _count?: { schedules: number };
  updatedAt: string;
}

export interface RenderedWidget {
  id: string;
  type: string;
  title: string;
  data: any;
}

export interface RenderedReport {
  name: string;
  adAccountName: string | null;
  cover: ReportCover | null;
  period: { startTime: string; endTime: string; days: number; label: string };
  currency: string;
  widgets: RenderedWidget[];
}

/** The designer's working copy of a template (saved or not yet). */
export interface ReportDraft {
  id?: string;
  name: string;
  description: string;
  dateRange: string;
  cover: ReportCover;
  widgets: ReportWidgetInstance[];
}

/* ── Widget helpers ────────────────────────────────────────────────────────── */

export const uid = () => Math.random().toString(36).slice(2, 10);

const WIDGET_ICONS: Record<string, LucideIcon> = {
  LayoutGrid,
  LineChart,
  GitCompareArrows,
  Table,
  Trophy,
  PieChart,
  Filter,
  Text,
  Minus,
};

export function widgetIcon(name: string): LucideIcon {
  return WIDGET_ICONS[name] || Blocks;
}

/** Sensible starting config for a freshly added widget. */
export function defaultWidgetConfig(type: ReportWidgetType): ReportWidgetInstance["config"] {
  switch (type) {
    case "kpiRow":
      return { metrics: ["SPEND", "CONVERSIONS", "CLICKS", "CPA"] };
    case "timeSeries":
      return { metric: "SPEND", chartStyle: "area" };
    case "metricCompare":
      return { metric: "SPEND", metricB: "CONVERSIONS" };
    case "breakdownTable":
      return { entity: "campaign", metrics: ["SPEND", "CONVERSIONS", "CLICKS", "CPA"], limit: 15 };
    case "topPerformers":
      return { entity: "adgroup", metric: "CONVERSIONS", limit: 10 };
    case "distribution":
      return { entity: "campaign", metric: "SPEND", chartStyle: "pie" };
    case "narrative":
      return { text: "" };
    default:
      return {};
  }
}

export function newWidget(type: ReportWidgetType): ReportWidgetInstance {
  const def = reportWidgetDef(type);
  return { id: uid(), type, title: def?.name || type, config: defaultWidgetConfig(type) };
}

export function metricLabel(key?: string): string {
  return (key && metricDef(key)?.label) || key || "";
}

export function entityLabel(key?: string): string {
  return REPORT_ENTITIES.find((e) => e.key === key)?.label || key || "";
}

export function rangeLabel(value?: string): string {
  return REPORT_DATE_RANGES.find((r) => r.value === value)?.label || value || "";
}

/** One-line summary of a widget's config, shown in the designer outline. */
export function widgetSummary(w: ReportWidgetInstance): string {
  const c = w.config || {};
  switch (w.type) {
    case "kpiRow":
      return (c.metrics || []).map(metricLabel).join(" · ") || "Pick metrics";
    case "timeSeries":
      return `${metricLabel(c.metric)} · ${c.chartStyle || "area"}`;
    case "metricCompare":
      return `${metricLabel(c.metric)} vs ${metricLabel(c.metricB)}`;
    case "breakdownTable":
      return `${entityLabel(c.entity)} · ${(c.metrics || []).length} metrics · top ${c.limit || 15}`;
    case "topPerformers":
      return `Top ${c.limit || 10} ${entityLabel(c.entity).toLowerCase()} by ${metricLabel(c.metric)}`;
    case "distribution":
      return `${metricLabel(c.metric)} across ${entityLabel(c.entity).toLowerCase()} · ${c.chartStyle || "pie"}`;
    case "funnel":
      return "Impressions → taps → installs";
    case "narrative":
      return c.text ? `${c.text.slice(0, 64)}${c.text.length > 64 ? "…" : ""}` : "Empty text block";
    case "spacer":
      return "Section break (new page in PDF)";
    default:
      return "";
  }
}

/* ── Value formatting ──────────────────────────────────────────────────────── */

/** Format a metric value by its unit — money via the org currency, never "$". */
export function formatMetricValue(key: string, value: number, currency: string): string {
  const def = metricDef(key);
  const v = Number.isFinite(value) ? value : 0;
  if (def?.unit === "money") return money(currency || "USD", v);
  if (def?.unit === "rate") return `${(v * 100).toFixed(2)}%`;
  return Math.round(v).toLocaleString("en-US");
}

/** Compact axis-tick formatter for a metric (full values live in tooltips). */
export function metricTickFormatter(key?: string): (v: number) => string {
  const def = key ? metricDef(key) : undefined;
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  if (def?.unit === "rate") return (v: number) => `${(v * 100).toFixed(1)}%`;
  return (v: number) => compact.format(v);
}

/* ── Drafts & starter presets ──────────────────────────────────────────────── */

export const DEFAULT_ACCENT = "#6d28d9";

export function blankDraft(): ReportDraft {
  return {
    name: "",
    description: "",
    dateRange: "30d",
    cover: { title: "", subtitle: "", accent: DEFAULT_ACCENT, logoText: "", hideBranding: false },
    widgets: [newWidget("kpiRow"), newWidget("timeSeries")],
  };
}

export function draftFromTemplate(t: ReportTemplateRow): ReportDraft {
  return {
    id: t.id,
    name: t.name,
    description: t.description || "",
    dateRange: t.dateRange,
    cover: {
      title: t.cover?.title || "",
      subtitle: t.cover?.subtitle || "",
      accent: t.cover?.accent || DEFAULT_ACCENT,
      logoText: t.cover?.logoText || "",
      hideBranding: Boolean(t.cover?.hideBranding),
    },
    widgets: (t.widgets || []).map((w) => ({ ...w, config: { ...w.config } })),
  };
}

export interface StarterPreset {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  build: () => ReportDraft;
}

const preset = (
  type: ReportWidgetType,
  title: string,
  config: ReportWidgetInstance["config"]
): ReportWidgetInstance => ({ id: uid(), type, title, config });

export const STARTER_PRESETS: StarterPreset[] = [
  {
    key: "monthly-overview",
    name: "Monthly overview",
    description: "Headline KPIs, spend trend, funnel and a campaign table — the classic recap.",
    icon: LayoutGrid,
    build: () => ({
      name: "Monthly overview",
      description: "Account-wide performance recap",
      dateRange: "30d",
      cover: {
        title: "Monthly performance report",
        subtitle: "Apple Search Ads — account overview",
        accent: DEFAULT_ACCENT,
        logoText: "",
        hideBranding: false,
      },
      widgets: [
        preset("kpiRow", "Headline KPIs", { metrics: ["SPEND", "CONVERSIONS", "CLICKS", "CPA"] }),
        preset("timeSeries", "Daily spend", { metric: "SPEND", chartStyle: "area" }),
        preset("funnel", "Conversion funnel", {}),
        preset("breakdownTable", "Campaign performance", {
          entity: "campaign",
          metrics: ["SPEND", "CONVERSIONS", "CPA", "CTR"],
          limit: 15,
        }),
      ],
    }),
  },
  {
    key: "keyword-deep-dive",
    name: "Keyword deep-dive",
    description: "Top keywords, the search terms behind them, and efficiency KPIs.",
    icon: Trophy,
    build: () => ({
      name: "Keyword deep-dive",
      description: "Keyword and search-term performance",
      dateRange: "30d",
      cover: {
        title: "Keyword deep-dive",
        subtitle: "What people search, what converts",
        accent: DEFAULT_ACCENT,
        logoText: "",
        hideBranding: false,
      },
      widgets: [
        preset("kpiRow", "Headline KPIs", { metrics: ["SPEND", "CLICKS", "CONVERSIONS", "CPC"] }),
        preset("topPerformers", "Top keywords by installs", { entity: "adgroup", metric: "CONVERSIONS", limit: 10 }),
        preset("breakdownTable", "Search terms", {
          entity: "ad",
          metrics: ["SPEND", "CLICKS", "CONVERSIONS", "CONVERSION_RATE"],
          limit: 15,
        }),
      ],
    }),
  },
  {
    key: "executive-summary",
    name: "Executive summary",
    description: "A short narrative, KPIs, spend vs installs and where the budget goes.",
    icon: Text,
    build: () => ({
      name: "Executive summary",
      description: "One-page summary for stakeholders",
      dateRange: "last_month",
      cover: {
        title: "Executive summary",
        subtitle: "Apple Search Ads performance",
        accent: DEFAULT_ACCENT,
        logoText: "",
        hideBranding: false,
      },
      widgets: [
        preset("narrative", "Summary", {
          text: "Highlights for the period: overall spend, install volume and efficiency. Edit this block to add your own commentary before sending.",
        }),
        preset("kpiRow", "Headline KPIs", { metrics: ["SPEND", "CONVERSIONS", "CPA", "CONVERSION_RATE"] }),
        preset("metricCompare", "Spend vs installs", { metric: "SPEND", metricB: "CONVERSIONS" }),
        preset("distribution", "Where the budget goes", { entity: "campaign", metric: "SPEND", chartStyle: "pie" }),
      ],
    }),
  },
];
