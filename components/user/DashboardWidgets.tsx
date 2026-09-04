"use client";

/**
 * Dashboard insight widgets — built on the org-wide campaign report plus
 * campaign metadata:
 *
 *  - Top Suggestions   (serving blocks + wasted spend + budget pacing)
 *  - Budget Pacing     (spend rate vs lifetime budget — runway, not utilisation)
 *  - Top Campaigns     (top spenders, with ad-group drill-down tray)
 *  - Conversion Funnel (impressions -> clicks -> conversions)
 *
 * Campaign Deep Dive was dropped: it ranked keywords and the search terms
 * behind them, and this API has neither.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Campaign } from "@/types/reportsDetails";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Trophy, ChevronRight, Layers, Loader2, Eye, MousePointerClick,
  TrendingUp, Filter, PackageOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useCampaignMeta, type DateRange } from "@/lib/dashboard/hooks";
import { buildSuggestions } from "@/lib/dashboard/insights";
import { analyzePacing } from "@/lib/optimize/budgetPacing";
import { findWastedSpend, DEFAULT_WASTED_CONFIG } from "@/lib/optimize/wastedSpend";
import { SuggestionsCard } from "@/components/dashboard/SuggestionsCard";
import { BudgetPacingCard } from "@/components/dashboard/BudgetPacingCard";
import { RankRow } from "@/components/dashboard/bits";

const spendOf = (c: Campaign) => Number(c.performance?.spendMicros) || 0;
const cpaOf = (c: Campaign) => (c.performance?.conversions > 0 ? spendOf(c) / c.performance.conversions : null);

/** Shared empty-state block for widgets. */
function Empty({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="w-9 h-9 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground/80">{sub}</p>}
    </div>
  );
}

export function DashboardWidgets({
  campaigns, rawRows, adAccountId, dateRange, days, currency,
}: {
  campaigns: Campaign[];
  /** Raw campaign-report rows (reportingDataResponse.row) for pacing analysis. */
  rawRows: any[];
  adAccountId: string;
  dateRange: DateRange;
  days: number;
  currency: string;
}) {
  const [tray, setTray] = useState<Campaign | null>(null);

  // ── Shared data ─────────────────────────────────────────────────────────────
  const metaQuery = useCampaignMeta(adAccountId);

  const top = useMemo(() => [...campaigns].sort((a, b) => spendOf(b) - spendOf(a)).slice(0, 6), [campaigns]);
  const maxSpend = top.length ? spendOf(top[0]) : 0;

  // ── Budget pacing (shared by the pacing widget and suggestions) ─────────────
  //
  // Lifetime budgets, not daily: a campaign that consumes its lifetime budget
  // stops permanently, so the projection is a runway rather than a utilisation
  // percentage. See lib/optimize/budgetPacing.
  const pacing = useMemo(
    () =>
      analyzePacing(
        campaigns
          .filter((c) => c.campaignStatus === "active" && c.lifetimeBudgetMicros)
          .map((c) => ({
            id: c.campaignId,
            name: c.campaignName,
            budgetMicros: c.lifetimeBudgetMicros!,
            spendMicros: c.performance.spendMicros,
            days,
          }))
      ),
    [campaigns, days]
  );

  const suggestions = useMemo(() => {
    // Wasted spend is now measured on the campaigns themselves — there are no
    // search terms on this platform to attribute it to (this API has none).
    const wasted = findWastedSpend(
      campaigns.map((c) => ({
        id: c.campaignId,
        name: c.campaignName,
        clicks: c.performance.clicks,
        conversions: c.performance.conversions,
        spendMicros: c.performance.spendMicros,
      })),
      DEFAULT_WASTED_CONFIG
    );
    const totalWastedMicros = wasted.reduce((sum, w) => sum + w.wastedMicros, 0);

    const zeroConversion = campaigns
      .filter((c) => spendOf(c) >= 1_000_000 && c.performance?.conversions === 0)
      .sort((a, b) => spendOf(b) - spendOf(a))
      .map((c) => ({ name: c.campaignName, spend: spendOf(c) }));

    // Entities the platform says cannot deliver. No statistics needed, and the
    // highest-value thing on the dashboard for a newly connected account.
    const blocked = campaigns
      .filter((c) => c.campaignStatus === "active" && (c.servingIssues?.length ?? 0) > 0)
      .map((c) => ({ name: c.campaignName, issues: c.servingIssues ?? [] }));

    return buildSuggestions({
      currency,
      moneyFmt: (amount) => money(currency, amount),
      pacing,
      wasted: totalWastedMicros > 0 ? { totalWasted: totalWastedMicros, count: wasted.length } : null,
      blocked,
      zeroConversion,
    });
  }, [campaigns, currency, pacing]);

  const suggestionsLoading = metaQuery.isLoading;

  // ── Conversion funnel ────────────────────────────────────────────────────────
  const funnel = useMemo(() => {
    return campaigns.reduce(
      (a, c) => ({
        impressions: a.impressions + (c.performance?.impressions || 0),
        clicks: a.clicks + (c.performance?.clicks || 0),
        conversions: a.conversions + (c.performance?.conversions || 0),
      }),
      { impressions: 0, clicks: 0, conversions: 0 }
    );
  }, [campaigns]);

  return (
    <div className="flex flex-col gap-4">
      {/* Top suggestions */}
      <SuggestionsCard suggestions={suggestions} isLoading={suggestionsLoading} />

      {/* Budget pacing + top placements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BudgetPacingCard
          pacing={pacing}
          isLoading={metaQuery.isLoading}
          isError={metaQuery.isError}
          currency={currency}
        />
              </div>

      {/* Top campaigns + conversion funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border rounded-xl lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />Top Campaigns by Spend
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top.length === 0 ? (
              <Empty icon={PackageOpen} title="No campaign data yet" sub="Run a campaign to see performance here." />
            ) : (
              <div className="flex flex-col">
                {top.map((c) => {
                  const spend = spendOf(c);
                  const cpa = cpaOf(c);
                  return (
                    <div key={c.campaignId} className="group flex items-center border-t first:border-t-0">
                      <div className="flex-1 min-w-0">
                        <RankRow
                          label={c.campaignName}
                          badge={<Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{c.campaignStatus}</Badge>}
                          fraction={maxSpend ? spend / maxSpend : 0}
                          value={money(currency, spend)}
                          sub={`${c.performance.conversions.toLocaleString()} inst · ${cpa === null ? "—" : money(currency, cpa)} CPA`}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 mr-3 opacity-70 group-hover:opacity-100 shrink-0"
                        onClick={() => setTray(c)}
                      >
                        Ad groups <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-primary" />Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.impressions === 0 ? (
              <Empty icon={Filter} title="No traffic yet" />
            ) : (
              <div className="flex flex-col gap-3">
                {[
                  { label: "Impressions", value: funnel.impressions, icon: Eye, color: "bg-violet-400 dark:bg-violet-300", base: funnel.impressions },
                  { label: "Clicks", value: funnel.clicks, icon: MousePointerClick, color: "bg-violet-600 dark:bg-violet-400", base: funnel.impressions },
                  { label: "Conversions", value: funnel.conversions, icon: TrendingUp, color: "bg-violet-800 dark:bg-violet-600", base: funnel.impressions },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><s.icon className="w-3.5 h-3.5" />{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", s.color)} style={{ width: `${s.base ? Math.max(3, (s.value / s.base) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="text-muted-foreground">Click-through</div>
                    <div className="font-semibold">{funnel.impressions ? ((funnel.clicks / funnel.impressions) * 100).toFixed(2) : "0.00"}%</div>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="text-muted-foreground">Conv. rate</div>
                    <div className="font-semibold">{funnel.clicks ? ((funnel.conversions / funnel.clicks) * 100).toFixed(2) : "0.00"}%</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AdGroupTray campaign={tray} adAccountId={adAccountId} dateRange={dateRange} currency={currency} onClose={() => setTray(null)} />
    </div>
  );
}

/** Slide-out tray showing a campaign's ad-group breakdown (fetched on demand). */
function AdGroupTray({
  campaign, adAccountId, dateRange, currency, onClose,
}: {
  campaign: Campaign | null;
  adAccountId: string;
  dateRange: { startTime: string; endTime: string };
  currency: string;
  onClose: () => void;
}) {
  const open = !!campaign;
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["dash-tray-adgroups", adAccountId, campaign?.campaignId, dateRange.startTime, dateRange.endTime],
    queryFn: async () => {
      const res = await api.post("/reports/adgroup", {
        adAccountId, campaignId: String(campaign!.campaignId),
        reportRequest: {
          startTime: dateRange.startTime, endTime: dateRange.endTime,
          // Include ad groups with no spend in range, otherwise a campaign whose
          // ad groups haven't accrued spend shows an empty tray.
          returnRowTotals: true, returnRecordsWithNoMetrics: true,
          selector: { orderBy: [{ field: "spendMicros", sortOrder: "DESCENDING" }], pagination: { offset: 0, limit: 200 } },
        },
      });
      return (res.data?.report?.data?.reportingDataResponse?.row || []) as any[];
    },
    enabled: open,
    staleTime: 60 * 1000,
  });

  const p = campaign?.performance;
  const spend = p ? Number(p.spendMicros) || 0 : 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-6">{campaign?.campaignName}</SheetTitle>
        </SheetHeader>

        {/* Campaign KPI summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4">
          {[
            { label: "Spend", value: money(currency, spend) },
            { label: "Impr.", value: (p?.impressions || 0).toLocaleString() },
            { label: "Clicks", value: (p?.clicks || 0).toLocaleString() },
            { label: "Conversions", value: (p?.conversions || 0).toLocaleString() },
          ].map((k) => (
            <div key={k.label} className="rounded-lg bg-muted/60 p-2.5">
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
              <div className="text-sm font-semibold tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="px-4 mt-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Layers className="w-4 h-4 text-primary" />Ad Groups</h3>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading ad groups…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-rose-500">Couldn&apos;t load ad groups.</div>
          ) : rows.length === 0 ? (
            <Empty icon={Layers} title="No ad groups" sub="This campaign has no ad-group data in this range." />
          ) : (
            <div className="flex flex-col gap-2 pb-6">
              {rows.map((r, i) => {
                const m = r?.total?.metrics || {};
                const agSpend = Number(m.spendMicros) || 0;
                const inst = Number(m.conversions ?? m.conversions) || 0;
                const cpa = inst > 0 ? agSpend / inst : null;
                return (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" title={r?.metadata?.adGroupName}>{r?.metadata?.adGroupName || `Ad Group ${r?.metadata?.adGroupId || i + 1}`}</span>
                      {r?.metadata?.adGroupStatus && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{r.metadata.adGroupStatus}</Badge>}
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                      <div><div className="text-muted-foreground">Spend</div><div className="font-semibold tabular-nums">{money(currency, agSpend)}</div></div>
                      <div><div className="text-muted-foreground">Clicks</div><div className="font-semibold tabular-nums">{(Number(m.clicks) || 0).toLocaleString()}</div></div>
                      <div><div className="text-muted-foreground">Conversions</div><div className="font-semibold tabular-nums">{inst.toLocaleString()}</div></div>
                      <div><div className="text-muted-foreground">CPA</div><div className="font-semibold tabular-nums">{cpa === null ? "—" : money(currency, cpa)}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
