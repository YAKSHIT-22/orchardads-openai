"use client";

/**
 * Dashboard KPI strip — a single horizontally-scrollable line of headline
 * metrics derived from the campaign report totals, separated by vertical
 * dividers. Metrics come from the shared chart-metric registry (native +
 * calculated: CPA, CPT, CPM, CVR, TTR); ratios render "—" when the
 * denominator is zero rather than a misleading 0.
 *
 * With `selectable`, a table-style "Metrics" picker (checkbox dropdown) lets
 * the viewer choose which registry metrics appear. Without it (e.g. the
 * public Live Share page) the strip renders a clean fixed default set.
 */

import { useState } from "react";
import {
  CHART_METRICS,
  formatMetricValue,
  type ChartMetric,
} from "@/lib/dashboard/metrics";
import type { ReportTotals } from "@/types/reportsDetails";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontal } from "lucide-react";
import { InfoHint, METRIC_HINTS } from "@/components/ui/info-hint";

/** Plain-language explainers for the calculated (jargon) metrics. */
const KPI_EXPLAIN: Record<string, string> = {
  cpa: METRIC_HINTS.CPA,
  cpt: METRIC_HINTS.CPT,
  cpm: METRIC_HINTS.CPM,
  cvr: METRIC_HINTS.CR,
  ctr: METRIC_HINTS.TTR,
};

/** Sensible default subset — everything else stays one toggle away. */
const DEFAULT_KEYS = [
  "spendMicros",
  "conversions",
  "clicks",
  "impressions",
  "cpa",
  "cvr",
];

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/**
 * Range value for a registry metric computed from the report totals —
 * the same formulas the registry uses over the daily series, so the strip
 * always agrees with the charts.
 */
function metricValue(key: string, t: ReportTotals): number | null {
  switch (key) {
    case "spendMicros":
      return t.spendMicros;
    case "conversions":
      return t.conversions;
    case "clicks":
      return t.clicks;
    case "impressions":
      return t.impressions;
    case "cpa":
      return ratio(t.spendMicros, t.conversions);
    case "cpt":
      return ratio(t.spendMicros, t.clicks);
    case "cpm": {
      const r = ratio(t.spendMicros, t.impressions);
      return r === null ? null : r * 1000;
    }
    case "cvr":
      return ratio(t.conversions, t.clicks);
    case "ctr":
      return ratio(t.clicks, t.impressions);
    default:
      return null;
  }
}

/** Secondary line: per-day average for totals, the formula hint for ratios. */
function metricSub(
  metric: ChartMetric,
  value: number | null,
  currency: string,
  days: number
): string {
  if (metric.aggregate === "sum" && value !== null) {
    const perDay = value / Math.max(1, days);
    return `${formatMetricValue(metric, currency, perDay)} / day`;
  }
  return metric.hint;
}

function StripItem({
  metric,
  totals,
  currency,
  days,
}: {
  metric: ChartMetric;
  totals: ReportTotals;
  currency: string;
  days: number;
}) {
  const value = metricValue(metric.key, totals);
  return (
    <div className="flex flex-col justify-center gap-0.5 px-5 py-4 shrink-0 min-w-[9.5rem]">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {metric.label}
        {KPI_EXPLAIN[metric.key] && (
          <InfoHint className="ml-1">{KPI_EXPLAIN[metric.key]}</InfoHint>
        )}
      </span>
      <span className="text-xl font-semibold tracking-tight tabular-nums whitespace-nowrap text-foreground">
        {formatMetricValue(metric, currency, value)}
      </span>
      <span className="text-[11px] text-muted-foreground/80 whitespace-nowrap">
        {metricSub(metric, value, currency, days)}
      </span>
    </div>
  );
}

export function KpiRow({
  totals,
  currency,
  days,
  selectable = false,
}: {
  totals: ReportTotals;
  currency: string;
  days: number;
  /** Show the "Metrics" columns-style picker (dashboard only). */
  selectable?: boolean;
}) {
  const [keys, setKeys] = useState<string[]>(DEFAULT_KEYS);

  const toggle = (key: string, on: boolean) => {
    setKeys((prev) => {
      if (on) {
        // Preserve registry order regardless of toggle order.
        return CHART_METRICS.map((m) => m.key).filter(
          (k) => prev.includes(k) || k === key
        );
      }
      // Keep at least one metric on the strip.
      if (prev.length === 1) return prev;
      return prev.filter((k) => k !== key);
    });
  };

  const visible = CHART_METRICS.filter((m) => keys.includes(m.key));

  return (
    <div className="mb-6 rounded-xl border bg-card text-card-foreground shadow-sm flex items-stretch min-w-0">
      <div
        className="flex-1 min-w-0 flex items-stretch divide-x divide-border overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="list"
        aria-label="Key performance metrics"
      >
        {visible.map((m) => (
          <div role="listitem" key={m.key} className="flex shrink-0" title={m.hint}>
            <StripItem metric={m} totals={totals} currency={currency} days={days} />
          </div>
        ))}
      </div>

      {selectable && (
        <div className="flex items-center border-l border-border px-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                aria-label="Choose metrics"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Metrics</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">Show metrics</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CHART_METRICS.map((m) => {
                const checked = keys.includes(m.key);
                return (
                  <DropdownMenuCheckboxItem
                    key={m.key}
                    checked={checked}
                    disabled={checked && keys.length === 1}
                    onCheckedChange={(on) => toggle(m.key, on === true)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    {m.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
