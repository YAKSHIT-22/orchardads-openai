"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { money, count, percent, toUnits } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ReportData } from "@/types/reportsDetails";

/**
 * Time Performance.
 *
 * Replaces the Apple build's "Weekday Performance". Same idea, one crucial
 * difference the page states rather than hides:
 *
 *   OPENAI ADS HAS NO DAYPARTING. There is no schedule, no hour-of-day bid
 *   adjustment, no day-of-week modifier. You can SEE when performance is better;
 *   you cannot bid differently at those times.
 *
 * That makes this an analysis tool, not an optimization one, and pretending
 * otherwise would send people looking for a setting that doesn't exist. What it
 * IS good for: spotting a weekday pattern worth reflecting in campaign start/end
 * dates, or a weekend collapse worth investigating.
 *
 * Conversions are only available at DAILY grain (the conversions endpoint
 * doesn't support hourly), so CPA is shown by weekday and never by hour.
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayRow = {
  day: string;
  short: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
  ctr: number | null;
  cpaMicros: number | null;
  cpcMicros: number | null;
  samples: number;
};

const METRICS = [
  { key: "spend", label: "Spend" },
  { key: "conversions", label: "Conversions" },
  { key: "cpa", label: "CPA" },
  { key: "ctr", label: "CTR" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export default function TimePerformancePage() {
  const { adAccountId, currency } = adAccountStore();
  const [days, setDays] = useState(90);
  const [metric, setMetric] = useState<MetricKey>("cpa");

  const query = useQuery({
    queryKey: ["time-performance", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/campaign", { adAccountId, days, daily: true, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const rows: DayRow[] = useMemo(() => {
    const buckets = new Map<
      number,
      { impressions: number; clicks: number; conversions: number; spendMicros: number; samples: number }
    >();

    for (const d of query.data?.dailyData ?? []) {
      // Parsed as UTC to match how the API buckets days; the account timezone
      // already determined which day each figure belongs to upstream.
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const b =
        buckets.get(dow) ?? { impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, samples: 0 };
      b.impressions += d.impressions;
      b.clicks += d.clicks;
      b.conversions += d.conversions;
      b.spendMicros += d.spendMicros;
      b.samples += 1;
      buckets.set(dow, b);
    }

    const div = (a: number, b: number) => (b > 0 ? a / b : null);

    // Monday-first: the working week is how advertisers think about pacing.
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const b = buckets.get(dow) ?? {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spendMicros: 0,
        samples: 0,
      };
      return {
        day: DAY_NAMES[dow],
        short: DAY_NAMES[dow].slice(0, 3),
        impressions: b.impressions,
        clicks: b.clicks,
        conversions: b.conversions,
        spendMicros: b.spendMicros,
        ctr: div(b.clicks, b.impressions),
        cpaMicros: div(b.spendMicros, b.conversions),
        cpcMicros: div(b.spendMicros, b.clicks),
        samples: b.samples,
      };
    });
  }, [query.data]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        short: r.short,
        value:
          metric === "spend"
            ? toUnits(r.spendMicros)
            : metric === "conversions"
              ? r.conversions
              : metric === "cpa"
                ? r.cpaMicros === null
                  ? null
                  : toUnits(r.cpaMicros)
                : r.ctr === null
                  ? null
                  : r.ctr * 100,
      })),
    [rows, metric]
  );

  // Only call out a best/worst day when there is enough conversion volume to
  // mean anything. Naming a "best day" off three conversions is how a tool
  // teaches someone the wrong lesson about their account.
  const insight = useMemo(() => {
    const judged = rows.filter((r) => r.conversions >= 5 && r.cpaMicros !== null);
    if (judged.length < 3) return null;
    const sorted = [...judged].sort((a, b) => a.cpaMicros! - b.cpaMicros!);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (worst.cpaMicros! < best.cpaMicros! * 1.25) return null;
    return { best, worst };
  }, [rows]);

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to see time patterns.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Time Performance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            How performance varies by day of week, over the last {days} days.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  metric === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
            aria-label="Date range"
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
          </select>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-2.5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">OpenAI Ads has no dayparting.</strong> There&apos;s no
          schedule and no hour or weekday bid adjustment, so this is for understanding your account,
          not for setting a rule. A strong weekday pattern is worth reflecting in campaign start and
          end dates, or in when you launch new creative.
        </p>
      </div>

      {insight && (
        <div className="rounded-xl border border-border bg-card p-4 flex gap-3">
          <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {insight.best.day} converts cheapest; {insight.worst.day} is the most expensive
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {money(currency, insight.best.cpaMicros)} vs {money(currency, insight.worst.cpaMicros)}{" "}
              CPA — a {((insight.worst.cpaMicros! / insight.best.cpaMicros! - 1) * 100).toFixed(0)}%
              difference across {insight.best.conversions + insight.worst.conversions} conversions.
              Both days clear the 5-conversion threshold, so this isn&apos;t noise.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="short" tickLine={false} axisLine={false} className="text-xs" />
              <YAxis tickLine={false} axisLine={false} className="text-xs" width={48} />
              <RTooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: "12px",
                }}
                formatter={(value) => {
                  const v = typeof value === "number" ? value : null;
                  if (v === null) return "no data";
                  if (metric === "ctr") return `${v.toFixed(2)}%`;
                  if (metric === "conversions") return Math.round(v).toLocaleString();
                  return `${currency} ${v.toFixed(2)}`;
                }}
              />
              <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">CPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                rows.map((r) => (
                  <TableRow key={r.day} className={r.conversions < 5 ? "opacity-70" : ""}>
                    <TableCell className="font-medium">
                      {r.day}
                      {r.conversions < 5 && r.conversions > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          too few conversions to judge
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(currency, r.spendMicros)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(r.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.conversions)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(currency, r.cpaMicros)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Conversions are reported daily only, so CPA is available by weekday but never by hour.
      </p>
    </div>
  );
}
