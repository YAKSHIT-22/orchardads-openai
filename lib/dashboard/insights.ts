/**
 * Dashboard insight computations — pure functions over data the dashboard has
 * already fetched. No network, no React.
 *
 * There are no ad placements and no search terms on this platform. What exists
 * instead:
 *
 *   breakdowns    -> `country` / `device` segments from the insights API
 *   targeting     -> free-text context hints, with no per-hint reporting
 *   budgets       -> lifetime, so pacing is a runway rather than a daily cap.
 */

import type { CampaignReportRow, SegmentReportRow } from "@/types/reportsDetails";
import type { PacingRow } from "@/lib/optimize/budgetPacing";

/* ── Campaign meta ─────────────────────────────────────────────────────────── */

export type CampaignMeta = {
  id: string;
  name: string;
  status?: string;
  biddingType?: string;
  /** Micros. The budget that actually stops delivery when consumed. */
  lifetimeBudgetMicros?: number | null;
  dailyBudgetMicros?: number | null;
  servingIssues?: string[];
};

export function parseCampaignMeta(raw: unknown[]): CampaignMeta[] {
  return (raw || []).map((r) => {
    const c = r as Record<string, unknown>;
    const budget = (c.budget ?? {}) as Record<string, number | undefined>;
    return {
      id: String(c.id ?? ""),
      name: (c.name as string) || `Campaign ${c.id}`,
      status: c.status as string | undefined,
      biddingType: c.bidding_type as string | undefined,
      lifetimeBudgetMicros: budget.lifetime_spend_limit_micros ?? null,
      dailyBudgetMicros: budget.daily_spend_limit_micros ?? null,
      servingIssues: Array.isArray(c.serving_issues)
        ? (c.serving_issues as { code: string }[]).map((i) => i.code)
        : [],
    };
  });
}

/* ── Segment breakdown (replaces placements) ───────────────────────────────── */

export type SegmentSlice = {
  id: string;
  label: string;
  spendMicros: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpaMicros: number | null;
  /** Share of total spend, 0..1. */
  share: number;
};

/**
 * Aggregate a segmented report (country or device) into ranked slices.
 *
 * The insights API allows exactly ONE segment per request, so a slice set is
 * always single-dimension — there is no country-by-device cross-tab available.
 */
export function aggregateSegments(segments: SegmentReportRow[]): SegmentSlice[] {
  const slices = new Map<string, SegmentSlice>();

  for (const s of segments || []) {
    const key = s.segmentValue || "unknown";
    const slice =
      slices.get(key) ??
      ({
        id: key,
        label: s.segmentLabel || s.segmentValue || "Unknown",
        spendMicros: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
        cpaMicros: null,
        share: 0,
      } satisfies SegmentSlice);

    slice.spendMicros += s.performance.spendMicros;
    slice.conversions += s.performance.conversions;
    slice.clicks += s.performance.clicks;
    slice.impressions += s.performance.impressions;
    slices.set(key, slice);
  }

  const out = [...slices.values()].filter((s) => s.spendMicros > 0 || s.impressions > 0);
  const total = out.reduce((sum, s) => sum + s.spendMicros, 0);
  for (const s of out) {
    s.cpaMicros = s.conversions > 0 ? s.spendMicros / s.conversions : null;
    s.share = total > 0 ? s.spendMicros / total : 0;
  }
  out.sort((a, b) => b.spendMicros - a.spendMicros);
  return out;
}

/* ── Suggestions ───────────────────────────────────────────────────────────── */

export type SuggestionTone = "critical" | "warning" | "positive" | "info";

export type Suggestion = {
  id: string;
  tone: SuggestionTone;
  title: string;
  sub: string;
  href: string;
  cta: string;
};

/**
 * The dashboard's ranked "what should I do next" list.
 *
 * Ordering is deliberate and is the product's core opinion: a campaign that
 * CANNOT DELIVER outranks every efficiency finding, because a blocked campaign
 * produces nothing at all while a merely inefficient one still produces
 * something. Most tools lead with spend charts and bury this.
 */
export function buildSuggestions(input: {
  currency: string;
  moneyFmt: (micros: number) => string;
  pacing: PacingRow[];
  /** Wasted-spend totals, in micros. */
  wasted: { totalWasted: number; count: number } | null;
  /** Campaigns the platform reports as unable to deliver. */
  blocked?: { name: string; issues: string[] }[];
  /** Campaigns spending without a single conversion in the window. */
  zeroConversion: { name: string; spend: number }[];
}): Suggestion[] {
  const { moneyFmt, pacing, wasted, blocked = [], zeroConversion } = input;
  const out: Suggestion[] = [];

  // 1. Not delivering at all. Nothing else matters while this is true.
  if (blocked.length) {
    out.push({
      id: "serving-blocked",
      tone: "critical",
      title: `${blocked.length} active campaign${blocked.length === 1 ? " isn't" : "s aren't"} delivering`,
      sub: `"${blocked[0].name}" is blocked (${blocked[0].issues[0]}). Serving Doctor has the exact fix for each.`,
      href: "/tools/diagnostics",
      cta: "Open Serving Doctor",
    });
  }

  // 2. Budget about to run out on a campaign that is working.
  const stopping = pacing.filter((p) => p.status === "running_out" || p.status === "exhausted");
  if (stopping.length) {
    const first = stopping[0];
    out.push({
      id: "budget-runway",
      tone: first.status === "exhausted" ? "critical" : "warning",
      title:
        first.status === "exhausted"
          ? `${stopping.filter((p) => p.status === "exhausted").length} campaign${stopping.length === 1 ? " has" : "s have"} spent their budget`
          : `${stopping.length} campaign${stopping.length === 1 ? " is" : "s are"} about to run out of budget`,
      sub: `"${first.name}": ${first.verdict}`,
      href: "/tools/optimize/budget-pacing",
      cta: "Open pacing",
    });
  }

  // 3. Money going nowhere.
  if (wasted && wasted.totalWasted > 0) {
    out.push({
      id: "wasted-spend",
      tone: "critical",
      title: `${moneyFmt(wasted.totalWasted)} produced no conversions`,
      sub: `Across ${wasted.count} campaign${wasted.count === 1 ? "" : "s"} with enough clicks to judge. Check tracking before cutting any budgets.`,
      href: "/tools/optimize/waste-finder",
      cta: "Open Waste Finder",
    });
  }

  const zero = zeroConversion.slice(0, 3);
  if (zero.length && !wasted) {
    const totalZero = zeroConversion.reduce((s, c) => s + c.spend, 0);
    out.push({
      id: "zero-conversion",
      tone: "warning",
      title: `${zeroConversion.length} campaign${zeroConversion.length === 1 ? "" : "s"} spent ${moneyFmt(totalZero)} with no conversions`,
      sub: `${zero.map((c) => `"${c.name}"`).join(", ")} — confirm conversion tracking is firing before you change budgets.`,
      href: "/tools/campaign",
      cta: "Review campaigns",
    });
  }

  // 4. Money left on the table.
  const under = pacing.filter((p) => p.status === "underspending");
  if (under.length) {
    out.push({
      id: "underspending",
      tone: "info",
      title: `${under.length} campaign${under.length === 1 ? " is" : "s are"} on track to underspend`,
      sub: `"${under[0].name}": ${under[0].verdict}`,
      href: "/tools/optimize/budget-pacing",
      cta: "Open pacing",
    });
  }

  return out.slice(0, 5);
}
