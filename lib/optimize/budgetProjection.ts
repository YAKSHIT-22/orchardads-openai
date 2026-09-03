/**
 * Budget projection & pacing — a real forecasting model, not just avg-vs-budget.
 *
 * Adapted from standard PPC budget-analysis practice to Apple Search Ads (which
 * bills on a daily budget; LOC accounts also have monthly budget orders). For a
 * chosen cycle (calendar month by default) it computes month-to-date spend, a
 * run-rate projection to cycle end, the pace vs target, and a pacing status with
 * dynamic thresholds that tighten as the cycle progresses.
 */

export type PacingState = "on_track" | "overpacing" | "underpacing" | "no_budget";

export type DailySpend = { date: string; spend: number };

export type BudgetProjectionRow = {
  campaignId: string;
  campaignName: string;
  currency: string;
  /** Daily budget from the campaign. */
  dailyBudget: number;
  /** Target spend for the whole cycle (dailyBudget × days in cycle, or an explicit monthly budget). */
  cycleTarget: number;
  /** Spend so far this cycle. */
  spentToDate: number;
  /** Average spend per elapsed day. */
  runRate: number;
  /** Projected total spend at cycle end at the current run rate. */
  projectedSpend: number;
  /** projectedSpend / cycleTarget (1 = exactly on target). */
  pace: number;
  /** Even daily spend that would hit the target exactly. */
  idealDaily: number;
  /** Spend the remaining days require to land exactly on target. */
  requiredDaily: number;
  daysElapsed: number;
  daysRemaining: number;
  daysInCycle: number;
  state: PacingState;
  /** Signed money delta vs target (projected − target); + = over, − = under. */
  projectedDelta: number;
  suggestion: string;
};

export type CycleInfo = { start: Date; end: Date; daysInCycle: number; daysElapsed: number; daysRemaining: number };

/** The calendar-month cycle containing `now` (defaults to today, UTC-safe by date string). */
export function monthCycle(now = new Date()): CycleInfo {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0); // last day of month
  const daysInCycle = end.getDate();
  const daysElapsed = Math.min(daysInCycle, now.getDate()); // includes today
  const daysRemaining = Math.max(0, daysInCycle - daysElapsed);
  return { start, end, daysInCycle, daysElapsed, daysRemaining };
}

/**
 * Dynamic pacing thresholds: early in the cycle we tolerate a wide band
 * (±25%), tightening linearly to ±1% by the last day — so an early
 * "underpacing" flag means a *projected* shortfall, not a current gap.
 */
function paceBand(cycleProgress: number): { low: number; high: number } {
  const p = Math.min(1, Math.max(0, cycleProgress));
  const tol = 0.25 - (0.25 - 0.01) * p; // 0.25 → 0.01
  return { low: 1 - tol, high: 1 + tol };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Project pacing for each campaign over the cycle.
 * @param campaigns  id/name/dailyBudget(+currency) and optional explicit monthlyBudget (LOC budget order).
 * @param spendByCampaign  cycle-to-date spend per campaignId (sum of daily spend since cycle start).
 * @param cycle  the cycle window (defaults to the current calendar month).
 */
export function projectBudgets(
  campaigns: { id: string | number; name: string; dailyBudget: number; currency: string; monthlyBudget?: number | null }[],
  spendByCampaign: Map<string, number>,
  cycle: CycleInfo = monthCycle()
): BudgetProjectionRow[] {
  const { daysInCycle, daysElapsed, daysRemaining } = cycle;
  const progress = daysInCycle > 0 ? daysElapsed / daysInCycle : 0;
  const band = paceBand(progress);

  const rows: BudgetProjectionRow[] = campaigns.map((c) => {
    const id = String(c.id);
    const dailyBudget = Number(c.dailyBudget) || 0;
    const cycleTarget = c.monthlyBudget && c.monthlyBudget > 0 ? c.monthlyBudget : dailyBudget * daysInCycle;
    const spentToDate = spendByCampaign.get(id) || 0;
    const runRate = daysElapsed > 0 ? spentToDate / daysElapsed : 0;
    const projectedSpend = spentToDate + runRate * daysRemaining;
    const pace = cycleTarget > 0 ? projectedSpend / cycleTarget : 0;
    const idealDaily = daysInCycle > 0 ? cycleTarget / daysInCycle : 0;
    const requiredDaily = daysRemaining > 0 ? Math.max(0, cycleTarget - spentToDate) / daysRemaining : 0;

    let state: PacingState;
    if (cycleTarget <= 0) state = "no_budget";
    else if (pace > band.high) state = "overpacing";
    else if (pace < band.low) state = "underpacing";
    else state = "on_track";

    let suggestion: string;
    if (state === "no_budget") suggestion = "No budget set — add a daily budget to pace it.";
    else if (state === "overpacing") suggestion = `Projected to overspend by ${Math.round((pace - 1) * 100)}% — lower the daily budget or bids.`;
    else if (state === "underpacing") suggestion = `Projected to hit only ${Math.round(pace * 100)}% of target — raise bids or broaden targeting to spend it.`;
    else suggestion = "Pacing on target.";

    return {
      campaignId: id, campaignName: c.name, currency: c.currency,
      dailyBudget: r2(dailyBudget), cycleTarget: r2(cycleTarget), spentToDate: r2(spentToDate),
      runRate: r2(runRate), projectedSpend: r2(projectedSpend), pace: Math.round(pace * 1000) / 1000,
      idealDaily: r2(idealDaily), requiredDaily: r2(requiredDaily),
      daysElapsed, daysRemaining, daysInCycle,
      state, projectedDelta: r2(projectedSpend - cycleTarget), suggestion,
    };
  });

  // Worst offenders first: overpacers by how far over, then underpacers.
  const rank: Record<PacingState, number> = { overpacing: 0, underpacing: 1, on_track: 2, no_budget: 3 };
  rows.sort((a, b) => rank[a.state] - rank[b.state] || Math.abs(b.pace - 1) - Math.abs(a.pace - 1));
  return rows;
}

/** Account-level roll-up across campaigns. */
export function accountPacing(rows: BudgetProjectionRow[]): {
  currency: string; cycleTarget: number; spentToDate: number; projectedSpend: number; pace: number;
  overpacing: number; underpacing: number; onTrack: number;
} {
  const currency = rows[0]?.currency || "USD";
  const sum = (f: (r: BudgetProjectionRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const cycleTarget = sum((r) => r.cycleTarget);
  const projectedSpend = sum((r) => r.projectedSpend);
  return {
    currency,
    cycleTarget: r2(cycleTarget),
    spentToDate: r2(sum((r) => r.spentToDate)),
    projectedSpend: r2(projectedSpend),
    pace: cycleTarget > 0 ? Math.round((projectedSpend / cycleTarget) * 1000) / 1000 : 0,
    overpacing: rows.filter((r) => r.state === "overpacing").length,
    underpacing: rows.filter((r) => r.state === "underpacing").length,
    onTrack: rows.filter((r) => r.state === "on_track").length,
  };
}
