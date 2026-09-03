"use client";

/**
 * Top suggestions widget — high-value next actions computed from real report
 * data (wasted spend, serving blocks, budget pacing, zero-conversion campaigns),
 * each linking to the tool that executes it.
 */

import Link from "next/link";
import type { Suggestion, SuggestionTone } from "@/lib/dashboard/insights";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WidgetCard, WidgetEmpty, WidgetSkeleton } from "./bits";
import {
  Lightbulb,
  ShieldMinus,
  TriangleAlert,
  Sparkles,
  Info,
  ArrowRight,
  CircleCheckBig,
  type LucideIcon,
} from "lucide-react";

const TONE: Record<SuggestionTone, { icon: LucideIcon; chip: string }> = {
  critical: { icon: ShieldMinus, chip: "bg-rose-600" },
  warning: { icon: TriangleAlert, chip: "bg-amber-500" },
  positive: { icon: Sparkles, chip: "bg-emerald-600" },
  info: { icon: Info, chip: "bg-sky-600" },
};

export function SuggestionsCard({
  suggestions,
  isLoading,
}: {
  suggestions: Suggestion[];
  isLoading: boolean;
}) {
  return (
    <WidgetCard icon={Lightbulb} title="Top Suggestions" iconClass="text-amber-500" flush>
      {isLoading ? (
        <div className="px-4 pb-3">
          <WidgetSkeleton rows={3} />
        </div>
      ) : suggestions.length === 0 ? (
        <WidgetEmpty
          icon={CircleCheckBig}
          title="No urgent actions"
          sub="No wasted spend, budget caps, or missed keywords detected in this range."
        />
      ) : (
        <div className="flex flex-col">
          {suggestions.map((s) => {
            const tone = TONE[s.tone];
            const ToneIcon = tone.icon;
            return (
              <div
                key={s.id}
                className="flex items-start sm:items-center gap-3 px-4 py-3 border-t first:border-t-0 hover:bg-muted/40 transition-colors"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    tone.chip
                  )}
                >
                  <ToneIcon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.sub}</p>
                </div>
                <Link href={s.href} className="shrink-0">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    {s.cta} <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
