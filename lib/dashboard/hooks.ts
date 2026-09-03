"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { parseCampaignMeta, type CampaignMeta } from "./insights";
import type { ReportData } from "@/types/reportsDetails";

/**
 * Shared dashboard data hooks.
 *
 * The keyword and search-term hooks that used to live here are gone: the
 * OpenAI Ads API has neither, so there was nothing for them to fetch. What
 * replaces them is `useSegmentRows`, backed by the insights `segments[]`
 * parameter (country / device / product), which is the only breakdown
 * dimension this platform offers — and only one per request.
 */

export type DateRange = { startTime: string; endTime: string };

const STALE = 5 * 60 * 1000;

/** Campaign entities (status, budgets, serving issues) — not performance. */
export function useCampaignMeta(adAccountId: string | null | undefined) {
  return useQuery<CampaignMeta[]>({
    queryKey: ["dash-campaign-meta", adAccountId],
    queryFn: async () => {
      const res = await api.post("/campaign/getallcampaigns", { adAccountId, limit: 200 });
      return parseCampaignMeta(res.data?.campaigns?.data ?? []);
    },
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}

/** Campaign-level report for a window. */
export function useCampaignReport(adAccountId: string | null | undefined, days: number, daily = true) {
  return useQuery<ReportData>({
    queryKey: ["dash-campaign-report", adAccountId, days, daily],
    queryFn: async () => {
      const res = await api.post("/reports/campaign", { adAccountId, days, daily, limit: 200 });
      return res.data.report as ReportData;
    },
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}

/** Ad-group report, optionally scoped to one campaign. */
export function useAdGroupRows(adAccountId: string, campaignId: string | null, days: number) {
  return useQuery<ReportData["adGroups"]>({
    queryKey: ["dash-adgroups", adAccountId, campaignId, days],
    queryFn: async () => {
      const res = await api.post("/reports/adgroup", {
        adAccountId,
        ...(campaignId ? { campaignId } : {}),
        days,
        daily: false,
        limit: 500,
      });
      return (res.data.report as ReportData).adGroups;
    },
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}

/** Ad-level report, optionally scoped to a campaign or ad group. */
export function useAdRows(
  adAccountId: string,
  opts: { campaignId?: string | null; adGroupId?: string | null; days: number }
) {
  return useQuery<ReportData["ads"]>({
    queryKey: ["dash-ads", adAccountId, opts.campaignId, opts.adGroupId, opts.days],
    queryFn: async () => {
      const res = await api.post("/reports/ad", {
        adAccountId,
        ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
        ...(opts.adGroupId ? { adGroupId: opts.adGroupId } : {}),
        days: opts.days,
        daily: false,
        limit: 500,
      });
      return (res.data.report as ReportData).ads;
    },
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}

/**
 * One breakdown dimension.
 *
 * The insights API accepts at most ONE `segments[]` value per request, so this
 * takes a single segment rather than a list — a country-by-device cross-tab is
 * not something the platform can produce.
 */
export function useSegmentRows(
  adAccountId: string | null | undefined,
  segment: "country" | "device" | "product",
  days: number
) {
  return useQuery<ReportData["segments"]>({
    queryKey: ["dash-segments", adAccountId, segment, days],
    queryFn: async () => {
      const res = await api.post("/reports/campaign", {
        adAccountId,
        days,
        daily: false,
        segment,
        limit: 500,
      });
      return (res.data.report as ReportData).segments;
    },
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}
