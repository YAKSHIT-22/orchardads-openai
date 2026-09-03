"use client";

/**
 * Shared presentation primitives for the dashboard insight widgets.
 * Presentation only — analysis logic lives in lib/dashboard/insights.ts.
 */

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHART_METRICS } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";
import { ArrowRight, TriangleAlert, type LucideIcon } from "lucide-react";

/** "Jan 5" — shared day label for the daily charts (axis ticks + tooltips). */
export const shortDate = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Responsive x-axis props for the daily charts. Every day in the range stays
 * plotted, but the chart is always `width:100%` — nothing scrolls sideways:
 * - ≤ 45 days: day labels, auto-thinned by recharts to fit the width;
 * - > 45 days (e.g. "this year"): one labelled tick per month.
 */
export function useDateAxis(dates: string[]): {
  tickFormatter: (v: string) => string;
  ticks?: string[];
  interval?: number;
  minTickGap?: number;
} {
  return useMemo(() => {
    if (dates.length <= 45) return { minTickGap: 24, tickFormatter: shortDate };
    // First datapoint of each month becomes the tick for that month.
    const seen = new Set<string>();
    const ticks: string[] = [];
    for (const d of dates) {
      const month = d.slice(0, 7);
      if (!seen.has(month)) {
        seen.add(month);
        ticks.push(d);
      }
    }
    const multiYear = new Set(dates.map((d) => d.slice(0, 4))).size > 1;
    const tickFormatter = (v: string) =>
      new Date(v).toLocaleDateString(
        "en-US",
        multiYear ? { month: "short", year: "2-digit" } : { month: "short" }
      );
    return { ticks, interval: 0, tickFormatter };
  }, [dates]);
}

/** Card shell: icon + title on the left, optional action link on the right. */
export function WidgetCard({
  icon: Icon,
  iconClass,
  title,
  action,
  children,
  className,
  flush = false,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove content padding (for list rows that own their own padding). */
  flush?: boolean;
}) {
  return (
    <Card className={cn("border rounded-xl", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Icon className={cn("w-4 h-4", iconClass || "text-primary")} />
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className={flush ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  );
}

/**
 * Compact chart-metric picker — one entry per registry metric, with a hue dot
 * tying the control to the series it drives.
 */
export function MetricSelect({
  value,
  onChange,
  excludeKey,
  dotColor,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (key: string) => void;
  /** Metric already shown on another axis — disabled here. */
  excludeKey?: string;
  dotColor: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      {/* w-fit + min-w: the trigger grows to the selected label so the chosen
          metric is always fully readable — no truncation. */}
      <SelectTrigger
        className={cn("w-fit min-w-32 max-w-full text-xs gap-1.5", className)}
        size="sm"
        aria-label={ariaLabel}
      >
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CHART_METRICS.map((m) => (
          <SelectItem
            key={m.key}
            value={m.key}
            disabled={m.key === excludeKey}
            className="text-xs"
            title={m.hint}
          >
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Small "Open tool →" header link. */
export function WidgetLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
    >
      {label} <ArrowRight className="w-3 h-3" />
    </Link>
  );
}

export function WidgetEmpty({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="w-9 h-9 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground/80 max-w-xs">{sub}</p>}
    </div>
  );
}

export function WidgetError({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <TriangleAlert className="w-8 h-8 text-rose-400" />
      <p className="text-sm font-medium text-muted-foreground">Couldn&apos;t load this widget</p>
      {message && <p className="text-xs text-muted-foreground/80 max-w-xs">{message}</p>}
    </div>
  );
}

export function WidgetSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${90 - (i % 3) * 16}%` }} />
      ))}
    </div>
  );
}

/**
 * Ranked list row: label (+ optional badge), a single-hue share bar, and
 * right-aligned primary/secondary values.
 */
export function RankRow({
  label,
  badge,
  fraction,
  value,
  sub,
  title,
}: {
  label: string;
  badge?: ReactNode;
  /** 0..1 share of the top entry — drives the bar length. */
  fraction: number;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t first:border-t-0 hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate" title={title || label}>
            {label}
          </span>
          {badge}
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          {/* Honest fill: no artificial minimum — near-zero share reads as a
              near-empty bar, the top entry fills the track completely. */}
          <div
            className="h-full bg-primary/80 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0 w-28">
        <div className="text-sm font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
      </div>
    </div>
  );
}
