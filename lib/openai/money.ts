/**
 * Money handling for the OpenAI Ads API.
 *
 * The API speaks MICROS — millionths of one unit of the ad account's currency.
 * From the ad-groups doc: "Micros are millionths of the main currency unit... a
 * $60 CPM ($0.06 per impression) is passed as 60000."
 *
 * Rules:
 *  - Store micros as BigInt. Never a float; 1e6 scaling plus IEEE754 loses cents
 *    on real budgets, and this is money that gets spent.
 *  - Convert at the display edge only.
 *  - Conversion *events* use a different unit (ISO-4217 minor units, e.g. 12999
 *    for $129.99). Do not mix the two — `minorToMicros` bridges them.
 */

export const MICROS_PER_UNIT = 1_000_000n;

/** Documented minimum campaign budget: 1,000,000 micros = 1.00 currency unit. */
export const MIN_CAMPAIGN_BUDGET_MICROS = 1_000_000n;

export function toMicros(units: number): bigint {
  if (!Number.isFinite(units)) throw new Error("toMicros: not a finite number");
  return BigInt(Math.round(units * 1_000_000));
}

export function fromMicros(micros: bigint | number | null | undefined): number {
  if (micros === null || micros === undefined) return 0;
  return Number(micros) / 1_000_000;
}

/** ISO-4217 minor units (cents) -> micros. Assumes a 2-decimal currency. */
export function minorToMicros(minor: bigint | number): bigint {
  return BigInt(minor) * 10_000n;
}

/** micros -> ISO-4217 minor units, rounded to the nearest minor unit. */
export function microsToMinor(micros: bigint): bigint {
  return (micros + 5_000n) / 10_000n;
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

/** Format micros in the account currency for display. */
export function formatMicros(
  micros: bigint | number | null | undefined,
  currency = "USD",
  { compact = false, maximumFractionDigits }: { compact?: boolean; maximumFractionDigits?: number } = {}
): string {
  const value = fromMicros(micros);
  const digits =
    maximumFractionDigits ?? (ZERO_DECIMAL.has(currency) ? 0 : Math.abs(value) >= 1000 ? 0 : 2);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: digits,
      minimumFractionDigits: compact ? 0 : digits,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** Apply a signed percentage change to a micros amount, rounding to whole micros. */
export function applyPercent(micros: bigint, percent: number): bigint {
  const scaled = (micros * BigInt(Math.round(percent * 10_000))) / 1_000_000n;
  return micros + scaled;
}

export function percentChange(from: bigint, to: bigint): number {
  if (from === 0n) return to === 0n ? 0 : 100;
  return (Number(to - from) / Number(from)) * 100;
}
