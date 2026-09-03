/**
 * Shared constants for OrchardAds.
 *
 * The Apple-era dummy response fixtures that used to live here are gone: this
 * product shows real data or an honest empty state, never sample numbers that
 * could be mistaken for a customer's account.
 */

export const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// ── Ads Manager links used throughout onboarding and diagnostics ────────────

export const ADS_MANAGER_URL = "https://ads.openai.com";
export const ADS_MANAGER_SETTINGS_URL = "https://ads.openai.com/settings";
export const ADS_DOCS_URL = "https://developers.openai.com/ads/api-overview";
export const ADS_ADVERTISERS_URL = "https://openai.com/advertisers/";

// ── Insights filter/sort vocabulary ────────────────────────────────────────
// The insights API accepts exactly three operators (docs: Insights > Filters).

export const operators = [
  { label: "In", value: "IN" },
  { label: "Greater Than", value: "GREATER_THAN" },
  { label: "Less Than", value: "LESS_THAN" },
];

export const sort = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" },
];

/**
 * Every metric the OpenAI Ads API can produce, plus the two we model.
 * Nothing outside this list may appear as a metric anywhere in the product.
 */
export const METRICS = [
  { label: "Spend", value: "spend", source: "delivery" },
  { label: "Impressions", value: "impressions", source: "delivery" },
  { label: "Clicks", value: "clicks", source: "delivery" },
  { label: "CTR", value: "ctr", source: "delivery" },
  { label: "CPC", value: "cpc", source: "delivery" },
  { label: "CPM", value: "cpm", source: "delivery" },
  { label: "Conversions", value: "conversions", source: "conversions" },
  { label: "CPA", value: "cpa", source: "derived" },
  { label: "Conversion rate", value: "cvr", source: "derived" },
  { label: "Revenue", value: "revenue", source: "modelled" },
  { label: "ROAS", value: "roas", source: "modelled" },
] as const;

export type MetricValue = (typeof METRICS)[number]["value"];

/** Metrics computed from the advertiser's value per conversion, not reported. */
export const MODELLED_METRICS: MetricValue[] = ["revenue", "roas"];

export const knownFields = [
  { label: "ID", value: "id" },
  { label: "Name", value: "name" },
  { label: "Status", value: "status" },
  { label: "Bidding type", value: "bidding_type" },
  { label: "Lifetime budget", value: "budget.lifetime_spend_limit_micros" },
  { label: "Daily budget", value: "budget.daily_spend_limit_micros" },
  { label: "Max bid", value: "bidding_config.max_bid_micros" },
  { label: "Review status", value: "review_status" },
];

// ── Pagination ─────────────────────────────────────────────────────────────

export const minLimit = 10;
export const midLimit = 100;
/** Insights caps `limit` at 2,000; list endpoints are walked with cursors. */
export const maxLimit = 2000;

// ── Table headers ──────────────────────────────────────────────────────────

export const campaignHeaders = [
  "Name",
  "Bidding",
  "Budget",
  "Spend",
  "Clicks",
  "Conversions",
  "CPA",
  "Status",
  "Actions",
];

export const adGroupHeaders = [
  "Name",
  "Max bid",
  "Spend",
  "Clicks",
  "Conversions",
  "CPA",
  "Status",
  "Actions",
];

export const adHeaders = ["Ad", "Review", "Impressions", "Clicks", "CTR", "Spend", "Status", "Actions"];

export const spendLimitHeaders = ["Name", "Window", "Limit", "Spent", "Remaining", "Status", "Actions"];

export const servingIssueHeaders = ["Issue", "Severity", "Entity", "Who fixes it", "Fix"];

// ── Entity status vocabulary ───────────────────────────────────────────────

export const ENTITY_STATUSES = ["active", "paused", "archived"] as const;
export const BIDDING_TYPES = [
  { label: "Impressions (CPM)", value: "impressions" },
  { label: "Clicks (CPC)", value: "clicks" },
  { label: "Conversions (oCPC)", value: "conversions" },
];

/** Documented account ceilings (Bulk API > Limits and retries). */
export const ACCOUNT_LIMITS = {
  campaigns: 5000,
  adGroups: 5000,
  ads: 5000,
  contextHintsPerAdGroup: 2000,
  locationIdsPerCampaign: 2500,
  adTitleMax: 50,
  adBodyMax: 100,
  targetUrlMax: 2048,
  nameMin: 3,
  nameMax: 1000,
};
