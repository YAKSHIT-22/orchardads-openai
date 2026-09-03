"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
} from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, count, percent } from "@/lib/format";
import { describeServingIssues, rootCause } from "@/lib/openai/servingIssues";
import { getStatusColor, getSeverityColor } from "@/utils/constant";
import { campaignHeaders } from "@/utils/variableConstant";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import type { AllCampaignsData } from "@/types/campaignDetails";
import type { CampaignReportRow, ReportData } from "@/types/reportsDetails";

/**
 * Campaigns.
 *
 * Two things this table does that a plain list would not, both because they are
 * the questions an advertiser actually has:
 *
 *  1. It shows WHY a campaign isn't delivering, from the platform's own typed
 *     serving-issue codes — an active campaign with an exhausted budget looks
 *     identical to a healthy one in a status column alone.
 *  2. It shows CPA next to spend. Spend without an outcome is the number that
 *     makes people feel informed while telling them nothing.
 *
 * ROAS is deliberately absent unless the account has a configured value per
 * conversion: the OpenAI Ads API returns conversion counts and no revenue.
 */

const PAGE_SIZE = 15;

type CampaignRow = CampaignReportRow & { rank: number };

export default function CampaignsPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [days, setDays] = useState(30);

  const reportQuery = useQuery({
    queryKey: ["campaign-report", adAccountId, days],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/campaign", { adAccountId, days, daily: false });
      return res.data.report as ReportData;
    },
  });

  const stateMutation = useMutation({
    mutationFn: async ({ campaignId, action }: { campaignId: string; action: "pause" | "activate" }) => {
      await api.post("/campaign/deletecampaign", { adAccountId, campaignId, action });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "pause" ? "Campaign paused" : "Campaign activated");
      queryClient.invalidateQueries({ queryKey: ["campaign-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't change the campaign state"),
  });

  const rows: CampaignRow[] = useMemo(() => {
    const all = reportQuery.data?.campaigns ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((c) => c.campaignName.toLowerCase().includes(q) || c.campaignId.includes(q))
      : all;

    // Ranked by spend: the campaigns worth looking at first are the ones moving
    // the most money, not the ones created most recently.
    return [...filtered]
      .sort((a, b) => b.performance.spendMicros - a.performance.spendMicros)
      .map((c, i) => ({ ...c, rank: i }));
  }, [reportQuery.data, query]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const blockedCount = rows.filter((c) => (c.servingIssues?.length ?? 0) > 0).length;

  if (!adAccountId) {
    return (
      <EmptyState
        title="No ad account connected"
        body="Connect an OpenAI Ads account to see your campaigns."
        action={{ href: "/onboarding/connect", label: "Connect an account" }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {days} days.{" "}
            {blockedCount > 0 ? (
              <Link href="/tools/serving-health" className="text-amber-600 hover:underline font-medium">
                {blockedCount} campaign{blockedCount === 1 ? " isn't" : "s aren't"} delivering
              </Link>
            ) : (
              "All active campaigns are able to deliver."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search campaigns"
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
            <option value={14}>14 days</option>
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

          <Button asChild size="sm" className="rounded-lg h-9">
            <Link href="/tools/campaign/createCampaign">
              <Plus className="w-4 h-4 mr-1.5" />
              New campaign
            </Link>
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {campaignHeaders.map((h) => (
                  <TableHead key={h} className={h === "Actions" ? "text-right" : ""}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {campaignHeaders.map((h) => (
                      <TableCell key={h}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={campaignHeaders.length} className="h-32 text-center">
                    <p className="text-sm text-muted-foreground">
                      {query
                        ? "No campaigns match that search."
                        : "No campaigns yet. Create one here, or in Ads Manager."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((c) => <CampaignRowView key={c.campaignId} row={c} currency={currency} onState={(action) => stateMutation.mutate({ campaignId: c.campaignId, action })} pending={stateMutation.isPending} />)
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {rows.length} campaign{rows.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignRowView({
  row,
  currency,
  onState,
  pending,
}: {
  row: CampaignRow;
  currency: string;
  onState: (action: "pause" | "activate") => void;
  pending: boolean;
}) {
  const p = row.performance;
  const cause = rootCause(row.servingIssues);
  const issues = describeServingIssues(row.servingIssues);
  const isActive = row.campaignStatus === "active";

  return (
    <TableRow>
      <TableCell className="max-w-[260px]">
        <Link
          href={`/tools/campaign/editCampaign?id=${row.campaignId}`}
          className="font-medium text-foreground hover:text-primary truncate block"
        >
          {row.campaignName}
        </Link>
        {cause && cause.severity !== "warning" && (
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
              {issues.length > 1 && (
                <p className="mt-1 text-muted-foreground">+{issues.length - 1} more issue(s)</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground capitalize">
        {row.biddingType ?? "—"}
      </TableCell>

      <TableCell className="text-sm">
        {row.lifetimeBudgetMicros ? (
          <BudgetCell
            spendMicros={p.spendMicros}
            budgetMicros={row.lifetimeBudgetMicros}
            currency={currency}
          />
        ) : (
          "—"
        )}
      </TableCell>

      <TableCell className="text-sm tabular-nums">{money(currency, p.spendMicros)}</TableCell>
      <TableCell className="text-sm tabular-nums">{count(p.clicks)}</TableCell>
      <TableCell className="text-sm tabular-nums">{count(p.conversions)}</TableCell>
      <TableCell className="text-sm tabular-nums">{money(currency, p.cpaMicros)}</TableCell>

      <TableCell>
        <Badge variant="outline" className={`capitalize ${getStatusColor(row.campaignStatus)}`}>
          {row.campaignStatus}
        </Badge>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={pending || row.campaignStatus === "archived"}
                onClick={() => onState(isActive ? "pause" : "activate")}
              >
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isActive ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isActive ? "Pause campaign" : "Activate campaign"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                <Link href={`/tools/campaign/editCampaign?id=${row.campaignId}`}>
                  <Settings2 className="w-4 h-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Budget consumption. Lifetime budgets are the ones that matter here: when a
 * lifetime budget is spent, the campaign stops delivering entirely — so the bar
 * is a countdown, not a progress indicator.
 */
function BudgetCell({
  spendMicros,
  budgetMicros,
  currency,
}: {
  spendMicros: number;
  budgetMicros: number;
  currency: string;
}) {
  const used = budgetMicros > 0 ? spendMicros / budgetMicros : 0;
  const pct = Math.min(1, used);
  const nearlyGone = used >= 0.85;

  return (
    <div className="min-w-[120px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tabular-nums">{money(currency, budgetMicros)}</span>
        <span className={`text-[11px] ${nearlyGone ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
          {percent(used, 0)} used
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${nearlyGone ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
      {action && (
        <Button asChild className="rounded-lg mt-1">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
