/**
 * Time handling for the OpenAI Ads API.
 *
 * Three shapes matter:
 *  - entity timestamps (`created_at`, `start_time`, `end_time`) are Unix SECONDS
 *  - insights `time_ranges[]` accept `unix_range`, `hour_range` (YYYY-MM-DDTHH)
 *    or `date_range` (YYYY-MM-DD), each optionally carrying an IANA timezone
 *  - spend-limit windows use plain `YYYY-MM-DD` date strings
 *
 * Documented bounds: range bounds must be within the past 5 years and can never
 * be in the future; the API normalizes them to full-hour boundaries. Campaign
 * start/end timestamps must fall between 946684800 (2000-01-01) and 4102444800
 * (2100-01-01).
 *
 * Everything is rendered in the AD ACCOUNT's timezone, not the browser's — an
 * advertiser reading "yesterday's spend" means yesterday where their account
 * bills, and getting that wrong silently shifts every daily number.
 */

export const MIN_CAMPAIGN_UNIX = 946_684_800;
export const MAX_CAMPAIGN_UNIX = 4_102_444_800;

export function toUnix(d: Date | number | string): number {
  const date = d instanceof Date ? d : new Date(d);
  return Math.floor(date.getTime() / 1000);
}

export function fromUnix(seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000);
}

/** Clamp a campaign timestamp into the documented accepted range. */
export function clampCampaignUnix(seconds: number): number {
  return Math.min(Math.max(Math.floor(seconds), MIN_CAMPAIGN_UNIX), MAX_CAMPAIGN_UNIX);
}

/** YYYY-MM-DD in a given IANA timezone (defaults to the account's). */
export function ymdIn(date: Date, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date in the account timezone. */
export function todayIn(timeZone = "UTC"): string {
  return ymdIn(new Date(), timeZone);
}

/** N days ago, as YYYY-MM-DD in the account timezone. */
export function daysAgoIn(days: number, timeZone = "UTC"): string {
  return ymdIn(new Date(Date.now() - days * 86_400_000), timeZone);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Format a date/timestamp for display in the account's timezone. */
export function formatInAccountTz(
  value: Date | number | string | null | undefined,
  timeZone = "UTC",
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  if (value === null || value === undefined) return "—";
  const date =
    typeof value === "number" ? new Date(value * 1000) : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, ...opts }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Relative "3 days ago" / "in 2 weeks" for sync status and pacing copy. */
export function relativeTime(value: Date | number | string | null | undefined): string {
  if (value === null || value === undefined) return "never";
  const date =
    typeof value === "number" ? new Date(value * 1000) : value instanceof Date ? value : new Date(value);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, sec] of units) {
    if (Math.abs(diffSec) >= sec) return rtf.format(Math.round(diffSec / sec), unit);
  }
  return rtf.format(diffSec, "second");
}

/** Inclusive list of YYYY-MM-DD dates, used to fill gaps in sparse fact rows. */
export function eachDay(since: string, until: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  while (t <= end) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}
