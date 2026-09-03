import { NextResponse } from "next/server";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AccountService, CampaignService, AdGroupService } from "@/lib/openai/services";
import { generateSuggestions, isAiConfigured } from "@/lib/ai/suggest";
import { requireFeature, consume } from "@/lib/billing/entitlements";
import { clientIp, rateLimit } from "@/lib/rateLimit";

/**
 * AI setup suggestions: context hints and ad copy for a new campaign.
 *
 * Two guards worth noting:
 *  - Metered. LLM calls are the only variable cost in this product, so every
 *    call is counted against the plan before it is made.
 *  - Rate limited per user on top of the plan cap, because a runaway client
 *    loop shouldn't be able to burn a month's allowance in a minute.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { generated: false, reason: "AI suggestions aren't configured on this deployment." },
      { status: 200 }
    );
  }

  await requireFeature(userId, "ai_analyst");

  const limit = await rateLimit(`ai-suggest:${userId}:${clientIp(req)}`, 20, 3600);
  if (!limit.ok) {
    return NextResponse.json(
      {
        generated: false,
        reason: `Too many AI requests — try again in about ${Math.ceil(limit.retryAfter / 60)} min.`,
      },
      { status: 200 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { adAccountId, biddingType = "clicks", countries = [], description } = body as {
    adAccountId?: string;
    biddingType?: string;
    countries?: string[];
    description?: string;
  };
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  const ctx = { userId, adAccountId };

  // Account and existing campaigns give the model real context. Both are
  // best-effort: a missing piece should degrade the suggestion, not block it.
  const [accountRes, campaignRes] = await Promise.allSettled([
    AccountService.get(ctx),
    CampaignService.list(ctx, { limit: 50 }),
  ]);

  const account = accountRes.status === "fulfilled" ? accountRes.value : null;
  const campaigns = campaignRes.status === "fulfilled" ? (campaignRes.value?.data ?? []) : [];

  // Pull existing context hints so suggestions don't repeat what's already live.
  let existing: { name?: string; contextHints?: string[] }[] = campaigns
    .slice(0, 10)
    .map((c) => ({ name: c.name, contextHints: [] as string[] }));
  try {
    const groups = await AdGroupService.list(ctx, { limit: 50 });
    const hints = (groups?.data ?? []).flatMap((g) => g.context_hints ?? []);
    if (hints.length) existing = [{ name: "Currently targeting", contextHints: [...new Set(hints)] }, ...existing];
  } catch {
    /* ad groups are optional context */
  }

  await consume(userId, "ai_analyses");

  const result = await generateSuggestions({
    currency: account?.currency_code || "USD",
    biddingType,
    countries: Array.isArray(countries) ? countries.map(String) : [],
    business: {
      url: account?.url,
      name: account?.name,
      description,
    },
    existingCampaigns: existing,
  });

  return NextResponse.json(result, { status: 200 });
});
