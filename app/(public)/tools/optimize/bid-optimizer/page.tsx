"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckSquare, Info, Loader2, Square, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, count, percent } from "@/lib/format";
import { getStatusColor } from "@/utils/constant";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { AdGroupReportRow, ReportData } from "@/types/reportsDetails";

/**
 * Bid Optimizer.
 *
 * THE ONLY BID IN THIS SYSTEM is
 * `bidding_config.max_bid_micros` on an AD GROUP. So this tool compares ad
 * groups on CPA and proposes bid changes to the ones that are out of line.
 *
 * Two things it refuses to do, both deliberate:
 *
 *  - It will not judge an ad group with fewer than `minConversions`. At $3-5
 *    CPCs a small advertiser produces a handful of conversions a month, and a
 *    CPA computed from two of them is noise. Those rows are shown, greyed, with
 *    the reason — rather than hidden (which looks like a bug) or scored
 *    (which would be confidently wrong).
 *  - It will not compute a median from fewer than three qualifying ad groups.
 *    A "median" of one is just that one number.
 */

const DEFAULTS = {
  days: 30,
  minConversions: 5,
  /** CPA above median x this -> lower the bid. */
  highMultiple: 1.5,
  /** CPA below median x this -> raise the bid. */
  lowMultiple: 0.7,
  /** Percentage change proposed. Kept small; the risk engine caps it anyway. */
  stepPercent: 20,
};

type Proposal = {
  row: AdGroupReportRow;
  cpaMicros: number | null;
  currentBidMicros: number | null;
  proposedBidMicros: number | null;
  direction: "up" | "down" | null;
  reason: string;
  /** False when the sample is too small to judge. */
  eligible: boolean;
};

export default function BidOptimizerPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [days, setDays] = useState(DEFAULTS.days);
  const [minConversions, setMinConversions] = useState(DEFAULTS.minConversions);
  const [stepPercent, setStepPercent] = useState(DEFAULTS.stepPercent);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reportQuery = useQuery({
    queryKey: ["adgroup-report", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/adgroup", { adAccountId, days, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (proposals: Proposal[]) => {
      // Applied one at a time. The Bulk API is in limited preview and returns
      // 404 unless OpenAI has enabled it for this specific ad account, so we
      // don't call it — see docs/research/BLOCKERS.md YELLOW-1.
      const results = await Promise.allSettled(
        proposals.map((p) =>
          api.post("/adgroups/update", {
            adAccountId,
            adGroupId: p.row.adGroupId,
            bidding_config: { max_bid_micros: p.proposedBidMicros },
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { applied: results.length - failed, failed };
    },
    onSuccess: ({ applied, failed }) => {
      if (applied) toast.success(`${applied} bid${applied === 1 ? "" : "s"} updated`);
      if (failed) toast.error(`${failed} update${failed === 1 ? "" : "s"} failed`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["adgroup-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't apply the bid changes"),
  });

  const { proposals, medianCpaMicros, judged } = useMemo(() => {
    const rows = (reportQuery.data?.adGroups ?? []).filter(
      (g) => g.adGroupStatus === "active" && g.maxBidMicros
    );

    const qualifying = rows.filter(
      (g) => g.performance.conversions >= minConversions && g.performance.cpaMicros !== null
    );

    // Median, not mean: one runaway ad group drags a mean far enough to make
    // healthy ones look expensive.
    const median = (values: number[]): number | null => {
      if (!values.length) return null;
      const s = [...values].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    const med = qualifying.length >= 3 ? median(qualifying.map((g) => g.performance.cpaMicros!)) : null;

    const out: Proposal[] = rows.map((row) => {
      const cpa = row.performance.cpaMicros;
      const bid = row.maxBidMicros ?? null;
      const eligible = row.performance.conversions >= minConversions && cpa !== null;

      if (!eligible) {
        return {
          row,
          cpaMicros: cpa,
          currentBidMicros: bid,
          proposedBidMicros: null,
          direction: null,
          reason: `Only ${row.performance.conversions} conversion${
            row.performance.conversions === 1 ? "" : "s"
          } — not enough to judge CPA yet.`,
          eligible: false,
        };
      }

      if (med === null) {
        return {
          row,
          cpaMicros: cpa,
          currentBidMicros: bid,
          proposedBidMicros: null,
          direction: null,
          reason: "Fewer than 3 ad groups have enough conversions to compare against.",
          eligible: false,
        };
      }

      if (cpa! > med * DEFAULTS.highMultiple) {
        const proposed = bid ? Math.round(bid * (1 - stepPercent / 100)) : null;
        return {
          row,
          cpaMicros: cpa,
          currentBidMicros: bid,
          proposedBidMicros: proposed,
          direction: "down",
          reason: `CPA is ${((cpa! / med - 1) * 100).toFixed(0)}% above the ${money(currency, med)} median.`,
          eligible: true,
        };
      }

      if (cpa! < med * DEFAULTS.lowMultiple) {
        const proposed = bid ? Math.round(bid * (1 + stepPercent / 100)) : null;
        return {
          row,
          cpaMicros: cpa,
          currentBidMicros: bid,
          proposedBidMicros: proposed,
          direction: "up",
          reason: `CPA is ${((1 - cpa! / med) * 100).toFixed(0)}% below the ${money(currency, med)} median — room to buy more volume.`,
          eligible: true,
        };
      }

      return {
        row,
        cpaMicros: cpa,
        currentBidMicros: bid,
        proposedBidMicros: null,
        direction: null,
        reason: "Within the normal range for this account.",
        eligible: true,
      };
    });

    // Actionable first, biggest deviation first.
    out.sort((a, b) => {
      if (!!a.direction !== !!b.direction) return a.direction ? -1 : 1;
      return (b.row.performance.spendMicros ?? 0) - (a.row.performance.spendMicros ?? 0);
    });

    return { proposals: out, medianCpaMicros: med, judged: qualifying.length };
  }, [reportQuery.data, minConversions, stepPercent, currency]);

  const actionable = proposals.filter((p) => p.direction && p.proposedBidMicros);
  const chosen = actionable.filter((p) => selected.has(p.row.adGroupId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!adAccountId) {
    return <p className="p-16 text-center text-sm text-muted-foreground">Connect an ad account first.</p>;
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Bid Optimizer</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          Compares ad groups on cost per conversion and proposes changes to the max bid — the only
          bid this platform has. Nothing is applied until you select it.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Window</Label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Minimum conversions to judge</Label>
          <Input
            type="number"
            min={1}
            value={minConversions}
            onChange={(e) => setMinConversions(Math.max(1, Number(e.target.value)))}
            className="h-9 w-28 rounded-lg"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Bid change</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={50}
              value={stepPercent}
              onChange={(e) => setStepPercent(Math.min(50, Math.max(1, Number(e.target.value))))}
              className="h-9 w-20 rounded-lg"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {medianCpaMicros !== null ? (
            <p className="text-xs text-muted-foreground">
              Median CPA <span className="font-medium text-foreground">{money(currency, medianCpaMicros)}</span>{" "}
              across {judged} ad groups
            </p>
          ) : (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5" />
              Not enough data to compare yet
            </p>
          )}

          <Button
            className="rounded-lg"
            disabled={!chosen.length || applyMutation.isPending}
            onClick={() => applyMutation.mutate(chosen)}
          >
            {applyMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Applying…
              </>
            ) : (
              `Apply ${chosen.length || ""} change${chosen.length === 1 ? "" : "s"}`.trim()
            )}
          </Button>
        </div>
      </div>

      {medianCpaMicros === null && !reportQuery.isLoading && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-2.5">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            At least 3 ad groups need {minConversions}+ conversions each before a median is
            meaningful. Until then this tool stays quiet rather than ranking noise — lower the
            threshold only if you understand you&apos;re acting on a small sample.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Ad group</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">Max bid</TableHead>
                <TableHead className="text-right">Proposed</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : proposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                    No active ad groups with a max bid in this window.
                  </TableCell>
                </TableRow>
              ) : (
                proposals.map((p) => {
                  const canAct = !!p.direction && !!p.proposedBidMicros;
                  return (
                    <TableRow key={p.row.adGroupId} className={p.eligible ? "" : "opacity-60"}>
                      <TableCell>
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => toggle(p.row.adGroupId)}
                            aria-label={selected.has(p.row.adGroupId) ? "Deselect" : "Select"}
                          >
                            {selected.has(p.row.adGroupId) ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        )}
                      </TableCell>

                      <TableCell className="font-medium max-w-[220px] truncate">
                        {p.row.adGroupName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {p.row.campaignName}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {money(currency, p.row.performance.spendMicros)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {count(p.row.performance.conversions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(currency, p.cpaMicros)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(currency, p.currentBidMicros)}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {p.proposedBidMicros ? (
                          <span
                            className={
                              p.direction === "down"
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-sky-600 dark:text-sky-400 font-medium"
                            }
                          >
                            {p.direction === "down" ? (
                              <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
                            ) : (
                              <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                            )}
                            {money(currency, p.proposedBidMicros)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="max-w-[280px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground line-clamp-2 cursor-default">
                              {p.reason}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{p.reason}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Bids are applied one ad group at a time. The Bulk API is in limited preview and is enabled
        per ad account by OpenAI, so this tool doesn&apos;t depend on it.
      </p>
    </div>
  );
}
