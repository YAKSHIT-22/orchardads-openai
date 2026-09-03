/**
 * Turn a RenderedReport into branded, email-safe HTML for scheduled delivery.
 * Charts are rendered as compact HTML tables / bars (no JS) so they survive in
 * email clients; the interactive charts live in the web designer/preview.
 */

import { emailLayout } from "@/lib/emailTemplates";
import { metricDef, formatMetric, type AlertMetricKey } from "@/lib/alerts/metrics";
import type { RenderedReport, RenderedWidget } from "./render";

const INK = "#18181b", MUTED = "#71717a", BORDER = "#e4e4e7", BG = "#f4f4f5", BRAND = "#0f7b56";
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (metric: string, v: number | null, currency: string) =>
  formatMetric(metric as AlertMetricKey, v, currency);

function kpiRow(w: RenderedWidget, currency: string): string {
  const metrics = (w.data?.metrics ?? []) as { key: string; value: number | null }[];
  const cells = metrics.map((m) => `
    <td style="padding:12px;background:${BG};border-radius:10px;text-align:center;width:${100 / Math.max(1, metrics.length)}%">
      <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.4px">${esc(metricDef(m.key)?.label || m.key)}</div>
      <div style="font-size:20px;font-weight:800;color:${INK};margin-top:3px">${esc(fmt(m.key, m.value, currency))}</div>
    </td>`).join('<td style="width:8px"></td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function funnel(w: RenderedWidget): string {
  const { impressions = 0, clicks = 0, conversions = 0 } = w.data || {};
  const ctr = impressions ? ((clicks / impressions) * 100).toFixed(2) : "0.00";
  const cvr = clicks ? ((conversions / clicks) * 100).toFixed(2) : "0.00";
  const bar = (label: string, val: number, base: number, color: string) => {
    const pct = base ? Math.max(3, (val / base) * 100) : 0;
    return `<tr><td style="padding:4px 0;font-size:12px;color:${MUTED};width:90px">${label}</td>
      <td style="padding:4px 0"><div style="background:${color};height:16px;width:${pct}%;border-radius:4px;min-width:24px"></div></td>
      <td style="padding:4px 0 4px 8px;font-size:13px;font-weight:700;color:${INK};text-align:right;white-space:nowrap">${val.toLocaleString()}</td></tr>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${bar("Impressions", impressions, impressions, "#c4b5fd")}
    ${bar("Clicks", clicks, impressions, "#8b5cf6")}
    ${bar("Conversions", conversions, impressions, "#6d28d9")}
  </table>
  <p style="margin:8px 0 0;font-size:12px;color:${MUTED}">Click-through ${ctr}% · Conversion ${cvr}%</p>`;
}

function table(w: RenderedWidget, currency: string): string {
  const metrics: string[] = w.data?.metrics || [];
  const head = `<tr><th style="text-align:left;padding:8px;font-size:11px;color:${MUTED};border-bottom:2px solid ${BORDER}">${esc(w.data?.entity || "")}</th>${metrics.map((m) => `<th style="text-align:right;padding:8px;font-size:11px;color:${MUTED};border-bottom:2px solid ${BORDER}">${esc(metricDef(m)?.label || m)}</th>`).join("")}</tr>`;
  const body = (w.data?.items || []).map((it: any) => `<tr>
    <td style="padding:8px;font-size:13px;color:${INK};border-bottom:1px solid ${BORDER};max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</td>
    ${metrics.map((m) => `<td style="padding:8px;font-size:13px;color:${INK};text-align:right;border-bottom:1px solid ${BORDER};white-space:nowrap">${esc(fmt(m, it.values[m] || 0, currency))}</td>`).join("")}
  </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${head}${body}</table>`;
}

function distribution(w: RenderedWidget, currency: string): string {
  const metric = w.data?.metrics?.[0] || "SPEND";
  const items = w.data?.items || [];
  const max = Math.max(1, ...items.map((i: any) => i.values[metric] || 0));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.slice(0, 10).map((it: any) => {
    const v = it.values[metric] || 0; const pct = Math.max(2, (v / max) * 100);
    return `<tr><td style="padding:3px 0;font-size:12px;color:${INK};width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.name)}</td>
      <td style="padding:3px 0"><div style="background:${BRAND};height:12px;width:${pct}%;border-radius:3px;min-width:16px"></div></td>
      <td style="padding:3px 0 3px 8px;font-size:12px;font-weight:600;color:${INK};text-align:right;white-space:nowrap">${esc(fmt(metric, v, currency))}</td></tr>`;
  }).join("")}</table>`;
}

function sparkNote(w: RenderedWidget): string {
  const n = (w.data?.series || []).length;
  return `<p style="margin:0;font-size:12px;color:${MUTED}">Daily trend over ${n} day${n === 1 ? "" : "s"} — view the interactive chart in the web report.</p>`;
}

function widgetHtml(w: RenderedWidget, currency: string): string {
  if (w.type === "spacer") return `<hr style="border:none;border-top:1px solid ${BORDER};margin:22px 0" />`;
  const title = w.type === "narrative" ? "" : `<h2 style="margin:0 0 10px;font-size:15px;font-weight:700;color:${INK}">${esc(w.title)}</h2>`;
  if (w.data?.error) return `${title}<p style="font-size:12px;color:#b91c1c">${esc(w.data.error)}</p>`;
  let body = "";
  switch (w.type) {
    case "narrative": body = `<p style="font-size:13px;color:${INK};line-height:1.6;white-space:pre-wrap">${esc(w.data?.text || "")}</p>`; break;
    case "kpiRow": body = kpiRow(w, currency); break;
    case "funnel": body = funnel(w); break;
    case "breakdownTable": case "topPerformers": body = table(w, currency); break;
    case "distribution": body = distribution(w, currency); break;
    case "timeSeries": case "metricCompare": body = sparkNote(w); break;
    default: body = "";
  }
  return `<div style="margin:0 0 22px">${title}${body}</div>`;
}

/** Full report HTML for email delivery. */
export function renderReportHtml(report: RenderedReport): { subject: string; html: string } {
  const cover = report.cover || {};
  const coverTitle = cover.title || report.name;
  const subject = `${report.name} — ${report.period.label} (${report.period.startTime} → ${report.period.endTime})`;

  const header = `
    <div style="margin:0 0 20px;padding:0 0 16px;border-bottom:2px solid ${BORDER}">
      <div style="font-size:22px;font-weight:800;color:${INK}">${esc(coverTitle)}</div>
      ${cover.subtitle ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">${esc(cover.subtitle)}</div>` : ""}
      <div style="font-size:12px;color:${MUTED};margin-top:6px">${esc(report.adAccountName || "")} · ${esc(report.period.label)} (${report.period.startTime} → ${report.period.endTime})</div>
    </div>`;

  const body = header + report.widgets.map((w) => widgetHtml(w, report.currency)).join("");
  return { subject, html: emailLayout({ title: subject, preheader: `${report.name} · ${report.period.label}`, bodyHtml: body }) };
}
