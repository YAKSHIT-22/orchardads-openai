import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { AccountService, AdGroupService, AdService, CampaignService, SpendLimitService } from "./services";
import { getConversionsWith, getInsightsWith, defaultFields, lastNDays } from "./insights";
import { ymdIn } from "./time";
import type { OpenAiAdsConnection } from "@prisma/client";
import type { Ad, AdGroup, Campaign, ConversionRow, InsightRow } from "./types";

/**
 * Background sync: OpenAI Ads API -> Postgres.
 *
 * Why this exists at all: the API enforces 600 req/min per endpoint and 1,200
 * overall, PER AD ACCOUNT AND PER IP. Fetching on every dashboard render would
 * spend the customer's own request budget — the same budget their other tools
 * draw on — and would make our page speed hostage to their rate limit. So every
 * read in the product goes to Postgres, and only this module talks upstream.
 *
 * Ordering is hierarchical because each level's ids scope the next call:
 *   account -> campaigns -> ad groups -> ads -> delivery insights -> conversions
 *
 * Two properties that matter more than speed:
 *
 * - IDEMPOTENT. Every write is an upsert keyed on (connectionId, externalId) or
 *   the MetricFact unique tuple, so a retried or overlapping run converges
 *   instead of duplicating.
 * - PARTIAL SUCCESS IS RECORDED, NOT SWALLOWED. If insights fail after entities
 *   succeed, the run is marked PARTIAL with the error. A sync that silently
 *   half-finished would leave the recommendation engine reasoning about a window
 *   with missing spend, which is worse than no recommendation at all.
 */

const SYNC_LOCK_TTL = 15 * 60; // seconds
const DEFAULT_WINDOW_DAYS = 30;

export type SyncOptions = {
  /** Days of insights to pull. Entities are always fully re-synced. */
  days?: number;
  trigger?: "manual" | "cron" | "queue";
  /** Skip insights (entity-only refresh after a write). */
  entitiesOnly?: boolean;
};

export type SyncResult = {
  runId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  campaignsSynced: number;
  adGroupsSynced: number;
  adsSynced: number;
  factsWritten: number;
  error?: string;
};

/**
 * Single-flight lock per connection.
 *
 * Two concurrent syncs of one account would double its request consumption
 * against a shared rate limit and race on the same upserts. Without Redis
 * (local dev) we proceed — a dev machine cannot realistically collide.
 */
async function acquireLock(connectionId: string): Promise<boolean> {
  const key = `oai:sync:lock:${connectionId}`;
  const res = await redis.set(key, "1", "EX", SYNC_LOCK_TTL, "NX");
  if (res === null) return false; // held by another run
  return true;
}

async function releaseLock(connectionId: string): Promise<void> {
  await redis.del(`oai:sync:lock:${connectionId}`).catch(() => {});
}

export async function syncConnection(
  connection: OpenAiAdsConnection,
  { days = DEFAULT_WINDOW_DAYS, trigger = "manual", entitiesOnly = false }: SyncOptions = {}
): Promise<SyncResult> {
  const gotLock = await acquireLock(connection.id);
  if (!gotLock) {
    return {
      runId: "",
      status: "SKIPPED",
      campaignsSynced: 0,
      adGroupsSynced: 0,
      adsSynced: 0,
      factsWritten: 0,
      error: "A sync is already running for this ad account.",
    };
  }

  const run = await prisma.syncRun.create({
    data: {
      connectionId: connection.id,
      userId: connection.userId,
      adAccountId: connection.adAccountId,
      status: "RUNNING",
      trigger,
    },
  });

  let campaignsSynced = 0;
  let adGroupsSynced = 0;
  let adsSynced = 0;
  let factsWritten = 0;
  const errors: string[] = [];

  try {
    // 1. Account metadata. Brand review status outranks everything else we can
    //    show: an account not approved cannot serve a single ad.
    try {
      const account = await AccountService.getWith(connection);
      await prisma.openAiAdsConnection.update({
        where: { id: connection.id },
        data: {
          adAccountName: account.name ?? connection.adAccountName,
          accountUrl: account.url ?? connection.accountUrl,
          currencyCode: account.currency_code || connection.currencyCode,
          timezone: account.timezone || connection.timezone,
          reviewStatus: account.review?.status ?? null,
          reviewReason: account.review?.reason ?? null,
          accountStatus: account.status ?? null,
          status: "ACTIVE",
          lastError: null,
          lastValidatedAt: new Date(),
        },
      });
    } catch (err) {
      errors.push(`account: ${message(err)}`);
    }

    // 2. Campaigns.
    const campaigns = await CampaignService.listAllWith(connection);
    campaignsSynced = await upsertCampaigns(connection, campaigns);

    // 3. Ad groups (account-wide; the endpoint serves all campaigns at once, so
    //    one walk beats one call per campaign against the rate limit).
    const adGroups = await AdGroupService.listAllWith(connection);
    adGroupsSynced = await upsertAdGroups(connection, adGroups);

    // 4. Ads.
    const ads = await AdService.listAllWith(connection);
    adsSynced = await upsertAds(connection, ads);

    // 5. Spend limit windows — `spent_micros` makes pacing exact rather than
    //    estimated, so it is worth its own call.
    try {
      const windows = await SpendLimitService.listWith(connection);
      await redis
        .set(
          `oai:spendlimits:${connection.id}`,
          JSON.stringify(windows?.data ?? []),
          "EX",
          600
        )
        .catch(() => {});
    } catch (err) {
      errors.push(`spend_limits: ${message(err)}`);
    }

    // 6. Insights. Daily grain, because conversions only support daily and the
    //    two sources must join on the same grain.
    if (!entitiesOnly) {
      try {
        factsWritten = await syncFacts(connection, days);
      } catch (err) {
        errors.push(`insights: ${message(err)}`);
      }
    }

    const status = errors.length ? "PARTIAL" : "SUCCESS";

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status,
        campaignsSynced,
        adGroupsSynced,
        adsSynced,
        factsWritten,
        error: errors.length ? errors.join(" | ") : null,
        finishedAt: new Date(),
      },
    });

    await prisma.openAiAdsConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    return {
      runId: run.id,
      status,
      campaignsSynced,
      adGroupsSynced,
      adsSynced,
      factsWritten,
      ...(errors.length ? { error: errors.join(" | ") } : {}),
    };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message(err), finishedAt: new Date() },
    });
    return {
      runId: run.id,
      status: "FAILED",
      campaignsSynced,
      adGroupsSynced,
      adsSynced,
      factsWritten,
      error: message(err),
    };
  } finally {
    await releaseLock(connection.id);
  }
}

// ── Entity upserts ──────────────────────────────────────────────────────────

async function upsertCampaigns(connection: OpenAiAdsConnection, campaigns: Campaign[]): Promise<number> {
  let n = 0;
  for (const c of campaigns) {
    if (!c?.id) continue;
    const data = {
      name: c.name,
      status: c.status,
      biddingType: c.bidding_type ?? null,
      objective: c.objective ?? null,
      billingEventType: c.billing_event_type ?? null,
      mode: c.mode ?? null,
      lifetimeBudgetMicros: bigintOrNull(c.budget?.lifetime_spend_limit_micros),
      dailyBudgetMicros: bigintOrNull(c.budget?.daily_spend_limit_micros),
      startTime: c.start_time ? new Date(c.start_time * 1000) : null,
      endTime: c.end_time ? new Date(c.end_time * 1000) : null,
      servingIssues: (c.serving_issues ?? []).map((i) => i.code),
      // The untouched response, so a mapping we got wrong can be corrected from
      // stored data instead of needing a re-sync. This API ships weekly changes.
      rawData: c as never,
    };

    await prisma.cachedCampaign.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: c.id } },
      update: { ...data, updatedAt: new Date() },
      create: {
        ...data,
        connectionId: connection.id,
        userId: connection.userId,
        adAccountId: connection.adAccountId,
        externalId: c.id,
      },
    });
    n++;
  }
  return n;
}

async function upsertAdGroups(connection: OpenAiAdsConnection, adGroups: AdGroup[]): Promise<number> {
  // Ad groups arrive without a campaign_id on the item body, so we resolve the
  // parent from what we just synced. An orphan (parent not yet visible) is
  // skipped rather than guessed at — it will land on the next run.
  const campaignRows = await prisma.cachedCampaign.findMany({
    where: { connectionId: connection.id },
    select: { id: true, externalId: true },
  });
  const campaignByExternal = new Map(campaignRows.map((r) => [r.externalId, r.id]));

  let n = 0;
  for (const g of adGroups) {
    if (!g?.id) continue;

    const parentExternal = extractParentId(g, "campaign_id");
    const campaignId = parentExternal ? campaignByExternal.get(parentExternal) : undefined;
    if (!campaignId) continue;

    const data = {
      name: g.name,
      status: g.status,
      billingEventType: g.bidding_config?.billing_event_type ?? null,
      maxBidMicros: bigintOrNull(g.bidding_config?.max_bid_micros),
      contextHints: g.context_hints ?? [],
      servingIssues: (g.serving_issues ?? []).map((i) => i.code),
      rawData: g as never,
    };

    await prisma.cachedAdGroup.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: g.id } },
      update: { ...data, campaignId, updatedAt: new Date() },
      create: {
        ...data,
        connectionId: connection.id,
        campaignId,
        userId: connection.userId,
        adAccountId: connection.adAccountId,
        externalId: g.id,
      },
    });
    n++;
  }
  return n;
}

async function upsertAds(connection: OpenAiAdsConnection, ads: Ad[]): Promise<number> {
  const groupRows = await prisma.cachedAdGroup.findMany({
    where: { connectionId: connection.id },
    select: { id: true, externalId: true },
  });
  const groupByExternal = new Map(groupRows.map((r) => [r.externalId, r.id]));

  let n = 0;
  for (const a of ads) {
    if (!a?.id) continue;

    const parentExternal = extractParentId(a, "ad_group_id");
    const adGroupId = parentExternal ? groupByExternal.get(parentExternal) : undefined;
    if (!adGroupId) continue;

    const data = {
      name: a.name ?? a.creative?.title ?? a.id,
      status: a.status,
      creativeType: a.creative?.type ?? null,
      title: a.creative?.title ?? null,
      body: a.creative?.body ?? null,
      targetUrl: a.creative?.target_url ?? null,
      imageUrl: a.creative?.image_url ?? null,
      fileId: a.creative?.file_id ?? null,
      // Review status and reason drive Review Doctor. `reason` is an enum
      // dominated by fixable crawler/landing-page failures.
      reviewStatus: a.review_status ?? a.review?.status ?? null,
      reviewReason: a.review?.reason ?? null,
      reviewScreenshot: a.review?.screenshot_url ?? null,
      servingIssues: (a.serving_issues ?? []).map((i) => i.code),
      rawData: a as never,
    };

    await prisma.cachedAd.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: a.id } },
      update: { ...data, adGroupId, updatedAt: new Date() },
      create: {
        ...data,
        connectionId: connection.id,
        adGroupId,
        userId: connection.userId,
        adAccountId: connection.adAccountId,
        externalId: a.id,
      },
    });
    n++;
  }
  return n;
}

// ── Metric facts ────────────────────────────────────────────────────────────

/**
 * Pull delivery + conversion insights at every level and write daily facts.
 *
 * Six upstream calls per level pair, not one per entity: the insights endpoints
 * accept an aggregation level inside an account-wide scope, so one request
 * returns every campaign's daily rows. At 5,000 entities per account, per-entity
 * fetching would blow the rate limit in seconds.
 */
async function syncFacts(connection: OpenAiAdsConnection, days: number): Promise<number> {
  const timeRange = lastNDays(days, connection.timezone);
  let written = 0;

  const levels = [
    { level: "campaign" as const, entityType: "CAMPAIGN" },
    { level: "ad_group" as const, entityType: "ADGROUP" },
    { level: "ad" as const, entityType: "AD" },
  ];

  // Account-level totals first — cheap, and the dashboard's headline numbers.
  written += await writeLevel(connection, "ACCOUNT", "ad_account", timeRange);

  for (const { level, entityType } of levels) {
    written += await writeLevel(connection, entityType, level, timeRange);
  }

  return written;
}

async function writeLevel(
  connection: OpenAiAdsConnection,
  entityType: string,
  level: "ad_account" | "campaign" | "ad_group" | "ad",
  timeRange: ReturnType<typeof lastNDays>
): Promise<number> {
  const delivery: InsightRow[] = await getInsightsWith(
    connection,
    { level: "account" },
    {
      timeRange,
      aggregationLevel: level,
      timeGranularity: "daily",
      fields: defaultFields(level),
      limit: 2000,
    }
  );

  const idKey = `${level}_id`;
  const entityIds = [
    ...new Set(delivery.map((r) => String(r[idKey] ?? r.ad_account_id ?? "")).filter(Boolean)),
  ];

  // Conversions are a separate endpoint and can legitimately fail (the account
  // may have no conversion setup at all). Treat an empty result as "no
  // conversions", never as a reason to drop the spend rows we already have.
  let conversions: ConversionRow[] = [];
  try {
    conversions = await getConversionsWith(connection, {
      aggregationLevel: level,
      timeRange,
      entityIds: entityIds.length ? entityIds : undefined,
      daily: true,
    });
  } catch {
    conversions = [];
  }

  type Acc = {
    impressions: number;
    clicks: number;
    spendMicros: number;
    conversions: number;
    viewThrough: number;
  };
  const rows = new Map<string, Acc>();
  const keyOf = (entityId: string, date: string) => `${entityId}|${date}`;
  const blank = (): Acc => ({
    impressions: 0,
    clicks: 0,
    spendMicros: 0,
    conversions: 0,
    viewThrough: 0,
  });

  for (const r of delivery) {
    const entityId = String(r[idKey] ?? r.ad_account_id ?? "");
    const date = normalizeDate(r.readable_time) ?? ymdIn(new Date(), connection.timezone);
    if (!entityId) continue;
    const k = keyOf(entityId, date);
    const acc = rows.get(k) ?? blank();
    acc.impressions += num(r.impressions);
    acc.clicks += num(r.clicks);
    acc.spendMicros += Math.round(num(r.spend) * 1_000_000);
    rows.set(k, acc);
  }

  for (const r of conversions) {
    const date = normalizeDate(r.date);
    if (!r.entity_id || !date) continue;
    const k = keyOf(r.entity_id, date);
    const acc = rows.get(k) ?? blank();
    acc.conversions += r.click_through_conversions ?? r.conversions ?? 0;
    acc.viewThrough += r.view_through_conversions ?? 0;
    rows.set(k, acc);
  }

  let written = 0;
  for (const [k, acc] of rows) {
    const [entityId, date] = k.split("|");
    await prisma.metricFact.upsert({
      where: {
        adAccountId_entityType_entityId_date_segmentType_segmentValue: {
          adAccountId: connection.adAccountId,
          entityType,
          entityId,
          date: new Date(`${date}T00:00:00Z`),
          segmentType: "",
          segmentValue: "",
        },
      },
      update: {
        impressions: BigInt(acc.impressions),
        clicks: BigInt(acc.clicks),
        spendMicros: BigInt(acc.spendMicros),
        conversions: acc.conversions,
        viewThroughConversions: acc.viewThrough,
        currencyCode: connection.currencyCode,
        syncedAt: new Date(),
      },
      create: {
        userId: connection.userId,
        adAccountId: connection.adAccountId,
        entityType,
        entityId,
        date: new Date(`${date}T00:00:00Z`),
        impressions: BigInt(acc.impressions),
        clicks: BigInt(acc.clicks),
        spendMicros: BigInt(acc.spendMicros),
        conversions: acc.conversions,
        viewThroughConversions: acc.viewThrough,
        currencyCode: connection.currencyCode,
      },
    });
    written++;
  }

  return written;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parent ids are not on the documented item bodies, so look in the raw payload.
 * If OpenAI adds the field under a different name later, this keeps working for
 * the names we know and skips (rather than mis-parents) anything else.
 */
function extractParentId(obj: unknown, key: string): string | null {
  const o = obj as Record<string, unknown>;
  const direct = o?.[key];
  if (typeof direct === "string") return direct;
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const alt = o?.[camel];
  return typeof alt === "string" ? alt : null;
}

function bigintOrNull(v: number | null | undefined): bigint | null {
  return v === null || v === undefined ? null : BigInt(Math.round(v));
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Sync every active connection for one user. Used by the manual button. */
export async function syncAllForUser(userId: string, options: SyncOptions = {}): Promise<SyncResult[]> {
  const connections = await prisma.openAiAdsConnection.findMany({
    where: { userId, status: "ACTIVE" },
  });
  const results: SyncResult[] = [];
  for (const connection of connections) {
    results.push(await syncConnection(connection, options));
  }
  return results;
}

/**
 * Make sure the cache is worth reading before a page renders from it.
 *
 * Everything the UI shows comes from our own tables, so a connection that has
 * never synced produces a page that is not empty-but-honest — it is actively
 * wrong. Serving Doctor is the worst case: with no cached entities it finds no
 * serving issues and reads as "nothing is blocking delivery", when in fact the
 * account had `ad_account_payment_method_missing_or_unauthorized` the whole
 * time. A false all-clear on the one feature whose entire promise is telling
 * you why nothing is running.
 *
 * So:
 *   - COLD cache (never synced): await an entity-only pull. Three list calls,
 *     fast enough to block a page load, and it is what serving issues, review
 *     status and names all come from.
 *   - STALE cache: refresh in the background at the plan's interval. The caller
 *     renders what it has; the next load is current.
 *
 * Single-flight is enforced by the Redis lock inside syncConnection, so several
 * pages opening at once cost one sync.
 */
export async function ensureFreshSync(
  connection: OpenAiAdsConnection,
  { staleAfterMinutes = 360 }: { staleAfterMinutes?: number } = {}
): Promise<void> {
  const last = connection.lastSyncAt?.getTime() ?? 0;

  if (!last) {
    await syncConnection(connection, { trigger: "manual", entitiesOnly: true }).catch((e) => {
      console.error("cold sync failed:", (e as Error).message);
    });
    return;
  }

  const ageMinutes = (Date.now() - last) / 60_000;
  if (ageMinutes >= staleAfterMinutes) {
    void syncConnection(connection, { trigger: "cron" }).catch((e) => {
      console.error("refresh sync failed:", (e as Error).message);
    });
  }
}
