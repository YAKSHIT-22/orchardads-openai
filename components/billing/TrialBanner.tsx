"use client";

import Link from "next/link";
import { Clock, Lock, Sparkles } from "lucide-react";

import { useBilling } from "@/lib/billing/useEntitlements";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Trial / read-only status banner.
 *
 * Shown only when there is something the user needs to know:
 *   - a trial with a week or less left
 *   - a trial that has ended (account is read-only)
 * A paying customer in good standing sees nothing, which is the point — a
 * permanent upgrade bar is noise that trains people to ignore the one message
 * that matters.
 *
 * The expired copy is deliberately not alarming. Their data is still there and
 * still visible; what stopped is writing and AI. Saying that plainly is more
 * likely to convert than implying we've taken something hostage.
 */
export function TrialBanner() {
  const { data } = useBilling();
  if (!data) return null;

  const { isTrialing, isReadOnly, trialDaysLeft, trialDays } = data;

  if (isReadOnly) {
    return (
      <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 md:px-6 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground inline-flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Your trial has ended. Dashboards, diagnostics and reports still work — applying
              changes and AI analysis are paused.
            </span>
          </p>
          <Button asChild size="sm" className="rounded-lg h-8 shrink-0">
            <Link href="/tools/billing">Choose a plan</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Quiet for most of the trial; speak up in the last week.
  if (!isTrialing || trialDaysLeft > 7) return null;

  const urgent = trialDaysLeft <= 3;

  return (
    <div
      className={cn(
        "border-b px-4 md:px-6 py-2.5",
        urgent ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/40"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground inline-flex items-center gap-2">
          {urgent ? (
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
          )}
          <span>
            {trialDaysLeft === 0
              ? "Your trial ends today."
              : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left of your ${trialDays}-day trial.`}{" "}
            <span className="text-muted-foreground">
              Every tool is unlocked until then.
            </span>
          </span>
        </p>
        <Button asChild size="sm" variant={urgent ? "default" : "outline"} className="rounded-lg h-8 shrink-0">
          <Link href="/tools/billing">See plans</Link>
        </Button>
      </div>
    </div>
  );
}
