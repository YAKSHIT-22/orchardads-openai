/**
 * Client-side budget/bid sanity limits for the campaign builder.
 *
 * Apple's API does NOT publish a per-currency minimum-bid table — it enforces
 * minimums server-side and rejects out-of-range values. The one hard, DOCUMENTED
 * relationship is: a campaign's dailyBudgetAmount must be >= each ad group's
 * defaultBidAmount (see docs/apple-ads-platform-plan.md). We enforce that and a
 * positive floor here so the obvious "min not in range" cases are caught before
 * submission; anything subtler still surfaces as Apple's own error.
 */

/** Absolute positive floor for any money field (Apple rejects <= 0). */
export const MIN_MONEY = 0.01;
/** Practical minimum daily budget we default/hint to. */
export const MIN_DAILY_BUDGET = 0.1;

export interface AdGroupBidCheck {
  label: string;
  defaultBid: number;
  cpaGoal?: number | null;
}

/**
 * Validate the campaign daily budget against its ad groups' bids/CPA goals.
 * Returns human-readable issues (empty = OK). Currency-agnostic (amounts are
 * already in the org currency).
 */
export function validateBudgetBids(dailyBudget: number, adGroups: AdGroupBidCheck[]): string[] {
  const issues: string[] = [];

  if (!(dailyBudget > 0)) {
    issues.push("Daily budget must be greater than 0.");
    return issues; // nothing else is meaningful without a budget
  }

  for (const ag of adGroups) {
    if (!(ag.defaultBid > 0)) {
      issues.push(`${ag.label}: default bid must be greater than 0.`);
      continue;
    }
    // Documented Apple rule: daily budget >= ad group default bid.
    if (ag.defaultBid > dailyBudget) {
      issues.push(
        `${ag.label}: default bid (${ag.defaultBid}) can't exceed the campaign daily budget (${dailyBudget}). Lower the bid or raise the daily budget.`
      );
    }
    if (ag.cpaGoal != null && ag.cpaGoal > 0 && ag.cpaGoal < ag.defaultBid) {
      issues.push(`${ag.label}: CPA goal (${ag.cpaGoal}) is below the default bid (${ag.defaultBid}) — a CPA goal should be at least the bid.`);
    }
  }

  return issues;
}
