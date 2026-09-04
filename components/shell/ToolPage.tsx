"use client";

/**
 * Shared page furniture, matching the conventions of OpenAI's own Ads Manager
 * so this product doesn't feel like a different application bolted alongside it.
 *
 * Observed there and reproduced here:
 *   - A plain page title on the left, primary action on the right. No hero.
 *   - Section tabs directly under the title, underline-style, not pill chips.
 *   - A right-aligned toolbar strip on the tab row for filter / view / range.
 *   - Quiet, generous empty states: icon, one line of what this is, one action.
 *   - Status shown as a coloured dot plus words ("Not serving"), never a bare
 *     enum and never colour alone.
 *   - A footer note for anything provisional, e.g. today's preliminary data.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ToolTab = { id: string; label: string; count?: number };

export function ToolTabs({
  tabs,
  active,
  onChange,
  toolbar,
}: {
  tabs: ToolTab[];
  active: string;
  onChange: (id: string) => void;
  toolbar?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 md:px-6 mt-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-1 overflow-x-auto scrollbar-hidden">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                  on
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {typeof t.count === "number" && (
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {toolbar && <div className="flex items-center gap-1.5 pb-1.5 shrink-0">{toolbar}</div>}
      </div>
    </div>
  );
}

/**
 * Status as a dot plus words.
 *
 * Colour alone fails for colour-blind readers and prints as grey, so the word
 * always carries the meaning and the dot only reinforces it.
 */
export function StatusDot({
  tone,
  children,
}: {
  tone: "serving" | "blocked" | "paused" | "pending" | "neutral";
  children: ReactNode;
}) {
  const dot = {
    serving: "bg-emerald-500",
    blocked: "bg-red-500",
    paused: "bg-muted-foreground",
    pending: "bg-amber-500",
    neutral: "bg-border",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {body && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">{body}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Footer note for provisional data.
 *
 * The insights endpoints document that the current account-local day is
 * preliminary and moves as conversions are attributed. Ads Manager says so on
 * every table; so should we, or a customer reads a half-formed day as a result.
 */
export function PreliminaryNote({ date, right }: { date?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 md:px-6 py-2.5 text-xs text-muted-foreground">
      <span>
        {date ? `Preliminary data for ${date}` : "Today's data is preliminary"} — conversions can
        take a few days to attribute.
      </span>
      {right}
    </div>
  );
}
