"use client";

/**
 * Autopilot suggestions table — the preview a run produces. Select the
 * proposed changes you want, review the confirm dialog, and apply them to
 * Apple in one shot. NOTIFY (report-only) rows are informational and can be
 * hidden but never applied.
 */

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { appleErrorToast } from "@/lib/openai/errorToast";
import type { Suggestion } from "@/lib/autopilot/types";
import {
  ACTION_BADGE, ACTION_SHORT, SUGGESTION_METRICS, metricDef, scopeDef, fmtMetricValue,
} from "@/components/autopilot/shared";
import { EmptyRow } from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InfoHint, METRIC_HINTS } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { CheckCircle2, Download, Info, Loader2, Sparkles, TriangleAlert, Zap } from "lucide-react";

const COLS = 3 + SUGGESTION_METRICS.length; // checkbox + entity + action + metrics

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(suggestions: Suggestion[], strategyName: string) {
  const header = ["Entity", "Scope", "Campaign", "Geo", "Rule", "Action", "Current", "New", "Spend", "Installs", "Taps", "CPA"];
  const lines = suggestions.map((s) =>
    [
      s.entityName, s.scope, s.campaignName || "", s.geo || "", s.ruleName, s.actionLabel,
      s.currentValue ?? "", s.newValue ?? "",
      s.metrics?.SPEND ?? "", s.metrics?.INSTALLS ?? "", s.metrics?.TAPS ?? "", s.metrics?.CPA ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  const blob = new Blob([[header.map(csvEscape).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `autopilot-${strategyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preview"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function metricCell(key: string, s: Suggestion): string {
  const v = s.metrics?.[key];
  if (v == null || Number.isNaN(Number(v))) return "—";
  if (metricDef(key)?.unit === "money") return money(s.currency || "USD", Number(v));
  return fmtMetricValue(key, Number(v), s.currency || "USD");
}

export function SuggestionsPanel({
  suggestions,
  adAccountId,
  strategyId,
  strategyName,
  onApplied,
  onAutomate,
}: {
  suggestions: Suggestion[];
  adAccountId: string;
  /** Present when previewing a saved strategy; omitted for inline builder previews. */
  strategyId?: string;
  strategyName: string;
  /** Called after a successful apply so the caller can refetch. */
  onApplied?: () => void;
  /** When set, shows an "Automate" shortcut in the header. */
  onAutomate?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideNotify, setHideNotify] = useState(false);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());
  const [failedKeys, setFailedKeys] = useState<Map<string, string>>(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const visible = useMemo(
    () => (hideNotify ? suggestions.filter((s) => s.actionType !== "NOTIFY") : suggestions),
    [suggestions, hideNotify]
  );
  const notifyCount = useMemo(() => suggestions.filter((s) => s.actionType === "NOTIFY").length, [suggestions]);
  const selectable = useMemo(
    () => visible.filter((s) => s.actionType !== "NOTIFY" && !appliedKeys.has(s.key)),
    [visible, appliedKeys]
  );
  const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.key));
  const toApply = suggestions.filter((s) => selected.has(s.key) && s.actionType !== "NOTIFY" && !appliedKeys.has(s.key));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set([...prev].filter((k) => !selectable.some((s) => s.key === k)));
      const next = new Set(prev);
      selectable.forEach((s) => next.add(s.key));
      return next;
    });
  };

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/autopilot/apply", {
        adAccountId,
        ...(strategyId ? { strategyId } : {}),
        suggestions: toApply,
      });
      return res.data as { applied: number; failed: number; results: { key: string; ok: boolean; error?: string }[] };
    },
    onSuccess: (data) => {
      setConfirmOpen(false);
      const okKeys = (data.results || []).filter((r) => r.ok).map((r) => r.key);
      setAppliedKeys((prev) => new Set([...prev, ...okKeys]));
      setFailedKeys((prev) => {
        const next = new Map(prev);
        (data.results || []).forEach((r) => {
          if (!r.ok) next.set(r.key, r.error || "Failed");
          else next.delete(r.key);
        });
        return next;
      });
      setSelected(new Set());
      if (data.failed > 0) {
        toast.warning(`${data.applied} applied · ${data.failed} failed`, {
          description: (data.results || []).find((r) => !r.ok)?.error,
        });
      } else {
        toast.success(`${data.applied} change${data.applied === 1 ? "" : "s"} applied on Apple`);
      }
      onApplied?.();
    },
    onError: (err) => appleErrorToast(err, "Couldn't apply the changes"),
  });

  return (
    <>
      <Card className="border rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">
                {suggestions.length === 0
                  ? "No matches"
                  : `${suggestions.length} match${suggestions.length === 1 ? "" : "es"}`}
              </p>
              {notifyCount > 0 && (
                <span className="text-xs text-muted-foreground">· {notifyCount} report-only</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {notifyCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Switch checked={hideNotify} onCheckedChange={setHideNotify} />
                  Hide report-only
                </label>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={suggestions.length === 0}
                onClick={() => downloadCsv(suggestions, strategyName)}
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </Button>
              {onAutomate && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onAutomate}>
                  <Zap className="w-3.5 h-3.5" />
                  Automate
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary cursor-pointer align-middle disabled:cursor-not-allowed"
                      aria-label="Select all"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="px-3 py-2 min-w-[220px]">Entity</TableHead>
                  <TableHead className="px-3 py-2 min-w-[220px]">Proposed change</TableHead>
                  {SUGGESTION_METRICS.map((m) => (
                    <TableHead key={m.key} className="px-3 py-2 text-right whitespace-nowrap">
                      {m.label}
                      {m.key === "CPA" && (
                        <InfoHint className="ml-1" side="left">{METRIC_HINTS.CPA}</InfoHint>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <EmptyRow
                    colSpan={COLS}
                    icon={Sparkles}
                    title={suggestions.length === 0 ? "No matches — nothing to change." : "All matches are report-only."}
                    sub={
                      suggestions.length === 0
                        ? "Every entity in scope is inside your rules. Loosen a threshold or widen the lookback to see matches."
                        : "Turn off “Hide report-only” to see them."
                    }
                  />
                ) : (
                  visible.map((s) => {
                    const isNotify = s.actionType === "NOTIFY";
                    const applied = appliedKeys.has(s.key);
                    const failure = failedKeys.get(s.key);
                    const context = [
                      scopeDef(s.scope)?.label || s.scope,
                      s.scope !== "CAMPAIGN" && s.campaignName ? `in ${s.campaignName}` : null,
                      s.geo ? `· ${s.geo}` : null,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <TableRow key={s.key} className={cn(applied && "opacity-60")}>
                        <TableCell className="px-4 py-3 align-top">
                          {applied ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Applied" />
                          ) : (
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-primary cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Select ${s.entityName}`}
                              checked={selected.has(s.key)}
                              disabled={isNotify}
                              title={isNotify ? "Info only — nothing to apply" : undefined}
                              onChange={() => toggleOne(s.key)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top max-w-[280px]">
                          <p className="text-sm font-medium truncate" title={s.entityName}>{s.entityName}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{context}</p>
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", ACTION_BADGE[s.actionType])}>
                              {ACTION_SHORT[s.actionType] || s.actionType}
                            </Badge>
                            <span className="text-sm">{s.actionLabel}</span>
                            {isNotify && !applied && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Info className="w-3 h-3" /> info only
                              </span>
                            )}
                            {applied && (
                              <span className="text-[10px] font-medium text-emerald-600">Applied</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Rule: {s.ruleName}</p>
                          {failure && (
                            <p className="text-[11px] text-rose-600 mt-0.5 inline-flex items-center gap-1">
                              <TriangleAlert className="w-3 h-3 shrink-0" /> {failure}
                            </p>
                          )}
                        </TableCell>
                        {SUGGESTION_METRICS.map((m) => (
                          <TableCell key={m.key} className="px-3 py-3 align-top text-right text-sm tabular-nums whitespace-nowrap">
                            {metricCell(m.key, s)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Sticky apply bar */}
      {toApply.length > 0 && (
        <div className="sticky bottom-4 z-30 flex justify-center">
          <div className="rounded-full border bg-background/95 backdrop-blur shadow-lg px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {toApply.length} change{toApply.length === 1 ? "" : "s"} selected
            </span>
            <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setConfirmOpen(true)}>
              <Zap className="w-3.5 h-3.5" />
              Apply {toApply.length} selected
            </Button>
          </div>
        </div>
      )}

      {/* Apply confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(open) => !applyMutation.isPending && setConfirmOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply {toApply.length} change{toApply.length === 1 ? "" : "s"} on Apple?</DialogTitle>
            <DialogDescription>
              These changes are made directly on your Apple Search Ads account. Bids and budgets can be changed
              back, but performance history won't be.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {toApply.map((s) => (
              <div key={s.key} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium" title={s.entityName}>{s.entityName}</span>
                <span className="text-muted-foreground text-xs shrink-0">{s.actionLabel}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={applyMutation.isPending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-1.5" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate()}>
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Apply now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
