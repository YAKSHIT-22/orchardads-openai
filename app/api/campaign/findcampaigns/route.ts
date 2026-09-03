import { withAdsRoute, AppError } from "@/lib/openai/client";
import { CampaignService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/** Fetch one campaign, with its serving issues. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, campaignId } = await req.json().catch(() => ({}));
  if (!adAccountId || !campaignId) throw new AppError("adAccountId and campaignId required", 400);

  const campaign = await CampaignService.get({ userId, adAccountId }, campaignId);
  return NextResponse.json({ message: "Campaign fetched", campaign }, { status: 200 });
});
