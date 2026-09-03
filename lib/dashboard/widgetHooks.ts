"use client";

/**
 * React-query hooks for the dashboard widgets.
 *
 * Thin wrappers over the report endpoint. The keyword and search-term
 * drill-down hooks are gone — the OpenAI Ads API has neither, so they were
 * calling routes that no longer exist.
 *
 * Every hook here takes a DAY COUNT rather than a start/end pair. That is
 * deliberate: the API bounds insight ranges to the past five years and rejects
 * future dates, and a day count can't express either mistake. It also makes
 * cache keys collide usefully between widgets asking for the same window,
 * which matters when rate limits are shared with the customer's own tools.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportData } from "@/types/reportsDetails";

const STALE = 5 * 60 * 1000;

async function fetchCampaignReport(
  adAccountId: string,
  days: number,
  daily: boolean,
  opts: { segment?: "country" | "device" | "product"; offsetDays?: number } = {}
): Promise<ReportData> {
  const res = await api.post("/reports/campaign", {
    adAccountId,
    days,
    daily,
    ...(opts.segment ? { segment: opts.segment } : {}),
    ...(opts.offsetDays ? { offsetDays: opts.offsetDays } : {}),
    limit: 200,
  });
  return res.data.report as ReportData;
}

/** Campaign report for the trailing month (daily) — powers spend projection. */
export function useMonthCampaignReport(adAccountId: string | null | undefined, days = 30) {
  return useQuery<ReportData>({
    queryKey: ["dash-month-report", adAccountId, days],
    queryFn: () => fetchCampaignReport(adAccountId as string, days, true),
    enabled: !!adAccountId,
    staleTime: STALE,
    retry: 1,
  });
}

/**
 * The equal-length window immediately BEFORE the current one.
 *
 * This is a second report call rather than a split of one longer daily series,
 * and that is deliberate: the comparison card ranks per-CAMPAIGN movers, and a
 * daily series is aggregated across the whole scope — it cannot be split back
 * apart by campaign. Fetching one longer window would be cheaper and would
 * silently produce the wrong answer.
 */
export function usePeriodCampaignReport(
  adAccountId: string | null | undefined,
  days: number,
  enabled = true
) {
  return useQuery<ReportData>({
    queryKey: ["dash-period-report", adAccountId, days],
    queryFn: () => fetchCampaignReport(adAccountId as string, days, false, { offsetDays: days }),
    enabled: !!adAccountId && enabled,
    staleTime: STALE,
    retry: 1,
  });
}

/**
 * One segment breakdown (country / device / product).
 *
 * The insights API accepts at most one `segments[]` value per request, so this
 * takes a single segment. Product segments additionally require the ad account
 * to have product feeds enabled; an account without them returns nothing rather
 * than erroring, and the widget shows an empty state.
 */
export function useSegmentReport(
  adAccountId: string | null | undefined,
  segment: "country" | "device" | "product",
  days: number,
  enabled = true
) {
  return useQuery<ReportData>({
    queryKey: ["dash-segment-report", adAccountId, segment, days],
    queryFn: () => fetchCampaignReport(adAccountId as string, days, false, { segment }),
    enabled: !!adAccountId && enabled,
    staleTime: STALE,
    retry: 1,
  });
}
