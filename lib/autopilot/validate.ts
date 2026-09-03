/**
 * Server-side validation for strategy rules. Ensures stored JSON matches the
 * Rule shape and that each action is allowed for the chosen scope.
 */

import { ALERT_METRIC_KEYS } from "@/lib/alerts/metrics";
import { scopeDef } from "./scopes";
import type { StrategyScope, Rule, Condition } from "./types";

const OPERATORS = new Set(["GT", "LT", "GTE", "LTE", "EQ", "NEQ", "BETWEEN"]);

export function validateRules(scope: StrategyScope, rules: unknown): { ok: true; rules: Rule[] } | { ok: false; error: string } {
  const def = scopeDef(scope);
  if (!def) return { ok: false, error: "Invalid scope" };
  if (!Array.isArray(rules) || rules.length === 0) return { ok: false, error: "Add at least one rule" };

  const clean: Rule[] = [];
  for (const raw of rules as any[]) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Malformed rule" };
    const conditions = Array.isArray(raw.conditions) ? raw.conditions : [];
    if (conditions.length === 0) return { ok: false, error: "Each rule needs at least one condition" };

    const cleanConds: Condition[] = [];
    for (const c of conditions) {
      if (!ALERT_METRIC_KEYS.includes(c?.metric)) return { ok: false, error: `Invalid metric: ${c?.metric}` };
      if (!OPERATORS.has(c?.operator)) return { ok: false, error: `Invalid operator: ${c?.operator}` };
      if (c?.value === undefined || c?.value === null || Number.isNaN(Number(c.value))) return { ok: false, error: "Condition value must be a number" };
      cleanConds.push({
        metric: c.metric, operator: c.operator, value: Number(c.value),
        ...(c.operator === "BETWEEN" ? { value2: Number(c.value2) } : {}),
      });
    }

    const action = raw.action;
    if (!action || !def.actions.includes(action.type)) {
      return { ok: false, error: `Action "${action?.type}" isn't allowed on ${def.label} scope` };
    }
    const needsAmount = ["SET_BID", "ADJUST_BID", "SET_BUDGET", "ADJUST_BUDGET"].includes(action.type);
    if (needsAmount && (action.amount === undefined || Number.isNaN(Number(action.amount)))) {
      return { ok: false, error: "This action needs an amount" };
    }

    clean.push({
      name: typeof raw.name === "string" ? raw.name.slice(0, 80) : undefined,
      match: raw.match === "ANY" ? "ANY" : "ALL",
      conditions: cleanConds,
      action: {
        type: action.type,
        ...(needsAmount ? { amount: Number(action.amount) } : {}),
        ...(action.minValue != null ? { minValue: Number(action.minValue) } : {}),
        ...(action.maxValue != null ? { maxValue: Number(action.maxValue) } : {}),
      },
    });
  }
  return { ok: true, rules: clean };
}
