import { withAdsRoute, AppError } from "@/lib/openai/client";
import { runCachedReport } from "@/lib/openai/report";
import { GET_ADGROUP_REPORTS } from "@/utils/redisExpire";
import { NextResponse } from "next/server";
import type { InsightSegment } from "@/lib/openai/types";

/**
 * Ad-group report. Scoped to one campaign when `campaignId` is given, otherwise
 * every ad group in the account — the insights endpoints support both, since
 * each scope also serves its lower aggregation levels.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const body = await req.json().catch(() => ({}));
  const { adAccountId, campaignId, days = 30, daily = true, segment, limit } = body as {
    adAccountId?: string;
    campaignId?: string;
    days?: number;
    daily?: boolean;
    segment?: InsightSegment;
    limit?: number;
  };

  if (days < 1 || days > 1825) throw new AppError("days must be between 1 and 1825", 400);

  const report = await runCachedReport({
    userId,
    adAccountId,
    reportType: "adgroup",
    scopeKey: campaignId ?? "account",
    request: {
      level: "ad_group",
      scope: campaignId ? { level: "campaign", id: campaignId } : { level: "account" },
      days,
      daily,
      segment,
      limit,
    },
    ttl: GET_ADGROUP_REPORTS,
  });

  return NextResponse.json({ message: "Ad group report fetched", report }, { status: 200 });
});
