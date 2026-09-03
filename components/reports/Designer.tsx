"use client";

/**
 * Report Designer — two-pane builder for report templates. Left: report
 * settings, the ordered widget outline (reorder / edit / duplicate / delete)
 * and an add-widget palette. Right: a live preview rendered from real Apple
 * Search Ads data via /api/reports/render (manual refresh — renders are real
 * report pulls and can take a few seconds).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { appleErrorToast } from "@/lib/openai/errorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import {
  REPORT_DATE_RANGES,
  REPORT_ENTITIES,
  REPORT_METRICS,
  REPORT_WIDGETS,
  reportWidgetDef,
  type ReportWidgetInstance,
} from "@/lib/reports/widgets";
import { metricDef } from "@/lib/alerts/metrics";
import {
  metricLabel,
  newWidget,
  widgetIcon,
  widgetSummary,
  type RenderedReport,
  type ReportDraft,
} from "@/components/reports/shared";
import { ReportPreviewOverlay, ReportView } from "@/components/reports/ReportView";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Copy,
  Eye,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";

const CHART_STYLE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  timeSeries: [
    { value: "area", label: "Area" },
    { value: "line", label: "Line" },
    { value: "bar", label: "Bar" },
  ],
  distribution: [
    { value: "pie", label: "Pie" },
    { value: "bar", label: "Horizontal bars" },
  ],
};

/* ── Per-widget config editor ──────────────────────────────────────────────── */

function WidgetConfigEditor({
  widget,
  onChange,
}: {
  widget: ReportWidgetInstance;
  onChange: (w: ReportWidgetInstance) => void;
}) {
  const def = reportWidgetDef(widget.type);
  if (!def) return null;
  const cfg = widget.config || {};
  const setCfg = (patch: Partial<NonNullable<ReportWidgetInstance["config"]>>) =>
    onChange({ ...widget, config: { ...cfg, ...patch } });

  const metricSelect = (
    value: string | undefined,
    fallback: string,
    onValue: (v: any) => void,
    label: string
  ) => (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select value={value || fallback} onValueChange={onValue}>
        <SelectTrigger className="h-8 text-sm w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORT_METRICS.map((m) => (
            <SelectItem key={m} value={m}>
              {metricLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 pt-3 mt-3 border-t border-dashed">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Widget title</Label>
        <Input
          className="h-8 text-sm"
          value={widget.title || ""}
          placeholder={def.name}
          onChange={(e) => onChange({ ...widget, title: e.target.value })}
        />
      </div>

      {def.fields.includes("metrics") && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            Metrics <span className="text-muted-foreground">(up to 8)</span>
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_METRICS.map((m) => {
              const selected = (cfg.metrics || []).includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  title={metricDef(m)?.hint}
                  onClick={() => {
                    const cur = cfg.metrics || [];
                    const next = selected ? cur.filter((x) => x !== m) : cur.length < 8 ? [...cur, m] : cur;
                    setCfg({ metrics: next });
                  }}
                  className={cn(
                    "px-2 py-1 rounded-md border text-[11px] font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {metricLabel(m)}
                </button>
              );
            })}
          </div>
          {!(cfg.metrics || []).length && <p className="text-[11px] text-amber-600">Pick at least one metric.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {def.fields.includes("metric") &&
          metricSelect(cfg.metric, "SPEND", (v) => setCfg({ metric: v }), def.fields.includes("metricB") ? "Metric A" : "Metric")}
        {def.fields.includes("metricB") && metricSelect(cfg.metricB, "CONVERSIONS", (v) => setCfg({ metricB: v }), "Metric B")}
        {def.fields.includes("entity") && (
          <div className="flex flex-col gap-1.5 min-w-0">
            <Label className="text-xs">Entity</Label>
            <Select value={cfg.entity || "campaign"} onValueChange={(v: any) => setCfg({ entity: v })}>
              <SelectTrigger className="h-8 text-sm w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_ENTITIES.map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {def.fields.includes("limit") && (
          <div className="flex flex-col gap-1.5 min-w-0">
            <Label className="text-xs">Rows (1–50)</Label>
            <Input
              className="h-8 text-sm w-full"
              type="number"
              min={1}
              max={50}
              value={cfg.limit ?? 10}
              onChange={(e) => setCfg({ limit: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </div>
        )}
        {def.fields.includes("chartStyle") && (
          <div className="flex flex-col gap-1.5 min-w-0">
            <Label className="text-xs">Chart style</Label>
            <Select
              value={cfg.chartStyle || CHART_STYLE_OPTIONS[widget.type]?.[0]?.value || "line"}
              onValueChange={(v) => setCfg({ chartStyle: v })}
            >
              <SelectTrigger className="h-8 text-sm w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(CHART_STYLE_OPTIONS[widget.type] || [{ value: "line", label: "Line" }]).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {def.fields.includes("text") && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Text</Label>
          <Textarea
            className="text-sm min-h-[90px]"
            placeholder="Add commentary, context or an introduction…"
            value={cfg.text || ""}
            onChange={(e) => setCfg({ text: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/* ── The designer ──────────────────────────────────────────────────────────── */

export default function Designer({
  adAccountId,
  adAccountName,
  initial,
  onSaved,
  onExit,
  onSchedule,
}: {
  adAccountId: string;
  adAccountName: string;
  initial: ReportDraft;
  onSaved?: (template: any) => void;
  onExit: () => void;
  onSchedule: (templateId: string) => void;
}) {
  const qc = useQueryClient();
  const [draftId, setDraftId] = useState<string | undefined>(initial.id);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [dateRange, setDateRange] = useState(initial.dateRange);
  const [cover, setCover] = useState(initial.cover);
  const [widgets, setWidgets] = useState<ReportWidgetInstance[]>(initial.widgets);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(initial.widgets.length === 0);
  const [stale, setStale] = useState(true);
  const [fullPreview, setFullPreview] = useState(false);

  const setCoverField = (patch: Partial<typeof cover>) => setCover((c) => ({ ...c, ...patch }));

  /* Mark the preview stale whenever anything render-relevant changes. */
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStale(true);
  }, [name, dateRange, cover, widgets]);

  const renderMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/reports/render", {
        adAccountId,
        adAccountName,
        template: { name: name.trim() || "Untitled report", dateRange, cover, widgets },
      });
      return res.data.report as RenderedReport;
    },
    onSuccess: () => setStale(false),
    onError: (err: any) => appleErrorToast(err, "Couldn't render the preview"),
  });

  const refreshPreview = useCallback(() => {
    if (!widgets.length) {
      toast.error("Add at least one widget first");
      return;
    }
    renderMutation.mutate();
  }, [widgets.length, renderMutation]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), description: description.trim(), cover, dateRange, widgets };
      if (draftId) {
        const res = await api.post("/reports/templates/mutate", { id: draftId, action: "edit", patch: payload });
        return res.data.template;
      }
      const res = await api.post("/reports/templates", { adAccountId, adAccountName, ...payload });
      return res.data.template;
    },
    onSuccess: (template: any) => {
      const created = !draftId;
      setDraftId(template.id);
      toast.success(created ? "Report saved" : "Changes saved", {
        description: "You can now schedule it or download the PDF from the preview.",
      });
      qc.invalidateQueries({ queryKey: ["report-templates", adAccountId] });
      onSaved?.(template);
    },
    onError: (err: any) => appleErrorToast(err, "Failed to save the report"),
  });

  /* Widget list operations. */
  const updateWidget = (i: number, w: ReportWidgetInstance) =>
    setWidgets((list) => list.map((x, idx) => (idx === i ? w : x)));
  const moveWidget = (i: number, dir: -1 | 1) =>
    setWidgets((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const duplicateWidget = (i: number) =>
    setWidgets((list) => {
      const copy: ReportWidgetInstance = { ...list[i], id: Math.random().toString(36).slice(2, 10), config: { ...list[i].config } };
      return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
    });
  const removeWidget = (i: number) => setWidgets((list) => list.filter((_, idx) => idx !== i));
  const addWidget = (type: (typeof REPORT_WIDGETS)[number]["type"]) => {
    const w = newWidget(type);
    setWidgets((list) => [...list, w]);
    setExpandedId(w.id);
  };

  const canSave = Boolean(name.trim()) && widgets.length > 0;
  const openFullPreview = () => {
    setFullPreview(true);
    if ((stale || !renderMutation.data) && !renderMutation.isPending) refreshPreview();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Designer header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 shrink-0" onClick={onExit}>
            <ArrowLeft className="w-3.5 h-3.5" />
            My reports
          </Button>
          <p className="text-sm text-muted-foreground truncate">
            {draftId ? "Editing" : "New report"}
            {name.trim() ? ` · ${name.trim()}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openFullPreview} disabled={!widgets.length}>
            <Maximize2 className="w-3.5 h-3.5" />
            Preview
          </Button>
          {draftId && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onSchedule(draftId)}>
              <CalendarClock className="w-3.5 h-3.5" />
              Schedule
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1.5" onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {draftId ? "Save changes" : "Save report"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
        {/* ── Left: settings + outline + palette ─────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card className="border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Settings2 className="w-4 h-4" />
                Report settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <Label className="text-xs">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input className="h-8 text-sm w-full" placeholder="Monthly overview" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <Label className="text-xs">
                    Date range{" "}
                    <InfoHint>
                      The reporting window every widget pulls its data for. Relative ranges (like “Last 30 days”) roll forward automatically each time the report renders or a scheduled send runs.
                    </InfoHint>
                  </Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="h-8 text-sm w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_DATE_RANGES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="What this report covers (shown in your list)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-dashed flex flex-col gap-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Cover & branding{" "}
                  <InfoHint>
                    Styles the report&apos;s front page: title, subtitle, accent color and a text logo. These appear on the rendered report and the PDF — useful for client-facing sends.
                  </InfoHint>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <Label className="text-xs">Cover title</Label>
                    <Input
                      className="h-8 text-sm w-full"
                      placeholder="Defaults to the report name"
                      value={cover.title || ""}
                      onChange={(e) => setCoverField({ title: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <Label className="text-xs">Subtitle</Label>
                    <Input
                      className="h-8 text-sm w-full"
                      placeholder="Apple Search Ads performance"
                      value={cover.subtitle || ""}
                      onChange={(e) => setCoverField({ subtitle: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <Label className="text-xs">Accent color</Label>
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="color"
                        aria-label="Accent color"
                        className="h-8 w-10 shrink-0 rounded-md border border-input bg-background p-0.5 cursor-pointer"
                        value={cover.accent || "#6d28d9"}
                        onChange={(e) => setCoverField({ accent: e.target.value })}
                      />
                      <Input
                        className="h-8 text-sm font-mono flex-1 min-w-0 w-full"
                        value={cover.accent || "#6d28d9"}
                        onChange={(e) => setCoverField({ accent: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <Label className="text-xs">Logo text</Label>
                    <Input
                      className="h-8 text-sm w-full"
                      placeholder="Your brand"
                      value={cover.logoText || ""}
                      onChange={(e) => setCoverField({ logoText: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">Hide OrchardAds branding</p>
                    <p className="text-[11px] text-muted-foreground">Removes the footer from the report.</p>
                  </div>
                  <Switch checked={Boolean(cover.hideBranding)} onCheckedChange={(v) => setCoverField({ hideBranding: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Widget outline */}
          <Card className="border rounded-xl">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Widgets{" "}
                {widgets.length > 0 && <span className="text-xs font-normal text-muted-foreground">({widgets.length})</span>}
              </CardTitle>
              <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setPaletteOpen((v) => !v)}>
                <Plus className="w-3.5 h-3.5" />
                Add widget
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {widgets.length === 0 && !paletteOpen && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No widgets yet.</p>
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setPaletteOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    Add your first widget
                  </Button>
                </div>
              )}

              {widgets.map((w, i) => {
                const def = reportWidgetDef(w.type);
                const Icon = widgetIcon(def?.icon || "");
                const expanded = expandedId === w.id;
                return (
                  <div key={w.id} className={cn("rounded-lg border p-2.5 transition-colors", expanded && "border-primary/40 bg-primary/[0.03]")}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setExpandedId(expanded ? null : w.id)}>
                        <p className="text-xs font-semibold truncate">{w.title || def?.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{widgetSummary(w)}</p>
                      </button>
                      <div className="flex items-center shrink-0">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={i === 0} onClick={() => moveWidget(i, -1)} aria-label="Move up">
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          disabled={i === widgets.length - 1}
                          onClick={() => moveWidget(i, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => duplicateWidget(i)} aria-label="Duplicate">
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => removeWidget(i)}
                          aria-label="Delete widget"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("h-6 w-6 p-0", expanded && "text-primary")}
                          onClick={() => setExpandedId(expanded ? null : w.id)}
                          aria-label="Configure widget"
                        >
                          <Settings2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {expanded && <WidgetConfigEditor widget={w} onChange={(next) => updateWidget(i, next)} />}
                  </div>
                );
              })}

              {/* Add-widget palette */}
              {paletteOpen && (
                <div className="rounded-lg border border-dashed p-2.5 mt-1">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Pick a widget to add
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {REPORT_WIDGETS.map((def) => {
                      const Icon = widgetIcon(def.icon);
                      return (
                        <button
                          key={def.type}
                          type="button"
                          onClick={() => addWidget(def.type)}
                          className="flex items-start gap-2 rounded-md border bg-background p-2 text-left hover:border-primary/50 hover:bg-primary/[0.03] transition-colors"
                        >
                          <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-3 h-3" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{def.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-snug">{def.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: live preview ────────────────────────────────────────── */}
        <Card className="border rounded-xl overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                Live preview
              </CardTitle>
              {stale && renderMutation.data && !renderMutation.isPending && (
                <span className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                  Out of date — refresh
                </span>
              )}
            </div>
            <Button
              variant={stale ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5"
              onClick={refreshPreview}
              disabled={renderMutation.isPending || !widgets.length}
            >
              {renderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh preview
            </Button>
          </CardHeader>
          <CardContent className="p-0 bg-zinc-100 dark:bg-zinc-900/60">
            {renderMutation.isPending ? (
              <div className="flex flex-col items-center justify-center gap-3 py-28 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Pulling live Apple Search Ads data…</p>
                <p className="text-xs text-muted-foreground/70">This can take a few seconds.</p>
              </div>
            ) : renderMutation.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-28">
                <p className="text-sm font-medium text-foreground/70">Preview failed</p>
                <p className="text-xs text-muted-foreground max-w-sm text-center">
                  {(renderMutation.error as any)?.response?.data?.error || "Something went wrong while rendering."}
                </p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshPreview}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </Button>
              </div>
            ) : renderMutation.data ? (
              <div className="p-3 md:p-5 overflow-y-auto max-h-[calc(100vh-220px)]">
                <div className="mx-auto max-w-[820px] rounded-lg shadow-lg overflow-hidden ring-1 ring-black/5">
                  <ReportView report={renderMutation.data} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-28 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-background border flex items-center justify-center">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/70">Nothing rendered yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Add widgets on the left, then refresh the preview to render them with your real account data.
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={refreshPreview} disabled={!widgets.length}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh preview
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full-screen preview + PDF */}
      <ReportPreviewOverlay
        open={fullPreview}
        loading={renderMutation.isPending}
        error={renderMutation.isError ? (renderMutation.error as any)?.response?.data?.error || "Render failed" : null}
        report={renderMutation.data || null}
        onClose={() => setFullPreview(false)}
        onRetry={refreshPreview}
        onSchedule={
          draftId
            ? () => {
                setFullPreview(false);
                onSchedule(draftId);
              }
            : undefined
        }
      />
    </div>
  );
}
