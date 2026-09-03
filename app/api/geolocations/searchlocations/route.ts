import { redis } from "@/lib/redis";
import { SEARCH_GEO_LOCATIONS } from "@/utils/redisExpire";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { GeoService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/**
 * Location search for campaign targeting.
 *
 * `GET /geo_lookup/search?q=` returns country, region and DMA ids that go into
 * `campaign.targeting.locations.include`. Cached for a day: location ids are
 * effectively static, and every cached hit is one fewer request against a rate
 * limit shared with the customer's other tools.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, q, limit } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const term = String(q ?? "").trim();
  if (term.length < 2) throw new AppError("Enter at least two characters to search.", 400);

  const key = JSON.stringify([adAccountId, term.toLowerCase(), limit ?? 25, "geo"]);
  const cached = await redis.get(key);
  if (cached) {
    return NextResponse.json({ message: "Locations fetched", locations: JSON.parse(cached) }, { status: 200 });
  }

  const locations = await GeoService.search({ userId, adAccountId }, term, Math.min(Number(limit) || 25, 100));

  await redis.set(key, JSON.stringify(locations), "EX", SEARCH_GEO_LOCATIONS);
  return NextResponse.json({ message: "Locations fetched", locations }, { status: 200 });
});
