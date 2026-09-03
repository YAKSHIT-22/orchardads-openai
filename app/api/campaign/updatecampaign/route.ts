import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { CampaignService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";
import { requireFeature } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";
import type { UpdateCampaignBody } from "@/lib/openai/types";

/**
 * Update one campaign.
 *
 * Two API details this route exists to get right, because both silently corrupt
 * a customer's setup if handled naively:
 *
 * 1. Updates are POST, not PUT/PATCH, and there is no envelope — fields go at
 *    the top level of the body.
 * 2. NESTED OBJECTS ARE REPLACED WHOLE. Sending `{budget: {daily_spend_limit_micros}}`
 *    drops the lifetime limit entirely, changing what the campaign is allowed to
 *    spend. So we read the current campaign first and merge, rather than passing
 *    the client's partial budget straight through.
 *
 * `bidding_type` is immutable after creation (and `conversion_event_setting_ids`
 * on a conversion campaign), so both are stripped rather than forwarded to fail.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const body = await req.json().catch(() => ({}));
  const { adAccountId, campaignId, ...updates } = body as {
    adAccountId?: string;
    campaignId?: string;
  } & Record<string, unknown>;

  if (!adAccountId || !campaignId) throw new AppError("adAccountId and campaignId required", 400);

  // Immutable after creation — never forward them.
  delete (updates as Record<string, unknown>).bidding_type;
  delete (updates as Record<string, unknown>).conversion_event_setting_ids;

  const before = await CampaignService.get({ userId, adAccountId }, campaignId);

  const payload: UpdateCampaignBody = { ...(updates as UpdateCampaignBody) };

  // Merge the budget so a partial edit can't silently clear the other limit.
  if (updates.budget && typeof updates.budget === "object") {
    payload.budget = { ...before.budget, ...(updates.budget as Record<string, number>) } as never;
  }

  const after = await CampaignService.update({ userId, adAccountId }, campaignId, payload);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "CAMPAIGN_UPDATED",
      entityType: "CAMPAIGN",
      entityId: campaignId,
      entityName: before.name,
      before: before as never,
      after: after as never,
      meta: { fields: Object.keys(payload) },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allCampaigns*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json({ message: "Campaign updated", campaign: after }, { status: 200 });
});
