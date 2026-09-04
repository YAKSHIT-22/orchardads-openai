import { NextResponse } from "next/server";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { FeedService } from "@/lib/openai/services";

/** Recent feed deliveries — the only confirmation a catalogue actually landed. */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const res = await FeedService.uploads({ userId, adAccountId });
  return NextResponse.json({ uploads: res?.data ?? [] }, { status: 200 });
});
