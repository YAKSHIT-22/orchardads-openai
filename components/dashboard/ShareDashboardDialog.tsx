"use client";

/**
 * Live Share create UI — a right-side sheet that creates a public, read-only
 * link to the current org's dashboard. Create + copy only; links are managed
 * (and revoked) from /tools/shared-dashboards. There is deliberately no
 * editing of a share.
 *
 * Widget keys mirror the server contract (app/api/shared-dashboards):
 * trend / comparison / topCampaigns / budgetPacing /
 * projectedSpend / performanceChange.
 * KPIs are always part of a share and are not a checkbox.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { SHARE_DATE_RANGES, rangeLabel } from "@/lib/dateRanges";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Link2,
  Lock,
  Activity,
  GitCompareArrows,
  Trophy,
  Store,
  Gauge,
  CalendarDays,
  CalendarClock,
  TrendingUpDown,
  TimerOff,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

/** Must stay in sync with WIDGET_KEYS in app/api/shared-dashboards/route.ts. */
const WIDGET_OPTIONS: { key: string; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "trend", label: "Performance chart", desc: "Daily trend for any metric", icon: Activity },
  { key: "comparison", label: "Metric comparison", desc: "Two metrics on a dual axis", icon: GitCompareArrows },
  { key: "topCampaigns", label: "Top campaigns", desc: "Ranked by spend with CPA", icon: Trophy },
  { key: "budgetPacing", label: "Budget pacing", desc: "Daily spend vs. daily budget", icon: Gauge },
  { key: "projectedSpend", label: "Projected spend", desc: "Month-end pace vs. budget target", icon: CalendarClock },
  { key: "performanceChange", label: "Performance change", desc: "vs. the previous period, with top movers", icon: TrendingUpDown },
];

// Relative ranges only — a Live Share link stays live and recomputes on view.
const DATE_RANGES = SHARE_DATE_RANGES.map((key) => ({ value: key as string, label: rangeLabel(key) }));

const EXPIRY_OPTIONS = [
  { value: "0", label: "Never expires" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
  { value: "90", label: "Expires in 90 days" },
];

type CreatedShare = { url: string; title: string; dateRange: string; expiry: string; widgetCount: number };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function ShareDashboardDialog({
  defaultDateRange = "30d",
  triggerLabel = "Share",
  triggerVariant = "outline",
  triggerClassName,
  showManageLink = true,
  onCreated,
}: {
  defaultDateRange?: string;
  /** Trigger button text — e.g. "New Live Share link" on the management page. */
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
  /** Hide the "Manage Live Share links" footer link (when already on that page). */
  showManageLink?: boolean;
  /** Called after a share is created — lets list views refresh. */
  onCreated?: () => void;
}) {
  const { adAccountId, connections, selectedIndex } = adAccountStore();
  const adAccountName = connections[selectedIndex]?.adAccountName || "";

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateRange, setDateRange] = useState(
    DATE_RANGES.some((r) => r.value === defaultDateRange) ? defaultDateRange : "30d"
  );
  const [widgets, setWidgets] = useState<string[]>(WIDGET_OPTIONS.map((w) => w.key));
  const [expiry, setExpiry] = useState("0");
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  const createShare = useMutation({
    mutationFn: async () => {
      const res = await api.post("/shared-dashboards", {
        adAccountId,
        adAccountName,
        title: title.trim(),
        description: description.trim() || undefined,
        dateRange,
        widgets,
        expiresInDays: Number(expiry) > 0 ? Number(expiry) : undefined,
      });
      return res.data.share as { token: string };
    },
    onSuccess: (share) => {
      setCreated({
        url: `${window.location.origin}/shared/${share.token}`,
        title: title.trim(),
        dateRange,
        expiry,
        widgetCount: widgets.length,
      });
      toast.success("Live Share link created");
      onCreated?.();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Couldn't create the Live Share link.");
    },
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Fresh form each time — a share can't be edited, only created or revoked.
      setTitle(adAccountName ? `${adAccountName} — OpenAI Ads performance` : "");
      setDescription("");
      setDateRange(DATE_RANGES.some((r) => r.value === defaultDateRange) ? defaultDateRange : "30d");
      setWidgets(WIDGET_OPTIONS.map((w) => w.key));
      setExpiry("0");
      setCreated(null);
      setCopied(false);
      setTouched(false);
    }
  };

  const toggleWidget = (key: string) => {
    setWidgets((prev) => (prev.includes(key) ? prev.filter((w) => w !== key) : [...prev, key]));
  };

  const allSelected = widgets.length === WIDGET_OPTIONS.length;
  const toggleAll = () => setWidgets(allSelected ? [] : WIDGET_OPTIONS.map((w) => w.key));

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link text and copy it manually.");
    }
  };

  const titleMissing = !title.trim();
  const canSubmit = !!adAccountId && !titleMissing && !createShare.isPending;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    createShare.mutate();
  };

  return (
    <>
      <Button
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
        onClick={() => handleOpenChange(true)}
        disabled={!adAccountId}
      >
        <Share2 className="h-4 w-4 mr-2" />
        {triggerLabel}
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:w-[460px] sm:max-w-[460px] gap-0 p-0 flex flex-col"
        >
          {created ? (
            <>
              <SheetHeader className="px-5 pt-6 pb-4 border-b">
                <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mb-1">
                  <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <SheetTitle>Your Live Share link is ready</SheetTitle>
                <SheetDescription>
                  Anyone with this link can view &ldquo;{created.title}&rdquo; — no sign-in
                  required.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
                <div className="rounded-lg border bg-muted/40 p-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={created.url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="text-xs font-mono bg-background"
                    />
                    <Button size="sm" onClick={copyLink} className="shrink-0 gap-1.5">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {rangeLabel(created.dateRange)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <TimerOff className="h-3 w-3" />
                      {EXPIRY_OPTIONS.find((o) => o.value === created.expiry)?.label || "Never expires"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <LayoutGrid className="h-3 w-3" />
                      KPIs + {created.widgetCount} widget{created.widgetCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  The dashboard is read-only and always shows fresh data for the scope you chose.
                  You can revoke this link at any time.
                </p>
              </div>

              <SheetFooter className="px-5 py-4 border-t flex-row items-center justify-between gap-2">
                {showManageLink ? (
                  <Link
                    href="/tools/shared-dashboards"
                    className="text-xs text-primary hover:underline inline-flex items-center"
                    onClick={() => setOpen(false)}
                  >
                    Manage Live Share links
                  </Link>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <a href={created.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </Button>
                  </a>
                  <Button size="sm" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </SheetFooter>
            </>
          ) : (
            <>
              <SheetHeader className="px-5 pt-6 pb-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  Create a Live Share link
                </SheetTitle>
                <SheetDescription>
                  A public, read-only view of {adAccountName ? <b>{adAccountName}</b> : "this organization"}
                  &rsquo;s live performance. Viewers don&apos;t need an account.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
                {/* Details */}
                <div className="flex flex-col gap-3">
                  <SectionLabel>Details</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="share-title">
                      Title <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="share-title"
                      value={title}
                      maxLength={120}
                      placeholder="e.g. Q3 OpenAI Ads performance"
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => setTouched(true)}
                      aria-invalid={touched && titleMissing}
                    />
                    {touched && titleMissing && (
                      <p className="text-xs text-rose-500">A title is required.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="share-desc">Description (optional)</Label>
                    <Textarea
                      id="share-desc"
                      value={description}
                      maxLength={400}
                      rows={2}
                      placeholder="A short note viewers will see under the title."
                      onChange={(e) => setDescription(e.target.value)}
                      className="resize-none"
                    />
                  </div>
                </div>

                {/* Date range + expiry */}
                <div className="flex flex-col gap-3">
                  <SectionLabel>Date range &amp; expiry</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        Date range
                      </Label>
                      <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_RANGES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Relative — viewers always see the latest data.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5">
                        <TimerOff className="h-3.5 w-3.5 text-muted-foreground" />
                        Link expiry
                      </Label>
                      <Select value={expiry} onValueChange={setExpiry}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Expired links stop working automatically.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Widgets */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Widgets to include</SectionLabel>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {widgets.length}/{WIDGET_OPTIONS.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {allSelected ? "Clear all" : "Select all"}
                      </button>
                    </div>
                  </div>

                  {/* KPIs are always part of a share — shown pinned, not as a checkbox. */}
                  <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 p-2.5">
                    <Lock className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight">
                        Performance KPIs
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Always included
                        </span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        Spend, conversions, CPA, CPC, CTR, CVR and more.
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {WIDGET_OPTIONS.map((w) => {
                      const checked = widgets.includes(w.key);
                      return (
                        <label
                          key={w.key}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                            checked
                              ? "border-primary/50 bg-primary/5"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleWidget(w.key)}
                            className="mt-0.5 h-4 w-4 accent-primary cursor-pointer shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                              <w.icon className={cn("h-3.5 w-3.5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} />
                              {w.label}
                            </span>
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {w.desc}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <SheetFooter className="px-5 py-4 border-t flex-row justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={!canSubmit} className="gap-1.5">
                  {createShare.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  Create public link
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
