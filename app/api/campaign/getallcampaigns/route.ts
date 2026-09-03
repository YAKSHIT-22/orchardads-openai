import { redis } from "@/lib/redis";
import { GET_ALL_CAMPAIGN } from "@/utils/redisExpire";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { CampaignService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/**
 * List campaigns for one ad account.
 *
 * Always requests `include[]=serving_issues` — the typed codes are what power
 * Serving Doctor, and fetching them separately would double our request count
 * against a rate limit the customer shares with their other tools.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, limit, name } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const key = JSON.stringify([userId, adAccountId, limit ?? null, name ?? null, "allCampaigns"]);
  const cached = await redis.get(key);
  if (cached) {
    return NextResponse.json(
      { message: "Campaigns fetched", campaigns: JSON.parse(cached) },
      { status: 200 }
    );
  }

  const payload = await CampaignService.list(
    { userId, adAccountId },
    { withServingIssues: true, limit, name }
  );

  await redis.set(key, JSON.stringify(payload), "EX", GET_ALL_CAMPAIGN);
  return NextResponse.json({ message: "Campaigns fetched", campaigns: payload }, { status: 200 });
});
