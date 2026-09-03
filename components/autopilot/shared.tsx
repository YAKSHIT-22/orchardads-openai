"use client";

/**
 * Shared types + helpers for the Autopilot tool UI.
 *
 * Value units: money & count condition values are stored as entered; rate
 * metrics (CTR, conversion rate) are stored as fractions server-side, so the
 * UI shows/accepts percents and converts on the way in/out (mirrors alerts).
 * ADJUST_* action amounts are plain percents, SET_* amounts are currency.
 */

import { money } from "@/lib/format";
import { ALERT_METRICS, metricDef, type AlertMetricKey } from "@/lib/alerts/metrics";
import { OPERATORS, ACTION_META, scopeDef } from "@/lib/autopilot/scopes";
import type { Rule, Condition, ActionType, ConditionOperator, StrategyScope } from "@/lib/autopilot/types";

/* ── API row shapes ────────────────────────────────────────────────────────── */

export type StrategyRow = {
  id: string;
  name: string;
  description: string | null;
  scope: StrategyScope;
  campaignIds: string[];
  lookbackDays: number;
  rules: Rule[];
  automated: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  autoApply: boolean;
  notifyEmail: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  _count?: { runs: number };
};

export type RunRow = {
  id: string;
  mode: "PREVIEW" | "APPLY" | "AUTO";
  matchedCount: number;
  appliedCount: number;
  failedCount: number;
  createdAt: string;
  error: string | null;
};

/* ── Builder form model (numbers kept as strings while typing) ─────────────── */

export type CondForm = {
  metric: AlertMetricKey;
  operator: ConditionOperator;
  value: string;
  value2: string;
};

export type RuleForm = {
  name: string;
  match: "ALL" | "ANY";
  conditions: CondForm[];
  actionType: ActionType;
  amount: string;
  minValue: string;
  maxValue: string;
};

export type StrategyForm = {
  name: string;
  description: string;
  scope: StrategyScope;
  lookbackDays: string;
  campaignIds: string[];
  rules: RuleForm[];
  automated: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  autoApply: boolean;
  notifyEmail: boolean;
};

export const emptyCondition = (): CondForm => ({ metric: "SPEND", operator: "GT", value: "", value2: "" });

export function emptyRule(scope: StrategyScope): RuleForm {
  const actions = scopeDef(scope)?.actions || ["NOTIFY"];
  return {
    name: "",
    match: "ALL",
    conditions: [emptyCondition()],
    actionType: actions[0],
    amount: "",
    minValue: "",
    maxValue: "",
  };
}

export const defaultForm = (): StrategyForm => ({
  name: "",
  description: "",
  scope: "ADGROUP",
  lookbackDays: "30",
  campaignIds: [],
  rules: [emptyRule("ADGROUP")],
  automated: false,
  frequency: "WEEKLY",
  autoApply: false,
  notifyEmail: false,
});

/* ── Unit conversion (rate metrics are fractions on the API) ───────────────── */

const isRate = (metric: string) => metricDef(metric)?.unit === "rate";

/** Percent typed by the user → fraction for the API (rate metrics only). */
export function toApiConditionValue(metric: string, raw: string): number {
  const n = Number(raw);
  return isRate(metric) ? n / 100 : n;
}

/** Fraction from the API → percent string for the form (rate metrics only). */
export function fromApiConditionValue(metric: string, value: number | undefined | null): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return isRate(metric) ? String(parseFloat((Number(value) * 100).toFixed(4))) : String(value);
}

/** Rules formatted for POSTing — converts condition values per metric unit. */
export function toApiRules(rules: RuleForm[]): Rule[] {
  return rules.map((r) => {
    const meta = ACTION_META[r.actionType];
    const action: Rule["action"] = { type: r.actionType };
    if (meta?.needsAmount) action.amount = Number(r.amount);
    if (r.minValue.trim() !== "" && !Number.isNaN(Number(r.minValue))) action.minValue = Number(r.minValue);
    if (r.maxValue.trim() !== "" && !Number.isNaN(Number(r.maxValue))) action.maxValue = Number(r.maxValue);
    return {
      ...(r.name.trim() ? { name: r.name.trim() } : {}),
      match: r.match,
      conditions: r.conditions.map((c) => ({
        metric: c.metric,
        operator: c.operator,
        value: toApiConditionValue(c.metric, c.value),
        ...(c.operator === "BETWEEN" ? { value2: toApiConditionValue(c.metric, c.value2) } : {}),
      })),
      action,
    };
  });
}

/** Saved rules → form model, re-expanding rate fractions to percents. */
export function fromApiRules(rules: Rule[], scope: StrategyScope): RuleForm[] {
  if (!Array.isArray(rules) || rules.length === 0) return [emptyRule(scope)];
  return rules.map((r) => ({
    name: r.name || "",
    match: r.match === "ANY" ? "ANY" : "ALL",
    conditions: (r.conditions || []).map((c: Condition) => ({
      metric: c.metric,
      operator: c.operator,
      value: fromApiConditionValue(c.metric, c.value),
      value2: c.operator === "BETWEEN" ? fromApiConditionValue(c.metric, c.value2) : "",
    })),
    actionType: r.action?.type || "NOTIFY",
    amount: r.action?.amount != null ? String(r.action.amount) : "",
    minValue: r.action?.minValue != null ? String(r.action.minValue) : "",
    maxValue: r.action?.maxValue != null ? String(r.action.maxValue) : "",
  }));
}

/* ── Plain-language sentences ──────────────────────────────────────────────── */

/** Format a threshold for display, given the metric's unit. */
export function fmtMetricValue(metric: string, value: number, currency: string): string {
  const def = metricDef(metric);
  if (!def) return String(value);
  if (def.unit === "money") return money(currency || "USD", value);
  if (def.unit === "rate") return `${parseFloat((value * 100).toFixed(2))}%`;
  return Math.round(value).toLocaleString();
}

const opSymbol = (op: ConditionOperator) => OPERATORS.find((o) => o.key === op)?.symbol || op;

/** "CPA > USD 8.00" — from an API-unit condition. */
function conditionPhrase(c: Condition, currency: string): string {
  const label = metricDef(c.metric)?.label || c.metric;
  if (c.operator === "BETWEEN") {
    return `${label} between ${fmtMetricValue(c.metric, c.value, currency)} and ${fmtMetricValue(c.metric, c.value2 ?? 0, currency)}`;
  }
  return `${label} ${opSymbol(c.operator)} ${fmtMetricValue(c.metric, c.value, currency)}`;
}

/** "lower bid 20% (min USD 0.10)" — from an API-unit action. */
export function actionPhrase(action: Rule["action"], currency: string): string {
  const meta = ACTION_META[action.type];
  if (!meta) return action.type;
  let base: string;
  switch (action.type) {
    case "ADJUST_BID":
    case "ADJUST_BUDGET": {
      const pct = Math.abs(Number(action.amount) || 0);
      const noun = action.type === "ADJUST_BID" ? "bid" : "daily budget";
      base = `${(Number(action.amount) || 0) < 0 ? "lower" : "raise"} ${noun} ${pct}%`;
      break;
    }
    case "SET_BID":
      base = `set bid to ${money(currency || "USD", Number(action.amount) || 0)}`;
      break;
    case "SET_BUDGET":
      base = `set daily budget to ${money(currency || "USD", Number(action.amount) || 0)}`;
      break;
    case "PAUSE":
      base = "pause";
      break;
    case "ENABLE":
      base = "resume";
      break;
    case "EXCLUDE_GEO":
      base = "exclude country";
      break;
    default:
      base = "report only";
  }
  const clamps: string[] = [];
  if (action.minValue != null) clamps.push(`min ${money(currency || "USD", action.minValue)}`);
  if (action.maxValue != null) clamps.push(`max ${money(currency || "USD", action.maxValue)}`);
  return clamps.length ? `${base} (${clamps.join(", ")})` : base;
}

/** Full sentence for an API-unit rule: "If CPA > $8 AND clicks >= 10, lower bid 20%". */
export function ruleSentence(rule: Rule, currency: string): string {
  const joiner = rule.match === "ANY" ? " OR " : " AND ";
  const conds = (rule.conditions || []).map((c) => conditionPhrase(c, currency)).join(joiner);
  return `If ${conds || "…"} → ${actionPhrase(rule.action, currency)}`;
}

/** Live sentence for a rule still being edited (form units). */
export function ruleFormSentence(rule: RuleForm, currency: string): string {
  const complete = rule.conditions.filter((c) => c.value.trim() !== "" && !Number.isNaN(Number(c.value)));
  const joiner = rule.match === "ANY" ? " OR " : " AND ";
  const conds = complete
    .map((c) =>
      conditionPhrase(
        {
          metric: c.metric,
          operator: c.operator,
          value: toApiConditionValue(c.metric, c.value),
          ...(c.operator === "BETWEEN" ? { value2: toApiConditionValue(c.metric, c.value2 || "0") } : {}),
        },
        currency
      )
    )
    .join(joiner);
  const meta = ACTION_META[rule.actionType];
  const action: Rule["action"] = { type: rule.actionType };
  if (meta?.needsAmount && rule.amount.trim() !== "") action.amount = Number(rule.amount);
  if (rule.minValue.trim() !== "") action.minValue = Number(rule.minValue);
  if (rule.maxValue.trim() !== "") action.maxValue = Number(rule.maxValue);
  return `If ${conds || "…"} → ${actionPhrase(action, currency)}`;
}

/** One-line summary for the strategy list. */
export function strategySummary(s: StrategyRow, currency: string): string {
  const rules = Array.isArray(s.rules) ? s.rules : [];
  if (rules.length === 0) return "No rules";
  const first = ruleSentence(rules[0], currency);
  return rules.length > 1 ? `${first} · +${rules.length - 1} more rule${rules.length > 2 ? "s" : ""}` : first;
}

/* ── Action badge styling ──────────────────────────────────────────────────── */

export const ACTION_BADGE: Record<ActionType, string> = {
  NOTIFY: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400",
  PAUSE: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ENABLE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  SET_BID: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  ADJUST_BID: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  SET_BUDGET: "border-primary/30 bg-primary/10 text-primary",
  ADJUST_BUDGET: "border-primary/30 bg-primary/10 text-primary",
  EXCLUDE_GEO: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export const ACTION_SHORT: Record<ActionType, string> = {
  NOTIFY: "Report",
  PAUSE: "Pause",
  ENABLE: "Resume",
  SET_BID: "Set bid",
  ADJUST_BID: "Adjust bid",
  SET_BUDGET: "Set budget",
  ADJUST_BUDGET: "Adjust budget",
  EXCLUDE_GEO: "Exclude geo",
};

export const FREQUENCY_LABEL: Record<StrategyRow["frequency"], string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

/* ── Dates ─────────────────────────────────────────────────────────────────── */

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Never";

/* ── Metric cells for the suggestions table ────────────────────────────────── */

export const SUGGESTION_METRICS: { key: AlertMetricKey; label: string }[] = [
  { key: "SPEND", label: "Spend" },
  { key: "CONVERSIONS", label: "Conversions" },
  { key: "CLICKS", label: "Clicks" },
  { key: "CPA", label: "CPA" },
];

export { ALERT_METRICS, metricDef, OPERATORS, ACTION_META, scopeDef };
