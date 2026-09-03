/**
 * Prebuilt Autopilot strategies — one-click starting points the builder loads
 * and the user then tweaks. Client-safe (no server imports).
 *
 * All money values are MICROS, matching the API and the rest of the codebase.
 *
 * Every template here is deliberately conservative, for a specific reason: on a
 * platform where a small advertiser produces a handful of conversions a month,
 * an aggressive default rule is far more likely to be reacting to noise than to
 * a real trend. The volume gates (`CLICKS >= n`, `CONVERSIONS >= n`) on every
 * template are the point, not decoration — without them these rules would fire
 * on three data points and cut a working campaign.
 *
 * There are no keyword templates. This API has no keywords.
 */

import type { StrategyScope, Rule } from "./types";

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  scope: StrategyScope;
  lookbackDays: number;
  rules: Rule[];
  /** Why this rule is safe to start from, shown under the template card. */
  rationale: string;
}

const M = 1_000_000; // one currency unit in micros

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "pause-wasteful-ad-groups",
    name: "Pause ad groups with no conversions",
    description: "Pause ad groups that spent real money over 30 days and converted nothing.",
    scope: "ADGROUP",
    lookbackDays: 30,
    rationale:
      "Requires 40+ clicks before firing, so it can't pause an ad group that simply hasn't had a chance yet.",
    rules: [
      {
        name: "Spend with no conversions",
        match: "ALL",
        conditions: [
          { metric: "SPEND", operator: "GTE", value: 25 * M },
          { metric: "CLICKS", operator: "GTE", value: 40 },
          { metric: "CONVERSIONS", operator: "EQ", value: 0 },
        ],
        action: { type: "PAUSE" },
      },
    ],
  },
  {
    id: "cut-expensive-bids",
    name: "Cut bids where CPA is too high",
    description: "Lower the max bid 20% on ad groups converting above your target cost.",
    scope: "ADGROUP",
    lookbackDays: 30,
    rationale:
      "Only acts once an ad group has at least 5 conversions, and never bids below a floor you set.",
    rules: [
      {
        name: "CPA over target",
        match: "ALL",
        conditions: [
          { metric: "CPA", operator: "GT", value: 50 * M },
          { metric: "CONVERSIONS", operator: "GTE", value: 5 },
        ],
        action: { type: "ADJUST_BID", amount: -20, minValue: 0.5 * M },
      },
    ],
  },
  {
    id: "scale-winning-ad-groups",
    name: "Scale winning ad groups",
    description: "Raise the max bid 15% on ad groups converting comfortably below target CPA.",
    scope: "ADGROUP",
    lookbackDays: 30,
    rationale:
      "Capped by a maximum bid so a runaway rule can't bid your budget away in a day.",
    rules: [
      {
        name: "Beating target CPA",
        match: "ALL",
        conditions: [
          { metric: "CPA", operator: "LT", value: 25 * M },
          { metric: "CONVERSIONS", operator: "GTE", value: 5 },
        ],
        action: { type: "ADJUST_BID", amount: 15, maxValue: 200 * M },
      },
    ],
  },
  {
    id: "fund-converting-campaigns",
    name: "Top up campaigns that are converting",
    description: "Raise the lifetime budget 20% on campaigns hitting target CPA.",
    scope: "CAMPAIGN",
    lookbackDays: 30,
    rationale:
      "Campaign budgets on this platform are lifetime, so a converting campaign stops dead when it runs out. This keeps the good ones alive.",
    rules: [
      {
        name: "Converting at or under target",
        match: "ALL",
        conditions: [
          { metric: "CPA", operator: "LTE", value: 30 * M },
          { metric: "CONVERSIONS", operator: "GTE", value: 10 },
        ],
        action: { type: "ADJUST_BUDGET", amount: 20 },
      },
    ],
  },
  {
    id: "trim-losing-campaigns",
    name: "Trim budget on losing campaigns",
    description: "Cut the lifetime budget 25% on campaigns spending well above target CPA.",
    scope: "CAMPAIGN",
    lookbackDays: 30,
    rationale:
      "Trims rather than pauses. A campaign with a broken conversion pixel looks identical to one that genuinely fails, and pausing on that mistake is expensive.",
    rules: [
      {
        name: "CPA well over target",
        match: "ALL",
        conditions: [
          { metric: "CPA", operator: "GT", value: 75 * M },
          { metric: "CONVERSIONS", operator: "GTE", value: 5 },
        ],
        action: { type: "ADJUST_BUDGET", amount: -25 },
      },
    ],
  },
  {
    id: "flag-low-ctr-ads",
    name: "Flag ads with weak click-through",
    description: "Report ads whose CTR is far below account norms after enough impressions.",
    scope: "AD",
    lookbackDays: 30,
    rationale:
      "Report-only. Weak CTR usually means the creative needs rewriting, not that the ad should be switched off.",
    rules: [
      {
        name: "Low CTR at volume",
        match: "ALL",
        conditions: [
          { metric: "IMPRESSIONS", operator: "GTE", value: 5000 },
          { metric: "CTR", operator: "LT", value: 0.002 },
        ],
        action: { type: "NOTIFY" },
      },
    ],
  },
  {
    id: "flag-weak-countries",
    name: "Flag underperforming countries",
    description: "Report countries spending without converting, using the country segment.",
    scope: "GEO",
    lookbackDays: 30,
    rationale:
      "Report-only by default. Excluding a country is a targeting change you should make deliberately.",
    rules: [
      {
        name: "Country spend with no conversions",
        match: "ALL",
        conditions: [
          { metric: "SPEND", operator: "GTE", value: 50 * M },
          { metric: "CONVERSIONS", operator: "EQ", value: 0 },
        ],
        action: { type: "NOTIFY" },
      },
    ],
  },
];

export function templateById(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}
