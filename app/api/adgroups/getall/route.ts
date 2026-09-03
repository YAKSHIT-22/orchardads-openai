import { redis } from "@/lib/redis";
import { GET_ALL_ADGROUPS } from "@/utils/redisExpire";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdGroupService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/** List ad groups, optionally scoped to one campaign. Serving issues included. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, campaignId, limit } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const key = JSON.stringify([userId, adAccountId, campaignId ?? null, limit ?? null, "allAdGroups"]);
  const cached = await redis.get(key);
  if (cached) {
    return NextResponse.json({ message: "Ad groups fetched", adGroups: JSON.parse(cached) }, { status: 200 });
  }

  const payload = await AdGroupService.list(
    { userId, adAccountId },
    { campaignId, withServingIssues: true, limit }
  );

  await redis.set(key, JSON.stringify(payload), "EX", GET_ALL_ADGROUPS);
  return NextResponse.json({ message: "Ad groups fetched", adGroups: payload }, { status: 200 });
});
