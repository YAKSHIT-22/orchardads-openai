import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdGroupService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import type { UpdateAdGroupBody } from "@/lib/openai/types";

/**
 * Update an ad group — this is where the bid lever lives.
 *
 * `bidding_config` is a nested object, so the API replaces it WHOLE. A caller
 * sending only `max_bid_micros` would blank `billing_event_type` and the bid
 * multipliers, so we read the current ad group and merge before writing.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const body = await req.json().catch(() => ({}));
  const { adAccountId, adGroupId, ...updates } = body as {
    adAccountId?: string;
    adGroupId?: string;
  } & Record<string, unknown>;

  if (!adAccountId || !adGroupId) throw new AppError("adAccountId and adGroupId required", 400);

  const before = await AdGroupService.get({ userId, adAccountId }, adGroupId);

  const payload: UpdateAdGroupBody = { ...(updates as UpdateAdGroupBody) };
  if (updates.bidding_config && typeof updates.bidding_config === "object") {
    payload.bidding_config = {
      ...before.bidding_config,
      ...(updates.bidding_config as Record<string, unknown>),
    } as never;
  }

  const after = await AdGroupService.update({ userId, adAccountId }, adGroupId, payload);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "ADGROUP_UPDATED",
      entityType: "ADGROUP",
      entityId: adGroupId,
      entityName: before.name,
      before: before as never,
      after: after as never,
      meta: { fields: Object.keys(payload) },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allAdGroups*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json({ message: "Ad group updated", adGroup: after }, { status: 200 });
});
