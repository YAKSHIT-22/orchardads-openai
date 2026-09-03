import { adsFetch, adsFetchWithConnection, paginate } from "./client";
import type { OpenAiAdsConnection } from "@prisma/client";
import type {
  Ad,
  AdAccount,
  AdGroup,
  Campaign,
  ConversionEventSetting,
  ConversionInsightsBody,
  ConversionRow,
  ConversionSource,
  CreateAdBody,
  CreateAdGroupBody,
  CreateCampaignBody,
  EntityStatus,
  GeoLookupResult,
  GeoLookupSearchResponse,
  InsightRow,
  ListEnvelope,
  SpendLimitWindow,
  UpdateAdBody,
  UpdateAdGroupBody,
  UpdateCampaignBody,
  UploadedFile,
} from "./types";

/**
 * Typed service wrappers over the OpenAI Ads API.
 *
 * Every call in the app goes through one of these. Nothing constructs a URL by
 * hand, and nothing calls `fetch` against api.ads.openai.com directly — that
 * rule is what keeps credential handling, rate limiting and audit logging in
 * one enforceable place, and it is also what lets the AI agent expose *typed
 * tools* rather than arbitrary HTTP.
 *
 * Two entry shapes for each operation:
 *   - `xxx(userId, ...)`        resolves the connection by ad account
 *   - `xxxWith(connection, ...)` for the sync worker, which holds one already
 */

type Ctx = { userId: string; adAccountId?: string | null; connectionId?: string | null };

// ── Ad account ──────────────────────────────────────────────────────────────

export const AccountService = {
  /** GET /ad_account — also the connection validation call. */
  get: (ctx: Ctx) => adsFetch<AdAccount>(ctx.userId, "/ad_account", { ...ctx }),

  getWith: (connection: OpenAiAdsConnection) =>
    adsFetchWithConnection<AdAccount>(connection, "/ad_account"),

  /** GET /ad_accounts — every account this credential can reach. */
  list: (ctx: Ctx) =>
    adsFetch<ListEnvelope<AdAccount>>(ctx.userId, "/ad_accounts", { ...ctx, query: { limit: 100 } }),

  /** Account-level negative keywords — the only negative-keyword surface here. */
  updateNegativeKeywords: (ctx: Ctx, negative_keywords: string[]) =>
    adsFetch<AdAccount>(ctx.userId, "/ad_account/negative_keywords", {
      ...ctx,
      method: "POST",
      body: { negative_keywords },
    }),

  /**
   * Account state. Blast radius is the advertiser's entire business, so this is
   * never reachable from a rule, a schedule, or the agent — only an explicit
   * human action in the UI. Enforced in lib/risk.
   */
  activate: (ctx: Ctx) => adsFetch<AdAccount>(ctx.userId, "/ad_account/activate", { ...ctx, method: "POST" }),
  pause: (ctx: Ctx) => adsFetch<AdAccount>(ctx.userId, "/ad_account/pause", { ...ctx, method: "POST" }),

  /** Requires brand updates to be enabled for the account (403 otherwise). */
  updateBrand: (ctx: Ctx, favicon_file_id: string) =>
    adsFetch<AdAccount>(ctx.userId, "/ad_account/brand", {
      ...ctx,
      method: "POST",
      body: { favicon_file_id },
    }),
};

// ── Spend limit windows (the pacing lever) ──────────────────────────────────

export const SpendLimitService = {
  list: (ctx: Ctx) =>
    adsFetch<ListEnvelope<SpendLimitWindow>>(ctx.userId, "/ad_account/spend_limit_windows", { ...ctx }),

  listWith: (connection: OpenAiAdsConnection) =>
    adsFetchWithConnection<ListEnvelope<SpendLimitWindow>>(connection, "/ad_account/spend_limit_windows"),

  create: (
    ctx: Ctx,
    body: { start_date: string; end_date: string; amount_micros: number; name?: string; io_id?: string }
  ) => adsFetch<SpendLimitWindow>(ctx.userId, "/ad_account/spend_limit_windows", { ...ctx, method: "POST", body }),

  update: (ctx: Ctx, windowId: string, body: Partial<{ end_date: string; amount_micros: number; name: string }>) =>
    adsFetch<SpendLimitWindow>(ctx.userId, `/ad_account/spend_limit_windows/${windowId}`, {
      ...ctx,
      method: "POST",
      body,
    }),

  remove: (ctx: Ctx, windowId: string) =>
    adsFetch<unknown>(ctx.userId, `/ad_account/spend_limit_windows/${windowId}/delete`, {
      ...ctx,
      method: "POST",
    }),
};

// ── Campaigns ───────────────────────────────────────────────────────────────

export const CampaignService = {
  list: (ctx: Ctx, opts: { withServingIssues?: boolean; name?: string; limit?: number } = {}) =>
    adsFetch<ListEnvelope<Campaign>>(ctx.userId, "/campaigns", {
      ...ctx,
      query: {
        limit: opts.limit ?? 100,
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.withServingIssues ? { "include[]": ["serving_issues"] } : {}),
      },
    }),

  /** Full walk, used by sync. Serving issues are always requested. */
  listAllWith: (connection: OpenAiAdsConnection) =>
    paginate<Campaign>(connection, "/campaigns", { "include[]": ["serving_issues"] }),

  get: (ctx: Ctx, campaignId: string) =>
    adsFetch<Campaign>(ctx.userId, `/campaigns/${campaignId}`, {
      ...ctx,
      query: { "include[]": ["serving_issues"] },
    }),

  create: (ctx: Ctx, body: CreateCampaignBody) =>
    adsFetch<Campaign>(ctx.userId, "/campaigns", { ...ctx, method: "POST", body }),

  /**
   * Update. Nested objects go WHOLE — sending `{budget: {daily...}}` alone
   * replaces the entire budget object and drops the lifetime limit, which would
   * silently change what the campaign is allowed to spend. Callers must merge
   * against the current campaign first.
   */
  update: (ctx: Ctx, campaignId: string, body: UpdateCampaignBody) =>
    adsFetch<Campaign>(ctx.userId, `/campaigns/${campaignId}`, { ...ctx, method: "POST", body }),

  activate: (ctx: Ctx, campaignId: string) =>
    adsFetch<Campaign>(ctx.userId, `/campaigns/${campaignId}/activate`, { ...ctx, method: "POST" }),

  pause: (ctx: Ctx, campaignId: string) =>
    adsFetch<Campaign>(ctx.userId, `/campaigns/${campaignId}/pause`, { ...ctx, method: "POST" }),

  /** IRREVERSIBLE per the official docs. Never call this from automation. */
  archive: (ctx: Ctx, campaignId: string) =>
    adsFetch<Campaign>(ctx.userId, `/campaigns/${campaignId}/archive`, { ...ctx, method: "POST" }),
};

// ── Ad groups ───────────────────────────────────────────────────────────────

export const AdGroupService = {
  list: (ctx: Ctx, opts: { campaignId?: string; withServingIssues?: boolean; limit?: number } = {}) =>
    adsFetch<ListEnvelope<AdGroup>>(ctx.userId, "/ad_groups", {
      ...ctx,
      query: {
        limit: opts.limit ?? 100,
        ...(opts.campaignId ? { campaign_id: opts.campaignId } : {}),
        ...(opts.withServingIssues ? { "include[]": ["serving_issues"] } : {}),
      },
    }),

  listAllWith: (connection: OpenAiAdsConnection, campaignId?: string) =>
    paginate<AdGroup>(connection, "/ad_groups", {
      "include[]": ["serving_issues"],
      ...(campaignId ? { campaign_id: campaignId } : {}),
    }),

  get: (ctx: Ctx, adGroupId: string) =>
    adsFetch<AdGroup>(ctx.userId, `/ad_groups/${adGroupId}`, {
      ...ctx,
      query: { "include[]": ["serving_issues"] },
    }),

  create: (ctx: Ctx, body: CreateAdGroupBody) =>
    adsFetch<AdGroup>(ctx.userId, "/ad_groups", { ...ctx, method: "POST", body }),

  /** `bidding_config` must be sent whole — see CampaignService.update. */
  update: (ctx: Ctx, adGroupId: string, body: UpdateAdGroupBody) =>
    adsFetch<AdGroup>(ctx.userId, `/ad_groups/${adGroupId}`, { ...ctx, method: "POST", body }),

  activate: (ctx: Ctx, adGroupId: string) =>
    adsFetch<AdGroup>(ctx.userId, `/ad_groups/${adGroupId}/activate`, { ...ctx, method: "POST" }),

  pause: (ctx: Ctx, adGroupId: string) =>
    adsFetch<AdGroup>(ctx.userId, `/ad_groups/${adGroupId}/pause`, { ...ctx, method: "POST" }),

  /** IRREVERSIBLE. */
  archive: (ctx: Ctx, adGroupId: string) =>
    adsFetch<AdGroup>(ctx.userId, `/ad_groups/${adGroupId}/archive`, { ...ctx, method: "POST" }),
};

// ── Ads ─────────────────────────────────────────────────────────────────────

export const AdService = {
  list: (ctx: Ctx, opts: { adGroupId?: string; withServingIssues?: boolean; limit?: number } = {}) =>
    adsFetch<ListEnvelope<Ad>>(ctx.userId, "/ads", {
      ...ctx,
      query: {
        limit: opts.limit ?? 100,
        ...(opts.adGroupId ? { ad_group_id: opts.adGroupId } : {}),
        ...(opts.withServingIssues ? { "include[]": ["serving_issues"] } : {}),
      },
    }),

  listAllWith: (connection: OpenAiAdsConnection, adGroupId?: string) =>
    paginate<Ad>(connection, "/ads", {
      "include[]": ["serving_issues"],
      ...(adGroupId ? { ad_group_id: adGroupId } : {}),
    }),

  get: (ctx: Ctx, adId: string) =>
    adsFetch<Ad>(ctx.userId, `/ads/${adId}`, { ...ctx, query: { "include[]": ["serving_issues"] } }),

  create: (ctx: Ctx, body: CreateAdBody) => adsFetch<Ad>(ctx.userId, "/ads", { ...ctx, method: "POST", body }),

  update: (ctx: Ctx, adId: string, body: UpdateAdBody) =>
    adsFetch<Ad>(ctx.userId, `/ads/${adId}`, { ...ctx, method: "POST", body }),

  preview: (ctx: Ctx, adId: string) =>
    adsFetch<unknown>(ctx.userId, `/ads/${adId}/preview`, { ...ctx, method: "POST" }),

  activate: (ctx: Ctx, adId: string) =>
    adsFetch<Ad>(ctx.userId, `/ads/${adId}/activate`, { ...ctx, method: "POST" }),

  pause: (ctx: Ctx, adId: string) => adsFetch<Ad>(ctx.userId, `/ads/${adId}/pause`, { ...ctx, method: "POST" }),

  /** IRREVERSIBLE. */
  archive: (ctx: Ctx, adId: string) =>
    adsFetch<Ad>(ctx.userId, `/ads/${adId}/archive`, { ...ctx, method: "POST" }),
};

// ── Files ───────────────────────────────────────────────────────────────────

export const FileService = {
  /** JSON form: resolve an image from a URL. `purpose` may be `account_favicon`. */
  uploadFromUrl: (ctx: Ctx, image_url: string, purpose?: string) =>
    adsFetch<UploadedFile>(ctx.userId, "/upload", {
      ...ctx,
      method: "POST",
      body: { image_url, ...(purpose ? { purpose } : {}) },
    }),
};

// ── Conversions ─────────────────────────────────────────────────────────────

export const ConversionService = {
  listSources: (ctx: Ctx) =>
    adsFetch<ListEnvelope<ConversionSource>>(ctx.userId, "/conversions/pixels", { ...ctx }),

  listSourcesWith: (connection: OpenAiAdsConnection) =>
    adsFetchWithConnection<ListEnvelope<ConversionSource>>(connection, "/conversions/pixels"),

  listEventSettings: (ctx: Ctx) =>
    adsFetch<ListEnvelope<ConversionEventSetting>>(ctx.userId, "/conversions/event_settings", { ...ctx }),

  listEventSettingsWith: (connection: OpenAiAdsConnection) =>
    adsFetchWithConnection<ListEnvelope<ConversionEventSetting>>(connection, "/conversions/event_settings"),

  /** Recent raw events for one pixel — used by tracking diagnostics. */
  recentEvents: (ctx: Ctx, pid: string, limit = 20) =>
    adsFetch<ListEnvelope<unknown>>(ctx.userId, "/conversions/events", { ...ctx, query: { pid, limit } }),

  /**
   * POST /conversions/insights — attributed conversion COUNTS.
   *
   * Returns only { entity_id, date?, device?, country?, conversions,
   * click_through_conversions, view_through_conversions }. There is no revenue
   * or conversion-value field: revenue and ROAS in this product are modelled
   * from the connection's configured value per conversion.
   */
  insights: (ctx: Ctx, body: ConversionInsightsBody) =>
    adsFetch<ListEnvelope<ConversionRow>>(ctx.userId, "/conversions/insights", {
      ...ctx,
      method: "POST",
      body,
    }),

  insightsWith: (connection: OpenAiAdsConnection, body: ConversionInsightsBody) =>
    adsFetchWithConnection<ListEnvelope<ConversionRow>>(connection, "/conversions/insights", {
      method: "POST",
      body,
    }),
};

// ── Geo ─────────────────────────────────────────────────────────────────────

export const GeoService = {
  search: (ctx: Ctx, q: string, limit = 25) =>
    adsFetch<GeoLookupSearchResponse>(ctx.userId, "/geo_lookup/search", { ...ctx, query: { q, limit } }),
};

// ── Insights (delivery) ─────────────────────────────────────────────────────

export type { InsightRow };
