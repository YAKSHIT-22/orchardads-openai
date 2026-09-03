/**
 * Autopilot rule/strategy types. Rules are stored as JSON on Strategy.rules and
 * validated against these shapes in the API + engine.
 */

import type { AlertMetricKey } from "@/lib/alerts/metrics";

export type StrategyScope = "CAMPAIGN" | "ADGROUP" | "AD" | "GEO";

export type ConditionOperator =
  | "GT" | "LT" | "GTE" | "LTE" | "EQ" | "NEQ" | "BETWEEN";

export type Condition = {
  metric: AlertMetricKey;
  operator: ConditionOperator;
  value: number;
  /** Second bound for BETWEEN. */
  value2?: number;
};

export type ActionType =
  | "NOTIFY"        // report only, no change
  | "PAUSE"
  | "ENABLE"
  | "SET_BID"       // absolute ad-group max bid (bidding_config.max_bid_micros)
  | "ADJUST_BID"    // +/- percent on the ad-group max bid
  | "SET_BUDGET"    // absolute campaign budget
  | "ADJUST_BUDGET" // +/- percent campaign budget
  | "EXCLUDE_GEO";  // remove a location from campaign targeting

export type Action = {
  type: ActionType;
  /**
   * Amount for SET_* (MICROS, matching the API); percent (e.g. 20 or -15) for
   * ADJUST_*. Micros rather than currency units so an action never loses cents
   * to floating point on the way to a live budget.
   */
  amount?: number;
  /** Clamp bounds for bid/budget actions, in micros. */
  minValue?: number;
  maxValue?: number;
};

export type Rule = {
  name?: string;
  /** All conditions must match (ALL) or any (ANY). */
  match: "ALL" | "ANY";
  conditions: Condition[];
  action: Action;
};

export type Strategy = {
  scope: StrategyScope;
  lookbackDays: number;
  campaignIds: string[];
  rules: Rule[];
};

/** One proposed change from a run — the row shown in the preview table. */
export type Suggestion = {
  ruleName: string;
  scope: StrategyScope;
  entityId: string;
  entityName: string;
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  /** Location id / country code for GEO scope. */
  geo?: string;
  actionType: ActionType;
  /** Human summary, e.g. "Pause" or "Bid $1.20 -> $0.96 (-20%)". */
  actionLabel: string;
  /** Micros. */
  currentValue?: number | null;
  newValue?: number | null;
  currency: string;
  /** Risk band from the risk engine — shown next to every proposed change. */
  riskBand?: "ADVISORY" | "LOW" | "MEDIUM" | "HIGH";
  /** Guardrail violations that blocked this suggestion, if any. */
  blockedBy?: string[];
  /** Metric snapshot that triggered the match (for the table + CSV). */
  metrics: Record<string, number>;
  /** Stable id for selection in preview→apply. */
  key: string;
};
