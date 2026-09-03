"use client";

/**
 * Advanced analytics widgets layered on top of the dashboard:
 *   - Performance Change     (window vs the equal-length window before it)
 *   - Segment Breakdown      (country / device, from the insights segments API)
 *
 * TWO APPLE WIDGETS WERE REMOVED, not ported, because their data does not exist
 * on this platform:
 *   - PPC Investigator   drilled into search terms and keywords. No keywords.
 *   - Market Expansion   listed App Store countries the app was eligible in but
 *                        not targeting. No app, no eligibility endpoint.
 *   - Projected Spend    projected against a monthly budget target. OpenAI Ads
 *                        campaigns carry lifetime budgets, so that target is
 *                        usually unknowable — Budget Pacing answers the real
 *                        question ("when does this go dark?") instead.
 *
 * All widgets honour the campaign multi-filter scope.
 */

import { useMemo } from "react";
import type { CampaignReportRow, Campaign } from "@/types/reportsDetails";
import { PerformanceChangeCard } from "@/components/dashboard/PerformanceChangeCard";
import { SegmentBreakdownCard } from "@/components/dashboard/SegmentBreakdownCard";
import { usePeriodCampaignReport } from "@/lib/dashboard/widgetHooks";
import { aggregateCampaigns } from "@/lib/dashboard/widgetHelpers";

export type WidgetRange = { startTime: string; endTime: string };

export function MoreDashboardWidgets({
  adAccountId,
  scopedRows,
  campaigns,
  selectedCampaignIds,
  dateRange,
  days,
  currency,
}: {
  adAccountId: string;
  /** Scoped campaign rows for the selected date range. */
  scopedRows: CampaignReportRow[];
  campaigns: Campaign[];
  selectedCampaignIds: string[];
  dateRange: WidgetRange;
  days: number;
  currency: string;
}) {
  // The equal-length window before this one, per campaign. See the hook for why
  // this is a separate call rather than a split of one longer series.
  const prevQuery = usePeriodCampaignReport(adAccountId, days);

  // Scope the previous window to the same campaign selection, so a filtered
  // view compares like with like instead of "these campaigns vs everything".
  const previousAgg = useMemo(() => {
    const rows = prevQuery.data?.campaigns ?? [];
    if (!selectedCampaignIds.length) return aggregateCampaigns(rows);
    const set = new Set(selectedCampaignIds);
    return aggregateCampaigns(rows.filter((r) => set.has(r.campaignId)));
  }, [prevQuery.data, selectedCampaignIds]);

  const currentAgg = useMemo(() => aggregateCampaigns(scopedRows), [scopedRows]);

  const prevLabel = useMemo(() => {
    const end = new Date(Date.now() - days * 86_400_000);
    const start = new Date(Date.now() - days * 2 * 86_400_000);
    return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  }, [days]);

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PerformanceChangeCard
          currentAgg={currentAgg}
          previousAgg={previousAgg}
          currency={currency}
          isLoading={prevQuery.isLoading}
          isError={prevQuery.isError}
          prevLabel={prevLabel}
        />
        <SegmentBreakdownCard adAccountId={adAccountId} days={days} currency={currency} />
      </div>
    </div>
  );
}
