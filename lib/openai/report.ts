import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { resolveConnection } from "./credentials";
import {
  computeMetrics,
  dateRange,
  defaultFields,
  getConversionsWith,
  getInsightsWith,
  joinInsights,
  lastNDays,
  type InsightScope,
  type Metrics,
} from "./insights";
import { AdGroupService, AdService, CampaignService } from "./services";
import type {
  AdGroupReportRow,
  AdReportRow,
  CampaignReportRow,
  DailyData,
  Performance,
  ReportData,
  SegmentReportRow,
} from "@/types/reportsDetails";
import type { AggregationLevel, InsightSegment, TimeRange } from "./types";

/**
 * The report layer: one place that turns "show me the last 30 days by campaign"
 * into the two upstream calls, the daily join, and a typed ReportData.
 *
 * Caching is two-tier (Redis -> Postgres), and it matters: the OpenAI Ads API
 * enforces rate limits per ad account
 * AND per IP, so an uncached dashboard would spend the customer's own budget of
 * requests every time someone reloads a page.
 */

const DEFAULT_TTL = 15 * 60;

export type ReportRequest = {
  level: AggregationLevel;
  /** Endpoint scope. Defaults to the whole ad account. */
  scope?: InsightScope;
  timeRange?: TimeRange;
  days?: number;
  /**
   * Shift the window back by this many days, so `days: 30, offsetDays: 30` is
   * "the 30 days before the last 30". Used for period-over-period comparison
   * and by alerts that ignore recent days while conversions are still landing.
   */
  offsetDays?: number;
  daily?: boolean;
  segment?: InsightSegment;
  limit?: number;
};

/**
 * Run a report with a two-tier cache (Redis -> Postgres).
 *
 * Every report route shares this so caching, rate-limit pressure, retries and
 * error normalization stay consistent.
 */
export async function runCachedReport({
  userId,
  adAccountId,
  reportType,
  request,
  ttl = DEFAULT_TTL,
  scopeKey = "",
}: {
  userId: string;
  adAccountId?: string | null;
  /** Stable label persisted on CachedReport.reportType, e.g. "campaign". */
  reportType: string;
  request: ReportRequest;
  /** Cache TTL in seconds. */
  ttl?: number;
  /** Extra scoping (campaignId / adGroupId) to keep cache keys unique. */
  scopeKey?: string;
}): Promise<ReportData> {
  const connection = await resolveConnection(userId, { adAccountId });

  const fingerprint = JSON.stringify(request);
  const redisKey = `oai:report:${JSON.stringify([userId, connection.adAccountId, scopeKey, reportType, fingerprint])}`;
  const dbKey = `${userId}:${connection.adAccountId}:${scopeKey}:${reportType}:${fingerprint}`;

  const redisCached = await redis.get(redisKey);
  if (redisCached) return JSON.parse(redisCached) as ReportData;

  const dbCached = await prisma.cachedReport.findUnique({ where: { cacheKey: dbKey } });
  if (dbCached && dbCached.expiresAt > new Date()) {
    await redis.set(redisKey, JSON.stringify(dbCached.data), "EX", ttl);
    return dbCached.data as unknown as ReportData;
  }

  const data = await buildReport(connection, request);

  const expiresAt = new Date(Date.now() + ttl * 1000);
  await redis.set(redisKey, JSON.stringify(data), "EX", ttl);
  // Fire-and-forget: a cache write must never fail the request.
  prisma.cachedReport
    .upsert({
      where: { cacheKey: dbKey },
      update: { data: data as never, expiresAt, updatedAt: new Date() },
      create: {
        userId,
        adAccountId: connection.adAccountId,
        reportType,
        cacheKey: dbKey,
        data: data as never,
        expiresAt,
      },
    })
    .catch(() => {});

  return data;
}

type Connection = Awaited<ReturnType<typeof resolveConnection>>;

/**
 * Fetch, join and shape one report.
 *
 * Ordering note: delivery and conversions are two separate calls, and the
 * conversions call takes the entity ids we want counts for. We fetch delivery
 * first and pass its ids through, so a campaign with spend but no conversions
 * still gets an explicit zero rather than being dropped from the join.
 */
async function buildReport(connection: Connection, request: ReportRequest): Promise<ReportData> {
  const {
    level,
    scope = { level: "account" } as InsightScope,
    days = 30,
    offsetDays = 0,
    daily = true,
    segment,
    limit,
  } = request;

  // An explicit range wins; otherwise build one from days + offset. Both go
  // through `dateRange`, which clamps to the API's documented bounds (nothing
  // older than five years, nothing in the future).
  const timeRange =
    request.timeRange ??
    (offsetDays > 0
      ? dateRange(
          new Date(Date.now() - (days + offsetDays - 1) * 86_400_000),
          new Date(Date.now() - offsetDays * 86_400_000),
          connection.timezone
        )
      : lastNDays(days, connection.timezone));
  const valueMicros = connection.conversionValueMicros;
  const currency = connection.currencyCode || "USD";

  // Row-level totals for the window (one row per entity).
  const deliveryTotals = await getInsightsWith(connection, scope, {
    timeRange,
    aggregationLevel: level,
    timeGranularity: "none",
    fields: defaultFields(level),
    includeZeroImpressions: true,
    limit,
  });

  const entityIds = uniq(
    deliveryTotals.map((r) => String(r[`${level}_id`] ?? r.ad_account_id ?? "")).filter(Boolean)
  );

  const conversionTotals = await getConversionsWith(connection, {
    aggregationLevel: level,
    timeRange,
    entityIds: entityIds.length ? entityIds : undefined,
    daily: false,
  }).catch(() => []);

  const totals = joinInsights(deliveryTotals, conversionTotals, level, valueMicros);

  // Daily series for the trend chart, aggregated across the whole scope.
  let dailyData: DailyData[] = [];
  if (daily) {
    const deliveryDaily = await getInsightsWith(connection, scope, {
      timeRange,
      aggregationLevel: level,
      timeGranularity: "daily",
      fields: defaultFields(level),
      limit,
    });
    const conversionDaily = await getConversionsWith(connection, {
      aggregationLevel: level,
      timeRange,
      entityIds: entityIds.length ? entityIds : undefined,
      daily: true,
    }).catch(() => []);

    dailyData = rollUpByDay(joinInsights(deliveryDaily, conversionDaily, level, valueMicros), valueMicros);
  }

  // One optional breakdown dimension. Segmented requests can't use hourly and
  // can't be combined with zero-impression expansion, so this is a separate call.
  let segments: SegmentReportRow[] = [];
  if (segment) {
    const segRows = await getInsightsWith(connection, scope, {
      timeRange,
      aggregationLevel: level,
      timeGranularity: "none",
      segments: [segment],
      fields: [...defaultFields(level), ...segmentFields(segment)],
      limit,
    }).catch(() => []);

    segments = segRows.map((row) => {
      const value = String(
        row[`${segment}_name`] ?? row[`${segment}_type`] ?? row[`${segment}_item_id`] ?? "unknown"
      );
      const m = computeMetrics(
        {
          entityId: value,
          impressions: numOf(row.impressions),
          clicks: numOf(row.clicks),
          spendMicros: Math.round(numOf(row.spend) * 1_000_000),
        },
        valueMicros
      );
      return {
        segmentType: segment,
        segmentValue: value,
        segmentLabel: String(row[`${segment}_title`] ?? value),
        performance: toPerformance(m, currency),
      };
    });
  }

  // Entity metadata comes from the synced cache, not another API round trip:
  // budgets, bids, statuses, serving issues and review reasons are all already
  // in Postgres from the last sync, and insights would not return most of them.
  const [campaigns, adGroups, ads] = await Promise.all([
    level === "campaign" ? attachCampaigns(connection, totals, currency) : Promise.resolve([]),
    level === "ad_group" ? attachAdGroups(connection, totals, currency) : Promise.resolve([]),
    level === "ad" ? attachAds(connection, totals, currency) : Promise.resolve([]),
  ]);

  return {
    campaigns,
    adGroups,
    ads,
    segments,
    dailyData,
    currency,
    revenueModelled: valueMicros != null,
  };
}

// ── Entity metadata joins ───────────────────────────────────────────────────

async function attachCampaigns(
  connection: Connection,
  totals: Metrics[],
  currency: string
): Promise<CampaignReportRow[]> {
  const rows = await prisma.cachedCampaign.findMany({
    where: { connectionId: connection.id },
    select: {
      externalId: true,
      name: true,
      status: true,
      biddingType: true,
      servingIssues: true,
      lifetimeBudgetMicros: true,
      dailyBudgetMicros: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.externalId, r]));

  // The cache (populated by sync) is the richer source — it alone has bidding
  // type and serving issues. But it is empty until a sync has run, and a table
  // showing "unknown" status and no budget because a background job hasn't
  // fired yet is simply broken to the person looking at it. So fall back to the
  // attributes the insights row already carries.
  return totals.map((m) => {
    const meta = byId.get(m.entityId);
    return {
      campaignId: m.entityId,
      campaignName: meta?.name ?? m.entityName ?? m.entityId,
      campaignStatus: meta?.status ?? m.status ?? "unknown",
      biddingType: meta?.biddingType ?? undefined,
      servingIssues: meta?.servingIssues ?? [],
      lifetimeBudgetMicros: meta?.lifetimeBudgetMicros
        ? Number(meta.lifetimeBudgetMicros)
        : (m.lifetimeBudgetMicros ?? null),
      dailyBudgetMicros: meta?.dailyBudgetMicros
        ? Number(meta.dailyBudgetMicros)
        : (m.dailyBudgetMicros ?? null),
      startTime: m.startTime ?? null,
      endTime: m.endTime ?? null,
      performance: toPerformance(m, currency),
    };
  });
}

async function attachAdGroups(
  connection: Connection,
  totals: Metrics[],
  currency: string
): Promise<AdGroupReportRow[]> {
  const rows = await prisma.cachedAdGroup.findMany({
    where: { connectionId: connection.id },
    select: {
      externalId: true,
      name: true,
      status: true,
      maxBidMicros: true,
      billingEventType: true,
      servingIssues: true,
      campaign: { select: { externalId: true, name: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.externalId, r]));

  return totals.map((m) => {
    const meta = byId.get(m.entityId);
    return {
      campaignId: meta?.campaign?.externalId ?? "",
      campaignName: meta?.campaign?.name ?? "",
      adGroupId: m.entityId,
      adGroupName: meta?.name ?? m.entityName ?? m.entityId,
      adGroupStatus: meta?.status ?? "unknown",
      maxBidMicros: meta?.maxBidMicros ? Number(meta.maxBidMicros) : null,
      billingEventType: meta?.billingEventType ?? undefined,
      servingIssues: meta?.servingIssues ?? [],
      performance: toPerformance(m, currency),
    };
  });
}

async function attachAds(
  connection: Connection,
  totals: Metrics[],
  currency: string
): Promise<AdReportRow[]> {
  const rows = await prisma.cachedAd.findMany({
    where: { connectionId: connection.id },
    select: {
      externalId: true,
      name: true,
      status: true,
      title: true,
      body: true,
      targetUrl: true,
      creativeType: true,
      reviewStatus: true,
      reviewReason: true,
      servingIssues: true,
      adGroup: {
        select: { externalId: true, name: true, campaign: { select: { externalId: true, name: true } } },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.externalId, r]));

  return totals.map((m) => {
    const meta = byId.get(m.entityId);
    return {
      campaignId: meta?.adGroup?.campaign?.externalId ?? "",
      campaignName: meta?.adGroup?.campaign?.name ?? "",
      adGroupId: meta?.adGroup?.externalId ?? "",
      adGroupName: meta?.adGroup?.name ?? "",
      adId: m.entityId,
      adName: meta?.name ?? m.entityName ?? m.entityId,
      title: meta?.title ?? undefined,
      body: meta?.body ?? undefined,
      targetUrl: meta?.targetUrl ?? null,
      creativeType: meta?.creativeType ?? undefined,
      status: meta?.status ?? "unknown",
      reviewStatus: meta?.reviewStatus ?? undefined,
      reviewReason: meta?.reviewReason ?? null,
      servingIssues: meta?.servingIssues ?? [],
      performance: toPerformance(m, currency),
    };
  });
}

// ── Shaping helpers ─────────────────────────────────────────────────────────

export function toPerformance(m: Metrics, currency: string): Performance {
  return {
    impressions: m.impressions,
    clicks: m.clicks,
    ctr: m.ctr,
    spendMicros: m.spendMicros,
    cpcMicros: m.cpcMicros,
    cpmMicros: m.cpmMicros,
    conversions: m.conversions,
    viewThroughConversions: m.viewThroughConversions,
    cpaMicros: m.cpaMicros,
    cvr: m.cvr,
    revenueMicros: m.revenueMicros,
    roas: m.roas,
    currency,
    date: m.date ?? "",
  };
}

/** Collapse entity-day rows into one series across the whole scope. */
function rollUpByDay(rows: Metrics[], valueMicros?: bigint | number | null): DailyData[] {
  const byDate = new Map<
    string,
    { impressions: number; clicks: number; spendMicros: number; conversions: number }
  >();

  for (const r of rows) {
    if (!r.date) continue;
    const acc = byDate.get(r.date) ?? { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0 };
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.spendMicros += r.spendMicros;
    acc.conversions += r.conversions;
    byDate.set(r.date, acc);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => {
      const m = computeMetrics({ entityId: date, date, ...acc }, valueMicros);
      return {
        date,
        impressions: m.impressions,
        clicks: m.clicks,
        ctr: m.ctr,
        spendMicros: m.spendMicros,
        cpcMicros: m.cpcMicros,
        cpmMicros: m.cpmMicros,
        conversions: m.conversions,
        cpaMicros: m.cpaMicros,
        cvr: m.cvr,
        revenueMicros: m.revenueMicros,
        roas: m.roas,
      };
    });
}

function segmentFields(segment: InsightSegment): string[] {
  if (segment === "country") return ["country.name"];
  if (segment === "device") return ["device.type"];
  return ["product.item_id", "product.title", "product.feed_id"];
}

function numOf(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Live entity snapshots straight from the API, for the pages that must reflect
 * an edit immediately rather than wait for the next sync.
 */
export const Live = {
  campaigns: (connection: Connection) => CampaignService.listAllWith(connection),
  adGroups: (connection: Connection, campaignId?: string) =>
    AdGroupService.listAllWith(connection, campaignId),
  ads: (connection: Connection, adGroupId?: string) => AdService.listAllWith(connection, adGroupId),
};

export { dateRange, lastNDays };
