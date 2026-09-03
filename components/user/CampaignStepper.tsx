"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared, theme-aligned progress stepper for the campaign create & edit flows.
 * Completed steps are clickable (to jump back); the current step and future
 * steps are not. Responsive: labels collapse to a "Step N of M" line on mobile.
 */
export function CampaignStepper({
  steps,
  current,
  onStepClick,
}: {
  steps: string[];
  current: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <div className="w-full mb-7">
      <div className="flex items-center">
        {steps.map((label, i) => {
          const isCurrent = i === current;
          const isPast = i < current;
          const clickable = isPast && !!onStepClick;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick!(i)}
                className={cn("flex items-center gap-2 group shrink-0", clickable ? "cursor-pointer" : "cursor-default")}
              >
                <span
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors shrink-0",
                    isCurrent && "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25",
                    isPast && "bg-primary/10 text-primary border-primary/30 group-hover:bg-primary/20",
                    !isCurrent && !isPast && "bg-background text-muted-foreground/60 border-border"
                  )}
                >
                  {isPast ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium whitespace-nowrap hidden md:inline transition-colors",
                    isCurrent
                      ? "text-foreground"
                      : isPast
                        ? "text-muted-foreground group-hover:text-foreground"
                        : "text-muted-foreground/40"
                  )}
                >
                  {label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-2 md:mx-3 min-w-[12px] rounded-full transition-colors",
                    i < current ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3 md:hidden">
        Step {current + 1} of {steps.length} · <span className="text-foreground font-medium">{steps[current]}</span>
      </p>
    </div>
  );
}
