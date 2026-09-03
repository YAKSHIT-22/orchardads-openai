/**
 * Scope + operator + action catalog for Autopilot.
 *
 * Mirrored (shape only) in the UI so the rule builder can only offer what the
 * OpenAI Ads API actually supports. Two scopes from the Apple build are gone and
 * are not coming back:
 *
 *  - KEYWORD: this API has no keywords. Ad-group targeting is free-text
 *    `context_hints[]`, which has no per-hint metrics, so there is nothing to
 *    write a numeric rule against.
 *  - Anything archive-shaped: archiving is documented as irreversible, so it is
 *    never an automatable action.
 *
 * GEO survives, but as a REPORTING scope: insights support a `country` segment,
 * so we can find weak countries. Excluding one edits campaign
 * `targeting.locations`, which is a campaign-level write.
 */

import type { StrategyScope, ActionType, ConditionOperator } from "./types";

export interface ScopeDef {
  key: StrategyScope;
  label: string;
  /** Plural noun for the entity. */
  entity: string;
  description: string;
  /** Whether the report is fetched once account-wide or per-campaign. */
  fanOut: "account" | "perCampaign";
  actions: ActionType[];
}

export const SCOPES: ScopeDef[] = [
  {
    key: "CAMPAIGN",
    label: "Campaign",
    entity: "campaigns",
    description: "Evaluate whole campaigns — pause, resume, or move budgets.",
    fanOut: "account",
    actions: ["NOTIFY", "PAUSE", "ENABLE", "ADJUST_BUDGET", "SET_BUDGET"],
  },
  {
    key: "ADGROUP",
    label: "Ad group",
    entity: "ad groups",
    description: "Evaluate ad groups — pause, resume, or change the max bid.",
    fanOut: "account",
    actions: ["NOTIFY", "PAUSE", "ENABLE", "ADJUST_BID", "SET_BID"],
  },
  {
    key: "AD",
    label: "Ad",
    entity: "ads",
    description: "Evaluate individual ads and creatives — pause or resume the weak ones.",
    fanOut: "account",
    actions: ["NOTIFY", "PAUSE", "ENABLE"],
  },
  {
    key: "GEO",
    label: "Country",
    entity: "countries",
    description:
      "Evaluate performance by country using the insights country segment — flag or exclude weak markets.",
    fanOut: "account",
    actions: ["NOTIFY", "EXCLUDE_GEO"],
  },
];

export function scopeDef(key: string): ScopeDef | undefined {
  return SCOPES.find((s) => s.key === key);
}

export const OPERATORS: { key: ConditionOperator; label: string; symbol: string }[] = [
  { key: "GT", label: "is greater than", symbol: ">" },
  { key: "GTE", label: "is at least", symbol: ">=" },
  { key: "LT", label: "is less than", symbol: "<" },
  { key: "LTE", label: "is at most", symbol: "<=" },
  { key: "EQ", label: "equals", symbol: "=" },
  { key: "NEQ", label: "is not", symbol: "!=" },
  { key: "BETWEEN", label: "is between", symbol: "<->" },
];

export const ACTION_META: Record<
  ActionType,
  { label: string; needsAmount: boolean; kind: "status" | "bid" | "budget" | "geo" | "none" }
> = {
  NOTIFY: { label: "Notify / report only", needsAmount: false, kind: "none" },
  PAUSE: { label: "Pause", needsAmount: false, kind: "status" },
  ENABLE: { label: "Resume (activate)", needsAmount: false, kind: "status" },
  SET_BID: { label: "Set max bid to", needsAmount: true, kind: "bid" },
  ADJUST_BID: { label: "Adjust max bid by %", needsAmount: true, kind: "bid" },
  SET_BUDGET: { label: "Set lifetime budget to", needsAmount: true, kind: "budget" },
  ADJUST_BUDGET: { label: "Adjust lifetime budget by %", needsAmount: true, kind: "budget" },
  EXCLUDE_GEO: { label: "Exclude country from targeting", needsAmount: false, kind: "geo" },
};

/** Insights aggregation level and segment for a scope. */
export function reportFor(scope: StrategyScope): {
  level: "campaign" | "ad_group" | "ad";
  segment?: "country";
  type: string;
} {
  switch (scope) {
    case "ADGROUP":
      return { level: "ad_group", type: "adgroup" };
    case "AD":
      return { level: "ad", type: "ad" };
    case "GEO":
      return { level: "campaign", segment: "country", type: "campaign-geo" };
    case "CAMPAIGN":
    default:
      return { level: "campaign", type: "campaign" };
  }
}
