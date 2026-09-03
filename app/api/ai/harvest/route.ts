import { adsFetch, withAdsRoute, AppError } from "@/lib/openai/client";
import { generateHarvestInsights, isAiConfigured } from "@/lib/ai/harvest";
import { aiCacheField, aiCacheGet, aiCacheSet, aiRateLimit } from "@/lib/ai/cache";
import { NextResponse } from "next/server";

/**
 * AI keyword-harvest enrichment. The client sends the converting terms it found
 * (from the search-term report) plus any wasteful terms and already-targeted
 * keywords; the server adds the app's metadata + localized listings (owner
 * credentials) and asks the model to rank candidates, propose expansion
 * keywords, and suggest negatives. Always 200 with { generated, ... } so the UI
 * degrades gracefully.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, adamId, currency, candidates, wastefulTerms, existingKeywords } = await req.json();
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  if (!isAiConfigured()) {
    return NextResponse.json({ generated: false, reason: "AI suggestions aren't configured yet." }, { status: 200 });
  }

  // Cache identical enrichment inputs (candidates + wasteful terms + existing kw
  // are the same for the same campaign/window until the report changes).
  const field = aiCacheField({ adAccountId, adamId, currency, candidates, wastefulTerms, existingKeywords });
  const cached = await aiCacheGet<any>("harvest", field);
  if (cached) return NextResponse.json({ ...cached, cached: true }, { status: 200 });

  const retryAfter = await aiRateLimit(userId);
  if (retryAfter) {
    return NextResponse.json(
      { generated: false, reason: `Too many AI requests — try again in about ${Math.ceil(retryAfter / 60)} min.` },
      { status: 200 },
    );
  }

  // App context is best-effort — a missing piece shouldn't block enrichment.
  let app: any = {};
  let localeData: any[] = [];
  if (adamId) {
    const [appRes, localeRes] = await Promise.allSettled([
      adsFetch<any>(userId, `/apps/${adamId}`, { method: "GET", adAccountId }),
      adsFetch<any>(userId, `/apps/${adamId}/locale-details`, { method: "GET", adAccountId }),
    ]);
    app = appRes.status === "fulfilled" ? (appRes.value?.data ?? appRes.value ?? {}) : {};
    localeData = localeRes.status === "fulfilled" ? (localeRes.value?.data?.appLocales || localeRes.value?.data || []) : [];
  }

  const result = await generateHarvestInsights({
    currency: currency || app?.currency || "USD",
    app: { appName: app?.appName, primaryGenre: app?.primaryGenre, secondaryGenre: app?.secondaryGenre, artistName: app?.artistName },
    locales: (Array.isArray(localeData) ? localeData : []).map((l: any) => ({ language: l.language, appName: l.appName, subTitle: l.subTitle, shortDescription: l.shortDescription })),
    candidates: Array.isArray(candidates) ? candidates.slice(0, 60) : [],
    wastefulTerms: Array.isArray(wastefulTerms) ? wastefulTerms.slice(0, 40) : [],
    existingKeywords: Array.isArray(existingKeywords) ? existingKeywords.slice(0, 300).map(String) : [],
  });

  if (result.generated) await aiCacheSet("harvest", field, result);

  return NextResponse.json(result, { status: 200 });
});
