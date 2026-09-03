"use client";

/**
 * Shared UI kit for the Optimize tool suite.
 * Presentation-only helpers — no analysis logic lives here.
 */

import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";

/* ── Chart palette (validated for light surfaces + CVD separation) ─────────── */
export const CHART = {
  primary: "#6d28d9", // matches --primary (violet)
  teal: "#0d9488",
  rose: "#be123c",
  amber: "#b45309",
  mutedFill: "#ddd6fe", // de-emphasized bars (violet-200)
  grid: "#f0f0f0",
  axis: "#a1a1aa",
} as const;

/* ── Page header ───────────────────────────────────────────────────────────── */
export function ToolHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground max-w-xl">{description}</p>
        </div>
      </div>
      {children && <div className="flex items-center gap-2 self-start shrink-0">{children}</div>}
    </div>
  );
}

/* ── Stat tiles ────────────────────────────────────────────────────────────── */
export type StatTone = "primary" | "positive" | "warning" | "critical" | "info" | "neutral";

const STAT_CHIP: Record<StatTone, string> = {
  primary: "bg-primary",
  positive: "bg-emerald-600",
  warning: "bg-amber-500",
  critical: "bg-rose-600",
  info: "bg-sky-600",
  neutral: "bg-zinc-400",
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <Card className="border rounded-xl">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
            <p className="text-2xl font-bold tabular-nums truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", STAT_CHIP[tone])}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Headline insight banner ───────────────────────────────────────────────── */
const BANNER_TONES: Record<StatTone, { wrap: string; chip: string }> = {
  primary: { wrap: "border-primary/25 bg-primary/5", chip: "bg-primary text-white" },
  positive: { wrap: "border-emerald-200 bg-emerald-50", chip: "bg-emerald-600 text-white" },
  warning: { wrap: "border-amber-200 bg-amber-50", chip: "bg-amber-500 text-white" },
  critical: { wrap: "border-rose-200 bg-rose-50", chip: "bg-rose-600 text-white" },
  info: { wrap: "border-sky-200 bg-sky-50", chip: "bg-sky-600 text-white" },
  neutral: { wrap: "border-border bg-muted/40", chip: "bg-zinc-400 text-white" },
};

export function InsightBanner({
  icon: Icon,
  tone = "primary",
  title,
  sub,
  action,
}: {
  icon: LucideIcon;
  tone?: StatTone;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  const t = BANNER_TONES[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3", t.wrap)}>
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", t.chip)}>
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ── Table states ──────────────────────────────────────────────────────────── */
export function SkeletonRows({ rows = 6, colSpan }: { rows?: number; colSpan: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={colSpan} className="px-4 py-3">
            <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${88 - (i % 3) * 14}%` }} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function EmptyRow({
  colSpan,
  icon: Icon,
  title,
  sub,
  action,
}: {
  colSpan: number;
  icon: LucideIcon;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-16">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground/70">{title}</p>
            {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
          </div>
          {action}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ErrorRow({
  colSpan,
  message,
  onRetry,
}: {
  colSpan: number;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-14">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <p className="font-medium text-foreground/70">Analysis failed</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {message || "Something went wrong while fetching the report."}
            </p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 mt-1">
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Campaign list hook + picker ───────────────────────────────────────────── */
export type CampaignOption = { id: string; name: string; dailyBudgetAmount?: any };

/**
 * Loads the campaign list once per org. When `autoSelectFirst` is set, the
 * first campaign is selected as soon as the list arrives so tools can auto-run.
 */
export function useCampaignList(autoSelectFirst = false) {
  const { adAccountId } = adAccountStore();
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!adAccountId) return;
    let cancelled = false;
    api
      .post("/campaign/getallcampaigns", { adAccountId, limit: 100, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        const list: CampaignOption[] = (res.data?.allcampaigns_results?.data || []).map((c: any) => ({
          id: String(c.id),
          name: c.name || `Campaign ${c.id}`,
          dailyBudgetAmount: c.dailyBudgetAmount,
        }));
        setCampaigns(list);
        if (autoSelectFirst && list[0]) setCampaignId((prev) => prev || list[0].id);
      })
      .catch(() => {
        /* picker shows the empty message */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adAccountId, autoSelectFirst]);

  return { adAccountId, campaigns, campaignId, setCampaignId, loaded };
}

export function CampaignSelect({
  value,
  onChange,
  campaigns,
  className,
  placeholder = "Select campaign",
}: {
  value: string;
  onChange: (v: string) => void;
  campaigns: CampaignOption[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-sm", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {campaigns.length ? (
          campaigns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))
        ) : (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">No campaigns found</div>
        )}
      </SelectContent>
    </Select>
  );
}
