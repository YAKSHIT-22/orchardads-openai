/**
 * Budget pacing analysis.
 *
 * OpenAI Ads campaigns carry a REQUIRED LIFETIME budget and an OPTIONAL daily
 * limit, which makes pacing a genuinely different (and more consequential)
 * question than it was on a daily-budget platform:
 *
 *   Daily budget capped  -> you lose some volume today, and tomorrow resets.
 *   Lifetime budget gone -> the campaign STOPS. It does not come back on its own.
 *
 * So the headline output here is an exhaustion date, not a utilisation
 * percentage. All money is MICROS.
 */

export type PacingStatus = "exhausted" | "running_out" | "healthy" | "underspending";

export type PacingRow = {
  campaignId: string;
  name: string;
  budgetMicros: number;
  spendMicros: number;
  remainingMicros: number;
  dailyRateMicros: number;
  /** Days until the lifetime budget is consumed at the observed rate. */
  daysToExhaust: number;
  /** Days until the campaign's end date, when it has one. */
  daysRemaining: number | null;
  status: PacingStatus;
  verdict: string;
};

/** Below this share of budget consumed per remaining day, it's underspending. */
const UNDERSPEND_RATIO = 0.7;
/** Above this, it will run out before the end date. */
const RUNOUT_RATIO = 1.4;

export type PacingInput = {
  id: string;
  name: string;
  budgetMicros: number;
  spendMicros: number;
  /** Days of data the spend figure covers. */
  days: number;
  /** Days until the campaign's end date, if it has one. */
  daysRemaining?: number | null;
};

export function analyzePacing(campaigns: PacingInput[]): PacingRow[] {
  const out: PacingRow[] = [];

  for (const c of campaigns || []) {
    if (!c.budgetMicros || c.budgetMicros <= 0) continue;

    const remaining = Math.max(0, c.budgetMicros - c.spendMicros);
    const dailyRate = c.days > 0 ? c.spendMicros / c.days : 0;

    // A campaign with no spend has no observable rate; projecting from zero
    // would produce an infinite runway, which is worse than saying nothing.
    if (dailyRate <= 0) continue;

    const daysToExhaust = remaining / dailyRate;
    const daysRemaining = c.daysRemaining ?? null;

    let status: PacingStatus;
    let verdict: string;

    if (remaining <= 0) {
      status = "exhausted";
      verdict = "Budget spent — the campaign has stopped delivering.";
    } else if (daysRemaining === null) {
      // No end date: report the runway, don't invent a deadline to judge it by.
      status = daysToExhaust < 7 ? "running_out" : "healthy";
      verdict =
        daysToExhaust < 7
          ? `About ${Math.round(daysToExhaust)} days of budget left at the current rate.`
          : `About ${Math.round(daysToExhaust)} days of budget left.`;
    } else {
      const ratio = daysToExhaust / Math.max(1, daysRemaining);
      if (ratio < UNDERSPEND_RATIO) {
        status = "running_out";
        verdict = `Will stop about ${Math.round(daysRemaining - daysToExhaust)} days before the end date.`;
      } else if (ratio > RUNOUT_RATIO) {
        status = "underspending";
        const unspent = remaining - dailyRate * daysRemaining;
        verdict = `On track to leave roughly ${(unspent / 1_000_000).toFixed(2)} unspent.`;
      } else {
        status = "healthy";
        verdict = "Pacing to finish close to the end date.";
      }
    }

    out.push({
      campaignId: c.id,
      name: c.name,
      budgetMicros: c.budgetMicros,
      spendMicros: c.spendMicros,
      remainingMicros: remaining,
      dailyRateMicros: Math.round(dailyRate),
      daysToExhaust: Math.round(daysToExhaust),
      daysRemaining,
      status,
      verdict,
    });
  }

  // Most urgent first: the ones about to go dark.
  const order: Record<PacingStatus, number> = {
    exhausted: 0,
    running_out: 1,
    underspending: 2,
    healthy: 3,
  };
  return out.sort((a, b) => order[a.status] - order[b.status] || a.daysToExhaust - b.daysToExhaust);
}
