import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { FeedService } from "@/lib/openai/services";
import { requireFeature } from "@/lib/billing/entitlements";

/**
 * Product feeds — the catalogue a `product_ad_template` creative renders from.
 * A campaign in `product_feed` mode needs one, and an ad group can point at a
 * product set within it.
 */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const res = await FeedService.list({ userId, adAccountId });
  return NextResponse.json({ feeds: res?.data ?? [] }, { status: 200 });
});

const schema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  /** ISO-3166 alpha-2, the same vocabulary as campaign location targeting. */
  countries: z.array(z.string().trim().length(2)).max(250).optional(),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, ...body } = parsed.data;
  const feed = await FeedService.create({ userId, adAccountId }, body);
  return NextResponse.json({ message: "Feed created", data: feed }, { status: 201 });
});
