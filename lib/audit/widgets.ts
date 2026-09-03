/**
 * Orchard Inspector widget catalog — the canonical list of audit checks the
 * create page offers and the run page computes. Keys are stored on
 * `SavedAudit.widgets` and must stay stable.
 *
 * REBUILT FOR OPENAI ADS. The Apple catalog was keyword-centric (spend leaks
 * from search terms, dormant keywords, untapped terms). None of those exist
 * here: the API has no keywords, no search terms and no match types.
 *
 * What replaced them is better, not merely different. The platform publishes
 * typed serving-issue codes and an enumerated ad-review reason, so the two
 * highest-value checks in this catalog — "what isn't delivering" and "what was
 * rejected and why" — are deterministic and need no history, no statistics and
 * no AI. They produce a real answer on the day an account is connected.
 */

export type AuditWidgetKey =
  | "servingBlocks"
  | "reviewFailures"
  | "healthScore"
  | "budgetExhaustion"
  | "wastedSpend"
  | "trackingGaps"
  | "creativeFatigue"
  | "structureGaps"
  | "pacingRisk";

export interface AuditWidgetDef {
  key: AuditWidgetKey;
  name: string;
  description: string;
  /**
   * True when the check needs performance history to say anything useful.
   * False for checks that work from entity state alone — those are the ones
   * that make a freshly connected account immediately worth looking at.
   */
  needsHistory: boolean;
  /** Which data the run page must load. */
  sources: ("entities" | "insights" | "conversions")[];
}

export const AUDIT_WIDGETS: AuditWidgetDef[] = [
  {
    key: "servingBlocks",
    name: "Serving Blocks",
    description:
      "Campaigns, ad groups and ads that can't deliver, grouped by root cause with the fix for each.",
    needsHistory: false,
    sources: ["entities"],
  },
  {
    key: "reviewFailures",
    name: "Review Failures",
    description:
      "Rejected ads grouped by reason — mostly crawler and landing-page problems you can fix today.",
    needsHistory: false,
    sources: ["entities"],
  },
  {
    key: "structureGaps",
    name: "Structure Gaps",
    description:
      "Campaigns with no ad groups, ad groups with no ads, and active entities under paused or finished parents.",
    needsHistory: false,
    sources: ["entities"],
  },
  {
    key: "trackingGaps",
    name: "Tracking Gaps",
    description:
      "Conversion-optimized campaigns with no recorded conversions, and event settings with no active source.",
    needsHistory: true,
    sources: ["entities", "insights", "conversions"],
  },
  {
    key: "budgetExhaustion",
    name: "Budget Exhaustion",
    description:
      "Campaigns that have spent their lifetime budget and stopped, separated into ones worth topping up and ones that aren't.",
    needsHistory: true,
    sources: ["entities", "insights", "conversions"],
  },
  {
    key: "wastedSpend",
    name: "Wasted Spend",
    description: "Spend with no conversions, gated on enough clicks that zero actually means something.",
    needsHistory: true,
    sources: ["insights", "conversions"],
  },
  {
    key: "pacingRisk",
    name: "Pacing Risk",
    description:
      "Campaigns that will exhaust their budget before the end date, or leave it unspent.",
    needsHistory: true,
    sources: ["entities", "insights"],
  },
  {
    key: "creativeFatigue",
    name: "Creative Fatigue",
    description: "Ads whose click-through rate has decayed materially over the window.",
    needsHistory: true,
    sources: ["insights"],
  },
  {
    key: "healthScore",
    name: "Health Score",
    description:
      "One number across delivery, structure, tracking and efficiency, with the components shown.",
    needsHistory: true,
    sources: ["entities", "insights", "conversions"],
  },
];

export const DEFAULT_AUDIT_WIDGETS: AuditWidgetKey[] = [
  "servingBlocks",
  "reviewFailures",
  "wastedSpend",
  "budgetExhaustion",
  "healthScore",
];

export function widgetDef(key: string): AuditWidgetDef | undefined {
  return AUDIT_WIDGETS.find((w) => w.key === key);
}

/** Widgets that produce a result without any performance history. */
export const INSTANT_WIDGETS: AuditWidgetKey[] = AUDIT_WIDGETS.filter((w) => !w.needsHistory).map(
  (w) => w.key
);

/** Stable key list, used to validate `SavedAudit.widgets` on write. */
export const AUDIT_WIDGET_KEYS: AuditWidgetKey[] = AUDIT_WIDGETS.map((w) => w.key);

/** Look up one widget definition by key. */
export const auditWidget = widgetDef;
