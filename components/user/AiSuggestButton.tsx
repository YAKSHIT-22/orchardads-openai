"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Contract of POST /api/ai/suggest ────────────────────────────────────────
export interface AiKeywordSuggestion { text: string; matchType: "BROAD" | "EXACT"; bid: number }
export interface AiNegKeywordSuggestion { text: string; matchType: "BROAD" | "EXACT" }

interface AiSuggestResult {
  generated: boolean;
  reason?: string;
  dailyBudget?: number;
  defaultBid?: number;
  keywords?: AiKeywordSuggestion[];
  negativeKeywords?: AiNegKeywordSuggestion[];
  rationale?: string;
}

/** What the user chose to apply from the review dialog. */
export interface AiApplySelection {
  dailyBudget?: number;
  defaultBid?: number;
  keywords: AiKeywordSuggestion[];
  negativeKeywords: AiNegKeywordSuggestion[];
}

interface AiSuggestButtonProps {
  adAccountId: string | null | undefined;
  /** Required before a request is ever sent. */
  adamId: string | undefined;
  supplySource: string | undefined;
  countriesOrRegions?: string[];
  /** Org currency — used for the request and to price suggested keyword bids. */
  currency: string;
  /** "full" = budget + bid + keywords (create flow); "keywords" = keywords/negatives only (edit flow). */
  mode: "full" | "keywords";
  /** Whether the campaign's placement supports keywords — keyword sections are hidden otherwise. */
  supportsKeywords: boolean;
  /** Set when targeting keywords can't be applied (e.g. the target ad group uses Search Match). */
  keywordsBlockedNote?: string;
  /** Where suggested keywords will be appended, e.g. the primary ad group's name. */
  keywordTargetLabel?: string;
  /** Where suggested negatives go, e.g. "campaign level" or a specific ad group. */
  negTargetLabel?: string;
  /** Extra reason to disable the button (shown as a tooltip). */
  disabledHint?: string;
  className?: string;
  onApply: (selection: AiApplySelection) => void;
}

const matchLabel = (m: "BROAD" | "EXACT") => (m === "BROAD" ? "Broad" : "Exact");

/**
 * "Suggest with AI" button + review dialog. Fetches suggestions from
 * /api/ai/suggest and lets the user review & pick what to apply — nothing is
 * ever applied silently. Falls back to a clear toast when generation fails.
 */
export function AiSuggestButton({
  adAccountId, adamId, supplySource, countriesOrRegions, currency,
  mode, supportsKeywords, keywordsBlockedNote, keywordTargetLabel, negTargetLabel = "campaign level",
  disabledHint, className, onApply,
}: AiSuggestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AiSuggestResult | null>(null);

  // Review-dialog selection state
  const [useBudget, setUseBudget] = useState(true);
  const [useBid, setUseBid] = useState(true);
  const [kwSelected, setKwSelected] = useState<Set<number>>(new Set());
  const [negSelected, setNegSelected] = useState<Set<number>>(new Set());

  const missingHint = disabledHint
    ?? (!adamId
      ? "Choose an app first"
      : !supplySource
        ? "Choose an ad placement first"
        : undefined);
  const disabled = Boolean(missingHint);

  const showBudget = mode === "full" && typeof result?.dailyBudget === "number";
  const showBid = mode === "full" && typeof result?.defaultBid === "number";
  const kwApplicable = supportsKeywords && !keywordsBlockedNote;
  const suggestedKws = kwApplicable ? result?.keywords ?? [] : [];
  const suggestedNegs = supportsKeywords ? result?.negativeKeywords ?? [] : [];

  const fetchSuggestions = async () => {
    // Never send a request without adamId.
    if (!adamId || !adAccountId) return;
    setLoading(true);
    try {
      const res = await api.post("/ai/suggest", {
        adAccountId, adamId, supplySource, countriesOrRegions, currency,
      });
      const data: AiSuggestResult = res.data || {};

      if (!data.generated) {
        toast.error("Suggestions couldn't be generated — please add manually.", {
          description: data.reason,
        });
        return;
      }

      // Keep only usable rows so a malformed model item never reaches the form.
      const clean: AiSuggestResult = {
        ...data,
        dailyBudget: typeof data.dailyBudget === "number" && data.dailyBudget > 0 ? data.dailyBudget : undefined,
        defaultBid: typeof data.defaultBid === "number" && data.defaultBid > 0 ? data.defaultBid : undefined,
        keywords: (data.keywords ?? []).filter(
          (k) => k?.text?.trim() && (k.matchType === "BROAD" || k.matchType === "EXACT") && Number(k.bid) > 0
        ),
        negativeKeywords: (data.negativeKeywords ?? []).filter(
          (k) => k?.text?.trim() && (k.matchType === "BROAD" || k.matchType === "EXACT")
        ),
      };

      const hasAnything =
        (mode === "full" && (clean.dailyBudget != null || clean.defaultBid != null)) ||
        (supportsKeywords && ((clean.keywords?.length ?? 0) > 0 || (clean.negativeKeywords?.length ?? 0) > 0));
      if (!hasAnything) {
        toast.error("Suggestions couldn't be generated — please add manually.", {
          description: data.reason || "The model didn't return anything applicable to this step.",
        });
        return;
      }

      setResult(clean);
      setUseBudget(clean.dailyBudget != null);
      setUseBid(clean.defaultBid != null);
      setKwSelected(new Set((clean.keywords ?? []).map((_, i) => i)));
      setNegSelected(new Set((clean.negativeKeywords ?? []).map((_, i) => i)));
      setOpen(true);
    } catch (err: any) {
      toast.error("Suggestions couldn't be generated — please add manually.", {
        description: err?.response?.data?.error || err?.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleIn = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  };

  const selectedCount =
    (showBudget && useBudget ? 1 : 0) +
    (showBid && useBid ? 1 : 0) +
    [...kwSelected].filter((i) => i < suggestedKws.length).length +
    [...negSelected].filter((i) => i < suggestedNegs.length).length;

  const handleApply = () => {
    if (!result) return;
    onApply({
      dailyBudget: showBudget && useBudget ? result.dailyBudget : undefined,
      defaultBid: showBid && useBid ? result.defaultBid : undefined,
      keywords: suggestedKws.filter((_, i) => kwSelected.has(i)),
      negativeKeywords: suggestedNegs.filter((_, i) => negSelected.has(i)),
    });
    setOpen(false);
  };

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || loading}
      onClick={fetchSuggestions}
      className={cn("gap-1.5", className)}
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Sparkles className="w-3.5 h-3.5 text-primary" />}
      {loading ? "Thinking…" : "Suggest with AI"}
    </Button>
  );

  return (
    <>
      {disabled && missingHint ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>{button}</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{missingHint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : button}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              AI suggestions
            </DialogTitle>
            <DialogDescription>
              Review what to apply — nothing is changed until you press Apply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {(showBudget || showBid) && (
              <div className="flex flex-col gap-2">
                {showBudget && (
                  <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary mt-0.5 h-3.5 w-3.5 shrink-0"
                      checked={useBudget}
                      onChange={(e) => setUseBudget(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Daily budget → {currency} {result?.dailyBudget}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Replaces the campaign&apos;s current daily budget
                      </span>
                    </span>
                  </label>
                )}
                {showBid && (
                  <label className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary mt-0.5 h-3.5 w-3.5 shrink-0"
                      checked={useBid}
                      onChange={(e) => setUseBid(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Default bid → {currency} {result?.defaultBid}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Replaces the primary ad group&apos;s default bid
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {supportsKeywords && keywordsBlockedNote && (result?.keywords?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{keywordsBlockedNote}</p>
              </div>
            )}

            {suggestedKws.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Keywords ({suggestedKws.length})
                    {keywordTargetLabel && (
                      <span className="normal-case font-normal tracking-normal"> — added to {keywordTargetLabel}</span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline underline-offset-2"
                    onClick={() => setKwSelected(
                      kwSelected.size === suggestedKws.length ? new Set() : new Set(suggestedKws.map((_, i) => i))
                    )}
                  >
                    {kwSelected.size === suggestedKws.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
                  {suggestedKws.map((k, i) => (
                    <label key={i} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-primary h-3.5 w-3.5 shrink-0"
                        checked={kwSelected.has(i)}
                        onChange={() => setKwSelected((p) => toggleIn(p, i))}
                      />
                      <span className="text-sm flex-1 truncate">{k.text}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {matchLabel(k.matchType)} · {currency} {k.bid}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {suggestedNegs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Negative keywords ({suggestedNegs.length})
                    <span className="normal-case font-normal tracking-normal"> — {negTargetLabel}</span>
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline underline-offset-2"
                    onClick={() => setNegSelected(
                      negSelected.size === suggestedNegs.length ? new Set() : new Set(suggestedNegs.map((_, i) => i))
                    )}
                  >
                    {negSelected.size === suggestedNegs.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-col rounded-lg border divide-y overflow-hidden">
                  {suggestedNegs.map((k, i) => (
                    <label key={i} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-primary h-3.5 w-3.5 shrink-0"
                        checked={negSelected.has(i)}
                        onChange={() => setNegSelected((p) => toggleIn(p, i))}
                      />
                      <span className="text-sm flex-1 truncate">{k.text}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{matchLabel(k.matchType)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {result?.rationale && (
              <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <Sparkles className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <span>{result.rationale}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApply} disabled={selectedCount === 0} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Apply {selectedCount > 0 ? `(${selectedCount})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
