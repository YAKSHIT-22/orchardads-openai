import { withAdsRoute, AppError } from "@/lib/openai/client";
import { runCachedReport } from "@/lib/openai/report";
import { GET_AD_REPORTS } from "@/utils/redisExpire";
import { NextResponse } from "next/server";
import type { InsightSegment } from "@/lib/openai/types";

/**
 * Ad-level report. Scoped to one ad group or campaign when given, else the whole
 * account. Ad rows carry review status and reason from the synced cache, which
 * is what makes the ads table double as a rejection triage view.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const body = await req.json().catch(() => ({}));
  const { adAccountId, campaignId, adGroupId, days = 30, daily = true, segment, limit } = body as {
    adAccountId?: string;
    campaignId?: string;
    adGroupId?: string;
    days?: number;
    daily?: boolean;
    segment?: InsightSegment;
    limit?: number;
  };

  if (days < 1 || days > 1825) throw new AppError("days must be between 1 and 1825", 400);

  const scope = adGroupId
    ? ({ level: "ad_group", id: adGroupId } as const)
    : campaignId
      ? ({ level: "campaign", id: campaignId } as const)
      : ({ level: "account" } as const);

  const report = await runCachedReport({
    userId,
    adAccountId,
    reportType: "ad",
    scopeKey: adGroupId ?? campaignId ?? "account",
    request: { level: "ad", scope, days, daily, segment, limit },
    ttl: GET_AD_REPORTS,
  });

  return NextResponse.json({ message: "Ad report fetched", report }, { status: 200 });
});
