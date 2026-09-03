/**
 * Shared date-range resolver for the dashboard and the public shared view.
 *
 * Apple's report API takes an inclusive [startTime, endTime] (YYYY-MM-DD), so
 * "last N days" must be [today-(N-1), today] = exactly N days (the old code used
 * [today-N, today] = N+1 days, hence "last 7 days" showed 8 days).
 *
 * Dates are computed in UTC for consistency with the rest of the app (which
 * formats report dates via toISOString().slice(0,10)).
 */

export type DateRangeKey =
  | "today" | "yesterday"
  | "7d" | "14d" | "30d" | "90d"
  | "thisMonth" | "lastMonth" | "thisYear"
  | "custom";

export const DATE_RANGE_PRESETS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" },
  { key: "custom", label: "Custom range" },
];

/** Relative presets valid for a live shared dashboard (custom is excluded — a
 *  share stays live, so it uses relative ranges that recompute on each view). */
export const SHARE_DATE_RANGES: DateRangeKey[] = [
  "7d", "14d", "30d", "90d", "thisMonth", "lastMonth", "thisYear",
];

const MS_DAY = 86400000;
const isoUTC = (d: Date) => d.toISOString().slice(0, 10);
const todayUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
const inclusiveDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MS_DAY) + 1;

export function rangeLabel(key: string): string {
  return DATE_RANGE_PRESETS.find((p) => p.key === key)?.label ?? "Last 30 days";
}

export type Granularity = "DAILY" | "WEEKLY" | "MONTHLY";

/**
 * Apple rejects a DAILY report whose range exceeds ~90 days
 * ("Date range … is not valid for granularity DAILY"). Pick the finest
 * granularity that's valid for a range of `days` so charts still render over
 * long windows (e.g. "This year" → WEEKLY buckets).
 */
export function granularityForRange(days: number): Granularity {
  if (days <= 90) return "DAILY";
  if (days <= 372) return "WEEKLY";
  return "MONTHLY";
}

export interface ResolvedRange {
  startTime: string;
  endTime: string;
  /** Inclusive number of days in the range — used for avg-daily / pacing math. */
  days: number;
  label: string;
}

/**
 * Resolve a range key (+ optional custom dates) into inclusive start/end + day
 * count. Unknown keys fall back to the last 30 days.
 */
export function resolveDateRange(key: string, custom?: { start?: string; end?: string }): ResolvedRange {
  const today = todayUTC();

  const lastN = (n: number): ResolvedRange => {
    const start = addDays(today, -(n - 1));
    return { startTime: isoUTC(start), endTime: isoUTC(today), days: n, label: rangeLabel(key) };
  };

  switch (key) {
    case "today":
      return { startTime: isoUTC(today), endTime: isoUTC(today), days: 1, label: "Today" };
    case "yesterday": {
      const y = addDays(today, -1);
      return { startTime: isoUTC(y), endTime: isoUTC(y), days: 1, label: "Yesterday" };
    }
    case "7d": return lastN(7);
    case "14d": return lastN(14);
    case "90d": return lastN(90);
    case "thisMonth": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { startTime: isoUTC(start), endTime: isoUTC(today), days: inclusiveDays(start, today), label: "This month" };
    }
    case "lastMonth": {
      const firstThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const end = addDays(firstThis, -1);
      const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      return { startTime: isoUTC(start), endTime: isoUTC(end), days: inclusiveDays(start, end), label: "Last month" };
    }
    case "thisYear": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { startTime: isoUTC(start), endTime: isoUTC(today), days: inclusiveDays(start, today), label: "This year" };
    }
    case "custom": {
      const s = custom?.start;
      const e = custom?.end;
      if (s && e && !isNaN(Date.parse(s)) && !isNaN(Date.parse(e))) {
        const start = new Date(s);
        const end = new Date(e);
        const [lo, hi] = start <= end ? [start, end] : [end, start];
        return { startTime: isoUTC(lo), endTime: isoUTC(hi), days: Math.max(1, inclusiveDays(lo, hi)), label: "Custom range" };
      }
      return lastN(30);
    }
    case "30d":
    default:
      return lastN(30);
  }
}
