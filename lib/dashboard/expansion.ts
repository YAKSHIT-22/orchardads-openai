/**
 * Market-expansion opportunities — pure compute for the dashboard widget.
 *
 * Joins each owned app's ELIGIBLE countries (from the App Eligibility endpoint)
 * with the countries its campaigns already target, and surfaces the eligible
 * markets NOT yet targeted. Apple exposes eligibility per app (adamId); a
 * campaign carries `countriesOrRegions` + `adamId`, so we group by app.
 */

export type AppExpansion = {
  adamId: number;
  appName: string;
  eligibleCount: number;
  targetedCount: number;
  /** Eligible country codes not targeted by any of this app's campaigns. */
  untapped: string[];
  campaignCount: number;
};

export type ExpansionSummary = {
  apps: AppExpansion[];
  /** Distinct (app, country) untapped pairs across the account. */
  totalUntapped: number;
  /** Countries ranked by how many apps could expand into them. */
  topCountries: { code: string; apps: number }[];
};

type CampaignLike = { adamId?: number | string | null; name?: string; countriesOrRegions?: string[] | null };

/**
 * @param campaigns   the org's campaigns (adamId + countriesOrRegions).
 * @param eligibleByApp  adamId → eligible country codes (state === ELIGIBLE, deduped).
 * @param appNames    optional adamId → display name.
 */
export function computeExpansion(
  campaigns: CampaignLike[],
  eligibleByApp: Map<number, string[]>,
  appNames?: Map<number, string>,
): ExpansionSummary {
  // Group targeted countries + campaign counts by app.
  const targetedByApp = new Map<number, Set<string>>();
  const campaignsByApp = new Map<number, number>();
  for (const c of campaigns || []) {
    const adamId = Number(c.adamId);
    if (!adamId) continue;
    const set = targetedByApp.get(adamId) || new Set<string>();
    for (const cc of c.countriesOrRegions || []) if (cc) set.add(String(cc).toUpperCase());
    targetedByApp.set(adamId, set);
    campaignsByApp.set(adamId, (campaignsByApp.get(adamId) || 0) + 1);
  }

  const apps: AppExpansion[] = [];
  const countryApps = new Map<string, Set<number>>();

  for (const [adamId, eligibleList] of eligibleByApp) {
    const eligible = [...new Set(eligibleList.map((c) => String(c).toUpperCase()))];
    if (!eligible.length) continue;
    const targeted = targetedByApp.get(adamId) || new Set<string>();
    const untapped = eligible.filter((c) => !targeted.has(c)).sort();

    for (const c of untapped) {
      const s = countryApps.get(c) || new Set<number>();
      s.add(adamId); countryApps.set(c, s);
    }

    apps.push({
      adamId,
      appName: appNames?.get(adamId) || `App ${adamId}`,
      eligibleCount: eligible.length,
      targetedCount: targeted.size,
      untapped,
      campaignCount: campaignsByApp.get(adamId) || 0,
    });
  }

  // Most opportunity first.
  apps.sort((a, b) => b.untapped.length - a.untapped.length);

  const topCountries = [...countryApps.entries()]
    .map(([code, appsSet]) => ({ code, apps: appsSet.size }))
    .sort((a, b) => b.apps - a.apps || a.code.localeCompare(b.code))
    .slice(0, 12);

  const totalUntapped = apps.reduce((s, a) => s + a.untapped.length, 0);

  return { apps, totalUntapped, topCountries };
}
