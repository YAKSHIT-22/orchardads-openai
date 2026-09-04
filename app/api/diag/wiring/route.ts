import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { adsFetchWithConnection } from "@/lib/openai/client";

/**
 * TEMPORARY read-only wiring probe.
 *
 * Exercises every OpenAI Ads endpoint the product depends on, against the real
 * connected account, and reports what each one actually returns. Its whole
 * purpose is to replace the `[U]` guesses in the research docs with observed
 * fact — `fields[]` already proved that a spec-derived projection can be wrong
 * in a way that only a live call reveals.
 *
 * Constraints, because this runs against a funded production ad account:
 *   - GET / read-only insights only. Nothing here creates, updates, pauses or
 *     archives anything.
 *   - Guarded by DIAG_TOKEN with a constant-time compare.
 *   - Returns shapes and error text, never the API key.
 *
 * DELETE THIS ROUTE once the mappings are corrected.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorised(req: Request): boolean {
  const expected = process.env.DIAG_TOKEN;
  if (!expected) return false;
  const got = req.headers.get("x-diag-token") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Probe = {
  name: string;
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
  count?: number;
  sampleKeys?: string[];
  sample?: unknown;
};

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conn = await prisma.openAiAdsConnection.findFirst({ orderBy: { createdAt: "asc" } });
  if (!conn) return NextResponse.json({ error: "No connection" }, { status: 400 });

  const results: Probe[] = [];

  async function probe(
    name: string,
    path: string,
    query?: Record<string, unknown>,
    method: "GET" | "POST" = "GET",
    body?: unknown
  ) {
    try {
      const res = await adsFetchWithConnection<Record<string, unknown>>(conn!, path, {
        method,
        ...(query ? { query: query as never } : {}),
        ...(body ? { body } : {}),
      });
      const data = (res as { data?: unknown[] })?.data;
      const arr = Array.isArray(data) ? data : Array.isArray(res) ? (res as unknown[]) : null;
      const first = arr?.[0] ?? (arr ? undefined : res);
      results.push({
        name,
        path,
        ok: true,
        count: arr?.length,
        sampleKeys: first && typeof first === "object" ? Object.keys(first as object).slice(0, 40) : undefined,
        sample: first,
      });
    } catch (err) {
      results.push({
        name,
        path,
        ok: false,
        status: (err as { status?: number }).status,
        error: String((err as { message?: string }).message ?? err).slice(0, 600),
      });
    }
  }

  const today = new Date();
  const since = new Date(today.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  const tr = JSON.stringify({ type: "date_range", since, until, timezone: conn.timezone || "UTC" });

  // ── Entities ────────────────────────────────────────────────────────────
  await probe("ad_account", "/ad_account");
  await probe("campaigns", "/campaigns", { limit: 5, "include[]": ["serving_issues"] });
  await probe("ad_groups", "/ad_groups", { limit: 5, "include[]": ["serving_issues"] });
  await probe("ads", "/ads", { limit: 5, "include[]": ["serving_issues"] });
  await probe("conversion_pixels", "/conversions/pixels");
  await probe("conversion_event_settings", "/conversions/event_settings", { limit: 5 });
  await probe("geo_lookup", "/geo_lookup/search", { q: "mumbai", limit: 3 });

  // ── Insights: the projections we actually send ──────────────────────────
  const campaignFields = [
    "campaign.id", "campaign.name", "campaign.status",
    "campaign.budget.lifetime", "campaign.budget.daily",
    "campaign.impressions", "campaign.clicks", "campaign.spend",
    "campaign.ctr", "campaign.cpc", "campaign.cpm",
  ];
  await probe("insights: campaign totals", "/ad_account/insights", {
    aggregation_level: "campaign", time_granularity: "none",
    "time_ranges[]": [tr], "fields[]": campaignFields, limit: 5,
  });
  await probe("insights: campaign daily (date key?)", "/ad_account/insights", {
    aggregation_level: "campaign", time_granularity: "daily",
    "time_ranges[]": [tr], "fields[]": campaignFields, limit: 5,
  });
  await probe("insights: zero_impression_items include", "/ad_account/insights", {
    aggregation_level: "campaign", time_granularity: "none",
    "time_ranges[]": [tr], "fields[]": campaignFields,
    "includes[]": ["zero_impression_items"], limit: 5,
  });
  await probe("insights: ad_group level [U]", "/ad_account/insights", {
    aggregation_level: "ad_group", time_granularity: "none",
    "time_ranges[]": [tr],
    "fields[]": ["ad_group.id", "ad_group.name", "ad_group.status",
      "ad_group.impressions", "ad_group.clicks", "ad_group.spend",
      "ad_group.ctr", "ad_group.cpc", "ad_group.cpm"],
    limit: 5,
  });
  await probe("insights: ad level [U]", "/ad_account/insights", {
    aggregation_level: "ad", time_granularity: "none",
    "time_ranges[]": [tr],
    "fields[]": ["ad.id", "ad.name", "ad.status",
      "ad.impressions", "ad.clicks", "ad.spend", "ad.ctr", "ad.cpc", "ad.cpm"],
    limit: 5,
  });
  await probe("insights: country segment", "/ad_account/insights", {
    aggregation_level: "campaign", time_granularity: "none",
    "time_ranges[]": [tr], "fields[]": [...campaignFields, "country.name"],
    "segments[]": ["country"], limit: 5,
  });
  await probe("insights: device segment", "/ad_account/insights", {
    aggregation_level: "campaign", time_granularity: "none",
    "time_ranges[]": [tr], "fields[]": [...campaignFields, "device.type"],
    "segments[]": ["device"], limit: 5,
  });

  // ── Conversions ─────────────────────────────────────────────────────────
  // The open question is whether a POST body wants each time range as a JSON
  // STRING (what query params require, and what the app currently sends) or as
  // a real object. Getting this wrong means conversions silently read as zero,
  // which would make every CPA and CVR in the product wrong rather than absent.
  const rangeObj = { type: "date_range", since, until, timezone: conn.timezone || "UTC" };
  await probe("conversions: time_ranges as STRING (what we send)", "/conversions/insights", undefined, "POST", {
    aggregation_level: "campaign",
    time_ranges: [JSON.stringify(rangeObj)],
    time_granularity: "none",
    group_by_entity: true,
    include_zero_rows: true,
  });
  // Omitting group_by_entity still errors, so it defaults to true server-side
  // and entity_ids is effectively mandatory. Two ways out: say false, or supply
  // the ids. Test both.
  await probe("conversions: group_by_entity FALSE", "/conversions/insights", undefined, "POST", {
    aggregation_level: "campaign",
    time_ranges: [JSON.stringify(rangeObj)],
    time_granularity: "none",
    group_by_entity: false,
    include_zero_rows: true,
  });
  const cmpId = "cmpn_23de9f4cf3e8819fbd4f699afc7015cc";
  await probe("conversions: WITH entity_ids", "/conversions/insights", undefined, "POST", {
    aggregation_level: "campaign",
    time_ranges: [JSON.stringify(rangeObj)],
    time_granularity: "none",
    entity_ids: [cmpId],
    group_by_entity: true,
    include_zero_rows: true,
  });

  // Exactly the app's deliveryTotals call — dump EVERY row to find the duplicate.
  let dupRows: unknown = null;
  try {
    const r = await adsFetchWithConnection<{ data?: unknown[] }>(conn, "/ad_account/insights", {
      query: {
        aggregation_level: "campaign",
        time_granularity: "none",
        "time_ranges[]": [tr],
        "fields[]": campaignFields,
        "includes[]": ["zero_impression_items"],
        limit: 500,
      } as never,
    });
    dupRows = r?.data;
  } catch (e) {
    dupRows = { error: String((e as Error).message).slice(0, 300) };
  }

  return NextResponse.json(
    {
      deliveryTotalsRows: dupRows,
      account: {
        adAccountId: conn.adAccountId,
        name: conn.adAccountName,
        currency: conn.currencyCode,
        timezone: conn.timezone,
        reviewStatus: conn.reviewStatus,
        accountStatus: conn.accountStatus,
      },
      window: { since, until },
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    },
    { status: 200 }
  );
}
