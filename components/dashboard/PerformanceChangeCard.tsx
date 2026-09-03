"use client";

/**
 * Performance change — the selected date range vs the immediately preceding
 * equal-length period. A KPI selector drives the headline delta (▲/▼ %,
 * colour-coded, direction-aware for "lower is better" cost metrics) and a
 * top-movers table of the campaigns that improved / declined most.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Loader2, AlertCircle, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIDGET_KPIS, getWidgetKpi, formatKpi, computeMovers, type CampaignAgg,
} from "@/lib/dashboard/widgetHelpers";

function DeltaBadge({ pct, good, className }: { pct: number | null; good: boolean; className?: string }) {
  if (pct === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(pct * 100).toFixed(1)}%
    </span>
  );
}

export function PerformanceChangeCard({
  currentAgg,
  previousAgg,
  currency,
  isLoading,
  isError,
  prevLabel,
}: {
  currentAgg: Map<string, CampaignAgg>;
  previousAgg: Map<string, CampaignAgg>;
  currency: string;
  isLoading: boolean;
  isError: boolean;
  prevLabel: string;
}) {
  const [kpiKey, setKpiKey] = useState("spend");
  const kpi = getWidgetKpi(kpiKey);

  const { movers, totalBefore, totalAfter } = useMemo(
    () => computeMovers(currentAgg, previousAgg, kpi),
    [currentAgg, previousAgg, kpi],
  );

  const totalDelta = totalAfter !== null && totalBefore !== null ? totalAfter - totalBefore : null;
  const totalPct = totalBefore && totalBefore !== 0 && totalDelta !== null ? totalDelta / totalBefore : null;
  // "Good" = higher for volume KPIs, lower for cost KPIs.
  const totalGood = totalPct === null ? true : kpi.lowerIsBetter ? totalPct <= 0 : totalPct >= 0;

  const topMovers = movers.filter((m) => m.delta !== null && m.delta !== 0).slice(0, 6);

  return (
    <Card className="border rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <GitCompareArrows className="w-4 h-4 text-primary" />
          Performance Change
          <span className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-normal">
                  {kpi.label}
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {WIDGET_KPIS.map((k) => (
                  <DropdownMenuItem key={k.key} onClick={() => setKpiKey(k.key)} className="text-xs">
                    {k.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading previous period…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center text-sm text-rose-500">
            <AlertCircle className="w-6 h-6" /> Couldn&apos;t load the comparison period.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Headline delta */}
            <div className="rounded-lg bg-muted/60 p-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">This period</div>
                <div className="text-2xl font-semibold tabular-nums">{formatKpi(kpi, currency, totalAfter)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  vs {formatKpi(kpi, currency, totalBefore)} ({prevLabel})
                </div>
              </div>
              <div className="text-right">
                <DeltaBadge pct={totalPct} good={totalGood} className="text-base" />
                {totalDelta !== null && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    {totalDelta >= 0 ? "+" : "−"}
                    {formatKpi(kpi, currency, Math.abs(totalDelta))}
                  </div>
                )}
              </div>
            </div>

            {/* Top movers */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">Top movers</div>
              {topMovers.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No campaign-level change for {kpi.label.toLowerCase()} in this window.
                </p>
              ) : (
                <div className="flex flex-col divide-y">
                  {topMovers.map((m) => {
                    const good = m.pct === null ? true : kpi.lowerIsBetter ? (m.pct ?? 0) <= 0 : (m.pct ?? 0) >= 0;
                    return (
                      <div key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="flex-1 min-w-0 truncate" title={m.name}>{m.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatKpi(kpi, currency, m.before)} → {formatKpi(kpi, currency, m.after)}
                        </span>
                        <DeltaBadge pct={m.pct} good={good} className="w-16 justify-end text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
