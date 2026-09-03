"use client";

/**
 * ReportView — renders a server-rendered report payload (from /api/reports/render)
 * as a branded, print-ready document. Deliberately a white "paper" surface in
 * both app themes so the on-screen preview matches the PDF exactly.
 *
 * ReportPreviewOverlay wraps it full-screen with Download PDF (window.print
 * against a print stylesheet — no extra deps) and Schedule actions.
 */

import { useEffect } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { CHART } from "@/components/optimize/ui";
import {
  formatMetricValue,
  metricLabel,
  metricTickFormatter,
  type RenderedReport,
  type RenderedWidget,
  DEFAULT_ACCENT,
} from "@/components/reports/shared";
import { CalendarClock, Download, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";

/* Fixed-order categorical palette for the white report surface (validated). */
const SLICE_COLORS = [CHART.primary, CHART.teal, CHART.amber, CHART.rose, "#0369a1", "#4d7c0f", "#a21caf", "#71717a"];

const shortDate = (d: string) => (d?.length >= 10 ? d.slice(5) : d);

/* ── Small pieces ──────────────────────────────────────────────────────────── */

function WidgetTitle({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: accent }} />
      <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
    </div>
  );
}

function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
      <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
      <span>Couldn&apos;t load this widget: {message}</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] font-medium text-zinc-500 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-zinc-800 flex items-center gap-1.5 tabular-nums">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.stroke || p.fill }} />
          <span className="text-zinc-500">{p.name}:</span>
          <span className="font-semibold">{formatMetricValue(p.payload?.__metricByKey?.[p.dataKey] || p.dataKey, Number(p.value), currency)}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Widget renderers ──────────────────────────────────────────────────────── */

function KpiRowWidget({ data, currency }: { data: any; currency: string }) {
  const metrics: { key: string; value: number }[] = data?.metrics || [];
  if (!metrics.length) return <p className="text-xs text-zinc-500">No metrics selected.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div key={m.key} className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium truncate">{metricLabel(m.key)}</p>
          <p className="text-xl font-bold text-zinc-900 tabular-nums mt-0.5 truncate" title={formatMetricValue(m.key, m.value, currency)}>
            {formatMetricValue(m.key, m.value, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TimeSeriesWidget({ data, accent }: { data: any; accent: string }) {
  const metric: string = data?.metric || "SPEND";
  const currency: string = data?.currency || "USD";
  const series: { date: string; value: number }[] = data?.series || [];
  if (!series.length) return <p className="text-xs text-zinc-500">No daily data for this period.</p>;
  const tick = metricTickFormatter(metric);
  const rows = series.map((p) => ({ ...p, __metricByKey: { value: metric } }));
  const common = {
    data: rows,
    margin: { top: 6, right: 8, left: 0, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
      <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART.axis }} tickFormatter={shortDate} tickLine={false} axisLine={{ stroke: CHART.grid }} />
      <YAxis tick={{ fontSize: 10, fill: CHART.axis }} tickFormatter={tick} tickLine={false} axisLine={false} width={46} />
      <Tooltip content={<ChartTooltip currency={currency} />} />
    </>
  );
  const style = data?.style || "area";
  return (
    <ResponsiveContainer width="100%" height={230}>
      {style === "bar" ? (
        <BarChart {...common}>
          {axes}
          <Bar dataKey="value" name={metricLabel(metric)} fill={accent} radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      ) : style === "line" ? (
        <LineChart {...common}>
          {axes}
          <Line type="monotone" dataKey="value" name={metricLabel(metric)} stroke={accent} strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <AreaChart {...common}>
          <defs>
            <linearGradient id="reportAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accent} stopOpacity={0.22} />
              <stop offset="95%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {axes}
          <Area type="monotone" dataKey="value" name={metricLabel(metric)} stroke={accent} strokeWidth={2} fill="url(#reportAreaFill)" dot={false} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

function MetricCompareWidget({ data, accent }: { data: any; accent: string }) {
  const currency: string = data?.currency || "USD";
  const metricA: string = data?.metricA || "SPEND";
  const metricB: string = data?.metricB || "CONVERSIONS";
  const series: { date: string; a: number; b: number }[] = data?.series || [];
  if (!series.length) return <p className="text-xs text-zinc-500">No daily data for this period.</p>;
  const rows = series.map((p) => ({ ...p, __metricByKey: { a: metricA, b: metricB } }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART.axis }} tickFormatter={shortDate} tickLine={false} axisLine={{ stroke: CHART.grid }} />
        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: accent }} tickFormatter={metricTickFormatter(metricA)} tickLine={false} axisLine={false} width={46} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: CHART.teal }} tickFormatter={metricTickFormatter(metricB)} tickLine={false} axisLine={false} width={46} />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line yAxisId="left" type="monotone" dataKey="a" name={metricLabel(metricA)} stroke={accent} strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="b" name={metricLabel(metricB)} stroke={CHART.teal} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BreakdownTableWidget({ data }: { data: any }) {
  const currency: string = data?.currency || "USD";
  const metrics: string[] = data?.metrics || [];
  const items: { name: string; values: Record<string, number> }[] = data?.items || [];
  if (!items.length) return <p className="text-xs text-zinc-500">No rows with activity in this period.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-50 text-zinc-500">
            <th className="text-left font-medium px-3 py-2">Name</th>
            {metrics.map((m) => (
              <th key={m} className="text-right font-medium px-3 py-2 whitespace-nowrap">{metricLabel(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <td className="px-3 py-2 text-zinc-800 font-medium max-w-[260px] truncate" title={it.name}>{it.name}</td>
              {metrics.map((m) => (
                <td key={m} className="px-3 py-2 text-right tabular-nums text-zinc-700 whitespace-nowrap">
                  {formatMetricValue(m, it.values?.[m] ?? 0, currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {typeof data?.total === "number" && data.total > items.length && (
        <p className="px-3 py-1.5 text-[11px] text-zinc-400 border-t border-zinc-100 bg-zinc-50/50">
          Showing top {items.length} of {data.total}
        </p>
      )}
    </div>
  );
}

function DistributionWidget({ data, accent }: { data: any; accent: string }) {
  const currency: string = data?.currency || "USD";
  const metric: string = data?.metrics?.[0] || "SPEND";
  const items: { name: string; values: Record<string, number> }[] = data?.items || [];
  if (!items.length) return <p className="text-xs text-zinc-500">No rows with activity in this period.</p>;

  const rows = items.map((it) => ({ name: it.name, value: it.values?.[metric] ?? 0 }));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const colors = [accent, ...SLICE_COLORS.filter((c) => c.toLowerCase() !== accent.toLowerCase())];

  if ((data?.style || "pie") !== "pie") {
    const max = Math.max(...rows.map((r) => r.value), 1);
    return (
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3">
            <p className="text-xs text-zinc-700 truncate" title={r.name}>{r.name}</p>
            <div className="h-3.5 rounded-r-[4px] bg-zinc-100 overflow-hidden">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${Math.max((r.value / max) * 100, 1)}%`, backgroundColor: accent }}
              />
            </div>
            <p className="text-xs tabular-nums text-zinc-600 whitespace-nowrap">
              {formatMetricValue(metric, r.value, currency)}
              <span className="text-zinc-400 ml-1">({((r.value / total) * 100).toFixed(1)}%)</span>
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-[190px] h-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={86} paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, name: any) => [formatMetricValue(metric, Number(v), currency), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 min-w-0 w-full flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-zinc-700 truncate flex-1" title={r.name}>{r.name}</span>
            <span className="tabular-nums text-zinc-600 whitespace-nowrap">{formatMetricValue(metric, r.value, currency)}</span>
            <span className="tabular-nums text-zinc-400 w-12 text-right">{((r.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelWidget({ data, accent }: { data: any; accent: string }) {
  const currency: string = data?.currency || "USD";
  const impressions = Number(data?.impressions) || 0;
  const clicks = Number(data?.clicks) || 0;
  const conversions = Number(data?.conversions) || 0;
  const max = Math.max(impressions, 1);
  const steps = [
    { label: "Impressions", value: impressions, color: `${accent}55` },
    { label: "Clicks", value: clicks, color: `${accent}aa` },
    { label: "Conversions", value: conversions, color: accent },
  ];
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      {steps.map((s, i) => (
        <div key={s.label}>
          {i > 0 && (
            <p className="text-[11px] text-zinc-400 pl-[120px] py-0.5">
              ↓ {i === 1 ? `Tap-through rate ${ctr.toFixed(2)}%` : `Conversion rate ${cvr.toFixed(2)}%`}
            </p>
          )}
          <div className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
            <p className="text-xs font-medium text-zinc-600">{s.label}</p>
            <div className="h-6 bg-zinc-100 rounded-r-md overflow-hidden">
              <div className="h-full rounded-r-md" style={{ width: `${Math.max((s.value / max) * 100, 1.5)}%`, backgroundColor: s.color }} />
            </div>
            <p className="text-xs font-semibold tabular-nums text-zinc-800 whitespace-nowrap">
              {formatMetricValue("IMPRESSIONS", s.value, currency)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function WidgetBody({ w, accent, currency }: { w: RenderedWidget; accent: string; currency: string }) {
  const data = w.data;
  if (data?.error) return <WidgetError message={String(data.error)} />;
  switch (w.type) {
    case "kpiRow":
      return <KpiRowWidget data={data} currency={data?.currency || currency} />;
    case "timeSeries":
      return <TimeSeriesWidget data={data} accent={accent} />;
    case "metricCompare":
      return <MetricCompareWidget data={data} accent={accent} />;
    case "breakdownTable":
    case "topPerformers":
      return <BreakdownTableWidget data={data} />;
    case "distribution":
      return <DistributionWidget data={data} accent={accent} />;
    case "funnel":
      return <FunnelWidget data={data} accent={accent} />;
    case "narrative":
      return data?.text ? (
        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{data.text}</p>
      ) : (
        <p className="text-xs text-zinc-400 italic">Empty text block</p>
      );
    default:
      return null;
  }
}

/* ── The document ──────────────────────────────────────────────────────────── */

export function ReportView({ report }: { report: RenderedReport }) {
  const cover = report.cover || {};
  const accent = cover.accent || DEFAULT_ACCENT;
  return (
    <div className="bg-white text-zinc-900" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as any}>
      {/* Cover header */}
      <div className="h-2 w-full" style={{ backgroundColor: accent }} />
      <header className="px-8 pt-8 pb-6 border-b border-zinc-100">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{cover.title || report.name}</h1>
            {cover.subtitle && <p className="text-sm text-zinc-500 mt-1">{cover.subtitle}</p>}
          </div>
          {(cover.logoText || !cover.hideBranding) && (
            <span
              className="shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: `${accent}14`, color: accent }}
            >
              {cover.logoText || "OrchardAds"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-xs text-zinc-500">
          {report.adAccountName && (
            <span>
              <span className="text-zinc-400">Organization</span>{" "}
              <span className="font-medium text-zinc-700">{report.adAccountName}</span>
            </span>
          )}
          <span>
            <span className="text-zinc-400">Period</span>{" "}
            <span className="font-medium text-zinc-700">
              {report.period.label} · {report.period.startTime} → {report.period.endTime}
            </span>
          </span>
          <span>
            <span className="text-zinc-400">Currency</span>{" "}
            <span className="font-medium text-zinc-700">{report.currency}</span>
          </span>
        </div>
      </header>

      {/* Widgets */}
      <div className="px-8 py-6 flex flex-col gap-7">
        {report.widgets.map((w) =>
          w.type === "spacer" ? (
            <div key={w.id} className="py-1 print:break-after-page" style={{ breakInside: "avoid" }}>
              <hr className="border-zinc-200" />
            </div>
          ) : (
            <section key={w.id} style={{ breakInside: "avoid" }}>
              <WidgetTitle title={w.title} accent={accent} />
              <WidgetBody w={w} accent={accent} currency={report.currency} />
            </section>
          )
        )}
        {!report.widgets.length && <p className="text-sm text-zinc-400 text-center py-10">This report has no widgets yet.</p>}
      </div>

      {/* Footer */}
      {!cover.hideBranding && (
        <footer className="px-8 py-4 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Generated with OrchardAds</span>
          <span>{new Date().toLocaleDateString()}</span>
        </footer>
      )}
    </div>
  );
}

/* ── Full-screen preview + PDF ─────────────────────────────────────────────── */

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; }
  #orchard-report-print, #orchard-report-print * { visibility: visible !important; }
  #orchard-report-overlay {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    background: #fff !important;
    backdrop-filter: none !important;
  }
  #orchard-report-print {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
}
`;

export function ReportPreviewOverlay({
  open,
  loading,
  error,
  report,
  onClose,
  onRetry,
  onSchedule,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  report: RenderedReport | null;
  onClose: () => void;
  onRetry?: () => void;
  onSchedule?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div id="orchard-report-overlay" className="fixed inset-0 z-[100] bg-zinc-950/75 backdrop-blur-sm overflow-y-auto">
      <style>{PRINT_CSS}</style>

      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-zinc-900/95 border-b border-white/10 print:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{report?.cover?.title || report?.name || "Report preview"}</p>
          {report && (
            <p className="text-[11px] text-zinc-400 truncate">
              {report.period.label} · {report.period.startTime} → {report.period.endTime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onSchedule && report && (
            <Button variant="secondary" size="sm" className="h-8 gap-1.5" onClick={onSchedule}>
              <CalendarClock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Schedule</span>
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1.5" disabled={!report} onClick={() => window.print()}>
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-300 hover:text-white hover:bg-white/10" onClick={onClose} aria-label="Close preview">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-zinc-300">
          <Loader2 className="w-7 h-7 animate-spin" />
          <p className="text-sm">Rendering report with live OpenAI Ads data…</p>
          <p className="text-xs text-zinc-500">This can take a few seconds.</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-zinc-300">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-sm font-medium">Couldn&apos;t render this report</p>
          <p className="text-xs text-zinc-500 max-w-sm text-center">{error}</p>
          {onRetry && (
            <Button variant="secondary" size="sm" className="gap-1.5 mt-1" onClick={onRetry}>
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </Button>
          )}
        </div>
      ) : report ? (
        <div id="orchard-report-print" className="mx-auto my-6 md:my-8 max-w-[840px] bg-white rounded-xl shadow-2xl overflow-hidden">
          <ReportView report={report} />
        </div>
      ) : null}
    </div>
  );
}
