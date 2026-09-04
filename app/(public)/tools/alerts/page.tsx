"use client";

/**
 * Orchard Watch — unified alerts for OpenAI Ads. Define metric
 * thresholds, budget-pacing watches and anomaly monitors; run them on demand
 * (the cron runs them on schedule) and review everything that triggered.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import { ALERT_METRICS, metricDef, type AlertMetricKey } from "@/lib/alerts/metrics";
import {
  type Alert, type AlertEvent, type AlertKind, type AlertScope, type AlertComparator,
  type AlertSeverity, type AlertAction,
  SEVERITY_META, KIND_META, SCOPE_LABEL,
  relativeTime, eventValue, actionTakenLabel,
} from "@/components/alerts/shared";
import {
  ToolHeader, StatCard, InsightBanner, SkeletonRows, EmptyRow, ErrorRow,
  useCampaignList, CampaignSelect,
} from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Activity, AlarmClock, BellRing, CheckCheck, CircleCheck, EyeOff, Inbox, Loader2,
  MoreHorizontal, Pencil, Play, Plus, Radar, Sparkles, Trash2, Wallet, X, Zap,
} from "lucide-react";

/* ── Form model ────────────────────────────────────────────────────────────── */

type AlertForm = {
  kind: AlertKind;
  name: string;
  scope: AlertScope;
  campaignId: string;
  metric: string; // "" = any metric (anomaly only)
  comparator: AlertComparator;
  threshold: string;
  comparePeriodDays: string;
  lookbackDays: string;
  offsetDays: string;
  sensitivity: number;
  severity: AlertSeverity;
  action: AlertAction;
  notifyEmail: boolean;
};

function defaultsFor(kind: AlertKind): AlertForm {
  const base: AlertForm = {
    kind, name: "", scope: "CAMPAIGN", campaignId: "", metric: "SPEND",
    comparator: "ABOVE", threshold: "", comparePeriodDays: "7", lookbackDays: "7",
    offsetDays: "0", sensitivity: 2.5, severity: "WARNING", action: "NOTIFY", notifyEmail: true,
  };
  if (kind === "BUDGET") return { ...base, threshold: "90", lookbackDays: "3" };
  if (kind === "ANOMALY") return { ...base, scope: "ACCOUNT", metric: "", lookbackDays: "28" };
  return base;
}

/** Anomaly detection only supports these metrics (see lib/alerts evaluator). */
const ANOMALY_METRIC_KEYS: AlertMetricKey[] = ["SPEND", "CONVERSIONS", "CLICKS", "IMPRESSIONS", "CPA"];

const isChange = (c: AlertComparator) => c === "CHANGE_UP" || c === "CHANGE_DOWN";

/**
 * Threshold unit conversion — the API stores rates as fractions:
 * rate metric + Above/Below → user types a percent, we POST value/100;
 * Increases/Decreases-by-% and budget pace % are POSTed as-is.
 */
function toApiThreshold(f: AlertForm): number {
  const n = Number(f.threshold);
  if (f.kind !== "METRIC" || isChange(f.comparator)) return n;
  return metricDef(f.metric)?.unit === "rate" ? n / 100 : n;
}

/** Reverse of toApiThreshold, for prefilling the edit form. */
function fromApiThreshold(a: Alert): string {
  if (a.threshold == null) return "";
  if (a.kind === "METRIC" && a.comparator && !isChange(a.comparator) && metricDef(a.metric || "")?.unit === "rate") {
    return String(parseFloat((a.threshold * 100).toFixed(4)));
  }
  return String(a.threshold);
}

/* ── Quick-start templates (prefill only — nothing is sent) ────────────────── */

const TEMPLATES: { label: string; patch: Partial<AlertForm> & { kind: AlertKind } }[] = [
  {
    label: "Spend spike",
    patch: { kind: "METRIC", name: "Spend spike", metric: "SPEND", comparator: "CHANGE_UP", threshold: "30", comparePeriodDays: "7", severity: "WARNING" },
  },
  {
    label: "CPA too high",
    patch: { kind: "METRIC", name: "CPA too high", metric: "CPA", comparator: "ABOVE", threshold: "", lookbackDays: "7", severity: "WARNING" },
  },
  {
    label: "Conversion drop",
    patch: { kind: "METRIC", name: "Conversion drop", metric: "CONVERSIONS", comparator: "CHANGE_DOWN", threshold: "30", comparePeriodDays: "7", severity: "CRITICAL" },
  },
  {
    label: "Budget capped",
    patch: { kind: "BUDGET", name: "Budget capped", comparator: "ABOVE", threshold: "95", lookbackDays: "1", severity: "WARNING" },
  },
];

/* ── Plain-language condition summaries ────────────────────────────────────── */

function scopePhrase(a: Alert): string {
  if (a.scope === "ACCOUNT") return "account total";
  if (a.scope === "CAMPAIGN") return a.campaignName ? `campaign “${a.campaignName}”` : "each campaign";
  const inCampaign = a.campaignName || (a.campaignId ? `campaign ${a.campaignId}` : "campaign");
  return a.scope === "ADGROUP" ? `ad groups in ${inCampaign}` : `ads in ${inCampaign}`;
}

function fmtThresholdFor(metric: string | null, threshold: number | null, currency: string): string {
  if (threshold == null) return "—";
  const def = metricDef(metric || "");
  if (def?.unit === "money") return money(currency || "USD", threshold);
  if (def?.unit === "rate") return `${parseFloat((threshold * 100).toFixed(4))}%`;
  return threshold.toLocaleString();
}

function alertSummary(a: Alert, currency: string): string {
  const act = a.action === "PAUSE" ? "auto-pause" : "notify";
  if (a.kind === "BUDGET") {
    const dir = a.comparator === "BELOW" ? "≤" : "≥";
    const target = a.campaignName ? `“${a.campaignName}”` : "all campaigns";
    return `Daily pace ${dir} ${a.threshold ?? "—"}% of budget on ${target} · last ${a.lookbackDays}d · ${act}`;
  }
  if (a.kind === "ANOMALY") {
    const m = a.metric ? (metricDef(a.metric)?.label || a.metric).toLowerCase() : "any metric";
    return `Unusual ${m} on ${scopePhrase(a)} · sensitivity ${a.sensitivity ?? 2.5}σ · ${a.lookbackDays}d baseline`;
  }
  const label = metricDef(a.metric || "")?.label || a.metric || "Metric";
  const lag = a.offsetDays ? ` · ${a.offsetDays}d lag` : "";
  const cond =
    a.comparator === "CHANGE_UP" || a.comparator === "CHANGE_DOWN"
      ? `${a.comparator === "CHANGE_UP" ? "↑" : "↓"} ${a.threshold ?? "—"}% vs prior ${a.comparePeriodDays}d`
      : `${a.comparator === "BELOW" ? "<" : ">"} ${fmtThresholdFor(a.metric, a.threshold, currency)} · last ${a.lookbackDays}d`;
  return `${label} on ${scopePhrase(a)} ${cond}${lag} · ${act}`;
}

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Never";

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/* ── Small form field wrapper ──────────────────────────────────────────────── */

function Field({
  label,
  hint,
  info,
  children,
}: {
  label: string;
  hint?: string;
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-xs font-medium text-muted-foreground flex flex-wrap items-center gap-1">
        {label}
        {info && <InfoHint className="shrink-0">{info}</InfoHint>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function OrchardWatchPage() {
  const qc = useQueryClient();
  const { adAccountId, currency, connections, selectedIndex } = adAccountStore();
  const adAccountName = connections[selectedIndex]?.adAccountName || "";
  const { campaigns } = useCampaignList();

  const [tab, setTab] = useState<"alerts" | "triggered">("alerts");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Alert | null>(null);
  const [form, setForm] = useState<AlertForm>(defaultsFor("METRIC"));
  const [toDelete, setToDelete] = useState<Alert | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "new">("all");
  const [severityFilter, setSeverityFilter] = useState<"" | AlertSeverity>("");

  const set = <K extends keyof AlertForm>(key: K, value: AlertForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const invalidateEvents = () => {
    qc.invalidateQueries({ queryKey: ["orchard-alert-events"] });
    qc.invalidateQueries({ queryKey: ["alerts-unread-count"] });
  };

  /* ── Queries ── */

  const alertsQuery = useQuery<Alert[]>({
    queryKey: ["orchard-alerts", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.get("/alerts", { params: { adAccountId, adAccountName } });
      return (res.data?.alerts || []) as Alert[];
    },
  });
  const alerts = alertsQuery.data || [];

  // All (non-dismissed) events — feeds the stats and, with default filters, the tab.
  const statsEventsQuery = useQuery<AlertEvent[]>({
    queryKey: ["orchard-alert-events", adAccountId, "all", ""],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.get("/alerts/events", { params: { adAccountId, status: "all", limit: 200 } });
      return (res.data?.events || []) as AlertEvent[];
    },
  });

  const eventsQuery = useQuery<AlertEvent[]>({
    queryKey: ["orchard-alert-events", adAccountId, statusFilter, severityFilter],
    enabled: !!adAccountId,
    queryFn: async () => {
      const params: Record<string, string> = { adAccountId, status: statusFilter, limit: "200" };
      if (severityFilter) params.severity = severityFilter;
      const res = await api.get("/alerts/events", { params });
      return (res.data?.events || []) as AlertEvent[];
    },
  });
  const events = eventsQuery.data || [];

  const unreadCount = useMemo(
    () => (statsEventsQuery.data || []).filter((e) => e.status === "NEW").length,
    [statsEventsQuery.data]
  );
  const triggeredToday = useMemo(
    () => (statsEventsQuery.data || []).filter((e) => isToday(e.createdAt)).length,
    [statsEventsQuery.data]
  );

  /* ── Alert mutations ── */

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const patch: Record<string, unknown> = {
          name: form.name.trim(),
          lookbackDays: Number(form.lookbackDays) || 7,
          severity: form.severity,
          notifyEmail: form.notifyEmail,
        };
        if (form.kind === "METRIC") {
          Object.assign(patch, {
            metric: form.metric,
            comparator: form.comparator,
            threshold: toApiThreshold(form),
            comparePeriodDays: Number(form.comparePeriodDays) || 7,
            offsetDays: Number(form.offsetDays) || 0,
            action: form.action,
          });
        } else if (form.kind === "BUDGET") {
          Object.assign(patch, {
            comparator: form.comparator === "BELOW" ? "BELOW" : "ABOVE",
            threshold: Number(form.threshold),
            offsetDays: Number(form.offsetDays) || 0,
            action: form.action,
          });
        } else {
          Object.assign(patch, { metric: form.metric || null, sensitivity: form.sensitivity });
        }
        await api.post("/alerts/mutate", { id: editing.id, action: "edit", patch });
        return;
      }
      const campaignName = campaigns.find((c) => c.id === form.campaignId)?.name || null;
      const body: Record<string, unknown> = {
        adAccountId, adAccountName,
        name: form.name.trim(),
        kind: form.kind,
        scope: form.kind === "BUDGET" ? "CAMPAIGN" : form.scope,
        campaignId: form.campaignId || null,
        campaignName: form.campaignId ? campaignName : null,
        lookbackDays: Number(form.lookbackDays) || 7,
        offsetDays: Number(form.offsetDays) || 0,
        comparePeriodDays: Number(form.comparePeriodDays) || 7,
        severity: form.severity,
        action: form.kind === "ANOMALY" ? "NOTIFY" : form.action,
        notifyEmail: form.notifyEmail,
      };
      if (form.kind === "METRIC") {
        body.metric = form.metric;
        body.comparator = form.comparator;
        body.threshold = toApiThreshold(form);
      } else if (form.kind === "BUDGET") {
        body.comparator = form.comparator === "BELOW" ? "BELOW" : "ABOVE";
        body.threshold = Number(form.threshold);
      } else {
        body.metric = form.metric || undefined;
        body.sensitivity = form.sensitivity;
      }
      await api.post("/alerts", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Alert updated" : "Alert created");
      setFormOpen(false);
      setEditing(null);
      setForm(defaultsFor("METRIC"));
      qc.invalidateQueries({ queryKey: ["orchard-alerts"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't save the alert"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await api.post("/alerts/mutate", { id, action: "toggle", enabled });
    },
    onSuccess: (_d, v) => {
      toast.success(v.enabled ? "Alert enabled" : "Alert paused");
      qc.invalidateQueries({ queryKey: ["orchard-alerts"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the alert"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post("/alerts/mutate", { id, action: "delete" });
    },
    onSuccess: () => {
      toast.success("Alert deleted");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["orchard-alerts"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't delete the alert"),
  });

  type EvalResult = {
    alertId: string; alertName: string; kind: AlertKind;
    matchCount: number; newEvents: number; appliedCount: number; error?: string;
  };

  const summarizeRun = (results: EvalResult[]) => {
    const fired = results.reduce((n, r) => n + r.newEvents, 0);
    const paused = results.reduce((n, r) => n + r.appliedCount, 0);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      toast.warning(`${failed.length} alert${failed.length > 1 ? "s" : ""} failed to evaluate`, {
        description: failed[0].error,
      });
    }
    if (fired > 0) {
      toast.success(
        `${fired} new alert event${fired > 1 ? "s" : ""}${paused ? ` · ${paused} entit${paused > 1 ? "ies" : "y"} paused` : ""}`
      );
    } else if (!failed.length) {
      toast.info(results.length ? "All clear — nothing triggered" : "No enabled alerts to run");
    }
    qc.invalidateQueries({ queryKey: ["orchard-alerts"] });
    invalidateEvents();
  };

  const runAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/alerts/evaluate", { adAccountId });
      return (res.data?.results || []) as EvalResult[];
    },
    onSuccess: summarizeRun,
    onError: (err) => adsErrorToast(err, "Couldn't run the alerts"),
  });

  const runOneMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await api.post("/alerts/evaluate", { adAccountId, alertId });
      return (res.data?.results || []) as EvalResult[];
    },
    onSuccess: summarizeRun,
    onError: (err) => adsErrorToast(err, "Couldn't run the alert"),
  });

  /* ── Event mutations ── */

  const eventMutation = useMutation({
    mutationFn: async (body: { id?: string; action: string; days?: number; adAccountId?: string }) => {
      await api.post("/alerts/events/mutate", body);
    },
    onSuccess: (_d, v) => {
      if (v.action === "readAll") toast.success("All events marked read");
      else if (v.action === "snooze") toast.success(`Snoozed for ${v.days} day${(v.days || 0) > 1 ? "s" : ""}`);
      else if (v.action === "dismiss") toast.success("Event dismissed");
      invalidateEvents();
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the event"),
  });

  /* ── Form helpers ── */

  const openCreate = () => {
    setEditing(null);
    setForm(defaultsFor("METRIC"));
    setFormOpen(true);
  };

  const openEdit = (a: Alert) => {
    setEditing(a);
    setForm({
      kind: a.kind,
      name: a.name,
      scope: a.scope,
      campaignId: a.campaignId || "",
      metric: a.metric || (a.kind === "ANOMALY" ? "" : "SPEND"),
      comparator: a.comparator || "ABOVE",
      threshold: fromApiThreshold(a),
      comparePeriodDays: String(a.comparePeriodDays ?? 7),
      lookbackDays: String(a.lookbackDays ?? 7),
      offsetDays: String(a.offsetDays ?? 0),
      sensitivity: a.sensitivity ?? 2.5,
      severity: a.severity,
      action: a.action,
      notifyEmail: a.notifyEmail,
    });
    setFormOpen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const switchKind = (kind: AlertKind) => {
    if (editing) return;
    setForm((f) => ({ ...defaultsFor(kind), name: f.name }));
  };

  const applyTemplate = (patch: Partial<AlertForm> & { kind: AlertKind }) => {
    setEditing(null);
    setForm({ ...defaultsFor(patch.kind), ...patch });
    setFormOpen(true);
  };

  const submit = () => {
    if (!adAccountId) return toast.error("Select an organization first");
    if (!form.name.trim()) return toast.error("Give the alert a name");
    if (form.kind !== "ANOMALY") {
      const t = Number(form.threshold);
      if (form.threshold.trim() === "" || Number.isNaN(t) || t <= 0) {
        return toast.error("Enter a threshold greater than zero");
      }
    }
    if (
      !editing &&
      form.kind === "METRIC" &&
      (form.scope === "ADGROUP" || form.scope === "AD") &&
      !form.campaignId
    ) {
      return toast.error("Ad-group and ad alerts need a campaign");
    }
    saveMutation.mutate();
  };

  /* ── Threshold unit labelling ── */

  const change = form.kind === "METRIC" && isChange(form.comparator);
  const formMetricDef = metricDef(form.metric);
  const thresholdSuffix =
    form.kind === "BUDGET" || change || formMetricDef?.unit === "rate"
      ? "%"
      : formMetricDef?.unit === "money"
        ? currency || "USD"
        : "#";
  const thresholdHint =
    form.kind === "BUDGET"
      ? `Fires when avg daily spend is ${form.comparator === "BELOW" ? "at or under" : "at or over"} this % of a campaign's daily budget`
      : change
        ? "Percent change vs the prior period — 30 means 30%"
        : formMetricDef?.unit === "rate"
          ? "Enter a percent — 2.5 means 2.5%"
          : formMetricDef?.unit === "money"
            ? `Amount in ${currency || "USD"}`
            : "Plain count";

  const accountScope = form.kind === "METRIC" && form.scope === "ACCOUNT";
  const campaignNeeded = form.kind === "METRIC" && (form.scope === "ADGROUP" || form.scope === "AD");

  /* ── Render ── */

  const kindTabs: { kind: AlertKind; label: string; icon: typeof Activity }[] = [
    { kind: "METRIC", label: "Metric", icon: Activity },
    { kind: "BUDGET", label: "Budget", icon: Wallet },
    { kind: "ANOMALY", label: "Anomaly", icon: Radar },
  ];

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={BellRing}
          title="Orchard Watch"
          description="Monitor metrics, budgets and anomalies — get alerted, emailed, or auto-pause."
        >
          <Button
            variant="outline"
            onClick={() => runAllMutation.mutate()}
            disabled={!adAccountId || runAllMutation.isPending}
            className="gap-1.5"
          >
            {runAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run all
          </Button>
          {!formOpen && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="w-4 h-4" />
              New alert
            </Button>
          )}
        </ToolHeader>

        {/* Tab switch — underline style, matching the rest of the tool suite
            (a segmented pill control here was the odd one out). */}
        <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hidden">
          {(
            [
              { id: "alerts", label: "Alerts" },
              { id: "triggered", label: "Triggered" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap",
                tab === t.id
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.id === "triggered" && unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "alerts" ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Alerts" value={String(alerts.length)} sub="Defined for this org" icon={BellRing} tone="primary" />
              <StatCard
                label="Enabled"
                value={String(alerts.filter((a) => a.enabled).length)}
                sub="Watching right now"
                icon={CircleCheck}
                tone="positive"
              />
              <StatCard
                label="Triggered today"
                value={String(triggeredToday)}
                sub="New events since midnight"
                icon={Zap}
                tone={triggeredToday > 0 ? "warning" : "neutral"}
              />
            </div>

            {unreadCount > 0 && (
              <InsightBanner
                icon={Zap}
                tone="warning"
                title={`${unreadCount} unresolved alert event${unreadCount > 1 ? "s" : ""} need${unreadCount > 1 ? "" : "s"} your attention`}
                sub="Review what fired, then mark it read, snooze it, or dismiss it."
                action={
                  <Button variant="outline" size="sm" onClick={() => setTab("triggered")}>
                    View triggered
                  </Button>
                }
              />
            )}

            {/* Create / edit card */}
            {formOpen && (
              <Card className="border rounded-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {editing ? `Edit alert — ${editing.name}` : "Create an alert"}
                      </CardTitle>
                      {!editing && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Quick start:
                          </span>
                          {TEMPLATES.map((t) => (
                            <button
                              key={t.label}
                              onClick={() => applyTemplate(t.patch)}
                              className="px-2 py-0.5 rounded-full border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        setFormOpen(false);
                        setEditing(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* Kind segmented control */}
                  <div className="flex items-center gap-2 self-start">
                  <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                    {kindTabs.map(({ kind, label, icon: Icon }) => (
                      <button
                        key={kind}
                        onClick={() => switchKind(kind)}
                        disabled={!!editing && form.kind !== kind}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-colors",
                          form.kind === kind
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                          !!editing && form.kind !== kind && "opacity-40 cursor-not-allowed hover:text-muted-foreground"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <InfoHint side="right">
                    Metric watches a number cross a threshold or change too fast. Budget watches daily spend pace vs a campaign&apos;s daily budget. Anomaly learns each metric&apos;s normal range and flags unusual spikes or drops automatically.
                  </InfoHint>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Field label="Name">
                      <Input
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        placeholder={
                          form.kind === "BUDGET" ? "e.g. Budget capped" : form.kind === "ANOMALY" ? "e.g. Account watchdog" : "e.g. CPA too high"
                        }
                        className="h-8 text-sm"
                      />
                    </Field>

                    {/* Scope */}
                    {form.kind === "METRIC" && (
                      <Field
                        label="Scope"
                        hint={campaignNeeded ? "Watches every row inside the chosen campaign" : undefined}
                        info="What level the alert watches. Account checks your org total; Campaign checks each campaign separately; Ad group and Ad check every row inside one campaign. Locked after creation."
                      >
                        <Select value={form.scope} onValueChange={(v) => {
                          const scope = v as AlertScope;
                          setForm((f) => ({
                            ...f,
                            scope,
                            campaignId: scope === "ADGROUP" || scope === "AD" ? f.campaignId : "",
                            action: scope === "ACCOUNT" ? "NOTIFY" : f.action,
                          }));
                        }} disabled={!!editing}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACCOUNT">Account</SelectItem>
                            <SelectItem value="CAMPAIGN">Campaign (each)</SelectItem>
                            <SelectItem value="ADGROUP">Ad group</SelectItem>
                            <SelectItem value="AD">Ad</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    {form.kind === "ANOMALY" && (
                      <Field label="Scope">
                        <Select
                          value={form.scope === "CAMPAIGN" ? "CAMPAIGN" : "ACCOUNT"}
                          onValueChange={(v) => setForm((f) => ({ ...f, scope: v as AlertScope, campaignId: "" }))}
                          disabled={!!editing}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACCOUNT">Account</SelectItem>
                            <SelectItem value="CAMPAIGN">Campaign</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}

                    {/* Campaign picker */}
                    {(campaignNeeded ||
                      form.kind === "BUDGET" ||
                      (form.kind === "ANOMALY" && form.scope === "CAMPAIGN")) &&
                      (editing ? (
                        <Field label="Campaign">
                          <Input
                            value={editing.campaignName || (editing.campaignId ? `Campaign ${editing.campaignId}` : "All campaigns")}
                            disabled
                            className="h-8 text-sm"
                          />
                        </Field>
                      ) : (
                        <Field
                          label={campaignNeeded ? "Campaign" : "Campaign (optional)"}
                          hint={campaignNeeded ? undefined : "Leave empty to watch all campaigns"}
                        >
                          <CampaignSelect
                            value={form.campaignId}
                            onChange={(v) => set("campaignId", v)}
                            campaigns={campaigns}
                            placeholder={campaignNeeded ? "Select campaign" : "All campaigns"}
                          />
                        </Field>
                      ))}

                    {/* Metric */}
                    {form.kind === "METRIC" && (
                      <Field label="Metric" hint={formMetricDef?.hint}>
                        <Select value={form.metric} onValueChange={(v) => set("metric", v)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALERT_METRICS.map((m) => (
                              <SelectItem key={m.key} value={m.key}>
                                <span className="flex items-center gap-2">
                                  {m.label}
                                  {m.calculated && (
                                    <span className="text-[10px] px-1 py-px rounded bg-muted text-muted-foreground border">calculated</span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    {form.kind === "ANOMALY" && (
                      <Field label="Metric" hint="Leave on “Any metric” to watch everything">
                        <Select
                          value={form.metric || "ANY"}
                          onValueChange={(v) => set("metric", v === "ANY" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ANY">Any metric</SelectItem>
                            {ALERT_METRICS.filter((m) => ANOMALY_METRIC_KEYS.includes(m.key)).map((m) => (
                              <SelectItem key={m.key} value={m.key}>
                                <span className="flex items-center gap-2">
                                  {m.label}
                                  {m.calculated && (
                                    <span className="text-[10px] px-1 py-px rounded bg-muted text-muted-foreground border">calculated</span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}

                    {/* Condition + threshold */}
                    {form.kind === "METRIC" && (
                      <Field
                        label="Condition"
                        info="Above/Below compare the metric's total over the lookback window to your threshold. Increases/Decreases by % compare one period to the period immediately before it."
                      >
                        <Select value={form.comparator} onValueChange={(v) => set("comparator", v as AlertComparator)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ABOVE">Above</SelectItem>
                            <SelectItem value="BELOW">Below</SelectItem>
                            <SelectItem value="CHANGE_UP">Increases by %</SelectItem>
                            <SelectItem value="CHANGE_DOWN">Decreases by %</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    {form.kind === "BUDGET" && (
                      <Field
                        label="Condition"
                        info="Over-pacing fires when average daily spend hits your % of the daily budget (the campaign keeps maxing out). Under-pacing fires when spend stays below it (budget going unused)."
                      >
                        <Select
                          value={form.comparator === "BELOW" ? "BELOW" : "ABOVE"}
                          onValueChange={(v) => set("comparator", v as AlertComparator)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ABOVE">Over-pacing (budget capped)</SelectItem>
                            <SelectItem value="BELOW">Under-pacing (underspending)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    {form.kind !== "ANOMALY" && (
                      <Field
                        label={form.kind === "BUDGET" ? "Pace threshold" : "Threshold"}
                        hint={thresholdHint}
                        info={
                          form.kind === "BUDGET"
                            ? "The pace level that trips the alert, as a percent of each campaign's daily budget. 90 means the alert fires once average daily spend reaches 90% of budget."
                            : "The value that trips the alert. For Increases/Decreases conditions it's a percent change; otherwise it's the metric's value over the lookback window."
                        }
                      >
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={form.threshold}
                            onChange={(e) => set("threshold", e.target.value)}
                            placeholder={form.kind === "BUDGET" ? "90" : "0"}
                            className="h-8 text-sm pr-12"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {thresholdSuffix}
                          </span>
                        </div>
                      </Field>
                    )}

                    {/* Anomaly sensitivity */}
                    {form.kind === "ANOMALY" && (
                      <Field
                        label={`Sensitivity — ${form.sensitivity.toFixed(1)}σ`}
                        hint="Higher = only bigger surprises"
                        info="How surprising a change must be before it alerts. It compares recent performance to the normal range for this metric (a statistical z-score). Lower = more sensitive — flags smaller swings and produces more alerts; higher = only big, unusual spikes or drops. 2.5σ is a balanced default."
                      >
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={0.5}
                          value={form.sensitivity}
                          onChange={(e) => set("sensitivity", Number(e.target.value))}
                          className="w-full h-8 accent-primary cursor-pointer"
                        />
                      </Field>
                    )}

                    {/* Windows */}
                    {change && (
                      <Field
                        label="Compare period (days)"
                        hint="Current window vs the immediately-preceding one"
                        info="Each period's length. The alert compares this period to the one immediately before it — 7 means the last 7 days vs the 7 days before that."
                      >
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={form.comparePeriodDays}
                          onChange={(e) => set("comparePeriodDays", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </Field>
                    )}
                    {!change && (
                      <Field
                        label="Lookback (days)"
                        hint={form.kind === "ANOMALY" ? "Baseline window for the daily series" : "Reporting window the condition is checked over"}
                        info={
                          form.kind === "ANOMALY"
                            ? "How many days of history establish what “normal” looks like. Recent days are then judged against that baseline."
                            : "How many days of data the alert evaluates each run."
                        }
                      >
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={form.lookbackDays}
                          onChange={(e) => set("lookbackDays", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </Field>
                    )}
                    {form.kind !== "ANOMALY" && (
                      <Field
                        label="Offset (days)"
                        hint="Ignore the last N days for conversion lag"
                        info="Skip the most recent N days when evaluating — useful because conversions can take a few days to attribute, so the freshest data often under-counts."
                      >
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={form.offsetDays}
                          onChange={(e) => set("offsetDays", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </Field>
                    )}

                    {/* Severity / action / email */}
                    <Field
                      label="Severity"
                      info="A label for how urgent triggered events are — Info, Warning or Critical. It only affects how events are badged and filtered, not how the alert runs."
                    >
                      <Select value={form.severity} onValueChange={(v) => set("severity", v as AlertSeverity)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INFO">Info</SelectItem>
                          <SelectItem value="WARNING">Warning</SelectItem>
                          <SelectItem value="CRITICAL">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {form.kind !== "ANOMALY" && (
                      <Field
                        label="Action"
                        hint={accountScope ? "Account-level alerts can't auto-pause" : "Auto-pause pauses each breaching entity"}
                        info="Notify records the event and emails you if enabled. Auto-pause additionally pauses the breaching campaign, ad group or ad in your live account, without asking first. It can never pause the ad account itself or archive anything."
                      >
                        <Select
                          value={form.action}
                          onValueChange={(v) => set("action", v as AlertAction)}
                          disabled={accountScope}
                        >
                          <SelectTrigger className={cn("h-8 text-sm", accountScope && "opacity-60")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NOTIFY">Notify only</SelectItem>
                            <SelectItem value="PAUSE" disabled={accountScope}>
                              Auto-pause
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    <Field
                      label="Email me"
                      hint="Send an email when this alert fires"
                      info="Sends an email to your account address each time this alert triggers. Events always appear in the Triggered tab either way."
                    >
                      <div className="h-8 flex items-center">
                        <Switch checked={form.notifyEmail} onCheckedChange={(v) => set("notifyEmail", v)} />
                      </div>
                    </Field>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t mt-1 pt-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setFormOpen(false);
                        setEditing(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={submit} disabled={saveMutation.isPending} className="gap-1.5">
                      {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editing ? "Save changes" : "Create alert"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Alerts list */}
            <Card className="border rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Your alerts
                  {alerts.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({alerts.length})</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="px-4 py-2 min-w-[260px]">Alert</TableHead>
                        <TableHead className="px-3 py-2">Type</TableHead>
                        <TableHead className="px-3 py-2">Scope</TableHead>
                        <TableHead className="px-3 py-2">Severity</TableHead>
                        <TableHead className="px-3 py-2">Enabled</TableHead>
                        <TableHead className="px-3 py-2 whitespace-nowrap">Last triggered</TableHead>
                        <TableHead className="px-3 py-2 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertsQuery.isLoading ? (
                        <SkeletonRows rows={5} colSpan={7} />
                      ) : alertsQuery.isError ? (
                        <ErrorRow
                          colSpan={7}
                          message={(alertsQuery.error as any)?.response?.data?.error || "Couldn't load your alerts."}
                          onRetry={() => alertsQuery.refetch()}
                        />
                      ) : alerts.length === 0 ? (
                        <EmptyRow
                          colSpan={7}
                          icon={BellRing}
                          title="No alerts yet"
                          sub="Create one above, or start from a quick-start template."
                          action={
                            <Button size="sm" onClick={openCreate} className="gap-1.5 mt-1">
                              <Plus className="w-3.5 h-3.5" /> New alert
                            </Button>
                          }
                        />
                      ) : (
                        alerts.map((a) => (
                          <TableRow key={a.id} className={cn(!a.enabled && "opacity-60")}>
                            <TableCell className="px-4 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{a.name}</span>
                                {a.isDefault && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                    Auto
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">{alertSummary(a, currency)}</p>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <Badge variant="outline" className={cn("text-[11px]", KIND_META[a.kind]?.badge)}>
                                {KIND_META[a.kind]?.label || a.kind}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground whitespace-nowrap">
                              {SCOPE_LABEL[a.scope] || a.scope}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <Badge variant="outline" className={cn("text-[11px]", SEVERITY_META[a.severity]?.badge)}>
                                {SEVERITY_META[a.severity]?.label || a.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <Switch
                                checked={a.enabled}
                                disabled={toggleMutation.isPending && toggleMutation.variables?.id === a.id}
                                onCheckedChange={(v) => toggleMutation.mutate({ id: a.id, enabled: v })}
                              />
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top text-sm text-muted-foreground whitespace-nowrap">
                              {fmtDateTime(a.lastTriggeredAt)}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={a.enabled ? "Run this alert now" : "Enable the alert to run it"}
                                  disabled={!a.enabled || (runOneMutation.isPending && runOneMutation.variables === a.id)}
                                  onClick={() => runOneMutation.mutate(a.id)}
                                >
                                  {runOneMutation.isPending && runOneMutation.variables === a.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(a)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                  title="Delete"
                                  onClick={() => setToDelete(a)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* ── Triggered tab ── */
          <Card className="border rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">Triggered events</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "new")}>
                    <SelectTrigger className="h-8 text-sm w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="new">Unread</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={severityFilter || "ALL"}
                    onValueChange={(v) => setSeverityFilter(v === "ALL" ? "" : (v as AlertSeverity))}
                  >
                    <SelectTrigger className="h-8 text-sm w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All severities</SelectItem>
                      <SelectItem value="INFO">Info</SelectItem>
                      <SelectItem value="WARNING">Warning</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!adAccountId || unreadCount === 0 || eventMutation.isPending}
                    onClick={() => eventMutation.mutate({ action: "readAll", adAccountId })}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="px-4 py-2">Severity</TableHead>
                      <TableHead className="px-3 py-2">Alert</TableHead>
                      <TableHead className="px-3 py-2">Entity</TableHead>
                      <TableHead className="px-3 py-2 min-w-[280px]">Message</TableHead>
                      <TableHead className="px-3 py-2 whitespace-nowrap">Value</TableHead>
                      <TableHead className="px-3 py-2">When</TableHead>
                      <TableHead className="px-3 py-2">Status</TableHead>
                      <TableHead className="px-3 py-2 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsQuery.isLoading ? (
                      <SkeletonRows rows={6} colSpan={8} />
                    ) : eventsQuery.isError ? (
                      <ErrorRow
                        colSpan={8}
                        message={(eventsQuery.error as any)?.response?.data?.error || "Couldn't load triggered events."}
                        onRetry={() => eventsQuery.refetch()}
                      />
                    ) : events.length === 0 ? (
                      <EmptyRow
                        colSpan={8}
                        icon={Inbox}
                        title="All clear — nothing has triggered."
                        sub={statusFilter === "new" || severityFilter ? "Try widening the filters." : "Events appear here when an alert fires."}
                      />
                    ) : (
                      events.map((e) => {
                        const sev = SEVERITY_META[e.severity] || SEVERITY_META.WARNING;
                        const taken = actionTakenLabel(e.actionTaken);
                        return (
                          <TableRow key={e.id} className={cn(e.status === "NEW" && "bg-primary/[0.03]")}>
                            <TableCell className="px-4 py-3 align-top">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", sev.dot)} />
                                <span className="text-xs font-medium">{sev.label}</span>
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {e.status === "NEW" && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                <span className="text-sm font-medium">{e.alert?.name || "Alert"}</span>
                              </div>
                              {e.alert?.kind && (
                                <span className="text-[11px] text-muted-foreground">{KIND_META[e.alert.kind]?.label}</span>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top max-w-[180px]">
                              <p className="text-sm truncate" title={e.entityName}>{e.entityName}</p>
                              <p className="text-[11px] text-muted-foreground">{SCOPE_LABEL[e.entityType] || e.entityType}</p>
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <p className="text-xs text-muted-foreground max-w-md" title={e.message}>{e.message}</p>
                              {taken && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "mt-1 text-[10px] px-1.5 py-0",
                                    e.actionTaken === "PAUSED" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                                    e.actionTaken === "PAUSE_FAILED" && "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                  )}
                                >
                                  {taken}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top text-sm tabular-nums whitespace-nowrap">
                              {eventValue(e)}
                            </TableCell>
                            <TableCell
                              className="px-3 py-3 align-top text-sm text-muted-foreground whitespace-nowrap"
                              title={fmtDateTime(e.createdAt)}
                            >
                              {relativeTime(e.createdAt)}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top whitespace-nowrap">
                              {e.status === "NEW" ? (
                                <Badge variant="outline" className="text-[11px] border-primary/30 bg-primary/10 text-primary">New</Badge>
                              ) : e.status === "SNOOZED" && e.effectiveSnoozed ? (
                                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                                  Snoozed{e.snoozedUntil ? ` → ${new Date(e.snoozedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[11px] text-muted-foreground">Read</Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="flex justify-end">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    {e.status === "NEW" && (
                                      <DropdownMenuItem onClick={() => eventMutation.mutate({ id: e.id, action: "read" })}>
                                        <CheckCheck className="mr-2 h-3.5 w-3.5" /> Mark read
                                      </DropdownMenuItem>
                                    )}
                                    {e.status === "SNOOZED" && (
                                      <DropdownMenuItem onClick={() => eventMutation.mutate({ id: e.id, action: "unsnooze" })}>
                                        <AlarmClock className="mr-2 h-3.5 w-3.5" /> Unsnooze
                                      </DropdownMenuItem>
                                    )}
                                    {[1, 7, 28].map((d) => (
                                      <DropdownMenuItem key={d} onClick={() => eventMutation.mutate({ id: e.id, action: "snooze", days: d })}>
                                        <AlarmClock className="mr-2 h-3.5 w-3.5" /> Snooze {d} day{d > 1 ? "s" : ""}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-rose-600 focus:text-rose-600"
                                      onClick={() => eventMutation.mutate({ id: e.id, action: "dismiss" })}
                                    >
                                      <EyeOff className="mr-2 h-3.5 w-3.5" /> Dismiss
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete alert?</DialogTitle>
            <DialogDescription>
              “{toDelete?.name}” will stop watching and be removed, along with its triggered-event history. This can't be undone.
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
    </section>
  );
}
