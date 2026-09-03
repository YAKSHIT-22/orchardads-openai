"use client";

/**
 * Metric comparison — two user-selectable metrics from the daily series on a
 * dual axis (e.g. Spend vs Conversions). Each side is locked to one hue
 * (`--chart-1` / `--chart-2`, theme-aware) and its axis ticks wear the same
 * hue so there is never ambiguity about which scale a line reads against.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import {
  getChartMetric,
  formatMetricValue,
  formatMetricTick,
  type ChartMetric,
} from "@/lib/dashboard/metrics";
import { MetricSelect, shortDate, useDateAxis } from "./bits";
import type { DailyData } from "@/types/reportsDetails";
import { GitCompareArrows } from "lucide-react";

const SERIES = {
  a: { color: "var(--chart-1)" },
  b: { color: "var(--chart-2)" },
} as const;

function CompareTip({
  active,
  payload,
  label,
  a,
  b,
  currency,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number | null }[];
  label?: string;
  a: ChartMetric;
  b: ChartMetric;
  currency: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const byKey = new Map(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{shortDate(label)}</p>
      <div className="mt-1 flex flex-col gap-1">
        {(
          [
            { metric: a, key: "a", color: SERIES.a.color },
            { metric: b, key: "b", color: SERIES.b.color },
          ] as const
        ).map((s) => (
          <p key={s.key} className="text-sm font-semibold flex items-center gap-1.5 tabular-nums">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs font-medium text-muted-foreground">{s.metric.label}</span>
            {formatMetricValue(s.metric, currency, byKey.get(s.key) ?? null)}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ComparisonChart({
  data,
  currency,
  className,
}: {
  data: DailyData[];
  currency: string;
  className?: string;
}) {
  const [aKey, setAKey] = useState("spendMicros");
  const [bKey, setBKey] = useState("conversions");
  const a = getChartMetric(aKey);
  const b = getChartMetric(bKey);

  const chartData = useMemo(
    () => data.map((d) => ({ date: d.date, a: a.daily(d), b: b.daily(d) })),
    [data, a, b]
  );

  const headline = useMemo(
    () =>
      data.length
        ? { a: a.range(data), b: b.range(data) }
        : null,
    [data, a, b]
  );

  // Day labels for short ranges, month labels for long ones — never scrolls.
  const dates = useMemo(() => data.map((d) => d.date), [data]);
  const dateAxis = useDateAxis(dates);

  return (
    <Card className={`border rounded-xl min-w-0 ${className || ""}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <GitCompareArrows className="w-4 h-4 text-primary" />
              Metric Comparison
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {headline === null ? (
                "No data in this range"
              ) : (
                <>
                  <span className="text-foreground font-semibold">
                    {formatMetricValue(a, currency, headline.a)}
                  </span>{" "}
                  {a.label.toLowerCase()} vs{" "}
                  <span className="text-foreground font-semibold">
                    {formatMetricValue(b, currency, headline.b)}
                  </span>{" "}
                  {b.label.toLowerCase()} over {data.length} day{data.length === 1 ? "" : "s"}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <MetricSelect
              value={aKey}
              onChange={setAKey}
              excludeKey={bKey}
              dotColor={SERIES.a.color}
              ariaLabel="Left-axis metric"
            />
            <span className="text-[11px] text-muted-foreground">vs</span>
            <MetricSelect
              value={bKey}
              onChange={setBKey}
              excludeKey={aKey}
              dotColor={SERIES.b.color}
              ariaLabel="Right-axis metric"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-center">
            <GitCompareArrows className="w-9 h-9 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Nothing to compare yet</p>
            <p className="text-xs text-muted-foreground">
              Pick any two metrics once your campaigns have daily traffic.
            </p>
          </div>
        ) : (
          <ChartContainer
            config={{
              a: { label: a.label, color: SERIES.a.color },
              b: { label: b.label, color: SERIES.b.color },
            }}
            className="h-[260px] w-full"
          >
            <ComposedChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
                {...dateAxis}
              />
              <YAxis
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11, fill: SERIES.a.color }}
                tickFormatter={(v: number) => formatMetricTick(a, v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11, fill: SERIES.b.color }}
                tickFormatter={(v: number) => formatMetricTick(b, v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<CompareTip a={a} b={b} currency={currency} />}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="a"
                name={a.label}
                stroke={SERIES.a.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="b"
                name={b.label}
                stroke={SERIES.b.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
