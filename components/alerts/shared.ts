/**
 * Shared client-side types + formatting helpers for Orchard Watch (alerts).
 * Mirrors the shapes returned by /api/alerts and /api/alerts/events — no logic
 * from lib/alerts is duplicated here beyond display formatting.
 */

import { metricDef } from "@/lib/alerts/metrics";
import { money } from "@/lib/format";

export type AlertKind = "METRIC" | "BUDGET" | "ANOMALY";
export type AlertScope = "ACCOUNT" | "CAMPAIGN" | "ADGROUP" | "AD";
export type AlertComparator = "ABOVE" | "BELOW" | "CHANGE_UP" | "CHANGE_DOWN";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertAction = "NOTIFY" | "PAUSE";
export type EventStatus = "NEW" | "READ" | "SNOOZED" | "DISMISSED";

export type Alert = {
  id: string;
  name: string;
  kind: AlertKind;
  scope: AlertScope;
  campaignId: string | null;
  campaignName: string | null;
  metric: string | null;
  comparator: AlertComparator | null;
  threshold: number | null;
  comparePeriodDays: number;
  lookbackDays: number;
  offsetDays: number;
  sensitivity: number | null;
  action: AlertAction;
  severity: AlertSeverity;
  notifyEmail: boolean;
  enabled: boolean;
  isDefault: boolean;
  lastRunAt: string | null;
  lastTriggeredAt: string | null;
};

export type AlertEvent = {
  id: string;
  alert: { name: string; kind: AlertKind } | null;
  entityName: string;
  entityType: AlertScope;
  metric: string;
  value: number;
  baseline: number | null;
  threshold: number | null;
  changePct: number | null;
  currency: string | null;
  severity: AlertSeverity;
  status: EventStatus;
  snoozedUntil: string | null;
  message: string;
  actionTaken: string | null;
  createdAt: string;
  effectiveSnoozed: boolean;
};

export const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; dot: string; stripe: string; badge: string }
> = {
  INFO: {
    label: "Info",
    dot: "bg-sky-500",
    stripe: "bg-sky-500",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  WARNING: {
    label: "Warning",
    dot: "bg-amber-500",
    stripe: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  CRITICAL: {
    label: "Critical",
    dot: "bg-rose-500",
    stripe: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
};

export const KIND_META: Record<AlertKind, { label: string; badge: string }> = {
  METRIC: { label: "Metric", badge: "border-primary/30 bg-primary/10 text-primary" },
  BUDGET: { label: "Budget", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  ANOMALY: { label: "Anomaly", badge: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400" },
};

export const SCOPE_LABEL: Record<AlertScope, string> = {
  ACCOUNT: "Account",
  CAMPAIGN: "Campaign",
  ADGROUP: "Ad group",
  AD: "Ad",
};

/** "just now" / "5m ago" / "3h ago" / "2d ago" / "Mar 4". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a metric value for display using the metric catalog's unit. */
export function fmtMetricValue(metric: string, value: number, currency: string | null): string {
  const def = metricDef(metric);
  const cur = currency || "USD";
  if (def?.unit === "money") return money(cur, value);
  if (def?.unit === "rate") return `${(value * 100).toFixed(2)}%`;
  return Math.round(value).toLocaleString();
}

/** The headline value for an event row (budget events show pace, others the metric). */
export function eventValue(e: AlertEvent): string {
  if (e.alert?.kind === "BUDGET") {
    return e.changePct != null
      ? `${Math.round(e.changePct)}% pace`
      : fmtMetricValue(e.metric, e.value, e.currency);
  }
  let out = fmtMetricValue(e.metric, e.value, e.currency);
  if (e.changePct != null) {
    out += ` (${e.changePct >= 0 ? "+" : ""}${e.changePct.toFixed(0)}%)`;
  }
  return out;
}

/** Human label for what the run did about a firing. */
export function actionTakenLabel(actionTaken: string | null): string | null {
  if (!actionTaken) return null;
  if (actionTaken === "PAUSED") return "Paused";
  if (actionTaken === "PAUSE_FAILED") return "Pause failed";
  if (actionTaken === "NOTIFY") return "Notified";
  return actionTaken;
}
