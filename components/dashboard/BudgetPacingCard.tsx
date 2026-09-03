"use client";

/**
 * Budget pacing widget.
 *
 * Rebuilt around LIFETIME budgets, which is what OpenAI Ads campaigns actually
 * carry. That changes the question the widget answers:
 *
 *   A daily budget asks "am I capped today?" — a utilisation gauge.
 *   A LIFETIME budget asks "when does this campaign go dark?" — a countdown.
 *
 * A lifetime budget stops delivery entirely when it is consumed and does not
 * reset, so the meter shows budget CONSUMED and the label shows days of runway.
 * Deep analysis lives in /tools/optimize/budget-pacing.
 */

import { useMemo } from "react";
import type { PacingRow, PacingStatus } from "@/lib/optimize/budgetPacing";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WidgetCard, WidgetEmpty, WidgetLink, WidgetSkeleton, WidgetError } from "./bits";
import { Gauge, Wallet } from "lucide-react";

const STATUS_STYLE: Record<PacingStatus, { label: string; fill: string; text: string }> = {
  exhausted: { label: "Stopped", fill: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  running_out: { label: "Running out", fill: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  underspending: { label: "Under", fill: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  healthy: { label: "On track", fill: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

function PacingMeter({ row, currency }: { row: PacingRow; currency: string }) {
  const style = STATUS_STYLE[row.status];
  const consumed = row.budgetMicros > 0 ? Math.min(1, row.spendMicros / row.budgetMicros) : 0;

  return (
    <div className="px-4 py-2.5 border-t first:border-t-0" title={row.verdict}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate" title={row.name}>
          {row.name}
        </span>
        <span className={cn("text-[11px] font-semibold shrink-0", style.text)}>
          {style.label}
          {row.status !== "exhausted" && ` · ${row.daysToExhaust}d left`}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", style.fill)}
          style={{ width: `${Math.max(2, consumed * 100)}%` }}
        />
      </div>

      <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
        {money(currency, row.spendMicros)} of {money(currency, row.budgetMicros)} spent
        {row.dailyRateMicros > 0 && ` · ${money(currency, row.dailyRateMicros)}/day`}
      </p>
    </div>
  );
}

export function BudgetPacingCard({
  pacing,
  isLoading,
  isError,
  currency,
  showToolLink = true,
}: {
  /** Pre-computed rows from lib/optimize/budgetPacing. */
  pacing: PacingRow[];
  isLoading: boolean;
  isError: boolean;
  currency: string;
  /** Hide the in-app "Full analysis" link (e.g. on the public shared view). */
  showToolLink?: boolean;
}) {
  const counts = useMemo(
    () => ({
      exhausted: pacing.filter((p) => p.status === "exhausted").length,
      runningOut: pacing.filter((p) => p.status === "running_out").length,
      under: pacing.filter((p) => p.status === "underspending").length,
      healthy: pacing.filter((p) => p.status === "healthy").length,
    }),
    [pacing]
  );

  // Most urgent first — analyzePacing already sorts that way.
  const rows = pacing.slice(0, 5);

  return (
    <WidgetCard
      icon={Gauge}
      title="Budget Pacing"
      action={
        showToolLink ? <WidgetLink href="/tools/optimize/budget-pacing" label="Full analysis" /> : undefined
      }
      flush
    >
      {isLoading ? (
        <div className="px-4 pb-3">
          <WidgetSkeleton rows={5} />
        </div>
      ) : isError ? (
        <WidgetError message="Campaign budgets could not be loaded." />
      ) : rows.length === 0 ? (
        <WidgetEmpty
          icon={Wallet}
          title="Nothing to pace yet"
          sub="Pacing appears once active campaigns have spent enough to project a rate."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-[11px] font-medium">
            {counts.exhausted > 0 && (
              <span className="text-red-600 dark:text-red-400">{counts.exhausted} stopped</span>
            )}
            {counts.runningOut > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{counts.runningOut} running out</span>
            )}
            {counts.under > 0 && (
              <span className="text-sky-600 dark:text-sky-400">{counts.under} under-pacing</span>
            )}
            <span className="text-emerald-600 dark:text-emerald-400">{counts.healthy} on track</span>
          </div>
          {rows.map((row) => (
            <PacingMeter key={row.campaignId} row={row} currency={currency} />
          ))}
        </>
      )}
    </WidgetCard>
  );
}
