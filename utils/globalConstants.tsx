import { countryMap } from "./countryMap";

export const formatServingStatus = {
    RUNNING: "Running",
    NOT_RUNNING: "Not Running",
  }
  
  export const formatDisplayStatus = {
    DELETED: "Deleted",
    ON_HOLD: "On Hold",
    PAUSED: "Paused",
    RUNNING: "Running",
  }

  export const formatStatus = {
    ENABLED: "Enabled",
    PAUSED: "Paused",
  }

  export const formatPaymentModel = {
    LOC: "Line Of Credit",
    PAYG: "Pay As You Go",
  }
  
  export const formatBillingEvent = {
    IMPRESSIONS: "Impressions",
    TAPS: "Taps",
  }
  
  export const formatAdChannelType = {
    SEARCH: "Search",
    DISPLAY: "Display",
  };
  
  export const formatCountriesOrRegions = (codes: string[]) =>
    codes.map((code) => countryMap[code] ?? code);
  
  export const sourceMap = {
    APPSTORE_PRODUCT_PAGES_BROWSE: "App Store Product Pages Browse",
    APPSTORE_SEARCH_RESULTS: "App Store Search Results",
    APPSTORE_SEARCH_TAB: "App Store Search Tab",
    APPSTORE_TODAY_TAB: "App Store Today Tab",
  };

  export const budgetSourceMap = {
    APPSTORE_SEARCH_RESULTS: "App Store Search Results",
    APPSTORE_SEARCH_TAB: "App Store Search Tab",
  }

  /**
   * Valid campaign placements. Each placement fixes the compatible
   * (supplySources, adChannelType, billingEvent) triple so the API never
   * rejects an incompatible combination. Source:
   * https://developer.apple.com/documentation/apple_ads/supplysource
   * All placements bill on TAPS (CPC); only Search results uses the SEARCH
   * channel and supports keywords.
   */
  export const CAMPAIGN_PLACEMENTS = [
    {
      id: "APPSTORE_SEARCH_RESULTS" as const,
      label: "Search results",
      description: "Ads at the top of App Store search results. Supports keywords & Search Match.",
      supplySources: ["APPSTORE_SEARCH_RESULTS"] as string[],
      adChannelType: "SEARCH" as const,
      billingEvent: "TAPS" as const,
      supportsKeywords: true,
      supportsSearchMatch: true,
      supportsCpaGoal: true,
      // Search results serve the app's default product page automatically — the
      // Create-an-Ad endpoint rejects ads for this supply source.
      supportsAds: false,
      iphoneOnly: false,
      requiresCustomProductPage: false,
    },
    {
      id: "APPSTORE_SEARCH_TAB" as const,
      label: "Search tab",
      description: "Ads on the App Store Search tab, before a search. Requires a product-page ad. No keywords, CPA goal or Search Match.",
      supplySources: ["APPSTORE_SEARCH_TAB"] as string[],
      adChannelType: "DISPLAY" as const,
      billingEvent: "TAPS" as const,
      supportsKeywords: false,
      supportsSearchMatch: false,
      supportsCpaGoal: false,
      // Search tab requires a default- or custom-product-page ad (API 5.2+).
      supportsAds: true,
      iphoneOnly: false,
      requiresCustomProductPage: false,
    },
    {
      id: "APPSTORE_TODAY_TAB" as const,
      label: "Today tab",
      description: "Ads on the App Store Today tab. Requires a custom product page and iPhone targeting.",
      supplySources: ["APPSTORE_TODAY_TAB"] as string[],
      adChannelType: "DISPLAY" as const,
      billingEvent: "TAPS" as const,
      supportsKeywords: false,
      supportsSearchMatch: false,
      supportsCpaGoal: true,
      supportsAds: false,
      iphoneOnly: true,
      requiresCustomProductPage: true,
    },
    {
      id: "APPSTORE_PRODUCT_PAGES_BROWSE" as const,
      label: "Product pages",
      description: "Ads in the “You Might Also Like” list on product pages across the App Store. No keywords.",
      supplySources: ["APPSTORE_PRODUCT_PAGES_BROWSE"] as string[],
      adChannelType: "DISPLAY" as const,
      billingEvent: "TAPS" as const,
      supportsKeywords: false,
      supportsSearchMatch: false,
      supportsCpaGoal: true,
      supportsAds: false,
      iphoneOnly: false,
      requiresCustomProductPage: false,
    },
  ];

  export const formatSupplySources = (sources: Array<keyof typeof sourceMap>): string[] => {
    return sources.map((source) => {
      return sourceMap[source] || source;
    });
  }

  export const formatGeoEntity = {
    AdminArea : "Admin Area",
    Locality: "Locality",
    Country: "Country"
  }
  
  export const formatServingStateReasons = (reasons: string[]) => {
    const reasonMap: { [key: string]: string } = {
      AD_GROUP_MISSING: "Ad Group Missing",
      APP_NOT_CATEGORIZED: "App Not Categorized",
      APP_NOT_ELIGIBLE: "App Not Eligible",
      APP_NOT_ELIGIBLE_SEARCHADS: "App Not Eligible for Search Ads",
      APP_NOT_ELIGIBLE_SUPPLY_SOURCE: "App Not Eligible for Supply Source",
      APP_NOT_LINKED_TO_CAMPAIGN_GROUP: "App Not Linked to Campaign Group",
      APP_NOT_PUBLISHED_YET: "App Not Published Yet",
      APP_SENSITIVE_CONTENT: "App Has Sensitive Content",
      BO_END_DATE_REACHED: "Budget Order End Date Reached",
      BO_EXHAUSTED: "Budget Order Exhausted",
      BO_START_DATE_IN_FUTURE: "Budget Order Start Date in Future",
      CAMPAIGN_END_DATE_REACHED: "Campaign End Date Reached",
      CAMPAIGN_START_DATE_IN_FUTURE: "Campaign Start Date in Future",
      CONTENT_PROVIDER_UNLINKED: "Content Provider Unlinked",
      CREATIVE_PENDING_REVIEW: "Creative Pending Review",
      CREATIVE_REJECTED: "Creative Rejected",
      AD_REJECTED: "Ad Rejected",
      CREATIVE_AND_PRODUCT_PAGE_MISMATCH: "Creative & Product Page Mismatch",
      PRODUCT_PAGE_DELETED: "Product Page Deleted",
      PRODUCT_PAGE_UNSUPPORTED: "Product Page Unsupported",
      CUSTOM_PRODUCT_PAGE_DELETED: "Custom Product Page Deleted",
      CREDIT_CARD_DECLINED: "Credit Card Declined",
      DAILY_CAP_EXHAUSTED: "Daily Cap Exhausted",
      DELETED_BY_USER: "Deleted by User",
      FEATURE_NOT_YET_AVAILABLE: "Feature Not Yet Available",
      FEATURE_NO_LONGER_AVAILABLE: "Feature No Longer Available",
      INELIGIBLE_BUSINESS_LOCATION: "Ineligible Business Location",
      LOC_EXHAUSTED: "LOC (Letter of Credit) Exhausted",
      MISSING_BO_OR_INVOICING_FIELDS: "Missing Budget Order or Invoicing Fields",
      NO_AVAILABLE_AD_GROUPS: "No Available Ad Groups",
      NO_ELIGIBLE_COUNTRIES: "No Eligible Countries",
      NO_PAYMENT_METHOD_ON_FILE: "No Payment Method on File",
      ORG_CHARGE_BACK_DISPUTED: "Organization Chargeback Disputed",
      ORG_PAYMENT_TYPE_CHANGED: "Organization Payment Type Changed",
      ORG_SUSPENDED_FRAUD: "Organization Suspended for Fraud",
      ORG_SUSPENDED_POLICY_VIOLATION: "Organization Suspended (Policy Violation)",
      PAUSED_BY_SYSTEM: "Paused by System",
      PAUSED_BY_USER: "Paused by User",
      SAPIN_LAW_AGENT_UNKNOWN: "SAPIN Law Agent Unknown",
      SAPIN_LAW_FRENCH_BIZ: "SAPIN Law: French Business",
      SAPIN_LAW_FRENCH_BIZ_UNKNOWN: "SAPIN Law: French Business Unknown",
      TAX_VERIFICATION_PENDING: "Tax Verification Pending",
      TOTAL_BUDGET_EXHAUSTED: "Total Budget Exhausted",
      USER_REQUESTED_ACCOUNT_SUSPENSION: "User Requested Account Suspension",
    };
  
    return reasons.map((reason) => reasonMap[reason] || reason);
  };

  export const sessionKeysToRemove = [
    "app-search",
    "user-acl-session",
    "appDetails",
    "geo-search",
    "getall-budgetOrders",
    "getall-campaigns",
    "localeAppDetails",
    "getall-adgroups",
    "getall-keywords",
    "getall-negative-keywords",
  ];

  export const formatMatchType = {
    BROAD: "Broad",
    EXACT: "Exact",
  };

  export const formatAdStatus: { [key: string]: string } = {
    VALID: "Valid",
    INVALID: "Invalid",
    ENABLED: "Enabled",
    PAUSED: "Paused",
  };

  // Serving-state reasons that mean a creative needs the user's attention
  // (rejected or awaiting review). Used to flag ads in the Ads/Creatives tool.
  export const AD_ATTENTION_REASONS = new Set<string>([
    "CREATIVE_PENDING_REVIEW",
    "CREATIVE_REJECTED",
    "AD_REJECTED",
    "CREATIVE_AND_PRODUCT_PAGE_MISMATCH",
    "PRODUCT_PAGE_DELETED",
    "PRODUCT_PAGE_UNSUPPORTED",
    "CUSTOM_PRODUCT_PAGE_DELETED",
  ]);

  export const AD_PENDING_REASONS = new Set<string>([
    "CREATIVE_PENDING_REVIEW",
  ]);

  export const formatKeywordStatus = {
    ACTIVE: "Active",
    PAUSED: "Paused",
  };