"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckSquare, Info, Loader2, Square, TrendingDown, TriangleAlert } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { findWastedSpend, DEFAULT_WASTED_CONFIG, totalWasted } from "@/lib/optimize/wastedSpend";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";

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

import type { ReportData } from "@/types/reportsDetails";

/**
 * Waste Finder.
 *
 * Replaces the Apple build's "Waste Blocker", which found search terms to add as
 * negative keywords. Neither search terms nor negative keywords exist here, so
 * the unit of analysis is the campaign itself: money spent with nothing to show.
 *
 * THE MOST IMPORTANT THING ON THIS PAGE IS THE WARNING, not the table. A
 * campaign with a broken conversion pixel looks EXACTLY like one that genuinely
 * doesn't convert, and cutting its budget on that mistake is the single most
 * expensive error this product could cause. So the tracking check runs first and
 * is shown before any recommendation.
 */

export default function WasteFinderPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [days, setDays] = useState(30);
  const [minClicks, setMinClicks] = useState(DEFAULT_WASTED_CONFIG.minClicks);
  const [targetCpa, setTargetCpa] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reportQuery = useQuery({
    queryKey: ["waste-report", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/campaign", { adAccountId, days, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  // Tracking health. Conversion campaigns recording nothing make every CPA in
  // this account unreliable, so this gate is checked before anything is advised.
  const trackingQuery = useQuery({
    queryKey: ["conversion-sources", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/conversions/sources", { adAccountId });
      return res.data as {
        capabilityGated?: boolean;
        diagnosis: { hasSource: boolean; hasEventSetting: boolean };
      };
    },
    retry: false,
  });

  const pauseMutation = useMutation({
    mutationFn: async (campaignIds: string[]) => {
      const results = await Promise.allSettled(
        campaignIds.map((campaignId) =>
          api.post("/campaign/deletecampaign", { adAccountId, campaignId, action: "pause" })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { paused: results.length - failed, failed };
    },
    onSuccess: ({ paused, failed }) => {
      if (paused) toast.success(`${paused} campaign${paused === 1 ? "" : "s"} paused`);
      if (failed) toast.error(`${failed} couldn't be paused`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["waste-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't pause those campaigns"),
  });

  const findings = useMemo(() => {
    const campaigns = reportQuery.data?.campaigns ?? [];
    return findWastedSpend(
      campaigns.map((c) => ({
        id: c.campaignId,
        name: c.campaignName,
        impressions: c.performance.impressions,
        clicks: c.performance.clicks,
        conversions: c.performance.conversions,
        spendMicros: c.performance.spendMicros,
      })),
      {
        ...DEFAULT_WASTED_CONFIG,
        minClicks,
        targetCpaMicros: targetCpa ? Math.round(Number(targetCpa) * 1_000_000) : null,
      }
    );
  }, [reportQuery.data, minClicks, targetCpa]);

  const recoverable = totalWasted(findings);
  const chosen = findings.filter((f) => selected.has(f.id));

  const trackingBroken =
    trackingQuery.data && !trackingQuery.data.capabilityGated && !trackingQuery.data.diagnosis.hasSource;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to find wasted spend.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Waste Finder</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          Campaigns that spent real money and produced no conversions — with enough clicks behind
          them that zero actually means something.
        </p>
      </header>

      {trackingBroken && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
          <TriangleAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              No active conversion source on this account
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Every campaign will report zero conversions whether or not it&apos;s working, so
              nothing below is trustworthy yet. Set up a pixel or the Conversions API in Ads
              Manager first — pausing campaigns on the strength of a broken pixel is expensive and
              hard to notice.
            </p>
          </div>
        </div>
      )}

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
          <Label className="text-xs">Minimum clicks before judging</Label>
          <Input
            type="number"
            min={1}
            value={minClicks}
            onChange={(e) => setMinClicks(Math.max(1, Number(e.target.value)))}
            className="h-9 w-28 rounded-lg"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Target CPA ({currency}) — optional</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={targetCpa}
            onChange={(e) => setTargetCpa(e.target.value)}
            placeholder="Also flag over-target"
            className="h-9 w-44 rounded-lg"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Potentially recoverable</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {money(currency, recoverable)}
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-lg"
            disabled={!chosen.length || pauseMutation.isPending}
            onClick={() => pauseMutation.mutate(chosen.map((c) => c.id))}
          >
            {pauseMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Pausing…
              </>
            ) : (
              `Pause ${chosen.length || ""}`.trim()
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-2.5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pausing is reversible; archiving is not, so this tool only ever pauses. A campaign with a
          genuinely bad offer and one with broken tracking produce identical numbers here — check
          Tracking before acting on a whole account&apos;s worth of findings.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">At stake</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : findings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nothing is obviously wasted at these thresholds. That&apos;s a good result.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                findings.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggle(f.id)}
                        aria-label={selected.has(f.id) ? "Deselect" : "Select"}
                      >
                        {selected.has(f.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>

                    <TableCell className="font-medium max-w-[260px] truncate">{f.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(currency, f.spendMicros)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(f.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(f.conversions)}</TableCell>

                    <TableCell className="text-right tabular-nums">
                      <span
                        className={cn(
                          "font-medium inline-flex items-center gap-1",
                          f.severity === "high" ? "text-destructive" : "text-amber-600"
                        )}
                      >
                        <TrendingDown className="w-3.5 h-3.5" />
                        {money(currency, f.wastedMicros)}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-[280px]">
                      <span className="text-xs text-muted-foreground">{f.reasons.join(" · ")}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
