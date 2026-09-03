import { redis } from "@/lib/redis";
import { GET_ALL_ADS } from "@/utils/redisExpire";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/**
 * List ads, optionally scoped to one ad group.
 *
 * Serving issues are always requested, and each ad carries `review_status` plus
 * an enumerated `review.reason` — together these are what Review Doctor reads,
 * so this one call answers both "is it running?" and "why was it rejected?".
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, adGroupId, limit } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const cacheKey = JSON.stringify([userId, adAccountId, adGroupId ?? null, limit ?? null, "allAds"]);
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json({ message: "Ads fetched", ads: JSON.parse(cached) }, { status: 200 });

  const ads = await AdService.list({ userId, adAccountId }, { adGroupId, withServingIssues: true, limit });

  await redis.set(cacheKey, JSON.stringify(ads), "EX", GET_ALL_ADS);
  return NextResponse.json({ message: "Ads fetched", ads }, { status: 200 });
});
