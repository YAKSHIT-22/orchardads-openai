"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pause, Play, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, count, percent } from "@/lib/format";
import { rootCause } from "@/lib/openai/servingIssues";
import { getSeverityColor, getStatusColor } from "@/utils/constant";
import { adGroupHeaders } from "@/utils/variableConstant";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

import type { ReportData } from "@/types/reportsDetails";

/**
 * Ad groups.
 *
 * This is where the bid lives — `bidding_config.max_bid_micros` is the only bid
 * in the entire OpenAI Ads API — and where `context_hints` live, which are the
 * only targeting text the platform has. So this table shows both, and the bid
 * is editable inline rather than buried behind a detail page.
 */

export default function AdGroupsPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const reportQuery = useQuery({
    queryKey: ["adgroup-report", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/adgroup", { adAccountId, days, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const stateMutation = useMutation({
    mutationFn: async ({ adGroupId, action }: { adGroupId: string; action: "pause" | "activate" }) =>
      api.post("/adgroups/delete", { adAccountId, adGroupId, action }),
    onSuccess: () => {
      toast.success("Ad group updated");
      queryClient.invalidateQueries({ queryKey: ["adgroup-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't change the ad group state"),
  });

  const bidMutation = useMutation({
    mutationFn: async ({ adGroupId, maxBid }: { adGroupId: string; maxBid: number }) =>
      api.post("/adgroups/update", {
        adAccountId,
        adGroupId,
        // The server merges this into the current bidding_config: the API
        // replaces nested objects wholesale, so a partial write would clear the
        // billing event type and any audience bid multipliers.
        bidding_config: { max_bid_micros: Math.round(maxBid * 1_000_000) },
      }),
    onSuccess: () => {
      toast.success("Bid updated");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["adgroup-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the bid"),
  });

  const rows = useMemo(() => {
    const all = reportQuery.data?.adGroups ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (g) => g.adGroupName.toLowerCase().includes(q) || g.campaignName.toLowerCase().includes(q)
        )
      : all;
    return [...filtered].sort((a, b) => b.performance.spendMicros - a.performance.spendMicros);
  }, [reportQuery.data, query]);

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to see ad groups.</p>
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Ad groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {days} days. The max bid here is the only bid this platform has.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ad groups"
              className="pl-8 rounded-lg h-9 w-56"
            />
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
            aria-label="Date range"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-9"
            onClick={() => reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${reportQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {adGroupHeaders.map((h) => (
                  <TableHead key={h} className={h === "Actions" ? "text-right" : ""}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {adGroupHeaders.map((h) => (
                      <TableCell key={h}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={adGroupHeaders.length} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">
                      {query ? "No ad groups match that search." : "No ad groups yet."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((g) => {
                  const cause = rootCause(g.servingIssues);
                  const isActive = g.adGroupStatus === "active";
                  const isEditing = editing?.id === g.adGroupId;

                  return (
                    <TableRow key={g.adGroupId}>
                      <TableCell className="max-w-[240px]">
                        <p className="font-medium text-foreground truncate">{g.adGroupName}</p>
                        <p className="text-xs text-muted-foreground truncate">{g.campaignName}</p>
                        {cause && cause.severity === "blocking" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`mt-1 gap-1 text-[11px] font-normal ${getSeverityColor(cause.severity)}`}
                              >
                                <TriangleAlert className="w-3 h-3" />
                                {cause.title}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">{cause.meaning}</p>
                              <p className="mt-1 text-muted-foreground">{cause.fix}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              step="0.01"
                              min={0.000001}
                              autoFocus
                              value={editing.value}
                              onChange={(e) => setEditing({ id: g.adGroupId, value: e.target.value })}
                              className="h-8 w-24 rounded-lg"
                            />
                            <Button
                              size="sm"
                              className="h-8 rounded-lg"
                              disabled={bidMutation.isPending}
                              onClick={() =>
                                bidMutation.mutate({
                                  adGroupId: g.adGroupId,
                                  maxBid: Number(editing.value),
                                })
                              }
                            >
                              {bidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 rounded-lg"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-sm tabular-nums hover:text-primary hover:underline"
                            onClick={() =>
                              setEditing({
                                id: g.adGroupId,
                                value: String((g.maxBidMicros ?? 0) / 1_000_000),
                              })
                            }
                          >
                            {money(currency, g.maxBidMicros)}
                          </button>
                        )}
                      </TableCell>

                      <TableCell className="text-sm tabular-nums">
                        {money(currency, g.performance.spendMicros)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{count(g.performance.clicks)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {count(g.performance.conversions)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {money(currency, g.performance.cpaMicros)}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${getStatusColor(g.adGroupStatus)}`}>
                          {g.adGroupStatus}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={stateMutation.isPending || g.adGroupStatus === "archived"}
                              onClick={() =>
                                stateMutation.mutate({
                                  adGroupId: g.adGroupId,
                                  action: isActive ? "pause" : "activate",
                                })
                              }
                            >
                              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isActive ? "Pause" : "Activate"}</TooltipContent>
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
        Bids are entered in {currency} and sent to OpenAI as micros. For a conversion-optimized
        campaign the max bid is your target CPA, even though billing is per click.
      </p>
    </div>
  );
}
