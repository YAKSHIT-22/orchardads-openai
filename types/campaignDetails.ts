import type {
  BiddingType,
  Budget,
  CampaignMode,
  CampaignObjective,
  EntityStatus,
  ServingIssue,
  Targeting,
} from "@/lib/openai/types";

/**
 * UI-facing campaign shapes for OpenAI Ads.
 *
 * `Money` is kept as a named type because so many components take one, but it
 * now carries MICROS rather than a decimal string — the API's own unit, and the
 * only representation in which budget arithmetic is exact.
 */
export interface Money {
  /** Millionths of one currency unit. */
  micros: number;
  currency: string;
}

export interface AllCampaignsData {
  readonly id: string;
  name: string;
  description?: string | null;
  status: EntityStatus;

  /** Immutable after creation. */
  bidding_type: BiddingType;
  objective?: CampaignObjective;
  billing_event_type?: string;
  mode?: CampaignMode | null;
  product_feed_id?: string | null;

  /**
   * `lifetime_spend_limit_micros` is REQUIRED by the API and is what actually
   * stops delivery; the daily limit is optional. Both are replaced whole on
   * update, so partial writes must merge.
   */
  budget: Budget;

  /** Unix seconds. */
  start_time?: number | null;
  end_time?: number | null;

  targeting?: Targeting;
  conversion_event_setting_ids?: string[];

  /** Present when the list call includes `include[]=serving_issues`. */
  serving_issues?: ServingIssue[];

  readonly created_at?: number;
  readonly updated_at?: number;
}

/** Form shape for the create/edit wizard. Money fields are entered in units. */
export interface CampaignFormValues {
  name: string;
  description?: string;
  status: "active" | "paused";
  lifetimeBudget: number;
  dailyBudget?: number | null;
  biddingType: BiddingType;
  conversionEventSettingId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  locationIds: string[];
  includedAudienceIds: string[];
  excludedAudienceIds: string[];
}
