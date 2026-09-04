import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdService } from "@/lib/openai/services";
import { requireFeature } from "@/lib/billing/entitlements";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";

/**
 * Update an ad — `POST /ads/{ad_id}` (the API uses POST, not PATCH).
 *
 * Every field is optional, but `creative` is replaced WHOLE when present: the
 * API takes the object as given, so sending a partial creative would blank the
 * members left out. The client therefore submits the full creative it rendered,
 * and this route refuses a creative missing its required members rather than
 * letting a half-filled form erase live ad copy.
 *
 * Editing copy sends the ad back for review, so this is not a cosmetic change —
 * it is the one write here that can take a serving ad off the air for a while.
 */
const schema = z.object({
  adAccountId: z.string().min(1),
  adId: z.string().min(1),
  name: z.string().trim().min(ACCOUNT_LIMITS.nameMin).max(ACCOUNT_LIMITS.nameMax).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  creative: z
    .object({
      type: z.enum(["chat_card", "product_ad_template"]),
      title: z.string().trim().min(3).max(ACCOUNT_LIMITS.adTitleMax),
      body: z.string().trim().min(1).max(ACCOUNT_LIMITS.adBodyMax),
      target_url: z
        .string()
        .trim()
        .max(ACCOUNT_LIMITS.targetUrlMax)
        .refine((v) => /^https?:\/\//i.test(v), "Destination URL must start with http:// or https://")
        .optional(),
      price: z.string().max(100).optional(),
      file_id: z.string().optional(),
      image_crop: z
        .object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0).max(1),
          height: z.number().min(0).max(1),
        })
        .optional(),
    })
    .optional(),
  landing_page_configuration: z
    .object({ query_string_template: z.string().max(2048) })
    .nullable()
    .optional(),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, adId, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) throw new AppError("Nothing to update", 400);

  // image_crop is documented as chat_card-only and dependent on file_id.
  // Catching it here gives a usable message instead of a bare upstream 400.
  if (patch.creative?.image_crop) {
    if (patch.creative.type !== "chat_card") {
      throw new AppError("Image cropping is only supported on chat card creatives.", 400);
    }
    if (!patch.creative.file_id) {
      throw new AppError("Add an image before setting a crop.", 400);
    }
  }

  const before = await AdService.get({ userId, adAccountId }, adId).catch(() => null);
  const ad = await AdService.update({ userId, adAccountId }, adId, patch);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "AD_UPDATED",
      entityType: "AD",
      entityId: adId,
      entityName: ad?.name ?? patch.name ?? null,
      before: before ? JSON.parse(JSON.stringify(before)) : undefined,
      after: JSON.parse(JSON.stringify(ad)),
    },
  });

  return NextResponse.json(
    {
      message: patch.creative
        ? "Ad updated. Changing copy or the destination sends it back for review."
        : "Ad updated.",
      data: ad,
    },
    { status: 200 }
  );
});
