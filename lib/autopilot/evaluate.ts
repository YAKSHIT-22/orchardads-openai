/**
 * Pure Autopilot evaluation. Given normalized entity records (one per campaign,
 * ad group, ad, or country, with a metric snapshot plus the current bid/budget)
 * and a strategy's rules, return the proposed changes. No network, no DB.
 *
 * All money here is MICROS, matching the API, so a rule that adjusts a live
 * budget never loses cents to floating point on the way in or out.
 */

import type { AlertMetricKey } from "@/lib/alerts/metrics";
import { metricDef } from "@/lib/alerts/metrics";
import { money } from "@/lib/format";
import type { Rule, Condition, Action, Suggestion, StrategyScope, ActionType } from "./types";

export type EntityRecord = {
  scope: StrategyScope;
  entityId: string;
  entityName: string;
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  geo?: string;
  status?: string;
  metrics: Partial<Record<AlertMetricKey, number>>;
  /**
   * Micros. The ad group's max bid for ADGROUP scope, the campaign's lifetime
   * budget for CAMPAIGN scope, null where the scope has no numeric lever.
   */
  currentValue?: number | null;
  currency: string;
};

function testCondition(record: EntityRecord, c: Condition): boolean {
  const raw = record.metrics[c.metric];
  // A metric with no value (no clicks, no conversions, no configured conversion
  // value) must not be coerced to 0 — that would make "CPA < 10" match every
  // campaign that has never converted, which is the exact opposite of intent.
  if (raw === undefined) return false;
  const v = Number(raw);
  const t = Number(c.value);
  switch (c.operator) {
    case "GT": return v > t;
    case "GTE": return v >= t;
    case "LT": return v < t;
    case "LTE": return v <= t;
    case "EQ": return v === t;
    case "NEQ": return v !== t;
    case "BETWEEN": return v >= Math.min(t, Number(c.value2 ?? t)) && v <= Math.max(t, Number(c.value2 ?? t));
    default: return false;
  }
}

function matches(record: EntityRecord, rule: Rule): boolean {
  if (!rule.conditions.length) return false;
  return rule.match === "ANY"
    ? rule.conditions.some((c) => testCondition(record, c))
    : rule.conditions.every((c) => testCondition(record, c));
}

function clamp(v: number, action: Action): number {
  let out = v;
  if (action.minValue != null) out = Math.max(out, action.minValue);
  if (action.maxValue != null) out = Math.min(out, action.maxValue);
  return out;
}

/** Money is micros — round to whole micros, never to 2dp of a currency unit. */
const r2 = (n: number) => Math.round(n);

/** Compute the proposed new value + a human label for an action on a record. */
function resolveAction(record: EntityRecord, action: Action): { newValue: number | null; label: string; skip?: string } {
  const cur = record.currentValue ?? null;
  const ccy = record.currency;
  switch (action.type) {
    case "NOTIFY": return { newValue: null, label: "Report only" };
    case "PAUSE":
      if (record.status === "PAUSED") return { newValue: null, label: "Pause", skip: "already paused" };
      return { newValue: null, label: "Pause" };
    case "ENABLE":
      if (record.status === "ENABLED" || record.status === "RUNNING") return { newValue: null, label: "Resume", skip: "already active" };
      return { newValue: null, label: "Resume" };
    case "EXCLUDE_GEO":
      return { newValue: null, label: `Exclude ${record.geo || "region"}` };
    case "SET_BID":
    case "SET_BUDGET": {
      const nv = clamp(r2(Number(action.amount) || 0), action);
      const what = action.type === "SET_BID" ? "Bid" : "Budget";
      return { newValue: nv, label: cur != null ? `${what} ${money(ccy, cur)} → ${money(ccy, nv)}` : `Set ${what.toLowerCase()} ${money(ccy, nv)}` };
    }
    case "ADJUST_BID":
    case "ADJUST_BUDGET": {
      if (cur == null || cur <= 0) return { newValue: null, label: "Adjust (no current value)", skip: "current value unknown" };
      const pct = Number(action.amount) || 0;
      const nv = clamp(r2(cur * (1 + pct / 100)), action);
      if (nv === r2(cur)) return { newValue: nv, label: "No change after clamp", skip: "clamped to current" };
      const what = action.type === "ADJUST_BID" ? "Bid" : "Budget";
      return { newValue: nv, label: `${what} ${money(ccy, cur)} → ${money(ccy, nv)} (${pct >= 0 ? "+" : ""}${pct}%)` };
    }
    default: return { newValue: null, label: action.type };
  }
}

function metricSnapshot(record: EntityRecord): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record.metrics)) out[k] = Number(v) || 0;
  return out;
}

/**
 * Evaluate all rules against all records. First matching rule per entity wins
 * (rules are ordered), so an entity gets at most one suggestion.
 */
export function evaluateStrategy(records: EntityRecord[], rules: Rule[]): Suggestion[] {
  const out: Suggestion[] = [];
  const claimed = new Set<string>();

  rules.forEach((rule, ri) => {
    for (const record of records) {
      if (claimed.has(record.entityId)) continue;
      if (!matches(record, rule)) continue;
      claimed.add(record.entityId);

      const { newValue, label, skip } = resolveAction(record, rule.action);
      if (skip) continue; // e.g. already paused / no current value

      out.push({
        ruleName: rule.name || `Rule ${ri + 1}`,
        scope: record.scope,
        entityId: record.entityId,
        entityName: record.entityName,
        campaignId: record.campaignId,
        campaignName: record.campaignName,
        adGroupId: record.adGroupId,
        geo: record.geo,
        actionType: rule.action.type,
        actionLabel: label,
        currentValue: record.currentValue ?? null,
        newValue,        currency: record.currency,
        metrics: metricSnapshot(record),
        key: `${record.scope}:${record.entityId}:${rule.action.type}`,
      });
    }
  });

  return out;
}

/** Actions that make a real change (used to hide no-op "Report only" rows). */
export function isMutatingAction(type: ActionType): boolean {
  return type !== "NOTIFY";
}
