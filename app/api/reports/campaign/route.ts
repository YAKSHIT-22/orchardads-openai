import { withAdsRoute, AppError } from "@/lib/openai/client";
import { runCachedReport } from "@/lib/openai/report";
import { GET_CAMPAIGN_REPORTS } from "@/utils/redisExpire";
import { NextResponse } from "next/server";
import type { InsightSegment } from "@/lib/openai/types";

/**
 * Campaign-level report over the whole ad account.
 *
 * `days` (not a caller-built request body) is the only time input: the API
 * bounds ranges to the past 5 years and rejects future dates, and letting the
 * client hand us an arbitrary range invites both. `segment` accepts exactly one
 * of country/device/product, matching the API's own limit.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const body = await req.json().catch(() => ({}));
  const { adAccountId, days = 30, offsetDays = 0, daily = true, segment, limit } = body as {
    adAccountId?: string;
    days?: number;
    offsetDays?: number;
    daily?: boolean;
    segment?: InsightSegment;
    limit?: number;
  };

  if (days < 1 || days > 1825) throw new AppError("days must be between 1 and 1825", 400);
  // The API rejects bounds older than five years, so the window and its offset
  // are validated together rather than letting an upstream 400 surface raw.
  if (offsetDays < 0 || days + offsetDays > 1825) {
    throw new AppError("The requested window falls outside the 5 years of history the API allows.", 400);
  }
  if (segment && !["country", "device", "product"].includes(segment)) {
    throw new AppError("segment must be one of country, device, product", 400);
  }

  const report = await runCachedReport({
    userId,
    adAccountId,
    reportType: "campaign",
    scopeKey: offsetDays ? `offset-${offsetDays}` : "",
    request: { level: "campaign", days, offsetDays, daily, segment, limit },
    ttl: GET_CAMPAIGN_REPORTS,
  });

  return NextResponse.json({ message: "Campaign report fetched", report }, { status: 200 });
});
