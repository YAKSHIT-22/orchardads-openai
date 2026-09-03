"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Loader2, Plus, Sparkles, X } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, count } from "@/lib/format";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

import type { ReportData } from "@/types/reportsDetails";

/**
 * Context Hints — the OpenAI Ads analogue of keywords.
 *
 * This tool replaces Keyword Harvest, and the difference is not cosmetic. On
 * this platform there is no keyword list, no match type, and no per-term
 * reporting: an ad group carries free-text `context_hints[]` describing the
 * SITUATIONS in which the product is useful, and OpenAI decides when that
 * matches a conversation.
 *
 * Two consequences the UI has to be honest about:
 *
 *  - THERE ARE NO PER-HINT METRICS. You cannot see which hint earned a click,
 *    ever. So this tool cannot rank hints by performance the way a keyword tool
 *    would, and it doesn't pretend to — it shows ad-group-level performance and
 *    lets you edit the hints that produced it.
 *  - Good hints read like intents, not keywords. The AI assist is prompted for
 *    that, and the examples on the page teach it, because an advertiser
 *    arriving from Google Ads will otherwise paste a keyword list.
 */

const MAX_HINTS = ACCOUNT_LIMITS.contextHintsPerAdGroup;

export default function ContextHintsPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  const groupsQuery = useQuery({
    queryKey: ["adgroup-report", adAccountId, 30],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.post("/reports/adgroup", { adAccountId, days: 30, daily: false, limit: 500 });
      return res.data.report as ReportData;
    },
  });

  const groups = useMemo(
    () =>
      [...(groupsQuery.data?.adGroups ?? [])].sort(
        (a, b) => b.performance.spendMicros - a.performance.spendMicros
      ),
    [groupsQuery.data]
  );

  const selected = groups.find((g) => g.adGroupId === selectedId) ?? groups[0] ?? null;

  // The report doesn't carry context hints (they're entity state, not
  // performance), so the selected ad group is fetched fresh.
  const detailQuery = useQuery({
    queryKey: ["adgroup-detail", adAccountId, selected?.adGroupId],
    enabled: !!adAccountId && !!selected?.adGroupId,
    queryFn: async () => {
      const res = await api.post("/adgroups/getall", { adAccountId, limit: 500 });
      const list = (res.data?.adGroups?.data ?? []) as {
        id: string;
        context_hints?: string[];
      }[];
      return list.find((g) => g.id === selected!.adGroupId) ?? null;
    },
  });

  useEffect(() => {
    setHints(detailQuery.data?.context_hints ?? []);
    setDirty(false);
  }, [detailQuery.data]);

  const suggest = useMutation({
    mutationFn: async () => {
      const res = await api.post("/ai/suggest", {
        adAccountId,
        biddingType: "clicks",
        description: selected?.campaignName,
      });
      return res.data as { generated: boolean; reason?: string; contextHints?: string[] };
    },
    onSuccess: (data) => {
      if (!data.generated) {
        toast.error(data.reason || "Couldn't generate suggestions");
        return;
      }
      const fresh = (data.contextHints ?? []).filter(
        (h) => !hints.some((existing) => existing.toLowerCase() === h.toLowerCase())
      );
      if (!fresh.length) {
        toast.info("No new hints — you're already covering these angles.");
        return;
      }
      setHints((prev) => [...prev, ...fresh].slice(0, MAX_HINTS));
      setDirty(true);
      toast.success(`${fresh.length} hint${fresh.length === 1 ? "" : "s"} added — review before saving`);
    },
    onError: (err) => adsErrorToast(err, "Couldn't generate suggestions"),
  });

  const save = useMutation({
    mutationFn: async () =>
      api.post("/adgroups/update", {
        adAccountId,
        adGroupId: selected!.adGroupId,
        context_hints: hints,
      }),
    onSuccess: () => {
      toast.success("Context hints updated");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["adgroup-detail"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't save the hints"),
  });

  const addDraft = () => {
    const value = draft.trim();
    if (!value) return;
    if (hints.some((h) => h.toLowerCase() === value.toLowerCase())) {
      toast.info("That hint is already there.");
      return;
    }
    if (hints.length >= MAX_HINTS) {
      toast.error(`An ad group supports at most ${MAX_HINTS.toLocaleString()} hints.`);
      return;
    }
    setHints((prev) => [...prev, value]);
    setDraft("");
    setDirty(true);
  };

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to edit targeting.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Context Hints</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          The only targeting text OpenAI Ads has. Hints describe the situations where your product
          is useful — OpenAI decides when a conversation matches.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-2.5">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">These are not keywords.</strong> There are no match
            types and no per-hint reporting — you can never see which hint earned a click. Write
            intents, not search terms.
          </p>
          <p className="mt-1">
            Good: <em>&ldquo;comparing project tools for a small remote team&rdquo;</em> · Weak:{" "}
            <em>&ldquo;project management software&rdquo;</em>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Ad group picker */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Ad groups</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ranked by spend, last 30 days</p>
          </div>

          <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
            {groupsQuery.isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            ) : groups.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">No ad groups yet.</p>
            ) : (
              groups.map((g) => (
                <button
                  key={g.adGroupId}
                  type="button"
                  onClick={() => setSelectedId(g.adGroupId)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors",
                    selected?.adGroupId === g.adGroupId && "bg-primary/5 border-l-2 border-primary"
                  )}
                >
                  <p className="text-sm font-medium text-foreground truncate">{g.adGroupName}</p>
                  <p className="text-xs text-muted-foreground truncate">{g.campaignName}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
                    {money(currency, g.performance.spendMicros)} · {count(g.performance.clicks)} clicks
                    · {count(g.performance.conversions)} conv.
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Select an ad group to edit its hints.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{selected.adGroupName}</h2>
                  <p className="text-sm text-muted-foreground">{selected.campaignName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => suggest.mutate()}
                    disabled={suggest.isPending}
                  >
                    {suggest.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1.5" />
                    )}
                    Suggest hints
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-lg"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save hints"
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm">Add a hint</Label>
                <div className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addDraft();
                      }
                    }}
                    placeholder="e.g. planning a first trip to Japan with kids"
                    className="rounded-lg"
                  />
                  <Button variant="outline" className="rounded-lg" onClick={addDraft}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {hints.length.toLocaleString()} of {MAX_HINTS.toLocaleString()} used
                </p>
              </div>

              {detailQuery.isLoading ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : hints.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No context hints on this ad group. Without them, OpenAI has very little to go on
                    when deciding where to show these ads.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {hints.map((h) => (
                    <Badge key={h} variant="outline" className="gap-1 pr-1 py-1 font-normal">
                      {h}
                      <button
                        type="button"
                        onClick={() => {
                          setHints((prev) => prev.filter((x) => x !== h));
                          setDirty(true);
                        }}
                        className="rounded-full hover:bg-muted p-0.5"
                        aria-label={`Remove ${h}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {dirty && (
                <p className="text-xs text-amber-600">
                  Unsaved changes. Saving replaces the whole hint list on this ad group.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
