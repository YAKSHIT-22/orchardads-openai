import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdGroupService } from "@/lib/openai/services";
import { resolveConnection } from "@/lib/openai/credentials";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Create an ad group.
 *
 * `bidding_config.billing_event_type` must MATCH the parent campaign's bidding
 * type — `impression` for impression campaigns, `click` for both click and
 * conversion campaigns. For a conversion campaign, `max_bid_micros` is the CPA
 * bid even though billing is per click, which is the single most confusable
 * field in this API, so we derive the billing event from the campaign rather
 * than trusting the caller to get it right.
 *
 * `context_hints` are the OpenAI Ads analogue of keywords: free text, at most
 * 2,000 per ad group.
 */
const schema = z.object({
  adAccountId: z.string().min(1),
  campaign_id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(ACCOUNT_LIMITS.nameMin)
    .max(ACCOUNT_LIMITS.nameMax)
    .refine((v) => /\S/.test(v), "Name must contain a non-space character"),
  description: z.string().max(1000).optional(),
  status: z.enum(["active", "paused"]),
  context_hints: z.array(z.string().trim().min(1)).max(ACCOUNT_LIMITS.contextHintsPerAdGroup).optional(),
  max_bid_micros: z.number().int().min(1),
  custom_audience_bid_multipliers: z
    .array(
      z.object({
        custom_audience_id: z.string(),
        bid_multiplier_micros: z.number().int().min(100_000).max(10_000_000),
      })
    )
    .optional(),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, max_bid_micros, custom_audience_bid_multipliers, ...input } = parsed.data;
  const connection = await resolveConnection(userId, { adAccountId });

  // Derive the billing event from the parent campaign so it can never mismatch.
  const parent = await prisma.cachedCampaign.findUnique({
    where: { connectionId_externalId: { connectionId: connection.id, externalId: input.campaign_id } },
    select: { biddingType: true, name: true },
  });
  const billing_event_type = parent?.biddingType === "impressions" ? "impression" : "click";

  const adGroup = await AdGroupService.create(
    { userId, adAccountId },
    {
      ...input,
      bidding_config: {
        billing_event_type,
        max_bid_micros,
        ...(custom_audience_bid_multipliers ? { custom_audience_bid_multipliers } : {}),
      },
    }
  );

  if (adGroup?.id) {
    const campaignRow = await prisma.cachedCampaign.findUnique({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: input.campaign_id } },
      select: { id: true },
    });

    if (campaignRow) {
      prisma.cachedAdGroup
        .upsert({
          where: { connectionId_externalId: { connectionId: connection.id, externalId: adGroup.id } },
          update: {
            name: adGroup.name,
            status: adGroup.status,
            maxBidMicros: adGroup.bidding_config?.max_bid_micros
              ? BigInt(adGroup.bidding_config.max_bid_micros)
              : null,
            billingEventType: adGroup.bidding_config?.billing_event_type ?? null,
            contextHints: adGroup.context_hints ?? [],
            servingIssues: (adGroup.serving_issues ?? []).map((i) => i.code),
            rawData: adGroup as never,
            updatedAt: new Date(),
          },
          create: {
            connectionId: connection.id,
            campaignId: campaignRow.id,
            userId,
            adAccountId: connection.adAccountId,
            externalId: adGroup.id,
            name: adGroup.name,
            status: adGroup.status,
            maxBidMicros: adGroup.bidding_config?.max_bid_micros
              ? BigInt(adGroup.bidding_config.max_bid_micros)
              : null,
            billingEventType: adGroup.bidding_config?.billing_event_type ?? null,
            contextHints: adGroup.context_hints ?? [],
            servingIssues: (adGroup.serving_issues ?? []).map((i) => i.code),
            rawData: adGroup as never,
          },
        })
        .catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        userId,
        adAccountId: connection.adAccountId,
        action: "ADGROUP_CREATED",
        entityType: "ADGROUP",
        entityId: adGroup.id,
        entityName: adGroup.name,
        after: adGroup as never,
        meta: { campaignId: input.campaign_id, billing_event_type },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });

    redis
      .keys(`*${userId}*${adAccountId}*allAdGroups*`)
      .then((keys) => {
        if (keys.length) redis.del(...keys);
      })
      .catch(() => {});
  }

  return NextResponse.json({ message: "Ad group created", adGroup }, { status: 201 });
});
