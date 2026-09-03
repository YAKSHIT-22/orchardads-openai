/**
 * Wasted-spend analysis.
 *
 * Pure functions — no network, no React — so the logic is easy to reason about
 * and reuse (tool page, Inspector, recommendation engine).
 *
 * This API has no keywords and no search-term report, so the unit of analysis is
 * the entity (campaign, ad group or ad) itself.
 *
 * The gate that matters is CLICKS, not spend. At $3-5 CPCs, a campaign with 5
 * clicks and no conversions has told you nothing; one with 40 has. Flagging the
 * former would be the single fastest way to make a customer distrust the tool.
 *
 * All money is MICROS.
 */

export type WastedSpendConfig = {
  /** Ignore entities that spent less than this (micros). */
  minSpendMicros: number;
  /** Minimum clicks before "no conversions" is treated as a finding. */
  minClicks: number;
  /** When set, entities that DO convert but above this CPA are flagged too. */
  targetCpaMicros: number | null;
};

export const DEFAULT_WASTED_CONFIG: WastedSpendConfig = {
  minSpendMicros: 5_000_000, // 5.00 in account currency
  minClicks: 40,
  targetCpaMicros: null,
};

export type WastedEntity = {
  id: string;
  name: string;
  impressions?: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
  cpaMicros: number | null;
  /** Spend attributable to the problem, in micros. */
  wastedMicros: number;
  reasons: string[];
  severity: "high" | "medium";
};

export type WastedInput = {
  id: string;
  name: string;
  impressions?: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
};

export function findWastedSpend(
  entities: WastedInput[],
  config: WastedSpendConfig = DEFAULT_WASTED_CONFIG
): WastedEntity[] {
  const out: WastedEntity[] = [];

  for (const e of entities || []) {
    if (e.spendMicros < config.minSpendMicros) continue;

    const cpaMicros = e.conversions > 0 ? e.spendMicros / e.conversions : null;
    const reasons: string[] = [];
    let wastedMicros = 0;
    let severity: "high" | "medium" = "medium";

    // Case 1: spend, enough traffic, nothing converted. The whole spend is at
    // stake — but only once there were enough clicks for zero to mean anything.
    if (e.conversions === 0 && e.clicks >= config.minClicks) {
      reasons.push(`${e.clicks} clicks and no conversions`);
      wastedMicros = e.spendMicros;
      severity = "high";
    }

    // Case 2: it converts, but far above the advertiser's target. Only the
    // EXCESS over target is wasted; the rest bought real conversions.
    if (
      config.targetCpaMicros &&
      cpaMicros !== null &&
      cpaMicros > config.targetCpaMicros &&
      e.conversions > 0
    ) {
      const excess = e.spendMicros - config.targetCpaMicros * e.conversions;
      reasons.push(
        `CPA ${(cpaMicros / 1_000_000).toFixed(2)} vs target ${(config.targetCpaMicros / 1_000_000).toFixed(2)}`
      );
      wastedMicros = Math.max(wastedMicros, excess);
    }

    if (!reasons.length) continue;

    out.push({
      id: e.id,
      name: e.name,
      impressions: e.impressions,
      clicks: e.clicks,
      conversions: e.conversions,
      spendMicros: e.spendMicros,
      cpaMicros,
      wastedMicros: Math.round(wastedMicros),
      reasons,
      severity,
    });
  }

  return out.sort((a, b) => b.wastedMicros - a.wastedMicros);
}

/** Total recoverable spend across a set of findings, in micros. */
export function totalWasted(rows: WastedEntity[]): number {
  return rows.reduce((s, r) => s + r.wastedMicros, 0);
}
