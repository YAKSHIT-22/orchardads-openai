"use client";

/**
 * Performance widget — the dashboard's daily chart for ONE selected metric
 * (area, `--chart-1`), picked from the shared chart-metric registry (native +
 * calculated: CPA, CPT, CPM, CVR, TTR). Comparing two metrics lives in the
 * dedicated ComparisonChart, not here.
 *
 * The plot is always full width — every date in the range fits with no
 * horizontal scrolling. Short ranges label individual days; long ranges
 * (> ~45 days, e.g. "this year") label one tick per month (useDateAxis).
 * The y-axis labels (and the metric control) are pinned beside the plot.
 * The scale is computed once (nice ticks) and shared between the pinned
 * labels and the hidden recharts axis, so gridlines and labels always agree.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  getChartMetric,
  formatMetricValue,
  formatMetricTick,
  type ChartMetric,
} from "@/lib/dashboard/metrics";
import { MetricSelect, shortDate, useDateAxis } from "./bits";
import type { DailyData } from "@/types/reportsDetails";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

/* Geometry shared by the plot and the pinned axis labels. */
const CHART_HEIGHT = 280;
const PLOT_TOP = 8; // chart margin.top
const X_AXIS_HEIGHT = 30; // recharts default XAxis height
const TICK_COUNT = 4;

const SERIES_COLOR = "var(--chart-1)";

/* ── Nice scale ─────────────────────────────────────────────────────────────── */

function niceCeil(x: number): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

function buildScale(values: (number | null)[]): { max: number; ticks: number[] } {
  const rawMax = values.reduce<number>((m, v) => (v !== null && v > m ? v : m), 0);
  if (!(rawMax > 0)) return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const step = niceCeil(rawMax / TICK_COUNT);
  return {
    max: step * TICK_COUNT,
    ticks: Array.from({ length: TICK_COUNT + 1 }, (_, i) => step * i),
  };
}

/* ── Pinned y-axis labels ───────────────────────────────────────────────────── */

function AxisLabels({
  scale,
  metric,
}: {
  scale: { max: number; ticks: number[] };
  metric: ChartMetric;
}) {
  const plotH = CHART_HEIGHT - PLOT_TOP - X_AXIS_HEIGHT;
  return (
    <div
      className="relative shrink-0 w-12 select-none"
      style={{ height: CHART_HEIGHT }}
      aria-hidden
    >
      {scale.ticks.map((t) => (
        <span
          key={t}
          className="absolute text-[11px] leading-none tabular-nums text-muted-foreground"
          style={{
            top: PLOT_TOP + (1 - t / scale.max) * plotH - 5,
            right: 6,
          }}
        >
          {formatMetricTick(metric, t)}
        </span>
      ))}
    </div>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────────── */

function PerformanceTip({
  active,
  payload,
  label,
  metric,
  currency,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
  metric: ChartMetric;
  currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{shortDate(label)}</p>
      <p className="text-sm font-semibold mt-0.5 flex items-center gap-1.5 tabular-nums">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: SERIES_COLOR }}
        />
        <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
        {formatMetricValue(metric, currency, payload[0].value ?? null)}
      </p>
    </div>
  );
}

/* ── Widget ─────────────────────────────────────────────────────────────────── */

export function PerformanceChart({
  data,
  currency,
  className,
}: {
  data: DailyData[];
  currency: string;
  className?: string;
}) {
  const [metricKey, setMetricKey] = useState("spendMicros");
  const metric = getChartMetric(metricKey);

  const chartData = useMemo(
    () => data.map((d) => ({ date: d.date, value: metric.daily(d) })),
    [data, metric]
  );

  const scale = useMemo(() => buildScale(chartData.map((d) => d.value)), [chartData]);

  const headline = useMemo(() => (data.length ? metric.range(data) : null), [data, metric]);

  // Day labels for short ranges, month labels for long ones — never scrolls.
  const dates = useMemo(() => data.map((d) => d.date), [data]);
  const dateAxis = useDateAxis(dates);

  return (
    <Card className={cn("border rounded-xl min-w-0", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-primary" />
              Performance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {headline === null ? (
                "No data in this range"
              ) : (
                <>
                  <span className="text-foreground font-semibold">
                    {formatMetricValue(metric, currency, headline)}
                  </span>{" "}
                  {metric.aggregate === "ratio" ? "average" : "total"}{" "}
                  {metric.label.toLowerCase()} over {data.length} day
                  {data.length === 1 ? "" : "s"}
                </>
              )}
            </p>
          </div>
          <MetricSelect
            value={metricKey}
            onChange={setMetricKey}
            dotColor={SERIES_COLOR}
            ariaLabel="Performance metric"
            className="shrink-0 self-start xl:self-auto"
          />
        </div>
      </CardHeader>

      <CardContent>
        {data.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-center"
            style={{ height: CHART_HEIGHT }}
          >
            <Activity className="w-9 h-9 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No performance data yet</p>
            <p className="text-xs text-muted-foreground">
              Daily metrics appear here once your campaigns have traffic.
            </p>
          </div>
        ) : (
          <div className="flex min-w-0">
            {/* Pinned scale */}
            <AxisLabels scale={scale} metric={metric} />

            {/* Full-width plot — the whole range fits, nothing scrolls */}
            <div className="flex-1 min-w-0" style={{ height: CHART_HEIGHT }}>
              <ChartContainer
                config={{ value: { label: metric.label, color: SERIES_COLOR } }}
                className="h-full w-full"
              >
                <AreaChart
                  data={chartData}
                  margin={{ left: 0, right: 0, top: PLOT_TOP, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="perfAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    height={X_AXIS_HEIGHT}
                    tick={{ fontSize: 11 }}
                    {...dateAxis}
                  />
                  <YAxis hide domain={[0, scale.max]} ticks={scale.ticks} />
                  <Tooltip
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                    content={<PerformanceTip metric={metric} currency={currency} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={metric.label}
                    stroke={SERIES_COLOR}
                    strokeWidth={2}
                    fill="url(#perfAreaFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
