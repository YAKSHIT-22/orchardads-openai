/**
 * Server-side validation for report templates: ensures stored widgets match the
 * catalog shape and configs reference valid metrics/entities.
 */

import { ALERT_METRIC_KEYS } from "@/lib/alerts/metrics";
import { reportWidgetDef, REPORT_ENTITIES, type ReportWidgetInstance } from "./widgets";

const ENTITY_KEYS = new Set(REPORT_ENTITIES.map((e) => e.key));
const RANGES = new Set(["7d", "14d", "30d", "90d", "this_month", "last_month"]);

export function isValidRange(r: string): boolean {
  return RANGES.has(r);
}

export function validateWidgets(widgets: unknown): { ok: true; widgets: ReportWidgetInstance[] } | { ok: false; error: string } {
  if (!Array.isArray(widgets) || widgets.length === 0) return { ok: false, error: "Add at least one widget" };
  const clean: ReportWidgetInstance[] = [];

  for (const raw of widgets as any[]) {
    const def = reportWidgetDef(raw?.type);
    if (!def) return { ok: false, error: `Unknown widget: ${raw?.type}` };

    const cfg: any = {};
    const c = raw?.config || {};
    if (def.fields.includes("metrics")) {
      const ms = Array.isArray(c.metrics) ? c.metrics.filter((m: any) => ALERT_METRIC_KEYS.includes(m)) : [];
      cfg.metrics = ms.length ? ms.slice(0, 8) : ["SPEND", "CONVERSIONS", "CLICKS", "CPA"];
    }
    if (def.fields.includes("metric")) cfg.metric = ALERT_METRIC_KEYS.includes(c.metric) ? c.metric : "SPEND";
    if (def.fields.includes("metricB")) cfg.metricB = ALERT_METRIC_KEYS.includes(c.metricB) ? c.metricB : "CONVERSIONS";
    if (def.fields.includes("entity")) cfg.entity = ENTITY_KEYS.has(c.entity) ? c.entity : "campaign";
    if (def.fields.includes("limit")) cfg.limit = Math.min(50, Math.max(1, Number(c.limit) || 10));
    if (def.fields.includes("chartStyle")) cfg.chartStyle = typeof c.chartStyle === "string" ? c.chartStyle.slice(0, 20) : "line";
    if (def.fields.includes("text")) cfg.text = typeof c.text === "string" ? c.text.slice(0, 4000) : "";

    clean.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : Math.random().toString(36).slice(2, 10),
      type: def.type,
      title: typeof raw.title === "string" ? raw.title.slice(0, 120) : def.name,
      config: cfg,
    });
  }
  return { ok: true, widgets: clean };
}
