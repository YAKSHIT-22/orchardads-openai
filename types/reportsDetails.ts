/**
 * Report shapes for OpenAI Ads.
 *
 * Two deliberate absences, both forced by the API rather than by scope:
 *   - No keyword or search-term shapes. The OpenAI Ads API has no keywords;
 *     targeting is free-text `context_hints[]` on the ad group.
 *   - No platform-reported revenue. `revenue` and `roas` below are MODELLED
 *     from the advertiser's configured value per conversion, and are `null`
 *     until they configure one. Anything rendering them must label them.
 *
 * All money is in MICROS (millionths of the account currency), matching the API.
 */

export interface Performance {
  impressions: number;
  clicks: number;
  /** clicks / impressions. Null when there were no impressions. */
  ctr: number | null;
  spendMicros: number;
  /** spend / clicks. Null when there were no clicks. */
  cpcMicros: number | null;
  /** spend / impressions * 1000. Null when there were no impressions. */
  cpmMicros: number | null;

  /** Click-through conversions. View-through is reported separately and never added. */
  conversions: number;
  viewThroughConversions: number;
  /** spend / conversions. Null when there were no conversions. */
  cpaMicros: number | null;
  /** conversions / clicks. Null when there were no clicks. */
  cvr: number | null;

  /** Modelled: conversions * the account's value per conversion. */
  revenueMicros: number | null;
  /** Modelled: revenue / spend. */
  roas: number | null;

  currency: string;
  date: string;
}

export interface CampaignReportRow {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  biddingType?: string;
  /** Serving-issue codes; empty means "nothing blocking delivery". */
  servingIssues?: string[];
  lifetimeBudgetMicros?: number | null;
  dailyBudgetMicros?: number | null;
  performance: Performance;
}

export interface AdGroupReportRow {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  adGroupStatus: string;
  /** bidding_config.max_bid_micros — the primary bid lever. */
  maxBidMicros?: number | null;
  billingEventType?: string;
  servingIssues?: string[];
  performance: Performance;
}

export interface AdReportRow {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  adId: string;
  adName: string;
  title?: string;
  body?: string;
  targetUrl?: string | null;
  creativeType?: string;
  status: string;
  /** in_review | rejected | approved */
  reviewStatus?: string;
  /** Enumerated crawler/landing-page failure reason, when rejected. */
  reviewReason?: string | null;
  servingIssues?: string[];
  performance: Performance;
}

/** One breakdown row (segments[] allows exactly one of product/country/device). */
export interface SegmentReportRow {
  segmentType: "country" | "device" | "product";
  segmentValue: string;
  segmentLabel?: string;
  performance: Performance;
}

export interface DailyData {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spendMicros: number;
  cpcMicros: number | null;
  cpmMicros: number | null;
  conversions: number;
  cpaMicros: number | null;
  cvr: number | null;
  revenueMicros: number | null;
  roas: number | null;
}

export interface ReportData {
  campaigns: CampaignReportRow[];
  adGroups: AdGroupReportRow[];
  ads: AdReportRow[];
  segments: SegmentReportRow[];
  dailyData: DailyData[];
  /** Account currency, so every consumer formats money the same way. */
  currency: string;
  /**
   * False when the account has no configured value per conversion, in which case
   * every `revenueMicros` / `roas` above is null and the UI must show a CTA
   * rather than a number.
   */
  revenueModelled: boolean;
}

export interface FilterState {
  selectedCampaignId: string | null;
  selectedAdGroupId: string | null;
  dateRange: string;
}

export interface ReportTotals {
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  revenueMicros: number | null;
}

/** Back-compat aliases so ported components keep compiling under new names. */
export type Campaign = CampaignReportRow;
export type AdGroup = AdGroupReportRow;
export type Ad = AdReportRow;
