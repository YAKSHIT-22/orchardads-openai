/**
 * Display formatting.
 *
 * The OpenAI Ads API speaks MICROS (millionths of one currency unit), and this
 * codebase stores money as micros end to end so that arithmetic on live budgets
 * never loses cents to floating point. Formatting is the ONLY place micros turn
 * into a human number — hence `money()` taking micros, not units.
 */

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

/** Format micros as currency, e.g. `money("USD", 12_500_000)` -> "$12.50". */
export function money(currency: string, micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return "—";
  const value = micros / 1_000_000;
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** Compact currency for tight spaces, e.g. "$12.5k". */
export function moneyCompact(currency: string, micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return "—";
  const value = micros / 1_000_000;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

/** Format a plain currency amount that is already in units, not micros. */
export function moneyUnits(currency: string, amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return money(currency, amount * 1_000_000);
}

/** Whole-number counts (impressions, clicks, conversions). */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString();
}

/**
 * A rate expressed 0..1 as a percentage.
 *
 * Null renders as an em dash rather than "0.00%": a campaign with no clicks has
 * no conversion rate, and showing 0% would read as "it converts terribly"
 * instead of "there is nothing to measure yet".
 */
export function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** A multiplier, e.g. ROAS "3.92x". */
export function ratio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}x`;
}

/** Signed percentage change for deltas, e.g. "+12.4%". */
export function delta(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/** Micros to a plain number of currency units, for charts and calculations. */
export function toUnits(micros: number | null | undefined): number {
  return micros ? micros / 1_000_000 : 0;
}
