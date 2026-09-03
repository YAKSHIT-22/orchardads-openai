"use client";

import { useMemo } from "react";
import type { ReportData, FilterState, ReportTotals } from "@/types/reportsDetails";

type EntityRow = {
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
  performance?: ReportData["campaigns"][number]["performance"];
};

/**
 * Client-side filtering + totals for the report tables.
 *
 * Two things it is careful about, both because getting them wrong produces
 * numbers a customer would act on:
 *
 * - Totals are summed from RAW COUNTERS (impressions, clicks, spend micros,
 *   conversions) and the rates are recomputed from those sums. Averaging
 *   per-row CTRs or CPAs would weight a campaign with 3 impressions the same as
 *   one with 300,000.
 * - Derived metrics stay NULL when their denominator is zero. A report with no
 *   conversions has no CPA; showing "0.00" would read as "free conversions".
 */
export function useReportData(data: ReportData, filters: FilterState, reportType: string) {
  const filteredData = useMemo(() => {
    const apply = <T extends EntityRow>(rows: T[]): T[] => {
      let filtered = rows;
      if (filters.selectedCampaignId) {
        filtered = filtered.filter((item) => item.campaignId === filters.selectedCampaignId);
      }
      if (filters.selectedAdGroupId) {
        filtered = filtered.filter((item) => item.adGroupId === filters.selectedAdGroupId);
      }
      return filtered;
    };

    return {
      campaigns: apply(data.campaigns),
      adGroups: apply(data.adGroups),
      ads: apply(data.ads),
    };
  }, [data, filters]);

  const reportData: EntityRow[] =
    (filteredData[reportType as keyof typeof filteredData] as EntityRow[] | undefined) ?? [];

  const totals: ReportTotals = useMemo(() => {
    return reportData.reduce<ReportTotals>(
      (acc, item) => {
        const p = item.performance;
        return {
          impressions: acc.impressions + (p?.impressions ?? 0),
          clicks: acc.clicks + (p?.clicks ?? 0),
          spendMicros: acc.spendMicros + (p?.spendMicros ?? 0),
          conversions: acc.conversions + (p?.conversions ?? 0),
          // Stays null unless at least one row carries modelled revenue.
          revenueMicros:
            p?.revenueMicros == null ? acc.revenueMicros : (acc.revenueMicros ?? 0) + p.revenueMicros,
        };
      },
      { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, revenueMicros: null }
    );
  }, [reportData]);

  /** Rates recomputed from the summed counters, never averaged across rows. */
  const metrics = useMemo(() => {
    const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
    return {
      ctr: div(totals.clicks, totals.impressions),
      cpcMicros: div(totals.spendMicros, totals.clicks),
      cpmMicros: totals.impressions > 0 ? (totals.spendMicros / totals.impressions) * 1000 : null,
      cpaMicros: div(totals.spendMicros, totals.conversions),
      cvr: div(totals.conversions, totals.clicks),
      roas: totals.revenueMicros == null ? null : div(totals.revenueMicros, totals.spendMicros),
    };
  }, [totals]);

  const uniqueCampaigns = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const row of [...data.campaigns, ...data.adGroups, ...data.ads] as EntityRow[]) {
      if (row.campaignId && !seen.has(row.campaignId)) {
        seen.set(row.campaignId, { id: row.campaignId, name: row.campaignName || row.campaignId });
      }
    }
    return [...seen.values()];
  }, [data]);

  const uniqueAdGroups = useMemo(() => {
    if (!filters.selectedCampaignId) return [];
    const seen = new Map<string, { id: string; name: string }>();
    for (const row of [...data.adGroups, ...data.ads] as EntityRow[]) {
      if (row.campaignId !== filters.selectedCampaignId) continue;
      if (row.adGroupId && !seen.has(row.adGroupId)) {
        seen.set(row.adGroupId, { id: row.adGroupId, name: row.adGroupName || row.adGroupId });
      }
    }
    return [...seen.values()];
  }, [data, filters.selectedCampaignId]);

  return { reportData, totals, metrics, uniqueCampaigns, uniqueAdGroups };
}
