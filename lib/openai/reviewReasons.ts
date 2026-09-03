import type { ReviewReasonCode, ReviewStatus } from "./types";

/**
 * Review Doctor — decode "why was my ad rejected, and how do I fix it?"
 *
 * `review.reason` on an ad (and on the ad account) is an enum from the official
 * OpenAPI spec, and it is dominated by *landing-page and crawler* failures
 * rather than content-policy judgements. That matters commercially: almost
 * every one of these is something the advertiser can fix in an afternoon, and
 * nobody is currently telling them how.
 *
 * Each entry gives the cause, the concrete fix, and whether the ad will
 * re-review automatically once the underlying problem is resolved.
 */

export type ReviewReasonInfo = {
  code: ReviewReasonCode;
  title: string;
  /** What OpenAI's crawler actually experienced. */
  cause: string;
  /** Step-by-step fix, in the order to try it. */
  fix: string[];
  category: "crawler" | "access" | "content" | "brand" | "unknown";
  /** True when resubmission is automatic after the site is fixed. */
  autoRetries: boolean;
};

const REASONS: Record<string, ReviewReasonInfo> = {
  crawl_failed: {
    code: "crawl_failed",
    title: "Landing page couldn't be read",
    cause: "OpenAI's crawler tried to fetch the destination URL and failed, without a more specific reason.",
    fix: [
      "Open the exact target URL in a private browser window and confirm it loads with no redirect chain.",
      "Check the page responds within a few seconds — slow origins time out.",
      "Confirm the URL is publicly reachable, not staging or IP-restricted.",
    ],
    category: "crawler",
    autoRetries: true,
  },
  crawler_bot_blocked: {
    code: "crawler_bot_blocked",
    title: "Crawler blocked by bot protection",
    cause:
      "A bot-protection layer (Cloudflare, Akamai, a WAF, or a rate-limit rule) blocked OpenAI's crawler before the page rendered.",
    fix: [
      "Allowlist OpenAI's crawler in your CDN/WAF bot rules.",
      "In Cloudflare, check Security > Bots and any 'Block AI Scrapers' setting — that setting alone will block ad review.",
      "Relax any rate limiting that triggers on a single non-browser user agent.",
    ],
    category: "access",
    autoRetries: true,
  },
  crawler_captcha: {
    code: "crawler_captcha",
    title: "Landing page shows a CAPTCHA",
    cause: "The crawler was served a CAPTCHA challenge instead of the page.",
    fix: [
      "Exclude the ad landing page from interstitial CAPTCHA / 'Under Attack' mode.",
      "If the challenge is geo-triggered, allow the regions the crawler reaches you from.",
    ],
    category: "access",
    autoRetries: true,
  },
  crawler_login_required: {
    code: "crawler_login_required",
    title: "Landing page requires a login",
    cause: "The destination URL redirected to a sign-in wall, so the crawler never saw the advertised content.",
    fix: [
      "Point the ad at a public page that describes the offer — not a page behind authentication.",
      "If the product itself needs an account, link to the marketing or pricing page instead.",
    ],
    category: "access",
    autoRetries: true,
  },
  crawler_400: {
    code: "crawler_400",
    title: "Landing page returned 400",
    cause: "The server rejected the crawler's request as malformed — often a required query parameter is missing.",
    fix: [
      "Load the exact URL, including all query parameters, and check it returns 200.",
      "Make sure tracking parameters are optional and the page works without them.",
    ],
    category: "crawler",
    autoRetries: true,
  },
  crawler_401: {
    code: "crawler_401",
    title: "Landing page returned 401",
    cause: "The page requires authentication.",
    fix: ["Remove HTTP auth from the landing page, or point the ad at a public URL."],
    category: "access",
    autoRetries: true,
  },
  crawler_403: {
    code: "crawler_403",
    title: "Landing page returned 403",
    cause: "The server refused the crawler — usually a user-agent, IP, or geo block rather than a real permission problem.",
    fix: [
      "Check user-agent blocking rules on the origin and CDN.",
      "Check for country-level blocking; the crawler may reach you from a region you block.",
      "Check mod_security or equivalent WAF rules for a false positive.",
    ],
    category: "access",
    autoRetries: true,
  },
  crawler_404: {
    code: "crawler_404",
    title: "Landing page returned 404",
    cause: "The destination URL doesn't exist.",
    fix: [
      "Correct the target URL on the ad.",
      "Watch for a trailing slash, a stale campaign slug, or a page that has since been removed.",
    ],
    category: "crawler",
    autoRetries: true,
  },
  crawler_408: {
    code: "crawler_408",
    title: "Landing page timed out",
    cause: "The origin took too long to respond.",
    fix: [
      "Reduce server response time for the landing page.",
      "Put the page behind a CDN, or pre-render it.",
      "Check that the page isn't blocked on a slow third-party script.",
    ],
    category: "crawler",
    autoRetries: true,
  },
  crawler_410: {
    code: "crawler_410",
    title: "Landing page is gone",
    cause: "The server reported the page as permanently removed.",
    fix: ["Point the ad at a live URL."],
    category: "crawler",
    autoRetries: true,
  },
  crawler_429: {
    code: "crawler_429",
    title: "Crawler was rate limited",
    cause: "The origin returned 'too many requests' to the crawler.",
    fix: [
      "Raise or exempt rate limits for the landing page path.",
      "Confirm no per-IP limit is counting the crawler as abusive traffic.",
    ],
    category: "access",
    autoRetries: true,
  },
  crawler_500: {
    code: "crawler_500",
    title: "Landing page returned 500",
    cause: "The origin threw a server error while rendering the page.",
    fix: ["Check application logs for the landing-page route.", "Retry once the error is resolved."],
    category: "crawler",
    autoRetries: true,
  },
  crawler_502: {
    code: "crawler_502",
    title: "Landing page returned 502",
    cause: "A gateway or proxy in front of the origin failed.",
    fix: ["Check the load balancer / reverse proxy and origin health."],
    category: "crawler",
    autoRetries: true,
  },
  crawler_503: {
    code: "crawler_503",
    title: "Landing page unavailable (503)",
    cause: "The origin reported itself as unavailable, or was in maintenance mode.",
    fix: ["Confirm the site is out of maintenance mode.", "Check origin capacity and autoscaling."],
    category: "crawler",
    autoRetries: true,
  },
  crawler_504: {
    code: "crawler_504",
    title: "Gateway timeout (504)",
    cause: "An upstream gateway timed out waiting for the origin.",
    fix: ["Reduce landing-page response time.", "Raise upstream timeouts at the proxy."],
    category: "crawler",
    autoRetries: true,
  },
  robots_txt: {
    code: "robots_txt",
    title: "Blocked by robots.txt",
    cause: "Your robots.txt disallows crawling of the landing page, so review cannot proceed.",
    fix: [
      "Allow the landing-page path in robots.txt.",
      "A blanket `Disallow: /` on a staging-style rule is the usual cause.",
      "Remember robots.txt is fetched from the domain root — check the live one, not the repo copy.",
    ],
    category: "access",
    autoRetries: true,
  },
  unsupported_content_type: {
    code: "unsupported_content_type",
    title: "Unsupported content type",
    cause: "The URL returned something other than a web page — a PDF, a file download, or a raw API response.",
    fix: ["Point the ad at an HTML page.", "If you're linking a document, link the page that hosts it instead."],
    category: "content",
    autoRetries: true,
  },
  landing_page_image_processing_failed: {
    code: "landing_page_image_processing_failed",
    title: "Couldn't process the landing-page image",
    cause: "OpenAI couldn't extract or process an image from the landing page.",
    fix: [
      "Make sure key images are served as standard formats (JPEG, PNG, WebP) and are directly reachable.",
      "Avoid lazy-loading the hero image behind JavaScript that a crawler won't execute.",
    ],
    category: "content",
    autoRetries: true,
  },
  landing_page_unusable: {
    code: "landing_page_unusable",
    title: "Landing page unusable",
    cause:
      "The page loaded but couldn't be used for an ad — typically almost no content, a bare redirect, or a page that doesn't match the advertised offer.",
    fix: [
      "Link to a page with real content about the advertised product or offer.",
      "Avoid interstitials, splash screens, and pure redirect URLs.",
      "Make sure the page's content matches the ad's title and body.",
    ],
    category: "content",
    autoRetries: true,
  },
  missing_favicon: {
    code: "missing_favicon",
    title: "Brand icon missing",
    cause:
      "The ad account has no brand icon. An account can't serve ads until its brand review is approved, and that needs an icon.",
    fix: [
      "Upload a brand icon of at least 128x128 px in Ads Manager.",
      "Make sure your site serves a favicon at the domain root.",
      "Poll the account until review status is approved.",
    ],
    category: "brand",
    autoRetries: true,
  },
};

export function describeReviewReason(code: string | null | undefined): ReviewReasonInfo | null {
  if (!code) return null;
  return (
    REASONS[code] ?? {
      code,
      title: humanize(code),
      cause: "OpenAI reported a review failure we don't have a description for yet.",
      fix: ["Open this ad in Ads Manager for the full review detail."],
      category: "unknown",
      autoRetries: false,
    }
  );
}

/** One-line summary for a table row. */
export function reviewSummary(status: ReviewStatus | string | null, reason?: string | null): string {
  if (status === "approved") return "Approved";
  if (status === "in_review") return "In review";
  if (status === "rejected") {
    const info = describeReviewReason(reason);
    return info ? `Rejected — ${info.title}` : "Rejected";
  }
  return "Unknown";
}

/**
 * Group rejected ads by root cause. One misconfigured WAF rule rejects every ad
 * on the account, so the useful unit of work is the cause, not the ad.
 */
export function groupByReason<T extends { reviewReason?: string | null }>(
  ads: T[]
): { reason: ReviewReasonInfo; ads: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const ad of ads) {
    const key = ad.reviewReason || "unknown";
    const list = buckets.get(key);
    if (list) list.push(ad);
    else buckets.set(key, [ad]);
  }
  return [...buckets.entries()]
    .map(([code, list]) => ({ reason: describeReviewReason(code)!, ads: list }))
    .sort((a, b) => b.ads.length - a.ads.length);
}

function humanize(code: string): string {
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const ALL_REVIEW_REASON_CODES = Object.keys(REASONS);
