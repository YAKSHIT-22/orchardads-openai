import type { BiddingConfig, EntityStatus, ProductSet, ServingIssue } from "@/lib/openai/types";

/**
 * UI-facing ad group shapes.
 *
 * `context_hints` is the OpenAI Ads analogue of keywords: free text describing
 * when the product is useful, up to 2,000 per ad group. There are no match
 * types, no per-hint bids, and no per-hint metrics.
 */
export interface AllAdGroupsData {
  readonly id: string;
  name: string;
  description?: string | null;
  status: EntityStatus;

  context_hints: string[];
  /** `max_bid_micros` here is the primary bid lever. */
  bidding_config: BiddingConfig;
  product_set?: ProductSet | null;

  serving_issues?: ServingIssue[];

  readonly created_at?: number;
  readonly updated_at?: number;
}

export interface AdGroupFormValues {
  campaignId: string;
  name: string;
  description?: string;
  status: "active" | "paused";
  /** Entered in currency units; converted to micros before the request. */
  maxBid: number;
  contextHints: string[];
}
