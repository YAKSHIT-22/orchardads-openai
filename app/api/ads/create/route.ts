import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Create an ad.
 *
 * Creative limits are enforced here because the API rejects violations outright
 * and a rejected create after composing copy is pure lost work:
 * title 3-50 chars, body <= 100, target URL <= 2,048.
 *
 * The URL check is deliberately strict about http(s): a landing page the
 * crawler cannot fetch is the single most common cause of ad rejection
 * (`crawler_bot_blocked`, `robots_txt`, `crawler_403`), so catching an obviously
 * unusable URL before submission saves a review cycle.
 */
const schema = z.object({
  adAccountId: z.string().min(1),
  ad_group_id: z.string().min(1),
  name: z.string().trim().max(ACCOUNT_LIMITS.nameMax).optional(),
  status: z.enum(["active", "paused"]),
  creative: z.object({
    type: z.enum(["chat_card", "product_ad_template"]).default("chat_card"),
    title: z.string().trim().min(3).max(ACCOUNT_LIMITS.adTitleMax),
    body: z.string().trim().min(1).max(ACCOUNT_LIMITS.adBodyMax),
    target_url: z
      .string()
      .trim()
      .max(ACCOUNT_LIMITS.targetUrlMax)
      .refine((v) => /^https?:\/\//i.test(v), "Destination URL must start with http:// or https://"),
    price: z.string().optional(),
    file_id: z.string().optional(),
    image_url: z.string().optional(),
  }),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, ...input } = parsed.data;
  const ad = await AdService.create({ userId, adAccountId }, input);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "AD_CREATED",
      entityType: "AD",
      entityId: ad.id,
      entityName: ad.name ?? input.creative.title,
      after: ad as never,
      meta: { adGroupId: input.ad_group_id },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allAds*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json(
    {
      message: "Ad created",
      ad,
      // Set expectations: an ad only serves once review passes, and reviews are
      // where new advertisers most often get stuck.
      note: "The ad won't serve until OpenAI approves it. Review usually takes a few minutes — Review Doctor will explain any rejection.",
    },
    { status: 201 }
  );
});
