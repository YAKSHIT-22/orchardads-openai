/**
 * Keyword bid optimization suggestions.
 *
 * Pure logic: given keyword-report rows and each keyword's current bid, suggest
 * a new bid that moves CPA toward the user's target — raise bids on efficient
 * keywords to capture volume, cut bids on expensive or non-converting ones.
 */

export type BidConfig = {
  /** Target cost-per-install (account currency). */
  targetCpa: number;
  /** Minimum clicks before a zero-install keyword is judged (avoids noise). */
  minTaps: number;
  /** Bid change is clamped to ±this fraction (0.5 = ±50%). */
  maxChange: number;
};

export const DEFAULT_BID_CONFIG: BidConfig = { targetCpa: 5, minTaps: 5, maxChange: 0.5 };

export type BidSuggestion = {
  keywordId: string;
  keyword: string;
  currentBid: number;
  suggestedBid: number;
  currency: string;
  clicks: number;
  conversions: number;
  cpa: number | null;
  changePct: number; // e.g. -0.2 = cut 20%
  direction: "raise" | "lower" | "hold";
  reason: string;
};

function readMetrics(row: any) {
  const m = row?.total?.metrics || row?.granularity?.[0]?.metrics || {};
  const clicks = Number(m.clicks) || 0;
  const conversions = Number(m.conversions ?? m.conversions ?? 0) || 0;
  const spend = Number(m.spendMicros) || 0;
  const currency = m.currency || "USD";
  const cpa = conversions > 0 ? spend / conversions : null;
  return { clicks, conversions, spend, currency, cpa };
}

const round2 = (n: number) => Math.max(0.01, Math.round(n * 100) / 100);

/**
 * Build bid suggestions from keyword-report rows.
 * @param rows       keyword report `reportingDataResponse.row[]`
 * @param bidByKeyword  map of keywordId → current bid amount
 */
export function suggestBids(
  rows: any[],
  bidByKeyword: Record<string, { amount: number; currency: string }>,
  config: BidConfig = DEFAULT_BID_CONFIG
): BidSuggestion[] {
  const out: BidSuggestion[] = [];

  for (const row of rows || []) {
    const meta = row?.metadata || {};
    const keywordId = String(meta.keywordId ?? meta.id ?? "");
    if (!keywordId) continue;
    const current = bidByKeyword[keywordId];
    if (!current || !(current.amount > 0)) continue;

    const { clicks, conversions, cpa, currency } = readMetrics(row);
    const currentBid = current.amount;
    let suggestedBid = currentBid;
    let reason = "";
    let direction: BidSuggestion["direction"] = "hold";

    if (conversions > 0 && cpa) {
      // Move bid proportionally toward target CPA, clamped.
      const ratio = Math.min(1 + config.maxChange, Math.max(1 - config.maxChange, config.targetCpa / cpa));
      suggestedBid = round2(currentBid * ratio);
      if (suggestedBid > currentBid) { direction = "raise"; reason = `CPA ${currency} ${cpa.toFixed(2)} beats target — raise to win more volume`; }
      else if (suggestedBid < currentBid) { direction = "lower"; reason = `CPA ${currency} ${cpa.toFixed(2)} above target — trim bid`; }
      else { reason = "On target"; }
    } else if (conversions === 0 && clicks >= config.minTaps) {
      // Spending without converting → cut hard.
      suggestedBid = round2(currentBid * (1 - config.maxChange));
      direction = "lower";
      reason = `${clicks} clicks, 0 conversions — cut bid`;
    } else {
      continue; // not enough signal
    }

    if (suggestedBid === currentBid) continue;

    out.push({
      keywordId,
      keyword: meta.keyword || meta.keywordText || keywordId,
      currentBid,
      suggestedBid,
      currency,
      clicks,
      conversions,
      cpa,
      changePct: (suggestedBid - currentBid) / currentBid,
      direction,
      reason,
    });
  }

  // Biggest moves first.
  out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  return out;
}
