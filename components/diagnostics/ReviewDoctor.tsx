"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { describeReviewReason, type ReviewReasonInfo } from "@/lib/openai/reviewReasons";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { AdReportRow, ReportData } from "@/types/reportsDetails";

/**
 * Review Doctor — "why was my ad rejected, and how do I fix it?"
 *
 * This is one of the two reasons this product is useful on the day an account is
 * connected. The platform
 * publishes `review_status` plus an ENUMERATED `review.reason`, and that enum is
 * dominated by landing-page and crawler failures — blocked bots, robots.txt,
 * 403s, login walls — not subjective policy calls. Those are fixable in an
 * afternoon, and nobody is currently telling advertisers how.
 *
 * Grouping is by CAUSE, not by ad, and that is the whole design: one
 * misconfigured WAF rule rejects every ad on the account at once, so thirty
 * identical rows would be thirty copies of one problem.
 */

type Group = { reason: ReviewReasonInfo; ads: AdReportRow[]; spendMicros: number };

export function ReviewDoctor() {
  const { adAccountId, currency } = adAccountStore();
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["review-doctor", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/ad", { adAccountId, days: 30, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const ads = query.data?.ads ?? [];

  const { rejected, inReview, approved, groups } = useMemo(() => {
    const rejectedAds = ads.filter((a) => a.reviewStatus === "rejected");
    const pending = ads.filter((a) => a.reviewStatus === "in_review");
    const ok = ads.filter((a) => a.reviewStatus === "approved");

    const byReason = new Map<string, AdReportRow[]>();
    for (const ad of rejectedAds) {
      const key = ad.reviewReason || "unknown";
      byReason.set(key, [...(byReason.get(key) ?? []), ad]);
    }

    const grouped: Group[] = [...byReason.entries()]
      .map(([code, list]) => ({
        reason: describeReviewReason(code)!,
        ads: list,
        spendMicros: list.reduce((s, a) => s + a.performance.spendMicros, 0),
      }))
      .sort((a, b) => b.ads.length - a.ads.length);

    return { rejected: rejectedAds, inReview: pending, approved: ok, groups: grouped };
  }, [ads]);

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to check ad reviews.</p>
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Review Doctor</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            An ad only serves once OpenAI approves it. Most rejections are landing-page or crawler
            problems on your own site — each one below has the specific fix.
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

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          icon={ShieldAlert}
          tone="critical"
          label="Rejected"
          value={query.isLoading ? null : rejected.length}
          sub={rejected.length ? `${groups.length} distinct cause${groups.length === 1 ? "" : "s"}` : "Nothing rejected"}
        />
        <StatTile
          icon={Clock}
          tone="warning"
          label="In review"
          value={query.isLoading ? null : inReview.length}
          sub="Usually clears in minutes"
        />
        <StatTile
          icon={CheckCircle2}
          tone="ok"
          label="Approved"
          value={query.isLoading ? null : approved.length}
          sub="Eligible to serve"
        />
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : rejected.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          <h2 className="text-base font-semibold text-foreground">No rejected ads</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {inReview.length > 0
              ? `${inReview.length} ad${inReview.length === 1 ? " is" : "s are"} still in review. Nothing to fix.`
              : "Every ad in this account has passed review."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const isOpen = open === g.reason.code;
            return (
              <div key={g.reason.code} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.reason.code)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                >
                  <TriangleAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{g.reason.title}</h3>
                      <Badge variant="outline" className="text-[11px] font-normal capitalize">
                        {g.reason.category}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {g.ads.length} ad{g.ads.length === 1 ? "" : "s"}
                      </Badge>
                      {g.spendMicros > 0 && (
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {money(currency, g.spendMicros)} spent before rejection
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {g.reason.cause}
                    </p>
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
                    <div>
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        How to fix it
                      </h4>
                      <ol className="mt-2 flex flex-col gap-2">
                        {g.reason.fix.map((step, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                      {g.reason.autoRetries && (
                        <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                          Once the underlying problem is fixed, review runs again automatically —
                          you don&apos;t need to recreate the ad.
                        </p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Affected ads
                      </h4>
                      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                        {g.ads.slice(0, 12).map((ad) => (
                          <li key={ad.adId} className="px-3 py-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">{ad.title || ad.adName}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {ad.campaignName} · {ad.adGroupName}
                              </p>
                            </div>
                            {ad.targetUrl && (
                              <a
                                href={ad.targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                              >
                                Open URL
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                      {g.ads.length > 12 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          +{g.ads.length - 12} more with the same cause.
                        </p>
                      )}
                    </div>
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
  sub,
}: {
  icon: typeof ShieldAlert;
  tone: "critical" | "warning" | "ok";
  label: string;
  value: number | null;
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
      <p className="text-2xl font-semibold text-foreground mt-1.5 tabular-nums">
        {value === null ? <Skeleton className="h-7 w-12" /> : count(value)}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
