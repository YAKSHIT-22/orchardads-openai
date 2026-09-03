import { withAdsRoute, AppError } from "@/lib/openai/client";
import { ConversionService } from "@/lib/openai/services";
import { GET_CONVERSION_SETUP } from "@/utils/redisExpire";
import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";

/**
 * List conversion event settings.
 *
 * Read-only on purpose. Creating pixels and Conversions API keys is gated by
 * OpenAI per ad account (`404 Not found` until enabled), so this product
 * diagnoses conversion setup and tells the advertiser exactly what to create in
 * Ads Manager rather than pretending to create it.
 * See docs/research/BLOCKERS.md YELLOW-2.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const key = JSON.stringify([userId, adAccountId, "conversionEventSettings"]);
  const cached = await redis.get(key);
  if (cached) return NextResponse.json(JSON.parse(cached), { status: 200 });

  const payload = await ConversionService.listEventSettings({ userId, adAccountId });
  const body = { data: payload?.data ?? [] };

  await redis.set(key, JSON.stringify(body), "EX", GET_CONVERSION_SETUP);
  return NextResponse.json(body, { status: 200 });
});
