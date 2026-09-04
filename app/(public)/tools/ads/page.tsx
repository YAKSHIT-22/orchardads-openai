"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, ExternalLink, Pause, Play, RefreshCw, Search } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, count, percent } from "@/lib/format";
import { reviewSummary } from "@/lib/openai/reviewReasons";
import { getStatusColor } from "@/utils/constant";
import { adHeaders } from "@/utils/variableConstant";

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
 * Ads.
 *
 * The Review column is first-class here rather than an afterthought. On a young
 * ad platform most ads that aren't running are stuck in or failed review, and
 * the reason is an enumerated, fixable one — so a status column alone ("active")
 * would be actively misleading about whether an ad is doing anything.
 */

const FILTERS = [
  { key: "all", label: "All" },
  { key: "rejected", label: "Rejected" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function AdsPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<FilterKey>("all");

  const reportQuery = useQuery({
    queryKey: ["ad-report", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/ad", { adAccountId, days, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const stateMutation = useMutation({
    mutationFn: async ({ adId, action }: { adId: string; action: "pause" | "activate" }) =>
      api.post("/ads/delete", { adAccountId, adId, action }),
    onSuccess: () => {
      toast.success("Ad updated");
      queryClient.invalidateQueries({ queryKey: ["ad-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't change the ad state"),
  });

  const rows = useMemo(() => {
    let all = reportQuery.data?.ads ?? [];
    if (filter !== "all") all = all.filter((a) => a.reviewStatus === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter(
        (a) =>
          a.adName.toLowerCase().includes(q) ||
          (a.title ?? "").toLowerCase().includes(q) ||
          a.campaignName.toLowerCase().includes(q)
      );
    }
    return [...all].sort((a, b) => b.performance.spendMicros - a.performance.spendMicros);
  }, [reportQuery.data, query, filter]);

  const counts = useMemo(() => {
    const ads = reportQuery.data?.ads ?? [];
    return {
      all: ads.length,
      rejected: ads.filter((a) => a.reviewStatus === "rejected").length,
      in_review: ads.filter((a) => a.reviewStatus === "in_review").length,
      approved: ads.filter((a) => a.reviewStatus === "approved").length,
    };
  }, [reportQuery.data]);

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to see ads.</p>
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Ads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {days} days.{" "}
            {counts.rejected > 0 ? (
              <Link href="/tools/review-health" className="text-amber-600 hover:underline font-medium">
                {counts.rejected} rejected — see why
              </Link>
            ) : (
              "No rejected ads."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ads"
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

      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label} {reportQuery.data ? `(${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {adHeaders.map((h) => (
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
                    {adHeaders.map((h) => (
                      <TableCell key={h}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={adHeaders.length} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">No ads match that view.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((a) => {
                  const isActive = a.status === "active";
                  return (
                    <TableRow key={a.adId}>
                      <TableCell className="max-w-[280px]">
                        <p className="font-medium text-foreground truncate">{a.title || a.adName}</p>
                        {a.body && (
                          <p className="text-xs text-muted-foreground truncate">{a.body}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/80 truncate">
                          {a.campaignName} · {a.adGroupName}
                        </p>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-normal ${getStatusColor(a.reviewStatus)}`}
                        >
                          {reviewSummary(a.reviewStatus ?? null, a.reviewReason)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm tabular-nums">
                        {count(a.performance.impressions)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{count(a.performance.clicks)}</TableCell>
                      <TableCell className="text-sm tabular-nums">{percent(a.performance.ctr)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {money(currency, a.performance.spendMicros)}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${getStatusColor(a.status)}`}>
                          {a.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Editing an ad means editing its creative, which is
                              step 3 of the builder — same screen, not a
                              separate editor that could drift from it. */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/tools/campaign/builder?campaignId=${a.campaignId}`}
                                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Edit ad and creative</TooltipContent>
                          </Tooltip>
                          {a.targetUrl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={a.targetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Open destination URL</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={stateMutation.isPending || a.status === "archived"}
                                onClick={() =>
                                  stateMutation.mutate({
                                    adId: a.adId,
                                    action: isActive ? "pause" : "activate",
                                  })
                                }
                              >
                                {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isActive ? "Pause" : "Activate"}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
