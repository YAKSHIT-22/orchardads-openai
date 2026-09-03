/**
 * Apple's native keyword bid recommendation, read from a keyword-report row.
 *
 * v5 keyword reports carry `insights.bidRecommendation.suggestedBidAmount`
 * (Money) — Apple's own suggested bid, based on historical performance. It is
 * `null` for keywords in Maximize-Conversions campaigns. This is separate from
 * our heuristic bid suggestions and, where present, should be preferred/shown.
 */

export type SuggestedBid = { amount: number; currency: string } | null;

/** Extract Apple's suggested bid from a keyword-report row, or null. */
export function readSuggestedBid(row: any): SuggestedBid {
  const s =
    row?.insights?.bidRecommendation?.suggestedBidAmount ??
    row?.metadata?.bidRecommendation?.suggestedBidAmount ??
    null;
  if (!s) return null;
  const amount = Number(s.amount);
  if (!(amount > 0)) return null;
  return { amount, currency: s.currency || "USD" };
}

/** Just the numeric suggested bid (or null). */
export function suggestedBidAmount(row: any): number | null {
  return readSuggestedBid(row)?.amount ?? null;
}
