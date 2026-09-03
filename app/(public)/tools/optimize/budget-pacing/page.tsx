"use client";

/**
 * Budget Pacing — Optimize suite.
 *
 * A real budget-projection tool: for the current calendar month it takes each
 * campaign's daily budget (target = budget × days in month), the spend accrued
 * so far, and projects month-end spend from the run rate. An account-level
 * gauge shows overall pace vs target; the table ranks campaigns worst-first
 * with the ideal and required daily spend to land exactly on target.
 * All math lives in lib/optimize/budgetProjection — this page only renders it.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { appleErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Gauge, Loader2, RefreshCw, TrendingUp, TrendingDown, CircleCheck,
  TriangleAlert, Download, Info, CalendarDays, Wallet,
} from "lucide-react";
import {
  monthCycle, projectBudgets, accountPacing,
  BudgetProjectionRow, PacingState,
} from "@/lib/optimize/budgetProjection";
import { ToolHeader, StatCard, InsightBanner, SkeletonRows, EmptyRow, ErrorRow } from "@/components/optimize/ui";
import { InfoHint } from "@/components/ui/info-hint";

/* ── State presentation (status colors ship with icon + label, never alone) ── */
const STATE_META: Record<PacingState, {
  label: string; badge: string; icon: typeof TrendingUp;
  stroke: string; track: string;
}> = {
  overpacing: {
    label: "Overpacing",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    icon: TrendingUp,
    stroke: "stroke-rose-500", track: "stroke-rose-100 dark:stroke-rose-500/15",
  },
  underpacing: {
    label: "Underpacing",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    icon: TrendingDown,
    stroke: "stroke-amber-500", track: "stroke-amber-100 dark:stroke-amber-500/15",
  },
  on_track: {
    label: "On track",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    icon: CircleCheck,
    stroke: "stroke-emerald-500", track: "stroke-emerald-100 dark:stroke-emerald-500/15",
  },
  no_budget: {
    label: "No budget",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    icon: TriangleAlert,
    stroke: "stroke-slate-400", track: "stroke-slate-100 dark:stroke-slate-500/15",
  },
};

const STATE_EXPLAIN: Record<PacingState, string> = {
  overpacing: "Spending faster than the monthly target — projected to overshoot the budget by month-end.",
  underpacing: "Spending slower than the monthly target — projected to leave budget unspent by month-end.",
  on_track: "The projection lands close enough to the monthly target — no action needed.",
  no_budget: "No daily budget is set, so there is no monthly target to pace against.",
};

function StateBadge({ state }: { state: PacingState }) {
  const m = STATE_META[state];
  const Icon = m.icon;
  return (
    <Badge title={STATE_EXPLAIN[state]} className={cn("text-xs border-0 gap-1 shrink-0 cursor-help", m.badge)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

/* ── Account pacing gauge (semicircular meter, same-ramp track) ────────────── */
const GAUGE_MAX = 1.5; // scale tops out at 150% of target

function PacingGauge({ pace, state }: { pace: number; state: PacingState }) {
  const m = STATE_META[state];
  const W = 220, H = 128, CX = W / 2, CY = 112, R = 88, SW = 14;
  const L = Math.PI * R; // semicircle arc length
  const frac = Math.max(0, Math.min(pace, GAUGE_MAX)) / GAUGE_MAX;
  const d = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  // Target tick at the 100% position along the arc.
  const tickT = 1 / GAUGE_MAX;
  const ang = Math.PI - Math.PI * tickT;
  const tx = (r: number) => CX + r * Math.cos(ang);
  const ty = (r: number) => CY - r * Math.sin(ang);

  return (
    <div className="relative w-[220px] shrink-0" role="img" aria-label={`Account pace ${Math.round(pace * 100)}% of monthly target`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Track: a lighter step of the same ramp so state reads across the bar */}
        <path d={d} fill="none" strokeWidth={SW} strokeLinecap="round" className={m.track} />
        {frac > 0 && (
          <path
            d={d} fill="none" strokeWidth={SW} strokeLinecap="round"
            className={cn(m.stroke, "transition-all duration-500")}
            strokeDasharray={`${Math.max(0.01, frac) * L} ${L}`}
          />
        )}
        {/* 100% target tick */}
        <line
          x1={tx(R - SW / 2 - 4)} y1={ty(R - SW / 2 - 4)}
          x2={tx(R + SW / 2 + 4)} y2={ty(R + SW / 2 + 4)}
          strokeWidth={2} className="stroke-foreground/50"
        />
        <text x={tx(R + SW / 2 + 10)} y={ty(R + SW / 2 + 10)} textAnchor="middle" className="fill-muted-foreground" fontSize="9">
          100%
        </text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-3xl font-bold leading-none">{Math.round(pace * 100)}%</p>
        <p className="text-xs text-muted-foreground mt-1">of monthly target</p>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Account gauge state uses the same dynamic band as the lib (±25% → ±1%). */
function accountState(pace: number, cycleTarget: number, progress: number): PacingState {
  if (cycleTarget <= 0) return "no_budget";
  const tol = 0.25 - (0.25 - 0.01) * Math.min(1, Math.max(0, progress));
  if (pace > 1 + tol) return "overpacing";
  if (pace < 1 - tol) return "underpacing";
  return "on_track";
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function BudgetPacingPage() {
  const { adAccountId, connections, selectedIndex } = adAccountStore();
  const orgCurrency = connections[selectedIndex]?.currencyCode || "USD";
  const [rows, setRows] = useState<BudgetProjectionRow[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const cycle = useMemo(() => monthCycle(), []);
  const monthLabel = cycle.start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const { mutate: analyze, isPending, isError, error } = useMutation({
    mutationFn: async () => {
      if (!adAccountId) throw new Error("No organization selected");
      const [campRes, reportRes] = await Promise.all([
        api.post("/campaign/getallcampaigns", { adAccountId, limit: 100, offset: 0 }),
        api.post("/reports/campaign", {
          adAccountId,
          reportRequest: {
            startTime: ymd(cycle.start), endTime: ymd(new Date()),
            returnRowTotals: true, returnRecordsWithNoMetrics: false,
            selector: {
              orderBy: [{ field: "spendMicros", sortOrder: "DESCENDING" }],
              pagination: { offset: 0, limit: 1000 },
            },
          },
        }),
      ]);

      const campaigns = (campRes.data?.allcampaigns_results?.data || []).map((c: any) => ({
        id: String(c.id),
        name: c.name || `Campaign ${c.id}`,
        dailyBudget: Number(c.dailyBudgetAmount?.amount) || 0,
        currency: c.dailyBudgetAmount?.currencyCode || orgCurrency,
        monthlyBudget: null,
      }));

      const spendByCampaign = new Map<string, number>();
      for (const row of reportRes.data?.report?.data?.reportingDataResponse?.row || []) {
        const id = String(row?.metadata?.campaignId ?? "");
        if (!id) continue;
        const spend = Number(row?.total?.metrics?.spendMicros) || 0;
        spendByCampaign.set(id, (spendByCampaign.get(id) || 0) + spend);
      }

      return projectBudgets(campaigns, spendByCampaign, cycle);
    },
    onSuccess: (r) => { setRows(r); setHasRun(true); },
    onError: (err: any) => appleErrorToast(err, "Failed to project budgets"),
  });

  // Auto-run once the org is known.
  useEffect(() => {
    if (adAccountId) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccountId]);

  const acct = useMemo(() => accountPacing(rows), [rows]);
  const progress = cycle.daysInCycle > 0 ? cycle.daysElapsed / cycle.daysInCycle : 0;
  const acctState = accountState(acct.pace, acct.cycleTarget, progress);
  const budgeted = rows.filter((r) => r.state !== "no_budget");
  const worst = rows.find((r) => r.state === "overpacing");

  const exportCSV = () => {
    if (!rows.length) return;
    const header = [
      "campaignId", "campaignName", "currency", "dailyBudget", "cycleTarget", "spentToDate",
      "runRate", "projectedSpend", "pacePercent", "idealDaily", "requiredDaily",
      "daysElapsed", "daysRemaining", "daysInCycle", "state", "projectedDelta", "suggestion",
    ];
    const lines = rows.map((r) =>
      [
        r.campaignId, `"${r.campaignName.replace(/"/g, '""')}"`, r.currency, r.dailyBudget, r.cycleTarget,
        r.spentToDate, r.runRate, r.projectedSpend, Math.round(r.pace * 100), r.idealDaily, r.requiredDaily,
        r.daysElapsed, r.daysRemaining, r.daysInCycle, r.state, r.projectedDelta,
        `"${r.suggestion.replace(/"/g, '""')}"`,
      ].join(",")
    );
    const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `budget-pacing-${ymd(cycle.start).slice(0, 7)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={Gauge}
          title="Budget Pacing"
          description={`Projects each campaign's month-end spend from its run rate and flags who will overshoot or undershoot the ${monthLabel} target.`}
        >
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length} className="gap-1.5 h-9">
            <Download size={14} />CSV
          </Button>
          <Button variant="outline" onClick={() => analyze()} disabled={isPending || !adAccountId} className="gap-1.5 h-9">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        </ToolHeader>

        {/* Headline insight */}
        {hasRun && !isPending && !isError && budgeted.length > 0 && (
          acct.overpacing > 0 ? (
            <InsightBanner
              icon={TrendingUp}
              tone="critical"
              title={<>{acct.overpacing} campaign{acct.overpacing === 1 ? " is" : "s are"} projected to overspend this month</>}
              sub={worst
                ? `${worst.campaignName} leads at ${Math.round(worst.pace * 100)}% of target — projected ${money(worst.currency, worst.projectedSpend)} vs ${money(worst.currency, worst.cycleTarget)}.`
                : undefined}
            />
          ) : acct.underpacing > 0 ? (
            <InsightBanner
              icon={TrendingDown}
              tone="warning"
              title={<>{acct.underpacing} campaign{acct.underpacing === 1 ? "" : "s"} projected to leave budget unspent</>}
              sub={`At the current run rate they won't reach their ${monthLabel} target — raise bids or broaden targeting to spend it.`}
            />
          ) : (
            <InsightBanner
              icon={CircleCheck}
              tone="positive"
              title="Every campaign is pacing on target"
              sub={`Projected ${monthLabel} spend is ${money(acct.currency, acct.projectedSpend)} against a ${money(acct.currency, acct.cycleTarget)} target.`}
            />
          )
        )}

        {/* Account gauge + headline chips */}
        {hasRun && !isPending && !isError && budgeted.length > 0 && (
          <Card className="border rounded-xl">
            <CardContent className="py-4 flex flex-col md:flex-row items-center gap-6">
              <PacingGauge pace={acct.pace} state={acctState} />
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <p className="text-sm font-semibold">Account pace · {monthLabel}</p>
                  <StateBadge state={acctState} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Wallet className="w-3 h-3" />Projected month-end{" "}
                      <InfoHint>Where total spend is headed by the end of the month if the current daily run rate continues.</InfoHint>
                    </p>
                    <p className="text-lg font-bold mt-0.5">{money(acct.currency, acct.projectedSpend)}</p>
                    <p className="text-xs text-muted-foreground">target {money(acct.currency, acct.cycleTarget)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />Spent to date</p>
                    <p className="text-lg font-bold mt-0.5">{money(acct.currency, acct.spentToDate)}</p>
                    <p className="text-xs text-muted-foreground">
                      {acct.projectedSpend >= acct.cycleTarget
                        ? `${money(acct.currency, acct.projectedSpend - acct.cycleTarget)} over target pace`
                        : `${money(acct.currency, acct.cycleTarget - acct.projectedSpend)} projected shortfall`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" />Cycle progress</p>
                    <p className="text-lg font-bold mt-0.5">Day {cycle.daysElapsed} of {cycle.daysInCycle}</p>
                    <p className="text-xs text-muted-foreground">{cycle.daysRemaining} day{cycle.daysRemaining === 1 ? "" : "s"} left this month</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary tiles */}
        {hasRun && !isPending && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="Overpacing" value={String(acct.overpacing)} sub="projected to overspend" icon={TrendingUp} tone={acct.overpacing > 0 ? "critical" : "positive"} />
            <StatCard label="Underpacing" value={String(acct.underpacing)} sub="projected to undershoot" icon={TrendingDown} tone={acct.underpacing > 0 ? "warning" : "positive"} />
            <StatCard label="On Track" value={String(acct.onTrack)} sub="landing near target" icon={CircleCheck} tone="positive" />
          </div>
        )}

        {/* Per-campaign table */}
        <Card className="border rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Campaign Projections {rows.length > 0 && <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>}
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              Projects month-end spend from your run rate so far; pacing thresholds tighten as the month progresses,
              so an early flag means a projected miss, not a current one. Worst offenders sort first.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="px-4 py-2">Campaign</TableHead>
                    <TableHead className="px-3 py-2 text-right">Daily Budget</TableHead>
                    <TableHead className="px-3 py-2 text-right">Spent to Date</TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Run Rate / Day <InfoHint side="left">Average spend per day so far this month — spent to date ÷ days elapsed.</InfoHint>
                    </TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Projected <InfoHint side="left">Estimated month-end spend if the current run rate continues: spent to date + run rate × days remaining.</InfoHint>
                    </TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Pace <InfoHint side="left">Projected month-end spend as a percent of the monthly target (daily budget × days in month). 100% = landing exactly on budget; above = overspending, below = leaving budget unspent.</InfoHint>
                    </TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Ideal Daily <InfoHint side="left">What the campaign should spend per day to land exactly on target — monthly target ÷ days in month.</InfoHint>
                    </TableHead>
                    <TableHead className="px-3 py-2 text-right">
                      Required Daily <InfoHint side="left">What it must now average per day for the rest of the month to still hit the target — remaining budget ÷ days remaining.</InfoHint>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    <SkeletonRows rows={6} colSpan={8} />
                  ) : isError ? (
                    <ErrorRow colSpan={8} message={(error as any)?.message} onRetry={() => analyze()} />
                  ) : rows.length > 0 ? (
                    rows.map((r) => (
                      <TableRow key={r.campaignId} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="px-4 py-2.5 max-w-[280px]">
                          <span className="inline-flex items-center gap-2 flex-wrap font-medium">
                            <span className="truncate" title={r.campaignName}>{r.campaignName}</span>
                            <StateBadge state={r.state} />
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.suggestion}</p>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums">{r.dailyBudget > 0 ? money(r.currency, r.dailyBudget) : "—"}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">{money(r.currency, r.spentToDate)}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums">{money(r.currency, r.runRate)}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
                          {money(r.currency, r.projectedSpend)}
                          {r.cycleTarget > 0 && r.projectedDelta !== 0 && (
                            <p className={cn("text-xs font-normal", r.projectedDelta > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                              {r.projectedDelta > 0 ? "+" : "−"}{money(r.currency, Math.abs(r.projectedDelta))} vs target
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums font-medium">
                          {r.cycleTarget > 0 ? `${Math.round(r.pace * 100)}%` : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums">{r.cycleTarget > 0 ? money(r.currency, r.idealDaily) : "—"}</TableCell>
                        <TableCell className="px-3 py-2.5 text-right tabular-nums">
                          {r.cycleTarget > 0 && r.daysRemaining > 0 ? money(r.currency, r.requiredDaily) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : hasRun ? (
                    <EmptyRow colSpan={8} icon={Gauge} title="No campaigns to project" sub="Create a campaign with a daily budget to see its monthly pacing here." />
                  ) : (
                    <EmptyRow colSpan={8} icon={Gauge} title="Waiting for data" sub="The projection runs automatically once your org loads." />
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
