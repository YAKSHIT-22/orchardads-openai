"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  KeyRound,
  Loader2,
  Megaphone,
  ScrollText,
  ShieldCheck,
  User,
} from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { money } from "@/lib/format";
import { relativeTime, formatInAccountTz } from "@/lib/openai/time";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Activity — the audit trail.
 *
 * This page is the product's promise made checkable: every change OrchardAds
 * made to a live ad account, what it was before, what it became, and who or what
 * triggered it. Nothing here can be edited or deleted, by anyone, including us.
 *
 * The before/after values are rendered as a diff rather than raw JSON, because
 * the question a user actually has is "what did this do to my budget", and a
 * JSON blob makes them do the reading.
 */

type Entry = {
  id: string;
  action: string;
  outcome: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "CAMPAIGN", label: "Campaigns" },
  { key: "ADGROUP", label: "Ad groups" },
  { key: "AD", label: "Ads" },
  { key: "AUTOPILOT", label: "Autopilot" },
  { key: "CONNECTION", label: "Connections" },
] as const;

export default function ActivityPage() {
  const { adAccountId, currency, timezone } = adAccountStore();
  const [filter, setFilter] = useState<string>("");

  const query = useInfiniteQuery({
    queryKey: ["activity", adAccountId, filter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get("/activity", {
        params: {
          ...(adAccountId ? { adAccountId } : {}),
          ...(filter ? { action: filter } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 50,
        },
      });
      return res.data as { data: Entry[]; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const entries = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data]
  );

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          Every change made to your ad accounts through OrchardAds, with the value before and after.
          This log is append-only — nothing here can be edited or removed.
        </p>
      </header>

      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-2">
          <ScrollText className="w-10 h-10 text-muted-foreground/30" />
          <h2 className="text-base font-semibold text-foreground">Nothing here yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Changes appear as soon as you apply your first recommendation or edit a campaign.
          </p>
          <Button asChild variant="outline" className="rounded-lg mt-1">
            <Link href="/tools/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} currency={currency} timezone={timezone} />
            ))}
          </ol>

          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="rounded-lg"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  currency,
  timezone,
}: {
  entry: Entry;
  currency: string;
  timezone: string;
}) {
  const failed = entry.outcome === "FAILURE";
  const automated = entry.action.startsWith("AUTOPILOT") || entry.action.startsWith("ALERT");
  const credential = entry.action.startsWith("CONNECTION");

  const Icon = credential ? KeyRound : automated ? Bot : entry.entityType === "AD" ? Megaphone : Megaphone;

  const diff = describeDiff(entry, currency);

  return (
    <li className="rounded-xl border border-border bg-card p-4 flex gap-3">
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          failed ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{humanAction(entry.action)}</span>
          {entry.entityName && (
            <span className="text-sm text-muted-foreground truncate">{entry.entityName}</span>
          )}
          {failed && (
            <Badge variant="outline" className="text-[11px] font-normal text-destructive border-destructive/30">
              Failed
            </Badge>
          )}
          {automated && (
            <Badge variant="outline" className="text-[11px] font-normal gap-1">
              <Bot className="w-3 h-3" />
              Automated
            </Badge>
          )}
        </div>

        {diff && (
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground line-through tabular-nums">{diff.from}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground tabular-nums">{diff.to}</span>
            {diff.delta && (
              <span
                className={cn(
                  "text-xs",
                  diff.delta.startsWith("-")
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-sky-600 dark:text-sky-400"
                )}
              >
                {diff.delta}
              </span>
            )}
          </div>
        )}

        {typeof entry.meta?.reason === "string" && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{entry.meta.reason}</p>
        )}
        {typeof entry.meta?.error === "string" && (
          <p className="text-xs text-destructive mt-1 leading-relaxed">{entry.meta.error}</p>
        )}
        {entry.meta?.irreversible === true && (
          <p className="text-xs text-amber-600 mt-1 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            This action could not be undone.
          </p>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          {formatInAccountTz(entry.createdAt, timezone, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>
    </li>
  );
}

/**
 * Render before/after as a human diff.
 *
 * Only the fields that actually change through this product are decoded —
 * budget, bid, status. Anything else falls through to no diff rather than
 * dumping JSON at someone trying to understand a budget change.
 */
function describeDiff(
  entry: Entry,
  currency: string
): { from: string; to: string; delta?: string } | null {
  const before = entry.before as Record<string, any> | null;
  const after = entry.after as Record<string, any> | null;
  if (!before && !after) return null;

  const beforeBudget = before?.budget?.lifetime_spend_limit_micros;
  const afterBudget = after?.budget?.lifetime_spend_limit_micros;
  if (typeof beforeBudget === "number" && typeof afterBudget === "number" && beforeBudget !== afterBudget) {
    return {
      from: money(currency, beforeBudget),
      to: money(currency, afterBudget),
      delta: pct(beforeBudget, afterBudget),
    };
  }

  const beforeBid = before?.bidding_config?.max_bid_micros;
  const afterBid = after?.bidding_config?.max_bid_micros;
  if (typeof beforeBid === "number" && typeof afterBid === "number" && beforeBid !== afterBid) {
    return { from: money(currency, beforeBid), to: money(currency, afterBid), delta: pct(beforeBid, afterBid) };
  }

  // Autopilot records a plain { value } pair rather than a full entity.
  if (typeof before?.value === "number" && typeof after?.value === "number") {
    return {
      from: money(currency, before.value),
      to: money(currency, after.value),
      delta: pct(before.value, after.value),
    };
  }

  if (before?.status && after?.status && before.status !== after.status) {
    return { from: String(before.status), to: String(after.status) };
  }

  return null;
}

function pct(from: number, to: number): string | undefined {
  if (!from) return undefined;
  const change = ((to - from) / from) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`;
}

function humanAction(action: string): string {
  const map: Record<string, string> = {
    CAMPAIGN_UPDATED: "Campaign updated",
    CAMPAIGN_CREATED: "Campaign created",
    CAMPAIGN_PAUSE: "Campaign paused",
    CAMPAIGN_ACTIVATE: "Campaign activated",
    CAMPAIGN_ARCHIVE: "Campaign archived",
    ADGROUP_UPDATED: "Ad group updated",
    ADGROUP_CREATED: "Ad group created",
    ADGROUP_PAUSE: "Ad group paused",
    ADGROUP_ACTIVATE: "Ad group activated",
    AD_CREATED: "Ad created",
    AD_PAUSE: "Ad paused",
    AD_ACTIVATE: "Ad activated",
    SPEND_LIMIT_CREATED: "Spend limit created",
    CONNECTION_CREATED: "Ad account connected",
    CONNECTION_KEY_ROTATED: "API key replaced",
    CONNECTION_DELETED: "Ad account disconnected",
  };
  if (map[action]) return map[action];

  const pretty = action.replace(/_/g, " ").toLowerCase();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}
