/**
 * Response and request shapes for the OpenAI Ads API.
 *
 * Transcribed from the official OpenAPI spec (snapshot at
 * docs/reference/openai-ads-openapi.json, info.version 2.3.0) and the prose
 * docs. Every optional marker mirrors the spec's `required` arrays.
 *
 * Everything here is treated as untrusted at runtime: the spec documents no
 * error bodies, ships weekly changes, and several fields are documented only in
 * prose. Parse defensively — never assume an optional field is present.
 */

export type ListEnvelope<T> = {
  object: string;
  data: T[];
  first_id?: string | null;
  last_id?: string | null;
  has_more?: boolean;
};

// ── Common ──────────────────────────────────────────────────────────────────

export type ReviewStatus = "in_review" | "rejected" | "approved";

/** Landing-page and brand review failure reasons (ReviewReasonCode). */
export type ReviewReasonCode =
  | "crawl_failed"
  | "crawler_bot_blocked"
  | "crawler_captcha"
  | "crawler_login_required"
  | "crawler_400"
  | "crawler_401"
  | "crawler_403"
  | "crawler_404"
  | "crawler_408"
  | "crawler_410"
  | "crawler_429"
  | "crawler_500"
  | "crawler_502"
  | "crawler_503"
  | "crawler_504"
  | "robots_txt"
  | "unsupported_content_type"
  | "landing_page_image_processing_failed"
  | "landing_page_unusable"
  | "missing_favicon"
  | (string & {});

export type Review = {
  status: ReviewStatus;
  reason?: ReviewReasonCode;
  screenshot_url?: string;
};

export type EntityStatus = "active" | "paused" | "archived";

// ── Ad account ──────────────────────────────────────────────────────────────

export type AdAccount = {
  id: string;
  name: string;
  url: string;
  preview_url: string | null;
  status?: string;
  timezone: string;
  currency_code: string;
  negative_keywords?: string[];
  review: Review;
  account_integrity_review?: { review: Review; details?: unknown };
};

export type SpendLimitWindow = {
  window_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  amount_micros: number;
  name: string | null;
  io_id: string | null;
  status: string;
  can_edit: boolean;
  can_edit_start_date: boolean;
  can_delete: boolean;
  /** Present once the window has accrued spend — the exact pacing input. */
  spent_micros?: number;
};

// ── Campaigns ───────────────────────────────────────────────────────────────

export type BiddingType = "impressions" | "clicks" | "conversions";
export type CampaignObjective = "reach" | "clicks" | "conversions";
export type CampaignMode = "product_feed" | "business_agent";

export type Budget = {
  lifetime_spend_limit_micros?: number;
  daily_spend_limit_micros?: number;
};

export type GeoLocation = {
  id: string;
  type?: "country" | "region" | "dma" | (string & {});
  country_code?: string;
  name?: string;
  region_code?: string;
};

export type Targeting = {
  locations?: { include?: GeoLocation[] };
  excluded_locations?: { include?: GeoLocation[] };
  custom_audiences?: { ids?: string[] };
  excluded_custom_audiences?: { ids?: string[] };
  platforms?: unknown;
};

/** Why an entity is not (fully) delivering. Enumerated in the spec. */
export type ServingIssueCode =
  // account
  | "ad_account_suspended"
  | "ad_account_brand_review_missing_favicon"
  | "ad_account_brand_review_escalated_review"
  | "ad_account_brand_review_rejected"
  | "ad_account_brand_review_in_progress"
  | "ad_account_payment_method_missing_or_unauthorized"
  | "ad_account_threshold_payment_failed"
  | "ad_account_persona_verification_not_approved"
  | "ad_account_persona_verification_step_up_required"
  | "ad_account_budget_exhausted"
  // campaign
  | "campaign_not_active"
  | "campaign_not_started"
  | "campaign_ended"
  | "campaign_has_no_ad_groups"
  | "campaign_has_no_serving_ready_ad_groups"
  | "campaign_budget_exhausted"
  // ad group
  | "ad_group_not_active"
  | "ad_group_has_no_ads"
  | "ad_group_has_no_serving_ready_ads"
  // ad
  | "ad_not_active"
  | "review_not_approved"
  | "landing_page_crawl_issue"
  | "ad_in_review"
  | "ad_over_18_only"
  | "policy_country_targeting_blocked"
  | "policy_country_targeting_limited"
  | "title_missing"
  | "advertiser_name_missing"
  | "image_or_favicon_missing"
  | "target_url_invalid"
  | "reserved_query_params_present"
  | "product_feed_id_missing"
  // partial
  | "partial_serving_review_not_approved"
  | "partial_serving_landing_page_crawl_issue"
  | "partial_serving_ad_in_review"
  | (string & {});

export type ServingIssue = { code: ServingIssueCode };

export type Campaign = {
  id: string;
  created_at: number;
  updated_at: number;
  name: string;
  description: string | null;
  status: EntityStatus;
  mode?: CampaignMode | null;
  product_feed_id?: string | null;
  business_agent_id?: string | null;
  start_time: number | null;
  end_time: number | null;
  budget: Budget;
  bidding_type: BiddingType;
  objective?: CampaignObjective;
  billing_event_type?: string;
  conversion_event_setting_ids?: string[];
  targeting?: Targeting;
  landing_page_configuration?: unknown;
  serving_issues?: ServingIssue[];
};

export type CreateCampaignBody = {
  name: string;
  description?: string;
  start_time?: number;
  end_time?: number;
  status: "active" | "paused";
  budget: { lifetime_spend_limit_micros: number; daily_spend_limit_micros?: number };
  mode?: CampaignMode;
  bidding_type?: BiddingType;
  conversion_event_setting_ids?: string[];
  targeting?: Targeting;
};

/**
 * All fields optional on update. Nested objects must be sent WHOLE — a partial
 * `budget` replaces the whole budget. `bidding_type` can never be updated, and
 * neither can `conversion_event_setting_ids` on a conversion campaign.
 */
export type UpdateCampaignBody = Partial<Omit<CreateCampaignBody, "bidding_type" | "status">> & {
  status?: EntityStatus;
};

// ── Ad groups ───────────────────────────────────────────────────────────────

export type CustomAudienceBidMultiplier = {
  custom_audience_id: string;
  /** 100000..10000000 == 0.1x .. 10x */
  bid_multiplier_micros: number;
};

export type BiddingConfig = {
  /** `impression` for impression campaigns; `click` for click AND conversion campaigns. */
  billing_event_type: "impression" | "click" | (string & {});
  strategy?: string;
  /**
   * The primary bid lever. For oCPC this is the CPA bid even though billing is
   * per click (e.g. 100000000 == a $100.00 CPA bid in a USD account).
   */
  max_bid_micros?: number;
  custom_audience_bid_multipliers?: CustomAudienceBidMultiplier[];
};

export type ProductSetFilter = {
  field: string;
  operator: "in" | "gt" | "gte" | "lt" | "lte";
  values: string[];
};

export type ProductSet = { product_feed_id: string; filters?: ProductSetFilter[] };

export type AdGroup = {
  id: string;
  created_at: number;
  updated_at: number;
  name: string;
  description: string | null;
  /** The OpenAI Ads analogue of keywords: free-text targeting hints. Max 2,000. */
  context_hints: string[];
  product_set?: ProductSet | null;
  status: EntityStatus;
  bidding_config: BiddingConfig;
  landing_page_configuration?: unknown;
  serving_issues?: ServingIssue[];
};

export type CreateAdGroupBody = {
  campaign_id: string;
  name: string;
  description?: string;
  context_hints?: string[];
  status: "active" | "paused";
  bidding_config: BiddingConfig;
  product_set?: ProductSet;
};

export type UpdateAdGroupBody = Partial<Omit<CreateAdGroupBody, "campaign_id" | "status">> & {
  status?: EntityStatus;
};

// ── Ads ─────────────────────────────────────────────────────────────────────

export type AdCreativeType = "chat_card" | "product_ad_template";

export type AdCreative = {
  type: AdCreativeType | (string & {});
  /** 3-50 chars. */
  title: string;
  /** <= 100 chars. */
  body: string;
  price?: string;
  file_id?: string;
  image_url?: string | null;
  image_crop?: unknown;
  /** <= 2048 chars. */
  target_url: string | null;
};

export type Ad = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  creative: AdCreative;
  status: EntityStatus;
  review_status: ReviewStatus;
  landing_page_configuration?: unknown;
  appeal?: unknown | null;
  review: Review;
  serving_issues?: ServingIssue[];
};

export type CreateAdBody = {
  ad_group_id: string;
  name?: string;
  status: "active" | "paused";
  creative: Omit<AdCreative, "image_crop">;
};

export type UpdateAdBody = {
  name?: string;
  status?: EntityStatus;
  creative?: Omit<AdCreative, "image_crop">;
};

// ── Insights ────────────────────────────────────────────────────────────────

export type AggregationLevel = "ad_account" | "campaign" | "ad_group" | "ad";
export type TimeGranularity = "hourly" | "daily" | "monthly" | "none";
export type InsightSegment = "product" | "country" | "device";

export type TimeRange =
  | { type: "unix_range"; start: string; end: string }
  | { type: "hour_range"; since: string; until: string; timezone?: string }
  | { type: "date_range"; since: string; until: string; timezone?: string };

export type InsightFilter = {
  field: string;
  operator: "IN" | "GREATER_THAN" | "LESS_THAN";
  value: string[] | number;
};

export type InsightSort = { field: string; direction: "asc" | "desc" };

/**
 * A delivery insights row.
 *
 * THE METRIC SET IS EXACTLY THESE SIX. There is no conversion metric and no
 * revenue metric on any delivery endpoint. Canonical field names project to
 * flat wire keys (`campaign.id` -> `campaign_id`).
 */
export type InsightRow = {
  readable_time?: string;
  timezone?: string;

  ad_account_id?: string;
  campaign_id?: string;
  ad_group_id?: string;
  ad_id?: string;

  name?: string;
  campaign_name?: string;
  ad_group_name?: string;
  ad_title?: string;

  impressions?: number;
  clicks?: number;
  spend?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;

  // segment projections
  country_name?: string;
  device_type?: string;
  product_item_id?: string;
  product_title?: string;

  [key: string]: unknown;
};

/**
 * An attributed-conversion row from POST /conversions/insights.
 *
 * This is the COMPLETE field set. `conversions` always equals
 * `click_through_conversions`; view-through is supplemental reporting only and
 * is never added to the total, never feeds CPA/CVR/bidding/billing.
 *
 * There is no conversion value or revenue field. Revenue and ROAS in this
 * product are modelled from the connection's configured value per conversion.
 */
export type ConversionRow = {
  entity_id: string;
  date?: string;
  device?: string;
  country?: string;
  conversions: number;
  click_through_conversions?: number;
  view_through_conversions?: number;
};

export type ConversionInsightsBody = {
  aggregation_level: AggregationLevel;
  /** JSON-encoded TimeRange strings. */
  time_ranges: string[];
  /** Only `none` and `daily` are supported here — delivery's `hourly` is not. */
  time_granularity?: "none" | "daily";
  /** Only `device` and `country`. */
  breakdown?: "device" | "country";
  entity_ids?: string[];
  group_by_entity?: boolean;
  include_zero_rows?: boolean;
};

// ── Conversions setup ───────────────────────────────────────────────────────

export type ConversionSource = {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
};

export type ConversionEventSetting = {
  id: string;
  name: string;
  event_type: string;
  custom_event_name: string | null;
  attribution_window_days: number;
  ad_account_id: string;
  source_ids: string[];
  sources: unknown[];
  campaigns: unknown[];
  archived: boolean;
  version: number;
};

// ── Files ───────────────────────────────────────────────────────────────────

export type UploadedFile = { file_id: string; [key: string]: unknown };

// ── Geo ─────────────────────────────────────────────────────────────────────

export type GeoLookupResult = {
  id: string;
  name: string;
  /** Free-form in the spec (country / region / city / postal_code / ...). */
  type: string;
  canonical_name: string;
  country_code: string;
  region_code: string | null;
  parent_id: string | null;
  parent_country: string | null;
};

/**
 * `/geo_lookup/search` is the one read endpoint that does NOT use the standard
 * `{ object, data }` list envelope — it returns its own shape.
 */
export type GeoLookupSearchResponse = {
  query: string;
  count: number;
  results: GeoLookupResult[];
};
