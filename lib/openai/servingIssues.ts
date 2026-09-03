import type { ServingIssueCode } from "./types";

/**
 * Serving Doctor — decode "why isn't this delivering?"
 *
 * The OpenAI Ads API returns typed serving-issue codes on campaigns, ad groups
 * and ads whenever the list call includes `include[]=serving_issues`. The full
 * enum is published in the OpenAPI spec, which makes this a complete,
 * deterministic fault tree handed to us by the platform: no AI, no statistics,
 * no history required. It produces value the moment a key is pasted, which is
 * the hardest moment in an analytics product.
 *
 * Each entry answers three questions the advertiser actually has:
 *   what is wrong · who can fix it · what exactly do I do
 *
 * `fixableBy` matters because roughly a third of these are OpenAI-side or
 * billing-side and no tool can fix them — saying so plainly is more useful than
 * a generic "check your settings".
 */

export type IssueSeverity = "blocking" | "partial" | "warning";
export type FixableBy = "advertiser" | "orchardads" | "openai" | "billing";

export type ServingIssueInfo = {
  code: ServingIssueCode;
  /** Where the issue originates, regardless of which entity reported it. */
  level: "account" | "campaign" | "ad_group" | "ad";
  severity: IssueSeverity;
  title: string;
  /** What it means, in the advertiser's language. */
  meaning: string;
  /** The specific next action. */
  fix: string;
  fixableBy: FixableBy;
  /**
   * True when we can propose a concrete API change for it. Everything else is
   * advisory: we diagnose it and hand over the fix rather than pretending to
   * have an Apply button that does nothing.
   */
  actionable: boolean;
};

const ISSUES: Record<string, ServingIssueInfo> = {
  // ── Account level ─────────────────────────────────────────────────────────
  ad_account_suspended: {
    code: "ad_account_suspended",
    level: "account",
    severity: "blocking",
    title: "Ad account suspended",
    meaning: "OpenAI has suspended this ad account. Nothing in it can serve.",
    fix: "Contact OpenAI Ads support. No campaign change will restore delivery until the suspension is lifted.",
    fixableBy: "openai",
    actionable: false,
  },
  ad_account_brand_review_missing_favicon: {
    code: "ad_account_brand_review_missing_favicon",
    level: "account",
    severity: "blocking",
    title: "Brand icon missing",
    meaning:
      "The account's brand review can't complete without a brand icon, and an account cannot serve ads until brand review is approved.",
    fix: "Upload a brand icon of at least 128x128 px in Ads Manager, then wait for review to complete. (Setting it through the API needs brand updates enabled for this account.)",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_account_brand_review_in_progress: {
    code: "ad_account_brand_review_in_progress",
    level: "account",
    severity: "blocking",
    title: "Brand review in progress",
    meaning: "OpenAI is reviewing the account's brand. Ads won't serve until it's approved.",
    fix: "No action needed. Reviews typically clear quickly; we'll re-check on the next sync.",
    fixableBy: "openai",
    actionable: false,
  },
  ad_account_brand_review_escalated_review: {
    code: "ad_account_brand_review_escalated_review",
    level: "account",
    severity: "blocking",
    title: "Brand review escalated",
    meaning: "The brand review needed a closer look and is taking longer than usual.",
    fix: "Wait for the review. If it stays escalated for more than a few days, contact OpenAI Ads support.",
    fixableBy: "openai",
    actionable: false,
  },
  ad_account_brand_review_rejected: {
    code: "ad_account_brand_review_rejected",
    level: "account",
    severity: "blocking",
    title: "Brand review rejected",
    meaning: "The account's brand didn't pass review, so nothing in it can serve.",
    fix: "Check the rejection reason on the account, correct the brand details or website, and resubmit.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_account_payment_method_missing_or_unauthorized: {
    code: "ad_account_payment_method_missing_or_unauthorized",
    level: "account",
    severity: "blocking",
    title: "Payment method missing or declined",
    meaning: "There's no usable payment method on the account, so delivery is stopped.",
    fix: "Add or update the payment method in Ads Manager billing settings.",
    fixableBy: "billing",
    actionable: false,
  },
  ad_account_threshold_payment_failed: {
    code: "ad_account_threshold_payment_failed",
    level: "account",
    severity: "blocking",
    title: "Payment failed",
    meaning: "A billing-threshold charge was declined, so delivery has stopped.",
    fix: "Settle the outstanding balance and update the payment method in Ads Manager.",
    fixableBy: "billing",
    actionable: false,
  },
  ad_account_persona_verification_not_approved: {
    code: "ad_account_persona_verification_not_approved",
    level: "account",
    severity: "blocking",
    title: "Identity verification not approved",
    meaning: "The advertiser identity check hasn't been approved for this account.",
    fix: "Complete identity verification in Ads Manager.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_account_persona_verification_step_up_required: {
    code: "ad_account_persona_verification_step_up_required",
    level: "account",
    severity: "blocking",
    title: "Additional verification required",
    meaning: "OpenAI needs extra identity verification before this account can serve.",
    fix: "Complete the additional verification step in Ads Manager.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_account_budget_exhausted: {
    code: "ad_account_budget_exhausted",
    level: "account",
    severity: "blocking",
    title: "Account spend limit reached",
    meaning:
      "An account-level spend limit window has been fully consumed, so nothing in the account can spend further.",
    fix: "Raise or extend the spend limit window, or wait for the next window to begin.",
    fixableBy: "advertiser",
    actionable: true,
  },

  // ── Campaign level ────────────────────────────────────────────────────────
  campaign_not_active: {
    code: "campaign_not_active",
    level: "campaign",
    severity: "blocking",
    title: "Campaign is paused",
    meaning: "The campaign isn't active, so none of its ad groups or ads can deliver.",
    fix: "Activate the campaign if it should be running.",
    fixableBy: "advertiser",
    actionable: true,
  },
  campaign_not_started: {
    code: "campaign_not_started",
    level: "campaign",
    severity: "warning",
    title: "Campaign hasn't started yet",
    meaning: "The campaign's start time is in the future.",
    fix: "Bring the start time forward if you meant it to be running now.",
    fixableBy: "advertiser",
    actionable: true,
  },
  campaign_ended: {
    code: "campaign_ended",
    level: "campaign",
    severity: "blocking",
    title: "Campaign has ended",
    meaning: "The campaign's end time has passed.",
    fix: "Extend the end time, or clear it, if the campaign should keep running.",
    fixableBy: "advertiser",
    actionable: true,
  },
  campaign_has_no_ad_groups: {
    code: "campaign_has_no_ad_groups",
    level: "campaign",
    severity: "blocking",
    title: "Campaign has no ad groups",
    meaning: "There's nothing under this campaign to deliver.",
    fix: "Add at least one ad group with a bid and one approved ad.",
    fixableBy: "advertiser",
    actionable: false,
  },
  campaign_has_no_serving_ready_ad_groups: {
    code: "campaign_has_no_serving_ready_ad_groups",
    level: "campaign",
    severity: "blocking",
    title: "No ad group is ready to serve",
    meaning:
      "Every ad group under this campaign is blocked — paused, empty, or holding only unapproved ads.",
    fix: "Open the ad groups below and clear their individual issues.",
    fixableBy: "advertiser",
    actionable: false,
  },
  campaign_budget_exhausted: {
    code: "campaign_budget_exhausted",
    level: "campaign",
    severity: "blocking",
    title: "Campaign budget exhausted",
    meaning: "The campaign has spent its lifetime budget, so it has stopped delivering.",
    fix: "Raise the lifetime budget if the campaign is performing, or leave it stopped if it isn't.",
    fixableBy: "advertiser",
    actionable: true,
  },

  // ── Ad group level ────────────────────────────────────────────────────────
  ad_group_not_active: {
    code: "ad_group_not_active",
    level: "ad_group",
    severity: "blocking",
    title: "Ad group is paused",
    meaning: "The ad group isn't active, so its ads can't deliver.",
    fix: "Activate the ad group if it should be running.",
    fixableBy: "advertiser",
    actionable: true,
  },
  ad_group_has_no_ads: {
    code: "ad_group_has_no_ads",
    level: "ad_group",
    severity: "blocking",
    title: "Ad group has no ads",
    meaning: "There's nothing to show.",
    fix: "Add at least one ad and let it pass review.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_group_has_no_serving_ready_ads: {
    code: "ad_group_has_no_serving_ready_ads",
    level: "ad_group",
    severity: "blocking",
    title: "No ad is ready to serve",
    meaning: "Every ad here is paused, rejected, or still in review.",
    fix: "Open Review Doctor to see exactly which ads are blocked and why.",
    fixableBy: "advertiser",
    actionable: false,
  },

  // ── Ad level ──────────────────────────────────────────────────────────────
  ad_not_active: {
    code: "ad_not_active",
    level: "ad",
    severity: "blocking",
    title: "Ad is paused",
    meaning: "The ad isn't active.",
    fix: "Activate the ad if it should be running.",
    fixableBy: "advertiser",
    actionable: true,
  },
  review_not_approved: {
    code: "review_not_approved",
    level: "ad",
    severity: "blocking",
    title: "Ad not approved",
    meaning: "The ad failed review, so it can't serve.",
    fix: "Open Review Doctor for the exact rejection reason and the fix for it.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_in_review: {
    code: "ad_in_review",
    level: "ad",
    severity: "warning",
    title: "Ad is in review",
    meaning: "OpenAI is still reviewing this ad. Reviews usually take only a few minutes.",
    fix: "No action needed yet. If it's been hours, check the landing page is reachable by a crawler.",
    fixableBy: "openai",
    actionable: false,
  },
  landing_page_crawl_issue: {
    code: "landing_page_crawl_issue",
    level: "ad",
    severity: "blocking",
    title: "Landing page can't be crawled",
    meaning:
      "OpenAI's crawler couldn't read the destination URL, so the ad can't be approved. This is the single most common fixable rejection.",
    fix: "Open Review Doctor for the specific crawler failure (blocked bot, robots.txt, login wall, 403, timeout) and its fix.",
    fixableBy: "advertiser",
    actionable: false,
  },
  ad_over_18_only: {
    code: "ad_over_18_only",
    level: "ad",
    severity: "partial",
    title: "Restricted to adults",
    meaning: "The ad is limited to an 18+ audience, which reduces reach.",
    fix: "If that's unintended, adjust the creative and landing page to avoid age-restricted content.",
    fixableBy: "advertiser",
    actionable: false,
  },
  policy_country_targeting_blocked: {
    code: "policy_country_targeting_blocked",
    level: "ad",
    severity: "blocking",
    title: "Blocked in the targeted countries",
    meaning: "Policy prevents this ad from running in every country the campaign targets.",
    fix: "Change the campaign's location targeting, or change the creative to comply.",
    fixableBy: "advertiser",
    actionable: true,
  },
  policy_country_targeting_limited: {
    code: "policy_country_targeting_limited",
    level: "ad",
    severity: "partial",
    title: "Limited in some countries",
    meaning: "The ad can't run in some of the targeted countries, so reach is reduced.",
    fix: "Review location targeting, or adjust the creative for the restricted markets.",
    fixableBy: "advertiser",
    actionable: true,
  },
  title_missing: {
    code: "title_missing",
    level: "ad",
    severity: "blocking",
    title: "Creative title missing",
    meaning: "The ad has no title, which is required.",
    fix: "Add a title of 3-50 characters.",
    fixableBy: "advertiser",
    actionable: true,
  },
  advertiser_name_missing: {
    code: "advertiser_name_missing",
    level: "ad",
    severity: "blocking",
    title: "Advertiser name missing",
    meaning: "The ad can't be attributed to an advertiser.",
    fix: "Complete the account's brand details in Ads Manager.",
    fixableBy: "advertiser",
    actionable: false,
  },
  image_or_favicon_missing: {
    code: "image_or_favicon_missing",
    level: "ad",
    severity: "blocking",
    title: "Image or brand icon missing",
    meaning: "The creative has no usable image, or the account has no brand icon.",
    fix: "Attach a creative image to the ad, and make sure the account has a brand icon of at least 128x128 px.",
    fixableBy: "advertiser",
    actionable: false,
  },
  target_url_invalid: {
    code: "target_url_invalid",
    level: "ad",
    severity: "blocking",
    title: "Destination URL is invalid",
    meaning: "The target URL is malformed or unreachable.",
    fix: "Fix the URL. It must be a valid, publicly reachable https address of at most 2,048 characters.",
    fixableBy: "advertiser",
    actionable: true,
  },
  reserved_query_params_present: {
    code: "reserved_query_params_present",
    level: "ad",
    severity: "blocking",
    title: "Reserved query parameters in the URL",
    meaning: "The destination URL uses query parameters OpenAI reserves for its own tracking.",
    fix: "Remove the reserved parameters from the URL and use your own UTM names instead.",
    fixableBy: "advertiser",
    actionable: true,
  },
  product_feed_id_missing: {
    code: "product_feed_id_missing",
    level: "ad",
    severity: "blocking",
    title: "Product feed not linked",
    meaning: "This is a product-feed ad but no feed is linked.",
    fix: "Link a product feed to the campaign, or convert the ad to a standard creative.",
    fixableBy: "advertiser",
    actionable: false,
  },

  // ── Partial serving ───────────────────────────────────────────────────────
  partial_serving_review_not_approved: {
    code: "partial_serving_review_not_approved",
    level: "ad",
    severity: "partial",
    title: "Some ads aren't approved",
    meaning: "Delivery is happening, but part of the inventory is held back by unapproved ads.",
    fix: "Clear the rejections in Review Doctor to recover full reach.",
    fixableBy: "advertiser",
    actionable: false,
  },
  partial_serving_landing_page_crawl_issue: {
    code: "partial_serving_landing_page_crawl_issue",
    level: "ad",
    severity: "partial",
    title: "Some landing pages can't be crawled",
    meaning: "Delivery is reduced because some destination URLs can't be read.",
    fix: "Fix the crawler issues listed in Review Doctor.",
    fixableBy: "advertiser",
    actionable: false,
  },
  partial_serving_ad_in_review: {
    code: "partial_serving_ad_in_review",
    level: "ad",
    severity: "partial",
    title: "Some ads still in review",
    meaning: "Delivery is reduced while some ads finish review.",
    fix: "No action needed. Reach should recover once review completes.",
    fixableBy: "openai",
    actionable: false,
  },
};

/** Unknown codes are possible — this API ships changes weekly. Never throw. */
export function describeServingIssue(code: string): ServingIssueInfo {
  return (
    ISSUES[code] ?? {
      code,
      level: "ad",
      severity: "warning",
      title: humanize(code),
      meaning: "OpenAI reported a delivery issue we don't have a description for yet.",
      fix: "Check this entity in Ads Manager for details.",
      fixableBy: "advertiser",
      actionable: false,
    }
  );
}

export function describeServingIssues(codes: string[] | null | undefined): ServingIssueInfo[] {
  if (!codes?.length) return [];
  const seen = new Set<string>();
  return codes
    .filter((c) => (seen.has(c) ? false : (seen.add(c), true)))
    .map(describeServingIssue)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function severityRank(s: IssueSeverity): number {
  return s === "blocking" ? 0 : s === "partial" ? 1 : 2;
}

/** True when the codes contain anything that fully stops delivery. */
export function isBlocked(codes: string[] | null | undefined): boolean {
  return describeServingIssues(codes).some((i) => i.severity === "blocking");
}

/**
 * Account-level codes repeat on every child entity (a suspended account appears
 * on every campaign, ad group and ad). Collapsing them keeps the Serving Doctor
 * list honest: one root cause, listed once, with the count of entities it stops.
 */
export function rootCause(codes: string[] | null | undefined): ServingIssueInfo | null {
  const issues = describeServingIssues(codes);
  const order: ServingIssueInfo["level"][] = ["account", "campaign", "ad_group", "ad"];
  for (const level of order) {
    const hit = issues.find((i) => i.level === level && i.severity === "blocking");
    if (hit) return hit;
  }
  return issues[0] ?? null;
}

function humanize(code: string): string {
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const ALL_SERVING_ISSUE_CODES = Object.keys(ISSUES);
