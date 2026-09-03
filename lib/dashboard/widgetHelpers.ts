import type { CampaignReportRow, Performance } from "@/types/reportsDetails";
/**
 * Pure helpers for the Optmyzr-style dashboard widgets (projected spend,
 * performance change, PPC investigator). No network, no React — everything
 * operates on data the dashboard already fetches: raw campaign-report rows,
 * keyword/search-term report rows and campaign meta.
 */

import type { CampaignMeta } from "@/lib/dashboard/insights";

const MS_DAY = 86400000;
const isoUTC = (d: Date) => d.toISOString().slice(0, 10);

/* ── Row metric extraction ───────────────────────────────────────────────── */

export type CoreMetrics = {
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
};

/** Prefer the row total; fall back to the first granularity bucket. */
/** Core counters off a typed Performance block. Spend stays in MICROS. */
export function rowMetrics(row: { performance?: Performance } | null | undefined): CoreMetrics {
  const p = row?.performance;
  return {
    spend: p?.spendMicros ?? 0,
    conversions: p?.conversions ?? 0,
    clicks: p?.clicks ?? 0,
    impressions: p?.impressions ?? 0,
  };
}

/** Sum every day inside a campaign row's granularity series. */
export function rowDailySpend(row: any): { date: string; spend: number }[] {
  return (row?.granularity || [])
    .map((g: any) => ({
      date: g.date || g.startTime?.slice(0, 10) || "",
      spend: Number(g.metrics?.spendMicros) || 0,
    }))
    .filter((d: { date: string }) => d.date);
}

/* ── KPI registry for the widgets (additive + derived ratios) ────────────── */

export type WidgetKpiKind = "money" | "count" | "percent";

export type WidgetKpi = {
  key: string;
  label: string;
  kind: WidgetKpiKind;
  /** Additive metrics decompose cleanly into per-entity contributions. */
  additive: boolean;
  /** Lower is better (CPA/CPC/CPM) — flips the "good/bad" colour. */
  lowerIsBetter: boolean;
  value: (m: CoreMetrics) => number | null;
};

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export const WIDGET_KPIS: WidgetKpi[] = [
  { key: "spend", label: "Spend", kind: "money", additive: true, lowerIsBetter: false, value: (m) => m.spend },
  { key: "conversions", label: "Conversions", kind: "count", additive: true, lowerIsBetter: false, value: (m) => m.conversions },
  { key: "clicks", label: "Clicks", kind: "count", additive: true, lowerIsBetter: false, value: (m) => m.clicks },
  { key: "impressions", label: "Impressions", kind: "count", additive: true, lowerIsBetter: false, value: (m) => m.impressions },
  { key: "cpa", label: "Cost per conversion", kind: "money", additive: false, lowerIsBetter: true, value: (m) => ratio(m.spend, m.conversions) },
  { key: "cpc", label: "CPC", kind: "money", additive: false, lowerIsBetter: true, value: (m) => ratio(m.spend, m.clicks) },
  { key: "cvr", label: "Conversion rate", kind: "percent", additive: false, lowerIsBetter: false, value: (m) => ratio(m.conversions, m.clicks) },
  { key: "ctr", label: "Click-through rate", kind: "percent", additive: false, lowerIsBetter: false, value: (m) => ratio(m.clicks, m.impressions) },
];

export const getWidgetKpi = (key: string): WidgetKpi =>
  WIDGET_KPIS.find((k) => k.key === key) ?? WIDGET_KPIS[0];

export function formatKpi(kpi: WidgetKpi, currency: string, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (kpi.kind === "money") return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (kpi.kind === "percent") return `${(v * 100).toFixed(2)}%`;
  return Math.round(v).toLocaleString();
}

/* ── Per-campaign aggregation ────────────────────────────────────────────── */

export type CampaignAgg = { id: string; name: string } & CoreMetrics;

/** Aggregate campaign report rows into one entry per campaign id. */
export function aggregateCampaigns(rows: CampaignReportRow[]): Map<string, CampaignAgg> {
  const out = new Map<string, CampaignAgg>();
  for (const row of rows || []) {
    const id = row?.campaignId;
    if (!id) continue;
    const m = rowMetrics(row);
    const prev =
      out.get(id) ??
      { id, name: row.campaignName || `Campaign ${id}`, spend: 0, conversions: 0, clicks: 0, impressions: 0 };
    out.set(id, {
      ...prev,
      spend: prev.spend + m.spend,
      conversions: prev.conversions + m.conversions,
      clicks: prev.clicks + m.clicks,
      impressions: prev.impressions + m.impressions,
    });
  }
  return out;
}

/**
 * Aggregate arbitrary report rows (keyword / search-term) into one entry per
 * key, reusing the CampaignAgg shape (name = the entity label).
 */
export function aggregateEntities(
  rows: any[],
  getId: (meta: any) => string,
  getName: (meta: any) => string,
): Map<string, CampaignAgg> {
  const out = new Map<string, CampaignAgg>();
  for (const row of rows || []) {
    const meta = row?.metadata || {};
    const id = getId(meta);
    if (!id) continue;
    const m = rowMetrics(row);
    const prev = out.get(id) ?? { id, name: getName(meta) || id, spend: 0, conversions: 0, clicks: 0, impressions: 0 };
    out.set(id, {
      ...prev,
      spend: prev.spend + m.spend,
      conversions: prev.conversions + m.conversions,
      clicks: prev.clicks + m.clicks,
      impressions: prev.impressions + m.impressions,
    });
  }
  return out;
}

/* ── Period-over-period movers ───────────────────────────────────────────── */

export type Mover = {
  id: string;
  name: string;
  before: number | null;
  after: number | null;
  /** after - before (null when neither period has a defined value). */
  delta: number | null;
  /** Percentage change vs before; null when before is 0/undefined. */
  pct: number | null;
  /** Signed share of the total additive delta (0..1); null for ratio KPIs. */
  contribution: number | null;
};

/**
 * Compare two aggregation maps for one KPI. For additive KPIs the total delta
 * equals the sum of per-entity deltas, so each entity gets a signed
 * `contribution` share; ratio KPIs report before/after/delta only.
 */
export function computeMovers(
  current: Map<string, CampaignAgg>,
  previous: Map<string, CampaignAgg>,
  kpi: WidgetKpi,
): { movers: Mover[]; totalBefore: number | null; totalAfter: number | null } {
  const ids = new Set<string>([...current.keys(), ...previous.keys()]);
  const rows: Mover[] = [];

  // Totals from summed core metrics (correct for ratios, not averaged averages).
  const sumCore = (map: Map<string, CampaignAgg>): CoreMetrics =>
    [...map.values()].reduce(
      (a, c) => ({ spend: a.spend + c.spend, conversions: a.conversions + c.conversions, clicks: a.clicks + c.clicks, impressions: a.impressions + c.impressions }),
      { spend: 0, conversions: 0, clicks: 0, impressions: 0 },
    );
  const totalAfter = kpi.value(sumCore(current));
  const totalBefore = kpi.value(sumCore(previous));
  const totalDelta = totalAfter !== null && totalBefore !== null ? totalAfter - totalBefore : null;

  for (const id of ids) {
    const cur = current.get(id);
    const prev = previous.get(id);
    const after = cur ? kpi.value(cur) : null;
    const before = prev ? kpi.value(prev) : null;
    const delta = after !== null && before !== null ? after - before : after !== null ? after : before !== null ? -before : null;
    const pct = before && before !== 0 && delta !== null ? delta / before : null;
    rows.push({
      id,
      name: cur?.name || prev?.name || `Campaign ${id}`,
      before,
      after,
      delta,
      pct,
      contribution: null,
    });
  }

  if (kpi.additive && totalDelta && totalDelta !== 0) {
    for (const r of rows) if (r.delta !== null) r.contribution = r.delta / totalDelta;
  }

  rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  return { movers: rows, totalBefore, totalAfter };
}

/* ── Projected month spend ───────────────────────────────────────────────── */

export type MonthContext = {
  daysInMonth: number;
  daysElapsed: number;
  monthLabel: string;
  startTime: string;
  endTime: string;
};

/** Current calendar month in UTC: bounds, elapsed days and a display label. */
export function currentMonthContext(now = new Date()): MonthContext {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const first = new Date(Date.UTC(y, mo, 1));
  const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const today = new Date(Date.UTC(y, mo, now.getUTCDate()));
  return {
    daysInMonth,
    daysElapsed: now.getUTCDate(),
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    startTime: isoUTC(first),
    endTime: isoUTC(today),
  };
}

export type ProjectedSpend = {
  mtdSpend: number;
  avgDaily: number;
  projected: number;
  /** Sum of selected campaigns' daily budgets × days-in-month; null if none set. */
  target: number | null;
  pctOfTarget: number | null;
  daily: { date: string; spend: number }[];
};

/**
 * Month-to-date spend + linear pace projection to month end, plus an optional
 * target derived from campaign daily budgets.
 */
export function computeProjectedSpend(
  monthRows: any[],
  meta: CampaignMeta[],
  selectedIds: string[],
  ctx: MonthContext,
): ProjectedSpend {
  const selected = new Set(selectedIds.map(String));
  const inScope = (id: any) => selected.size === 0 || selected.has(String(id));

  const rows = (monthRows || []).filter((r) => inScope(r?.metadata?.campaignId));

  // Daily spend series across in-scope campaigns.
  const dailyMap = new Map<string, number>();
  let mtdSpend = 0;
  for (const row of rows) {
    for (const d of rowDailySpend(row)) {
      dailyMap.set(d.date, (dailyMap.get(d.date) || 0) + d.spend);
      mtdSpend += d.spend;
    }
  }
  const daily = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, spend]) => ({ date, spend }));

  const avgDaily = ctx.daysElapsed > 0 ? mtdSpend / ctx.daysElapsed : 0;
  const projected = avgDaily * ctx.daysInMonth;

  // Target: sum of in-scope campaigns' daily limits x days in month.
  //
  // Most OpenAI Ads campaigns carry only a LIFETIME budget, so a monthly target
  // is genuinely unknowable for them — we return null rather than inventing one
  // by dividing a lifetime budget across an arbitrary period.
  const budgets = meta.filter((m) => inScope(m.id) && Number(m.dailyBudgetMicros ?? 0) > 0);
  const dailyBudgetSum = budgets.reduce((s, m) => s + Number(m.dailyBudgetMicros ?? 0), 0);
  const target = dailyBudgetSum > 0 ? dailyBudgetSum * ctx.daysInMonth : null;
  const pctOfTarget = target && target > 0 ? projected / target : null;

  return { mtdSpend, avgDaily, projected, target, pctOfTarget, daily };
}

