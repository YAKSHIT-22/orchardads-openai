import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { CampaignService } from "@/lib/openai/services";
import { resolveConnection } from "@/lib/openai/credentials";
import { MIN_CAMPAIGN_BUDGET_MICROS } from "@/lib/openai/money";
import { clampCampaignUnix } from "@/lib/openai/time";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { CreateCampaignBody } from "@/lib/openai/types";

/**
 * Create a campaign.
 *
 * Validated against the documented rules rather than trusting the client, since
 * a rejected create after a long wizard is a bad experience and some of these
 * cannot be undone later:
 *
 *  - `name` 3-1000 chars, must contain a non-space character
 *  - `budget.lifetime_spend_limit_micros` is REQUIRED, minimum 1,000,000 micros
 *  - `bidding_type` CANNOT be changed after creation, and neither can the
 *    selected conversion event — so a wrong choice here means rebuilding the
 *    campaign, and we say so rather than letting it through quietly
 *  - `bidding_type: "conversions"` needs exactly one active standard event
 *    setting, and needs conversion bidding enabled for the account (else 403)
 *  - timestamps are Unix seconds within 2000-01-01 .. 2100-01-01
 *  - at most 2,500 location IDs
 */

const budgetSchema = z.object({
  lifetime_spend_limit_micros: z
    .number()
    .int()
    .min(Number(MIN_CAMPAIGN_BUDGET_MICROS), "Lifetime budget must be at least 1.00 in your account currency"),
  daily_spend_limit_micros: z.number().int().positive().optional(),
});

const createSchema = z
  .object({
    adAccountId: z.string().min(1),
    name: z
      .string()
      .trim()
      .min(ACCOUNT_LIMITS.nameMin)
      .max(ACCOUNT_LIMITS.nameMax)
      .refine((v) => /\S/.test(v), "Name must contain a non-space character"),
    description: z.string().max(1000).optional(),
    status: z.enum(["active", "paused"]),
    budget: budgetSchema,
    start_time: z.number().int().optional(),
    end_time: z.number().int().optional(),
    bidding_type: z.enum(["impressions", "clicks", "conversions"]).optional(),
    conversion_event_setting_ids: z.array(z.string()).optional(),
    mode: z.enum(["product_feed", "business_agent"]).optional(),
    targeting: z
      .object({
        locations: z
          .object({ include: z.array(z.object({ id: z.string() })).max(ACCOUNT_LIMITS.locationIdsPerCampaign) })
          .optional(),
        custom_audiences: z.object({ ids: z.array(z.string()) }).optional(),
        excluded_custom_audiences: z.object({ ids: z.array(z.string()) }).optional(),
      })
      .optional(),
  })
  .refine(
    (v) => v.bidding_type !== "conversions" || v.conversion_event_setting_ids?.length === 1,
    "A conversion-optimized campaign needs exactly one active conversion event setting"
  )
  .refine(
    (v) => !v.start_time || !v.end_time || v.end_time > v.start_time,
    "End time must be after start time"
  );

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, ...input } = parsed.data;
  const connection = await resolveConnection(userId, { adAccountId });

  const body: CreateCampaignBody = {
    ...input,
    ...(input.start_time ? { start_time: clampCampaignUnix(input.start_time) } : {}),
    ...(input.end_time ? { end_time: clampCampaignUnix(input.end_time) } : {}),
  };

  const campaign = await CampaignService.create({ userId, adAccountId }, body);

  if (campaign?.id) {
    // Write straight into the cache so the campaign appears without waiting for
    // the next sync. `rawData` keeps the untouched response for later mapping
    // corrections — this API ships changes weekly.
    prisma.cachedCampaign
      .upsert({
        where: { connectionId_externalId: { connectionId: connection.id, externalId: campaign.id } },
        update: {
          name: campaign.name,
          status: campaign.status,
          biddingType: campaign.bidding_type ?? null,
          lifetimeBudgetMicros: campaign.budget?.lifetime_spend_limit_micros
            ? BigInt(campaign.budget.lifetime_spend_limit_micros)
            : null,
          dailyBudgetMicros: campaign.budget?.daily_spend_limit_micros
            ? BigInt(campaign.budget.daily_spend_limit_micros)
            : null,
          servingIssues: (campaign.serving_issues ?? []).map((i) => i.code),
          rawData: campaign as never,
          updatedAt: new Date(),
        },
        create: {
          connectionId: connection.id,
          userId,
          adAccountId: connection.adAccountId,
          externalId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          biddingType: campaign.bidding_type ?? null,
          objective: campaign.objective ?? null,
          lifetimeBudgetMicros: campaign.budget?.lifetime_spend_limit_micros
            ? BigInt(campaign.budget.lifetime_spend_limit_micros)
            : null,
          dailyBudgetMicros: campaign.budget?.daily_spend_limit_micros
            ? BigInt(campaign.budget.daily_spend_limit_micros)
            : null,
          startTime: campaign.start_time ? new Date(campaign.start_time * 1000) : null,
          endTime: campaign.end_time ? new Date(campaign.end_time * 1000) : null,
          servingIssues: (campaign.serving_issues ?? []).map((i) => i.code),
          rawData: campaign as never,
        },
      })
      .catch(() => {});

    await prisma.auditLog.create({
      data: {
        userId,
        adAccountId: connection.adAccountId,
        action: "CAMPAIGN_CREATED",
        entityType: "CAMPAIGN",
        entityId: campaign.id,
        entityName: campaign.name,
        after: campaign as never,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });

    redis
      .keys(`*${userId}*${adAccountId}*allCampaigns*`)
      .then((keys) => {
        if (keys.length) redis.del(...keys);
      })
      .catch(() => {});
  }

  return NextResponse.json({ message: "Campaign created", campaign }, { status: 201 });
});
