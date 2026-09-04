import { adsFetch, adsFetchWithConnection } from "./client";
import { ConversionService } from "./services";
import type { OpenAiAdsConnection } from "@prisma/client";
import type {
  AggregationLevel,
  ConversionRow,
  InsightFilter,
  InsightRow,
  InsightSegment,
  InsightSort,
  ListEnvelope,
  TimeGranularity,
  TimeRange,
} from "./types";

/**
 * Insights: the two-source join that produces every number in this product.
 *
 *   delivery   GET  /{scope}/insights       -> impressions, clicks, spend, ctr, cpc, cpm
 *   conversion POST /conversions/insights   -> conversions (click-through only)
 *
 * Two structural facts drive the design:
 *
 * 1. THE DELIVERY METRIC SET IS EXACTLY SIX. There is no conversion metric and
 *    no revenue metric on the delivery endpoints, so CPA and CVR only exist
 *    after this join, and revenue/ROAS only exist as a model (see below).
 *
 * 2. THE GRAINS DIFFER. Delivery supports hourly/daily/monthly/none; conversions
 *    support only none/daily. So any joined table is DAILY. An hourly view can
 *    show spend and clicks but must never show CPA — we surface that in the UI
 *    rather than silently interpolating.
 *
 * MODELLED REVENUE
 * ----------------
 * The API returns conversion counts, never conversion value. Revenue and ROAS
 * are therefore computed as `conversions * conversionValueMicros`, where the
 * value per conversion is supplied by the advertiser per ad account (and
 * optionally per campaign). When no value is configured these fields are `null`
 * — never zero, never estimated. Every surface that renders them must label
 * them as modelled. See docs/research/BLOCKERS.md RED-1.
 */

// ── Time ranges ─────────────────────────────────────────────────────────────

/** Bounds must be within the past 5 years and never in the future. */
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export function dateRange(since: Date, until: Date, timezone?: string): TimeRange {
  const floor = new Date(Date.now() - FIVE_YEARS_MS);
  const from = since < floor ? floor : since;
  const now = new Date();
  const to = until > now ? now : until;
  return {
    type: "date_range",
    since: ymd(from),
    until: ymd(to),
    ...(timezone ? { timezone } : {}),
  };
}

export function lastNDays(days: number, timezone?: string): TimeRange {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  return dateRange(since, until, timezone);
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The API takes each of these params as a repeated, JSON-encoded string. */
const enc = (v: unknown) => JSON.stringify(v);

// ── Delivery insights ───────────────────────────────────────────────────────

export type InsightsQuery = {
  timeRange: TimeRange;
  aggregationLevel?: AggregationLevel;
  timeGranularity?: TimeGranularity;
  fields?: string[];
  filters?: InsightFilter[];
  sort?: InsightSort[];
  segments?: InsightSegment[];
  /** Include entity rows that had zero impressions in the window. */
  includeZeroImpressions?: boolean;
  limit?: number;
  after?: string;
};

/**
 * Default projection.
 *
 * `fields[]` is a STRICT allowlist and a bad entry fails the whole request with
 * a 400 — it is not ignored. The account-scope endpoint rejected
 * `metadata.readable_time` and named the only members it accepts:
 *
 *   ad_account.budget.daily | ad_account.budget.lifetime | ad_account.id
 *   ad_account.name | ad_account.url | campaign.budget.daily
 *   campaign.budget.lifetime | campaign.clicks | campaign.cpc | campaign.cpm
 *   campaign.ctr | campaign.description | campaign.end_time | campaign.id
 *   campaign.impressions | campaign.name | campaign.spend | campaign.start_time
 *   campaign.status | country.name | device.type | metadata.timezone
 *
 * Note what is NOT there: no conversions (they come from
 * `POST /conversions/insights`, as modelled), and no time/date member at all.
 * The per-bucket timestamp is returned by the API for a time-bucketed request
 * rather than being something you ask for — so it must not be requested, and
 * `pickDate` below reads whatever key it arrives under.
 *
 * Only the campaign list above is confirmed against the live API. Ad-group and
 * ad projections keep the same id/name/status shape by analogy and are marked
 * [U] until a real call proves them; descriptive fields we can get from the
 * entity cache instead (ad titles, review status) are deliberately NOT
 * requested here, so an unverified guess cannot break a report.
 */
export function defaultFields(level: AggregationLevel): string[] {
  const metrics = ["impressions", "clicks", "spend", "ctr", "cpc", "cpm"];
  const id = `${level}.id`;
  const name =
    level === "ad"
      ? ["ad.name", "ad.status"]
      : level === "ad_group"
        ? ["ad_group.name", "ad_group.status"]
        : level === "campaign"
          ? ["campaign.name", "campaign.status", "campaign.budget.lifetime", "campaign.budget.daily"]
          : ["ad_account.name"];
  return [id, ...name, ...metrics.map((m) => `${level}.${m}`)];
}

function toQuery(q: InsightsQuery): Record<string, string | number | string[] | undefined> {
  return {
    time_granularity: q.timeGranularity ?? "daily",
    ...(q.aggregationLevel ? { aggregation_level: q.aggregationLevel } : {}),
    "time_ranges[]": [enc(q.timeRange)],
    ...(q.fields?.length ? { "fields[]": q.fields } : {}),
    ...(q.filters?.length ? { "filters[]": q.filters.map(enc) } : {}),
    ...(q.sort?.length ? { "sort[]": q.sort.map(enc) } : {}),
    ...(q.segments?.length ? { "segments[]": q.segments } : {}),
    ...(q.includeZeroImpressions && !q.segments?.length
      ? { "includes[]": ["zero_impression_items"] }
      : {}),
    limit: Math.min(q.limit ?? 500, 2000),
    ...(q.after ? { after: q.after } : {}),
  };
}

function scopePath(scope: { level: "account" } | { level: "campaign" | "ad_group" | "ad"; id: string }): string {
  if (scope.level === "account") return "/ad_account/insights";
  if (scope.level === "campaign") return `/campaigns/${scope.id}/insights`;
  if (scope.level === "ad_group") return `/ad_groups/${scope.id}/insights`;
  return `/ads/${scope.id}/insights`;
}

export type InsightScope = { level: "account" } | { level: "campaign" | "ad_group" | "ad"; id: string };

export async function getInsights(
  ctx: { userId: string; adAccountId?: string | null; connectionId?: string | null },
  scope: InsightScope,
  query: InsightsQuery
): Promise<InsightRow[]> {
  const res = await adsFetch<ListEnvelope<InsightRow>>(ctx.userId, scopePath(scope), {
    ...ctx,
    query: toQuery(query),
  });
  return res?.data ?? [];
}

export async function getInsightsWith(
  connection: OpenAiAdsConnection,
  scope: InsightScope,
  query: InsightsQuery
): Promise<InsightRow[]> {
  const out: InsightRow[] = [];
  let after: string | undefined = query.after;
  let q = query;

  // Insights caps limit at 2,000; walk pages so a 90-day daily-by-ad pull is
  // complete rather than silently truncated at the first page.
  for (let page = 0; page < 25; page++) {
    let res: ListEnvelope<InsightRow>;
    try {
      res = await adsFetchWithConnection<ListEnvelope<InsightRow>>(
        connection,
        scopePath(scope),
        { query: toQuery({ ...q, after }) }
      );
    } catch (err) {
      // `includes` is an optional enrichment whose accepted values we have not
      // verified against a live account. A rejected value 400s the ENTIRE
      // request, which would take the dashboard down rather than degrade it —
      // so drop the extra and retry once. Everything else still rethrows: a bad
      // `fields` entry is our bug and should be loud, not silently narrowed.
      const status = (err as { status?: number }).status;
      const msg = String((err as { message?: string }).message ?? "");
      const optional = q.includeZeroImpressions && /include/i.test(msg);
      if (status === 400 && optional) {
        q = { ...q, includeZeroImpressions: false };
        console.warn("Insights: dropping unsupported includes[] and retrying —", msg);
        page--;
        continue;
      }
      throw err;
    }
    const batch = res?.data ?? [];
    out.push(...batch);
    if (!res?.has_more || !res?.last_id || batch.length === 0) break;
    after = res.last_id;
  }
  return out;
}

// ── Conversions ─────────────────────────────────────────────────────────────

export async function getConversions(
  ctx: { userId: string; adAccountId?: string | null; connectionId?: string | null },
  opts: {
    aggregationLevel: AggregationLevel;
    timeRange: TimeRange;
    entityIds?: string[];
    daily?: boolean;
    breakdown?: "device" | "country";
    includeZeroRows?: boolean;
  }
): Promise<ConversionRow[]> {
  const res = await ConversionService.insights(ctx, {
    aggregation_level: opts.aggregationLevel,
    time_ranges: [enc(opts.timeRange)],
    time_granularity: opts.daily ? "daily" : "none",
    ...(opts.breakdown ? { breakdown: opts.breakdown } : {}),
    ...(opts.entityIds?.length ? { entity_ids: opts.entityIds } : {}),
    group_by_entity: true,
    include_zero_rows: opts.includeZeroRows ?? true,
  });
  return res?.data ?? [];
}

export async function getConversionsWith(
  connection: OpenAiAdsConnection,
  opts: {
    aggregationLevel: AggregationLevel;
    timeRange: TimeRange;
    entityIds?: string[];
    daily?: boolean;
  }
): Promise<ConversionRow[]> {
  const res = await ConversionService.insightsWith(connection, {
    aggregation_level: opts.aggregationLevel,
    time_ranges: [enc(opts.timeRange)],
    time_granularity: opts.daily ? "daily" : "none",
    ...(opts.entityIds?.length ? { entity_ids: opts.entityIds } : {}),
    group_by_entity: true,
    include_zero_rows: true,
  });
  return res?.data ?? [];
}

// ── The joined row ──────────────────────────────────────────────────────────

/**
 * One entity-day of truth. `spendMicros` is authoritative; every derived metric
 * below is computed here rather than trusted from the API, so a rounding
 * difference in `ctr`/`cpc` can never disagree with the numbers we act on.
 */
export type Metrics = {
  entityId: string;
  entityName?: string;
  date?: string;

  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  viewThroughConversions: number;

  // Derived. Null when the denominator is zero — never 0, never Infinity.
  ctr: number | null; // clicks / impressions
  cpcMicros: number | null; // spend / clicks
  cpmMicros: number | null; // spend / impressions * 1000
  cpaMicros: number | null; // spend / conversions
  cvr: number | null; // conversions / clicks

  // Modelled from the advertiser's value per conversion. Null when unconfigured.
  revenueMicros: number | null;
  roas: number | null;
  /** Always true when revenueMicros is non-null: this is a model, not platform data. */
  revenueIsModelled: boolean;
};

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeMetrics(
  base: {
    entityId: string;
    entityName?: string;
    date?: string;
    impressions?: number;
    clicks?: number;
    spendMicros?: number;
    conversions?: number;
    viewThroughConversions?: number;
  },
  conversionValueMicros?: bigint | number | null
): Metrics {
  const impressions = base.impressions ?? 0;
  const clicks = base.clicks ?? 0;
  const spendMicros = base.spendMicros ?? 0;
  const conversions = base.conversions ?? 0;

  const value = conversionValueMicros == null ? null : Number(conversionValueMicros);
  const revenueMicros = value == null ? null : conversions * value;

  return {
    entityId: base.entityId,
    entityName: base.entityName,
    date: base.date,
    impressions,
    clicks,
    spendMicros,
    conversions,
    viewThroughConversions: base.viewThroughConversions ?? 0,
    ctr: div(clicks, impressions),
    cpcMicros: div(spendMicros, clicks),
    cpmMicros: impressions > 0 ? (spendMicros / impressions) * 1000 : null,
    cpaMicros: div(spendMicros, conversions),
    cvr: div(conversions, clicks),
    revenueMicros,
    roas: revenueMicros == null ? null : div(revenueMicros, spendMicros),
    revenueIsModelled: revenueMicros != null,
  };
}

/**
 * Join a delivery insights page to a conversions page.
 *
 * Both sides key on the entity id (and date, when daily). Conversion rows can
 * exist for entities with no delivery in the window and vice versa, so this is a
 * full outer join — dropping either side would understate spend or conversions.
 */
export function joinInsights(
  delivery: InsightRow[],
  conversions: ConversionRow[],
  level: AggregationLevel,
  conversionValueMicros?: bigint | number | null
): Metrics[] {
  const idKey = `${level}_id` as const;
  const nameKey =
    level === "ad" ? "ad_title" : level === "ad_group" ? "ad_group_name" : level === "campaign" ? "campaign_name" : "name";

  const merged = new Map<
    string,
    {
      entityId: string;
      entityName?: string;
      date?: string;
      impressions: number;
      clicks: number;
      spendMicros: number;
      conversions: number;
      viewThroughConversions: number;
    }
  >();

  const keyOf = (entityId: string, date?: string) => `${entityId}::${date ?? ""}`;

  for (const row of delivery) {
    const entityId = String(row[idKey] ?? row.ad_account_id ?? "");
    if (!entityId) continue;
    const date = pickDate(row);
    const k = keyOf(entityId, date);
    const acc = merged.get(k) ?? blank(entityId, date);
    acc.entityName = (row[nameKey] as string) ?? (row.name as string) ?? acc.entityName;
    acc.impressions += num(row.impressions);
    acc.clicks += num(row.clicks);
    // `spend` is reported in the account currency; convert to micros once, here.
    acc.spendMicros += Math.round(num(row.spend) * 1_000_000);
    merged.set(k, acc);
  }

  for (const row of conversions) {
    const entityId = row.entity_id;
    if (!entityId) continue;
    const date = normalizeDate(row.date);
    const k = keyOf(entityId, date);
    const acc = merged.get(k) ?? blank(entityId, date);
    // `conversions` == click_through_conversions by documentation; prefer the
    // explicit field when present so a future divergence doesn't double-count.
    acc.conversions += row.click_through_conversions ?? row.conversions ?? 0;
    acc.viewThroughConversions += row.view_through_conversions ?? 0;
    merged.set(k, acc);
  }

  return [...merged.values()].map((r) => computeMetrics(r, conversionValueMicros));
}

function blank(entityId: string, date?: string) {
  return {
    entityId,
    entityName: undefined as string | undefined,
    date,
    impressions: 0,
    clicks: 0,
    spendMicros: 0,
    conversions: 0,
    viewThroughConversions: 0,
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The bucket timestamp cannot be requested via `fields[]`, so we take whatever
 * the API labels it. Ordered by how the docs refer to it, falling back to the
 * generic names a time series could plausibly use. Without this a daily series
 * would silently collapse into a single undated bucket.
 */
function pickDate(row: Record<string, unknown>): string | undefined {
  for (const k of ["readable_time", "date", "time", "start_time", "timestamp", "bucket"]) {
    const v = row[k];
    if (v) return normalizeDate(v);
  }
  return undefined;
}

/** `readable_time` may be a date, a datetime, or a month bucket. Keep the day. */
function normalizeDate(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

/** Sum a set of entity-day rows into one total. */
export function totalise(rows: Metrics[], conversionValueMicros?: bigint | number | null): Metrics {
  const acc = rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      spendMicros: a.spendMicros + r.spendMicros,
      conversions: a.conversions + r.conversions,
      viewThroughConversions: a.viewThroughConversions + r.viewThroughConversions,
    }),
    { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, viewThroughConversions: 0 }
  );
  return computeMetrics({ entityId: "total", ...acc }, conversionValueMicros);
}
