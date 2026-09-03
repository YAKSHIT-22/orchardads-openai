"use client";

/**
 * Daily performance trend — a single-series area chart over the daily
 * campaign series. The metric comes from the shared chart-metric registry
 * (native + calculated: CPA, CPC, CPM, CVR, CTR). One axis, one hue
 * (`--primary`), theme-aware; the tooltip carries the exact value in the
 * org currency.
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
import { MetricSelect } from "./bits";
import { cn } from "@/lib/utils";
import type { DailyData } from "@/types/reportsDetails";
import { Activity } from "lucide-react";

const shortDate = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function TrendTip({
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
      <p className="text-sm font-semibold mt-0.5 tabular-nums">
        {metric.label}: {formatMetricValue(metric, currency, payload[0].value ?? null)}
      </p>
    </div>
  );
}

export function TrendChart({
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

  const headline = useMemo(() => (data.length ? metric.range(data) : null), [data, metric]);

  return (
    <Card className={cn("border rounded-xl min-w-0", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-primary" />
              Daily Performance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {headline === null ? (
                "No data in this range"
              ) : (
                <>
                  <span className="text-foreground font-semibold">
                    {formatMetricValue(metric, currency, headline)}
                  </span>{" "}
                  {metric.aggregate === "ratio" ? "average" : "total"} {metric.label.toLowerCase()}{" "}
                  over {data.length} day{data.length === 1 ? "" : "s"}
                </>
              )}
            </p>
          </div>
          <MetricSelect
            value={metricKey}
            onChange={setMetricKey}
            dotColor="var(--primary)"
            ariaLabel="Trend metric"
            className="shrink-0 self-start sm:self-auto"
          />
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-center">
            <Activity className="w-9 h-9 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No trend data yet</p>
            <p className="text-xs text-muted-foreground">
              Daily performance appears here once your campaigns have traffic.
            </p>
          </div>
        ) : (
          <ChartContainer
            config={{ value: { label: metric.label, color: "var(--primary)" } }}
            className="h-[260px] w-full"
          >
            <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="dashTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tick={{ fontSize: 11 }}
                tickFormatter={shortDate}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatMetricTick(metric, v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<TrendTip metric={metric} currency={currency} />}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#dashTrendFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
