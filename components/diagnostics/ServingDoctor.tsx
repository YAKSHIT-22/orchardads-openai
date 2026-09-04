"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  CreditCard,
  Layers,
  Megaphone,
  RefreshCw,
  Stethoscope,
  Tags,
  TriangleAlert,
} from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore, useActiveConnection } from "@/stores/adAccountStore";
import {
  describeServingIssue,
  severityRank,
  type FixableBy,
  type ServingIssueInfo,
} from "@/lib/openai/servingIssues";
import { money, count } from "@/lib/format";
import { getSeverityColor } from "@/utils/constant";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { ReportData } from "@/types/reportsDetails";

/**
 * Serving Doctor — "why isn't this delivering?"
 *
 * The platform publishes a typed `serving_issues` enum on every entity, and
 * the list endpoints return it inline via `include[]=serving_issues` — so this
 * is a complete, deterministic fault tree with no inference and no extra calls.
 *
 * THE DESIGN DECISION THAT MATTERS: findings are grouped by ROOT CAUSE, not by
 * entity. Account-level problems (suspended account, failed brand review,
 * missing payment method) repeat on every campaign, ad group and ad beneath
 * them — an ungrouped list would show one problem two hundred times and bury
 * the single thing that needs fixing.
 *
 * It also states plainly who can fix each one. Roughly a third are OpenAI-side
 * or billing-side and no tool can resolve them; saying so is more useful than
 * an Apply button that does nothing.
 */

type Finding = {
  info: ServingIssueInfo;
  entities: { level: "Campaign" | "Ad group" | "Ad"; name: string; spendMicros: number }[];
  spendMicros: number;
};

const FIXER_LABEL: Record<FixableBy, string> = {
  advertiser: "You can fix this",
  orchardads: "We can fix this",
  openai: "OpenAI-side",
  billing: "Billing",
};

const LEVEL_ICON = {
  Campaign: Megaphone,
  "Ad group": Layers,
  Ad: Tags,
} as const;

export function ServingDoctor() {
  const { adAccountId, currency } = adAccountStore();
  const connection = useActiveConnection();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);

  // Three report calls, each account-wide. The insights endpoints take an
  // aggregation level inside an account scope, so there is no per-campaign
  // fan-out — which matters when rate limits are shared with the customer's
  // own tools.
  const query = useQuery({
    queryKey: ["serving-doctor", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const [campaigns, adGroups, ads] = await Promise.all([
        api.post("/reports/campaign", { adAccountId, days: 7, daily: false, limit: 500 }),
        api.post("/reports/adgroup", { adAccountId, days: 7, daily: false, limit: 500 }),
        api.post("/reports/ad", { adAccountId, days: 7, daily: false, limit: 500 }),
      ]);
      return {
        campaigns: (campaigns.data.report as ReportData).campaigns,
        adGroups: (adGroups.data.report as ReportData).adGroups,
        ads: (ads.data.report as ReportData).ads,
      };
    },
  });

  const { findings, blockedCount, healthyCount, atRiskSpend } = useMemo(() => {
    const byCode = new Map<string, Finding>();
    let blocked = 0;
    let healthy = 0;

    const add = (
      level: "Campaign" | "Ad group" | "Ad",
      name: string,
      codes: string[] | undefined,
      spendMicros: number
    ) => {
      if (!codes?.length) {
        healthy++;
        return;
      }
      const infos = codes.map(describeServingIssue).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
      if (infos.some((i) => i.severity === "blocking")) blocked++;

      for (const info of infos) {
        if (info.severity === "warning") continue;
        const existing = byCode.get(info.code) ?? { info, entities: [], spendMicros: 0 };
        existing.entities.push({ level, name, spendMicros });
        existing.spendMicros += spendMicros;
        byCode.set(info.code, existing);
      }
    };

    for (const c of query.data?.campaigns ?? []) {
      if (c.campaignStatus === "archived") continue;
      add("Campaign", c.campaignName, c.servingIssues, c.performance.spendMicros);
    }
    for (const g of query.data?.adGroups ?? []) {
      if (g.adGroupStatus === "archived") continue;
      add("Ad group", g.adGroupName, g.servingIssues, g.performance.spendMicros);
    }
    for (const a of query.data?.ads ?? []) {
      if (a.status === "archived") continue;
      add("Ad", a.adName, a.servingIssues, a.performance.spendMicros);
    }

    // Account-level causes first (they are the root of everything below them),
    // then by how many entities they stop.
    const levelWeight = { account: 0, campaign: 1, ad_group: 2, ad: 3 } as const;
    const list = [...byCode.values()].sort(
      (a, b) =>
        severityRank(a.info.severity) - severityRank(b.info.severity) ||
        levelWeight[a.info.level] - levelWeight[b.info.level] ||
        b.entities.length - a.entities.length
    );

    return {
      findings: list,
      blockedCount: blocked,
      healthyCount: healthy,
      atRiskSpend: list.reduce((s, f) => s + f.spendMicros, 0),
    };
  }, [query.data]);

  // The report request is what triggers a cold sync, and that sync is what
  // refreshes the account snapshot. The connection in the store was loaded
  // BEFORE any of that, so its review status can be stale — it was captured
  // when the key was pasted and never updated since. Refresh it once the report
  // lands, or the banner below keeps asserting a rejection that OpenAI has
  // already cleared.
  const synced = query.isSuccess;
  useEffect(() => {
    if (synced) queryClient.invalidateQueries({ queryKey: ["connections"] });
  }, [synced, queryClient]);

  // Never synced: entity metadata (and therefore every serving issue) lives in
  // our cache, so before a sync this tool would find nothing and read as
  // "everything is fine" — a false all-clear on the one feature whose whole
  // job is telling you why nothing is running.
  const neverSynced = !connection?.lastSyncAt;

  // The account's own brand review outranks everything: an account that hasn't
  // passed it cannot serve a single ad, no matter what its campaigns look like.
  // Only asserted once we have a synced snapshot, so a stale "rejected" from
  // connect time can't produce a false alarm.
  const brandBlocked =
    !neverSynced && !!connection?.reviewStatus && connection.reviewStatus !== "approved";

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to run diagnostics.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Serving Doctor</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Every campaign, ad group and ad that can&apos;t deliver right now, grouped by root cause.
            Read straight from OpenAI&apos;s own diagnostics — no guesswork.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn("w-4 h-4 mr-1.5", query.isFetching && "animate-spin")} />
          Re-check
        </Button>
      </header>

      {neverSynced && !query.isLoading && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 flex gap-3">
          <RefreshCw className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              First sync is still running
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Serving issues come from OpenAI&apos;s entity data, which we pull into our own
              tables. Until that first pull finishes this page can&apos;t tell you anything —
              it is not saying your account is healthy. Give it a moment and re-check.
            </p>
          </div>
        </div>
      )}

      {brandBlocked && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
          <Building2 className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              This ad account hasn&apos;t passed brand review
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Review status is <strong className="text-foreground">{connection?.reviewStatus}</strong>
              {connection?.reviewReason ? ` (${connection.reviewReason})` : ""}. Until it&apos;s
              approved, nothing in this account can serve — fixing individual campaigns won&apos;t
              help. Resolve it in Ads Manager first.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          icon={CircleSlash}
          tone="critical"
          label="Blocked entities"
          value={query.isLoading ? null : blockedCount}
          sub={findings.length ? `${findings.length} distinct cause${findings.length === 1 ? "" : "s"}` : "Nothing blocked"}
        />
        <StatTile
          icon={CheckCircle2}
          tone="ok"
          label="Delivering"
          value={query.isLoading ? null : healthyCount}
          sub="No issues reported"
        />
        <StatTile
          icon={TriangleAlert}
          tone="warning"
          label="Spend on blocked entities"
          value={null}
          display={query.isLoading ? undefined : money(currency, atRiskSpend)}
          sub="Last 7 days, before delivery stopped"
        />
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : findings.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-2">
          <Stethoscope className="w-10 h-10 text-emerald-500" />
          <h2 className="text-base font-semibold text-foreground">Everything can deliver</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            No campaign, ad group or ad is blocked. If something still isn&apos;t getting
            impressions, it&apos;s a bidding or demand question — not a serving one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {findings.map((f) => {
            const isOpen = open === f.info.code;
            return (
              <div key={f.info.code} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : f.info.code)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                >
                  {f.info.fixableBy === "billing" ? (
                    <CreditCard className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <TriangleAlert
                      className={cn(
                        "w-5 h-5 shrink-0 mt-0.5",
                        f.info.severity === "blocking" ? "text-destructive" : "text-amber-600"
                      )}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{f.info.title}</h3>
                      <Badge
                        variant="outline"
                        className={cn("text-[11px] font-normal capitalize", getSeverityColor(f.info.severity))}
                      >
                        {f.info.severity === "blocking" ? "Not delivering" : "Reduced delivery"}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {FIXER_LABEL[f.info.fixableBy]}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {f.entities.length} entit{f.entities.length === 1 ? "y" : "ies"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.info.meaning}</p>
                  </div>

                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
                    <div className="rounded-lg bg-muted/40 border border-border p-3">
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        What to do
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{f.info.fix}</p>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Affected
                      </h4>
                      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                        {f.entities.slice(0, 15).map((e, i) => {
                          const Icon = LEVEL_ICON[e.level];
                          return (
                            <li key={`${e.name}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm text-foreground truncate">{e.name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{e.level}</span>
                              </div>
                              {e.spendMicros > 0 && (
                                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                  {money(currency, e.spendMicros)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {f.entities.length > 15 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          +{f.entities.length - 15} more with the same cause.
                        </p>
                      )}
                    </div>

                    {f.info.code.startsWith("ad_account_") && (
                      <p className="text-xs text-muted-foreground">
                        This is an account-level problem. Fixing it clears the issue for every
                        entity listed above at once.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  display,
  sub,
}: {
  icon: typeof CircleSlash;
  tone: "critical" | "warning" | "ok";
  label: string;
  value: number | null;
  display?: string;
  sub: string;
}) {
  const toneClass =
    tone === "critical"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", toneClass)} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground mt-1.5 tabular-nums">
        {display !== undefined ? (
          display
        ) : value === null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          count(value)
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
