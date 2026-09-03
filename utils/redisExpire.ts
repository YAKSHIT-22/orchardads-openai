/**
 * Cache TTLs, in seconds.
 *
 * These are tuned against the OpenAI Ads rate limits (600 req/min per endpoint,
 * 1,200 overall, enforced per ad account AND per IP), not against freshness
 * preferences. Entity lists change only when someone edits them, so they cache
 * longer; insights change continuously but are billed against the same request
 * budget the customer's other tools draw on, so 5 minutes is the floor.
 */

export const GET_AD_ACCOUNT = 900;
export const GET_ALL_CAMPAIGN = 900;
export const GET_ALL_ADGROUPS = 600;
export const GET_ALL_ADS = 600;
export const GET_SPEND_LIMITS = 300;
export const SEARCH_GEO_LOCATIONS = 24 * 60 * 60; // location IDs are effectively static
export const GET_CUSTOM_AUDIENCES = 600;
export const GET_CONVERSION_SETUP = 900;

export const GET_CAMPAIGN_REPORTS = 300;
export const GET_ADGROUP_REPORTS = 300;
export const GET_AD_REPORTS = 300;
export const GET_ACCOUNT_REPORTS = 300;
export const GET_SEGMENT_REPORTS = 600;

/** Serving issues drive the product's headline diagnostics — keep them fresh. */
export const GET_SERVING_ISSUES = 180;
/** Review outcomes usually land within minutes, so poll rejected ads often. */
export const GET_REVIEW_STATUS = 180;
