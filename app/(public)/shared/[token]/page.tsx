"use client";

/**
 * Public, read-only shared dashboard — rendered from a share token with no
 * authentication and no app chrome. Data comes from GET /api/public/dashboard/[token]
 * (the owner's scope is fixed server-side; viewers can't change it).
 *
 * Deliberately uses plain fetch (not react-query) so the page has zero
 * dependency on app providers, and reuses the dashboard's presentational
 * components + client-side transforms. Only widgets present in the response's
 * `widgets` array are rendered; the layout adapts to what's enabled.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { analyzePacing } from "@/lib/optimize/budgetPacing";
import { aggregateCampaigns } from "@/lib/dashboard/widgetHelpers";
import { resolveDateRange } from "@/lib/dateRanges";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Campaign, ReportData, ReportTotals } from "@/types/reportsDetails";

import { KpiRow } from "@/components/dashboard/KpiRow";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ComparisonChart } from "@/components/dashboard/ComparisonChart";
import { BudgetPacingCard } from "@/components/dashboard/BudgetPacingCard";
import { PerformanceChangeCard } from "@/components/dashboard/PerformanceChangeCard";
import { WidgetCard, WidgetEmpty, RankRow } from "@/components/dashboard/bits";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart2,
  CalendarDays,
  Clock,
  Link2Off,
  Loader2,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  TimerOff,
  Trophy,
} from "lucide-react";

type PublicDashboard = {
  title: string;
  description: string | null;
  adAccountName: string | null;
  dateRange: string;
  widgets: string[];
  currency: string;
  /** Modelled revenue is stated explicitly so a viewer never mistakes it for
      platform-reported revenue. */
  revenueModelled: boolean;
  report: ReportData;
  /** Previous equal-length period report — for performanceChange. */
  previousReport: ReportData | null;
  generatedAt: string;
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; code: number | null }
  | { status: "ready"; data: PublicDashboard };

const RANGE_LABELS: Record<string, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function rangeDays(range: string) {
  return range === "7d" ? 7 : range === "14d" ? 14 : range === "90d" ? 90 : 30;
}

const spendOf = (c: Campaign) => Number(c.performance?.spendMicros) || 0;

/* ── Shells / chrome ────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="flex-1 flex flex-col">{children}</div>
      <PoweredBy />
    </div>
  );
}

function PoweredBy() {
  return (
    <footer className="py-8">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <span className="font-semibold text-foreground/80">OrchardAds</span> — OpenAI
            Ads optimization
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            This dashboard is shared read-only. Figures reflect the owner&apos;s selected range.
          </p>
        </div>
      </div>
    </footer>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 shrink-0">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}

/* ── Error / loading states ─────────────────────────────────────────────────── */

function StatusScreen({
  icon: Icon,
  tone = "muted",
  title,
  message,
  onRetry,
  retrying,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "muted" | "warn";
  title: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Shell>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <Card className="border rounded-2xl shadow-sm w-full max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <div
              className={cn(
                "w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center",
                tone === "warn"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-muted text-muted-foreground/70"
              )}
            >
              <Icon className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{message}</p>
            {onRetry && (
              <Button
                onClick={onRetry}
                disabled={retrying}
                variant="outline"
                size="sm"
                className="mt-6 gap-2"
              >
                {retrying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Try again
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground/70 mt-6">
              Shared via <span className="font-medium">OrchardAds</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <div className="border-b border-border/60 bg-background/60 backdrop-blur-sm">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
          <Skeleton className="h-7 w-72 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md mt-2" />
          <Skeleton className="h-3.5 w-64 rounded-md mt-3" />
        </div>
      </div>
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 flex-1">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </Shell>
  );
}

/* ── Top-campaigns widget (read-only, no drill-down) ───────────────────────── */

function PublicTopCampaigns({ campaigns, currency }: { campaigns: Campaign[]; currency: string }) {
  const top = useMemo(
    () => [...campaigns].sort((a, b) => spendOf(b) - spendOf(a)).slice(0, 6),
    [campaigns]
  );
  const maxSpend = top.length ? spendOf(top[0]) : 0;

  return (
    <WidgetCard icon={Trophy} iconClass="text-amber-500" title="Top Campaigns by Spend" flush>
      {top.length === 0 ? (
        <WidgetEmpty icon={PackageOpen} title="No campaign data yet" />
      ) : (
        <div className="pb-1">
          {top.map((c) => {
            const spend = spendOf(c);
            const conversions = c.performance?.conversions || 0;
            const cpa = conversions > 0 ? spend / conversions : null;
            return (
              <RankRow
                key={c.campaignId}
                label={c.campaignName}
                badge={
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {c.campaignStatus}
                  </Badge>
                }
                fraction={maxSpend ? spend / maxSpend : 0}
                value={money(currency, spend)}
                sub={`${conversions.toLocaleString()} inst · ${cpa === null ? "—" : money(currency, cpa)} CPA`}
              />
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function SharedDashboardPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const res = await fetch(`/api/public/dashboard/${token}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", code: res.status });
          return;
        }
        const data = (await res.json()) as PublicDashboard;
        if (!cancelled) setState({ status: "ready", data });
      } catch {
        if (!cancelled) setState({ status: "error", code: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const data = state.status === "ready" ? state.data : null;

  // The public route returns a fully shaped ReportData, so nothing is
  // transformed here — one fewer place for the owner's numbers and the viewer's
  // numbers to drift apart.
  const reportData: ReportData = useMemo(
    () =>
      data?.report ?? {
        campaigns: [],
        adGroups: [],
        ads: [],
        segments: [],
        dailyData: [],
        currency: "USD",
        revenueModelled: false,
      },
    [data]
  );

  const totals: ReportTotals = useMemo(
    () =>
      reportData.campaigns.reduce<ReportTotals>(
        (acc, c) => ({
          impressions: acc.impressions + (c.performance?.impressions ?? 0),
          clicks: acc.clicks + (c.performance?.clicks ?? 0),
          spendMicros: acc.spendMicros + (c.performance?.spendMicros ?? 0),
          conversions: acc.conversions + (c.performance?.conversions ?? 0),
          revenueMicros:
            c.performance?.revenueMicros == null
              ? acc.revenueMicros
              : (acc.revenueMicros ?? 0) + c.performance.revenueMicros,
        }),
        { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, revenueMicros: null }
      ),
    [reportData.campaigns]
  );

  const days = rangeDays(data?.dateRange || "30d");

  // Lifetime-budget pacing, computed from the same campaign rows the viewer can
  // already see. The public payload deliberately carries no entity metadata
  // beyond what the report itself returns.
  const pacing = useMemo(
    () =>
      analyzePacing(
        reportData.campaigns
          .filter((c) => c.campaignStatus === "active" && c.lifetimeBudgetMicros)
          .map((c) => ({
            id: c.campaignId,
            name: c.campaignName,
            budgetMicros: c.lifetimeBudgetMicros!,
            spendMicros: c.performance.spendMicros,
            days,
          }))
      ),
    [reportData.campaigns, days]
  );

  // Performance change — current range vs the server-provided previous period.
  const currentAgg = useMemo(() => aggregateCampaigns(reportData.campaigns), [reportData.campaigns]);
  const previousAgg = useMemo(
    () => aggregateCampaigns(data?.previousReport?.campaigns ?? []),
    [data]
  );
  const prevLabel = useMemo(() => {
    const end = new Date(Date.now() - days * 86_400_000);
    const start = new Date(Date.now() - days * 2 * 86_400_000);
    return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  }, [days]);

  /* ── Non-ready states ── */
  if (state.status === "loading") return <LoadingScreen />;

  if (state.status === "error") {
    const retry = () => setAttempt((a) => a + 1);
    switch (state.code) {
      case 404:
        return (
          <StatusScreen
            icon={Link2Off}
            title="This shared dashboard is no longer available"
            message="The link may have been revoked by its owner, or the address isn't quite right. Ask the person who shared it for a new link."
          />
        );
      case 410:
        return (
          <StatusScreen
            icon={TimerOff}
            title="This link has expired"
            message="The owner set an expiry on this shared dashboard and it has passed. Ask them for a fresh link."
          />
        );
      case 429:
        return (
          <StatusScreen
            icon={Clock}
            title="Too many requests"
            message="This dashboard is being refreshed a little too often. Wait a moment and try again."
            onRetry={retry}
          />
        );
      case 503:
        return (
          <StatusScreen
            icon={ShieldAlert}
            tone="warn"
            title="Temporarily unavailable"
            message="This dashboard can't be loaded right now — the owner may need to reconnect their Apple Ads account. Check back later."
            onRetry={retry}
          />
        );
      default:
        return (
          <StatusScreen
            icon={ShieldAlert}
            tone="warn"
            title="Couldn't load this dashboard"
            message="Something went wrong while fetching the data. Check your connection and try again."
            onRetry={retry}
          />
        );
    }
  }

  const dash = data!;
  const currency = dash.currency || "USD";
  const widgets = dash.widgets || [];
  const hasData = reportData.campaigns.length > 0;
  const updatedAt = dash.generatedAt
    ? new Date(dash.generatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const hasTrend = widgets.includes("trend");
  const hasComparison = widgets.includes("comparison");
  const hasPacing = widgets.includes("budgetPacing");
  const hasPlacements = widgets.includes("topPlacements");
  const hasProjected = widgets.includes("projectedSpend");
  const hasPerfChange = widgets.includes("performanceChange");
  const hasImpressionShare = widgets.includes("impressionShare");

  return (
    <Shell>
      {/* Header */}
      <div className="border-b border-border/60 bg-background/70 backdrop-blur-sm">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
                  {dash.title}
                </h1>
                <LiveBadge />
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  Read-only
                </Badge>
              </div>
              {dash.description && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
                  {dash.description}
                </p>
              )}
              <div className="flex items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground flex-wrap">
                {dash.adAccountName && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                    <BarChart2 className="w-3.5 h-3.5 text-primary" />
                    {dash.adAccountName}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {RANGE_LABELS[dash.dateRange] || dash.dateRange}
                </span>
                {updatedAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Updated {updatedAt}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 min-w-0">
        <KpiRow totals={totals} currency={currency} days={days} />

        {!hasData ? (
          <Card className="border rounded-xl">
            <CardContent className="py-20 flex flex-col items-center gap-2.5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-1">
                <PackageOpen className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground">No campaign data in this range</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                There was no reportable activity for{" "}
                {RANGE_LABELS[dash.dateRange]?.toLowerCase() || "this period"}. Check back once
                the campaigns have traffic.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Charts — 2-up when both are enabled, full-width when only one. */}
            {(hasTrend || hasComparison) && (
              <div
                className={cn(
                  "grid grid-cols-1 gap-5 min-w-0",
                  hasTrend && hasComparison && "lg:grid-cols-2"
                )}
              >
                {hasTrend && <TrendChart data={reportData.dailyData} currency={currency} />}
                {hasComparison && (
                  <ComparisonChart data={reportData.dailyData} currency={currency} />
                )}
              </div>
            )}

            {/* Period-over-period change.
                Projected monthly spend is deliberately absent from the public
                view: most OpenAI Ads campaigns carry only a lifetime budget, so
                a "monthly target" would be a number we invented rather than one
                the advertiser set — and a shared link is exactly where an
                invented number would be taken at face value. */}
            {hasPerfChange && (
              <div className="grid grid-cols-1 gap-5 min-w-0">
                {hasPerfChange && (
                  <PerformanceChangeCard
                    currentAgg={currentAgg}
                    previousAgg={previousAgg}
                    currency={currency}
                    isLoading={false}
                    isError={!dash.previousReport}
                    prevLabel={prevLabel}
                  />
                )}
              </div>
            )}

            {/* Insight cards side by side. */}
            {(hasPacing || hasPlacements) && (
              <div
                className={cn(
                  "grid grid-cols-1 gap-5 min-w-0",
                  hasPacing && hasPlacements && "lg:grid-cols-2"
                )}
              >
                {hasPacing && (
                  <BudgetPacingCard
                    pacing={pacing}
                    isLoading={false}
                    isError={false}
                    currency={currency}
                    showToolLink={false}
                  />
                )}
              </div>
            )}

            {widgets.includes("topCampaigns") && (
              <PublicTopCampaigns campaigns={reportData.campaigns} currency={currency} />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
