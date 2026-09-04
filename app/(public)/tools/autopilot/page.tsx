"use client";

/**
 * Autopilot — rule-driven bulk optimization for OpenAI Ads. Build a
 * strategy (rules against one scope), preview the exact changes it proposes,
 * apply them in one click, or automate the whole thing on a schedule.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import type { Suggestion } from "@/lib/autopilot/types";
import {
  type StrategyRow, type RunRow,
  strategySummary, fmtDateTime, FREQUENCY_LABEL, scopeDef,
} from "@/components/autopilot/shared";
import { StrategyBuilder, AUTOMATION_STEP } from "@/components/autopilot/builder";
import { SuggestionsPanel } from "@/components/autopilot/suggestions";
import { ToolHeader, StatCard, InsightBanner, SkeletonRows, EmptyRow, ErrorRow } from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Bot, CircleCheck, Clock, History, Loader2, Pencil, Play, Plus, ShieldAlert, Trash2, Zap,
} from "lucide-react";

function AutomationBadge({ s }: { s: StrategyRow }) {
  if (!s.automated) {
    return (
      <Badge variant="outline" className="text-[11px] text-muted-foreground">
        Manual
      </Badge>
    );
  }
  if (s.autoApply) {
    return (
      <Badge
        variant="outline"
        className="text-[11px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1"
      >
        <ShieldAlert className="w-3 h-3" />
        Auto · {FREQUENCY_LABEL[s.frequency]} · auto-applies
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] border-zinc-600/30 bg-zinc-600/10 text-zinc-800 dark:text-zinc-400 gap-1">
      <Clock className="w-3 h-3" />
      Auto · {FREQUENCY_LABEL[s.frequency]} · {s.notifyEmail ? "notifies" : "records"}
    </Badge>
  );
}

const RUN_MODE_BADGE: Record<RunRow["mode"], string> = {
  PREVIEW: "border-zinc-600/30 bg-zinc-600/10 text-zinc-800 dark:text-zinc-400",
  APPLY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  AUTO: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export default function AutopilotPage() {
  const qc = useQueryClient();
  const { adAccountId, currency } = adAccountStore();

  const [view, setView] = useState<"list" | "builder" | "suggestions">("list");
  const [editing, setEditing] = useState<StrategyRow | null>(null);
  const [builderStep, setBuilderStep] = useState(0);
  const [runResult, setRunResult] = useState<{ strategy: StrategyRow; suggestions: Suggestion[] } | null>(null);
  const [toDelete, setToDelete] = useState<StrategyRow | null>(null);
  const [historyFor, setHistoryFor] = useState<StrategyRow | null>(null);

  /* ── Queries ── */

  const strategiesQuery = useQuery<StrategyRow[]>({
    queryKey: ["autopilot-strategies", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.get("/autopilot", { params: { adAccountId } });
      return (res.data?.strategies || []) as StrategyRow[];
    },
  });
  const strategies = strategiesQuery.data || [];

  const runsQuery = useQuery<RunRow[]>({
    queryKey: ["autopilot-runs", historyFor?.id],
    enabled: !!historyFor,
    queryFn: async () => {
      const res = await api.get("/autopilot/runs", { params: { strategyId: historyFor!.id } });
      return (res.data?.runs || []) as RunRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["autopilot-strategies"] });

  /* ── Mutations ── */

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await api.post("/autopilot/mutate", { id, action: "toggle", enabled });
    },
    onSuccess: (_d, v) => {
      toast.success(v.enabled ? "Strategy enabled" : "Strategy paused");
      invalidate();
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the strategy"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post("/autopilot/mutate", { id, action: "delete" });
    },
    onSuccess: () => {
      toast.success("Strategy deleted");
      setToDelete(null);
      invalidate();
    },
    onError: (err) => adsErrorToast(err, "Couldn't delete the strategy"),
  });

  const runMutation = useMutation({
    mutationFn: async (strategy: StrategyRow) => {
      const res = await api.post("/autopilot/run", { adAccountId, strategyId: strategy.id });
      return { strategy, suggestions: (res.data?.suggestions || []) as Suggestion[] };
    },
    onSuccess: (data) => {
      setRunResult(data);
      setView("suggestions");
      invalidate();
    },
    onError: (err) => adsErrorToast(err, "Couldn't run the strategy"),
  });

  /* ── Navigation helpers ── */

  const openCreate = () => {
    setEditing(null);
    setBuilderStep(0);
    setView("builder");
  };

  const openEdit = (s: StrategyRow, step = 0) => {
    setEditing(s);
    setBuilderStep(step);
    setView("builder");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeBuilder = () => {
    setEditing(null);
    setView(runResult ? "suggestions" : "list");
  };

  const automatedCount = strategies.filter((s) => s.automated).length;
  const enabledCount = strategies.filter((s) => s.enabled).length;
  const autoApplyCount = strategies.filter((s) => s.automated && s.autoApply && s.enabled).length;

  /* ── Render ── */

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        {view === "builder" ? (
          <>
            <ToolHeader
              icon={Bot}
              title="Autopilot"
              description={editing ? "Update the strategy — scope stays fixed, everything else is editable." : "Build a rule set, preview it against live data, then save it."}
            />
            <StrategyBuilder
              editing={editing}
              initialStep={builderStep}
              onClose={closeBuilder}
              onSaved={() => {
                setEditing(null);
                setRunResult(null);
                setView("list");
                invalidate();
              }}
            />
          </>
        ) : view === "suggestions" && runResult ? (
          <>
            <ToolHeader
              icon={Bot}
              title={runResult.strategy.name}
              description={`Preview run · ${scopeDef(runResult.strategy.scope)?.label || runResult.strategy.scope} scope · last ${runResult.strategy.lookbackDays} days`}
            >
              <Button variant="outline" className="gap-1.5" onClick={() => { setRunResult(null); setView("list"); }}>
                <ArrowLeft className="w-4 h-4" />
                All strategies
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={runMutation.isPending}
                onClick={() => runMutation.mutate(runResult.strategy)}
              >
                {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Re-run
              </Button>
            </ToolHeader>
            <SuggestionsPanel
              suggestions={runResult.suggestions}
              adAccountId={adAccountId}
              strategyId={runResult.strategy.id}
              strategyName={runResult.strategy.name}
              onApplied={invalidate}
              onAutomate={() => openEdit(runResult.strategy, AUTOMATION_STEP)}
            />
          </>
        ) : (
          <>
            <ToolHeader
              icon={Bot}
              title="Autopilot"
              description="Build rules that optimize your account — preview changes, apply in one click, or automate them."
            >
              <Button onClick={openCreate} className="gap-1.5" disabled={!adAccountId}>
                <Plus className="w-4 h-4" />
                New strategy
              </Button>
            </ToolHeader>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Strategies" value={String(strategies.length)} sub="Saved for this org" icon={Bot} tone="primary" />
              <StatCard
                label="Enabled"
                value={String(enabledCount)}
                sub="Ready to run"
                icon={CircleCheck}
                tone={enabledCount > 0 ? "positive" : "neutral"}
              />
              <StatCard
                label="Automated"
                value={String(automatedCount)}
                sub="Run on a schedule"
                icon={Clock}
                tone={automatedCount > 0 ? "info" : "neutral"}
              />
            </div>

            {autoApplyCount > 0 && (
              <InsightBanner
                icon={ShieldAlert}
                tone="warning"
                title={`${autoApplyCount} strateg${autoApplyCount === 1 ? "y" : "ies"} will auto-apply changes to your live account`}
                sub="Scheduled runs make these changes without asking. Edit a strategy's automation step to switch back to review-first."
              />
            )}

            {/* Strategy list */}
            <Card className="border rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Your strategies
                  {strategies.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({strategies.length})</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="px-4 py-2 min-w-[280px]">Strategy</TableHead>
                        <TableHead className="px-3 py-2">
                          Scope <InfoHint>The level the rules evaluate — campaigns, ad groups, ads or countries. Fixed once the strategy is saved.</InfoHint>
                        </TableHead>
                        <TableHead className="px-3 py-2">Rules</TableHead>
                        <TableHead className="px-3 py-2 whitespace-nowrap">
                          Automation <InfoHint>Manual runs only when you press Run. Auto runs on a schedule; “auto-applies” means it also makes the changes in your live account without asking — otherwise you review first. It can never archive anything or pause the ad account.</InfoHint>
                        </TableHead>
                        <TableHead className="px-3 py-2">Enabled</TableHead>
                        <TableHead className="px-3 py-2 whitespace-nowrap">Last run</TableHead>
                        <TableHead className="px-3 py-2 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {strategiesQuery.isLoading ? (
                        <SkeletonRows rows={5} colSpan={7} />
                      ) : strategiesQuery.isError ? (
                        <ErrorRow
                          colSpan={7}
                          message={(strategiesQuery.error as any)?.response?.data?.error || "Couldn't load your strategies."}
                          onRetry={() => strategiesQuery.refetch()}
                        />
                      ) : strategies.length === 0 ? (
                        <EmptyRow
                          colSpan={7}
                          icon={Bot}
                          title="No strategies yet"
                          sub="Build your first rule set — start from a template and preview before anything changes."
                          action={
                            <Button size="sm" onClick={openCreate} className="gap-1.5 mt-1" disabled={!adAccountId}>
                              <Plus className="w-3.5 h-3.5" /> New strategy
                            </Button>
                          }
                        />
                      ) : (
                        strategies.map((s) => {
                          const running = runMutation.isPending && runMutation.variables?.id === s.id;
                          const rules = Array.isArray(s.rules) ? s.rules : [];
                          return (
                            <TableRow key={s.id} className={cn(!s.enabled && "opacity-60")}>
                              <TableCell className="px-4 py-3 align-top">
                                <p className="font-medium">{s.name}</p>
                                {s.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 max-w-md">{s.description}</p>
                                )}
                                <p className="text-[11px] text-muted-foreground mt-1 max-w-md" title={strategySummary(s, currency)}>
                                  {strategySummary(s, currency)}
                                </p>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <Badge variant="outline" className="text-[11px]">
                                  {scopeDef(s.scope)?.label || s.scope}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground tabular-nums">
                                {rules.length}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <AutomationBadge s={s} />
                                {s.automated && s.nextRunAt && (
                                  <p className="text-[10px] text-muted-foreground mt-1">next {fmtDateTime(s.nextRunAt)}</p>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <Switch
                                  checked={s.enabled}
                                  disabled={toggleMutation.isPending && toggleMutation.variables?.id === s.id}
                                  onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, enabled: v })}
                                />
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground whitespace-nowrap">
                                {fmtDateTime(s.lastRunAt)}
                                {typeof s._count?.runs === "number" && s._count.runs > 0 && (
                                  <p className="text-[10px]">{s._count.runs} run{s._count.runs === 1 ? "" : "s"}</p>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Run now — preview what would change"
                                    disabled={runMutation.isPending}
                                    onClick={() => runMutation.mutate(s)}
                                  >
                                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(s)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Run history"
                                    onClick={() => setHistoryFor(s)}
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                    title="Delete"
                                    onClick={() => setToDelete(s)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {runMutation.isPending && (
              <InsightBanner
                icon={Zap}
                tone="info"
                title="Running the strategy against your live performance data…"
                sub="This reads the OpenAI Ads insights API and can take a few seconds."
              />
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete strategy?</DialogTitle>
            <DialogDescription>
              “{toDelete?.name}” and its run history will be removed. Changes it already applied to your account stay as
              they are. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              className="gap-1.5"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run history */}
      <Dialog open={!!historyFor} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Run history — {historyFor?.name}</DialogTitle>
            <DialogDescription>The most recent runs, newest first.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {runsQuery.isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : runsQuery.isError ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {(runsQuery.error as any)?.response?.data?.error || "Couldn't load the run history."}
              </p>
            ) : (runsQuery.data || []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No runs yet — hit Run on the strategy.</p>
            ) : (
              <div className="divide-y">
                {(runsQuery.data || []).map((r) => (
                  <div key={r.id} className="px-3.5 py-2.5 flex items-center gap-3">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", RUN_MODE_BADGE[r.mode])}>
                      {r.mode === "AUTO" ? "Scheduled" : r.mode === "APPLY" ? "Applied" : "Preview"}
                    </Badge>
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="tabular-nums">{r.matchedCount} matched</span>
                      {(r.mode !== "PREVIEW" || r.appliedCount > 0) && (
                        <span className="text-muted-foreground"> · {r.appliedCount} applied{r.failedCount > 0 ? ` · ${r.failedCount} failed` : ""}</span>
                      )}
                      {r.error && <p className="text-[11px] text-rose-600 truncate" title={r.error}>{r.error}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{fmtDateTime(r.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
