import type { AdCreative, EntityStatus, Review, ReviewStatus, ServingIssue } from "@/lib/openai/types";

/**
 * UI-facing ad shapes.
 *
 * `review_status` and `review.reason` are first-class here rather than an
 * afterthought: on a young ad platform most ads that aren't running are stuck in
 * review, and the reason enum is dominated by fixable landing-page and crawler
 * failures. That is what Review Doctor renders.
 */
export interface AllAdsData {
  readonly id: string;
  name: string;
  status: EntityStatus;
  creative: AdCreative;

  review_status: ReviewStatus;
  review: Review;
  serving_issues?: ServingIssue[];

  readonly created_at?: number;
  readonly updated_at?: number;
}

export interface AdFormValues {
  adGroupId: string;
  name?: string;
  status: "active" | "paused";
  /** 3-50 characters. */
  title: string;
  /** Up to 100 characters. */
  body: string;
  /** Up to 2,048 characters, and must be crawlable or the ad will be rejected. */
  targetUrl: string;
  imageUrl?: string;
  fileId?: string;
}
