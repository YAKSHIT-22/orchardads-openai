"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useReportData } from "@/hooks/useReportData";
import type { FilterState, ReportData } from "@/types/reportsDetails";
import { adAccountStore } from "@/stores/adAccountStore";

import { DashboardHeader } from "@/components/user/DashboardHeader";
import { resolveDateRange, granularityForRange } from "@/lib/dateRanges";
import { ShareDashboardDialog } from "@/components/dashboard/ShareDashboardDialog";
import { CampaignMultiFilter } from "@/components/dashboard/CampaignMultiFilter";
import { MoreDashboardWidgets } from "@/components/dashboard/MoreDashboardWidgets";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ComparisonChart } from "@/components/dashboard/ComparisonChart";

import { CampaignReport } from "@/components/user/reports/CampaignReport";
import { DashboardWidgets } from "@/components/user/DashboardWidgets";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { AlertCircle, RefreshCw, BarChart2, Sparkles, ClipboardCheck, Gauge, ArrowRight } from "lucide-react";

const EMPTY_DATA: ReportData = {
  campaigns: [],
  adGroups: [],
  ads: [],
  segments: [],
  dailyData: [],
  currency: "USD",
  revenueModelled: false,
};

function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, desc, color }: {
  href: string; icon: any; title: string; desc: string; color: string;
}) {
  return (
    <Link href={href}>
      <Card className="border rounded-xl hover:shadow-sm transition-shadow h-full">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { adAccountId, currency: orgCurrency } = adAccountStore();
  const selectedReport = "campaigns";
  const [filters, setFilters] = useState<FilterState>({
    selectedCampaignId: null,
    selectedAdGroupId: null,
    dateRange: "30d",
  });
  // Custom range dates (only used when dateRange === "custom").
  const [customRange, setCustomRange] = useState<{ start?: string; end?: string }>({});

  // Inclusive [startTime, endTime] + actual day count for the selected range.
  const resolved = resolveDateRange(filters.dateRange, customRange);

  const { data: rawReport, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-report", adAccountId, filters.dateRange, resolved.startTime, resolved.endTime],
    queryFn: async () => {
      if (!adAccountId) throw new Error("No organisation selected");
      const { startTime, endTime } = resolved;
      // The report layer handles the two upstream calls (delivery insights plus
      // the conversions endpoint) and the daily join. Zero-impression campaigns
      // are included, so a fresh account doesn't render a blank dashboard.
      const res = await api.post("/reports/campaign", {
        adAccountId,
        days: resolved.days,
        daily: true,
        limit: 200,
      });
      return res.data.report as ReportData;
    },
    enabled: !!adAccountId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // Multi-campaign scope (empty = all campaigns). Drives every widget below.
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

  const reportData: ReportData = rawReport ?? EMPTY_DATA;

  /**
   * Narrow the report to the selected campaigns.
   *
   * The daily series is NOT re-derived per campaign: the API returns it
   * aggregated across the requested scope, and splitting it client-side would
   * require per-campaign daily rows we deliberately don't fetch (one call
   * instead of N, because rate limits are shared with the customer's own
   * tools). With a campaign filter active the charts therefore stay
   * account-level, which is stated in the UI rather than silently implied.
   */
  const scopedData: ReportData = useMemo(() => {
    if (!selectedCampaignIds.length) return reportData;
    const set = new Set(selectedCampaignIds);
    return { ...reportData, campaigns: reportData.campaigns.filter((c) => set.has(c.campaignId)) };
  }, [selectedCampaignIds, reportData]);

  const scopedRows = scopedData.campaigns;

  const { reportData: filteredData, totals, uniqueCampaigns, uniqueAdGroups } = useReportData(
    scopedData,
    filters,
    selectedReport,
  );

  // Full campaign list (unscoped) — options for the multi-filter itself.
  const campaignOptions = useMemo(
    () => reportData.campaigns.map((c) => ({ id: c.campaignId, name: c.campaignName })),
    [reportData.campaigns],
  );

  // The connected ad account's currency is authoritative (the API returns
  // all amounts in it). Prefer it; fall back to the report's currency only if
  // the ACL hasn't loaded yet, then USD as a last resort.
  const currency =
    orgCurrency || reportData.campaigns[0]?.performance?.currency || "USD";
  const days = resolved.days;

  const handleFiltersChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleCampaignScopeChange = (ids: string[]) => {
    setSelectedCampaignIds(ids);
    // The bottom-table single-select may point outside the new scope — reset it.
    setFilters((prev) => ({ ...prev, selectedCampaignId: null, selectedAdGroupId: null }));
  };

  if (!adAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-yellow-500" />
          <p className="text-base font-medium">No organization selected</p>
          <p className="text-sm mt-1">Select an organization from the picker at the top to view your dashboard.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <DashboardHeader dateRange={filters.dateRange} onDateRangeChange={(dateRange) => handleFiltersChange({ dateRange })} />
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <DashboardHeader dateRange={filters.dateRange} onDateRangeChange={(dateRange) => handleFiltersChange({ dateRange })} />
        <div className="container mx-auto px-4 sm:px-6 py-16 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <p className="text-lg font-semibold mb-2">Failed to load dashboard data</p>
            <p className="text-sm text-muted-foreground mb-6">
              {(error as any)?.response?.data?.error || "Check your OpenAI Ads connection in Settings and try again."}
            </p>
            <Button onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <DashboardHeader
        dateRange={filters.dateRange}
        onDateRangeChange={(dateRange) => handleFiltersChange({ dateRange })}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        action={<ShareDashboardDialog defaultDateRange={filters.dateRange} />}
      />

      <div className="container mx-auto px-4 sm:px-6 py-6">
        <CampaignMultiFilter
          campaigns={campaignOptions}
          selectedIds={selectedCampaignIds}
          onChange={handleCampaignScopeChange}
        />

        <KpiRow totals={totals} currency={currency} days={days} selectable />

        {/* Performance first: daily trend + two-metric comparison, stacked
            full width so the whole date range fits with no horizontal scroll */}
        <div className="flex flex-col gap-4 mb-6">
          {selectedCampaignIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Trends below cover the whole account. Per-campaign daily series
              aren&apos;t fetched, to stay well inside your ad account&apos;s API
              rate limit.
            </p>
          )}
          <PerformanceChart data={scopedData.dailyData} currency={currency} />
          <ComparisonChart data={scopedData.dailyData} currency={currency} />
        </div>

        {/* Actionable insights: suggestions, pacing, placements, top lists, deep dive */}
        <div className="mb-6">
          <DashboardWidgets
            campaigns={scopedData.campaigns}
            rawRows={scopedRows}
            adAccountId={adAccountId as string}
            dateRange={{ startTime: resolved.startTime, endTime: resolved.endTime }}
            days={days}
            currency={currency}
          />
        </div>

        {/* Advanced analytics (performance change, segment breakdown),
            scoped to the campaign selection. */}
        <MoreDashboardWidgets
          adAccountId={adAccountId as string}
          scopedRows={scopedRows}
          campaigns={scopedData.campaigns}
          selectedCampaignIds={selectedCampaignIds}
          dateRange={{ startTime: resolved.startTime, endTime: resolved.endTime }}
          days={days}
          currency={currency}
        />

        <div className="flex items-center justify-between mt-6 mb-3">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">All Campaigns</h2>
          <Link href="/tools/reports" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <BarChart2 className="w-3.5 h-3.5" /> Ad group, ad and segment reports <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {reportData.campaigns.length === 0 ? (
          <Card className="border rounded-xl">
            <CardContent className="py-16 flex flex-col items-center gap-2 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">No campaign data in this range</p>
              <p className="text-sm text-muted-foreground">Adjust the date range or create your first campaign.</p>
              <Link href="/tools/campaign/builder" className="mt-1"><Button size="sm" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" />New Campaign</Button></Link>
            </CardContent>
          </Card>
        ) : (
          <CampaignReport data={scopedData.campaigns} filters={filters} uniqueCampaigns={uniqueCampaigns} uniqueAdGroups={uniqueAdGroups} />
        )}

        {/* Optimize quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          <QuickLink href="/tools/audits" icon={ClipboardCheck} title="Orchard Inspector" desc="Find serving blocks, rejected ads and wasted spend." color="bg-zinc-600" />
          <QuickLink href="/tools/alerts" icon={Gauge} title="Orchard Watch" desc="Monitor metrics & budgets, get alerted or auto-pause." color="bg-rose-500" />
          <QuickLink href="/tools/campaign/builder" icon={Sparkles} title="New Campaign" desc="Build a campaign in one guided flow." color="bg-zinc-600" />
        </div>
      </div>
    </div>
  );
}
