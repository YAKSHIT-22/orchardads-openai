"use client";

/**
 * Reports — the Report Designer tool. Three tabs:
 *  · My reports  — saved templates + starter presets + preview/duplicate/delete
 *  · Designer    — build a report from widgets with a live data preview
 *  · Schedules   — email delivery of saved reports (incl. legacy schedules)
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { appleErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolHeader } from "@/components/optimize/ui";
import { cn } from "@/lib/utils";
import Designer from "@/components/reports/Designer";
import Schedules from "@/components/reports/Schedules";
import { ReportPreviewOverlay } from "@/components/reports/ReportView";
import {
  blankDraft,
  draftFromTemplate,
  rangeLabel,
  STARTER_PRESETS,
  uid,
  type RenderedReport,
  type ReportDraft,
  type ReportTemplateRow,
} from "@/components/reports/shared";
import {
  Building2,
  CalendarClock,
  CalendarRange,
  Copy,
  Eye,
  FileText,
  Layers,
  Loader2,
  Mail,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";

type Tab = "templates" | "designer" | "schedules";

const TABS: { id: Tab; label: string }[] = [
  { id: "templates", label: "My reports" },
  { id: "designer", label: "Designer" },
  { id: "schedules", label: "Schedules" },
];

export default function ReportsPage() {
  const { adAccountId, connections, selectedIndex } = adAccountStore();
  const adAccountName = connections[selectedIndex]?.adAccountName || "";
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("templates");
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [designerKey, setDesignerKey] = useState("");
  const [scheduleTemplateId, setScheduleTemplateId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ReportTemplateRow | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["report-templates", adAccountId],
    queryFn: async () => (await api.get(`/reports/templates?adAccountId=${adAccountId}`)).data.templates as ReportTemplateRow[],
    enabled: !!adAccountId,
  });
  const templates = templatesQuery.data || [];

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const openDesigner = (d: ReportDraft) => {
    setDraft(d);
    setDesignerKey(uid());
    setTab("designer");
  };

  const openSchedules = (templateId?: string) => {
    setScheduleTemplateId(templateId);
    setTab("schedules");
  };

  const previewMutation = useMutation({
    mutationFn: async (templateId: string) =>
      (await api.post("/reports/render", { adAccountId, adAccountName, templateId })).data.report as RenderedReport,
    onError: (err: any) => appleErrorToast(err, "Couldn't render the report"),
  });

  const openPreview = (t: ReportTemplateRow) => {
    setPreviewTemplateId(t.id);
    setPreviewOpen(true);
    previewMutation.mutate(t.id);
  };

  const duplicateMutation = useMutation({
    mutationFn: async (t: ReportTemplateRow) =>
      api.post("/reports/templates", {
        adAccountId,
        adAccountName,
        name: `${t.name} (copy)`.slice(0, 120),
        description: t.description || "",
        cover: t.cover || undefined,
        dateRange: t.dateRange,
        widgets: t.widgets,
      }),
    onSuccess: () => {
      toast.success("Report duplicated");
      qc.invalidateQueries({ queryKey: ["report-templates", adAccountId] });
    },
    onError: (err: any) => appleErrorToast(err, "Failed to duplicate the report"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.post("/reports/templates/mutate", { id, action: "delete" }),
    onSuccess: () => {
      toast.success("Report deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["report-templates", adAccountId] });
      qc.invalidateQueries({ queryKey: ["report-schedules", adAccountId] });
    },
    onError: (err: any) => appleErrorToast(err, "Failed to delete the report"),
  });

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={FileText}
          title="Reports"
          description="Design branded reports, preview them, download PDF, and schedule email delivery."
        >
          <Button size="sm" className="gap-1.5" onClick={() => openDesigner(blankDraft())} disabled={!adAccountId}>
            <Plus className="w-3.5 h-3.5" />
            New report
          </Button>
        </ToolHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === "designer" && !draft) {
                  openDesigner(blankDraft());
                  return;
                }
                setTab(t.id);
              }}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!adAccountId ? (
          <Card className="border rounded-xl">
            <CardContent className="py-16 text-center">
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground/70">No organization selected</p>
                <p className="text-sm text-muted-foreground">Connect your Apple Ads account to design reports.</p>
              </div>
            </CardContent>
          </Card>
        ) : tab === "designer" && draft ? (
          <Designer
            key={designerKey}
            adAccountId={adAccountId}
            adAccountName={adAccountName}
            initial={draft}
            onExit={() => setTab("templates")}
            onSchedule={(templateId) => openSchedules(templateId)}
          />
        ) : tab === "schedules" ? (
          <Schedules adAccountId={adAccountId} templates={templates} initialTemplateId={scheduleTemplateId} />
        ) : (
          <div className="flex flex-col gap-5">
            {/* Starter presets */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Start from a template
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {STARTER_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => openDesigner(p.build())}
                    className="group rounded-xl border border-dashed bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <p.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{p.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Saved templates */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Saved reports {templates.length > 0 && <span className="font-normal">({templates.length})</span>}
              </p>

              {templatesQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border rounded-xl">
                      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-8 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : templatesQuery.isError ? (
                <Card className="border rounded-xl">
                  <CardContent className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center">
                        <TriangleAlert className="w-5 h-5 text-rose-500" />
                      </div>
                      <p className="font-medium text-foreground/70">Couldn&apos;t load your reports</p>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        {(templatesQuery.error as any)?.response?.data?.error || "Something went wrong."}
                      </p>
                      <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => templatesQuery.refetch()}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Try again
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : templates.length === 0 ? (
                <Card className="border rounded-xl">
                  <CardContent className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-foreground/70">No reports yet</p>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        Build your first report from widgets — KPIs, trends, tables and more — then download it as a PDF
                        or schedule email delivery.
                      </p>
                      <Button size="sm" className="gap-1.5 mt-1" onClick={() => openDesigner(blankDraft())}>
                        <Plus className="w-3.5 h-3.5" />
                        New report
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {templates.map((t) => (
                    <Card key={t.id} className="border rounded-xl flex flex-col">
                      <CardContent className="pt-4 pb-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" title={t.name}>
                              {t.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 min-h-[16px]">
                              {t.description || "No description"}
                            </p>
                          </div>
                          <span
                            className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: `${t.cover?.accent || "#6d28d9"}1a`, color: t.cover?.accent || "#6d28d9" }}
                          >
                            <FileText className="w-4 h-4" />
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[11px] gap-1 font-normal">
                            <CalendarRange className="w-3 h-3" />
                            {rangeLabel(t.dateRange)}
                          </Badge>
                          <Badge variant="outline" className="text-[11px] gap-1 font-normal">
                            <Layers className="w-3 h-3" />
                            {t.widgets?.length || 0} widget{(t.widgets?.length || 0) === 1 ? "" : "s"}
                          </Badge>
                          {(t._count?.schedules || 0) > 0 && (
                            <Badge variant="outline" className="text-[11px] gap-1 font-normal">
                              <Mail className="w-3 h-3" />
                              {t._count!.schedules} schedule{t._count!.schedules === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-auto">
                          Updated {new Date(t.updatedAt).toLocaleDateString()}
                        </p>

                        <div className="flex items-center gap-1.5 pt-1 border-t">
                          <Button variant="outline" size="sm" className="h-7 gap-1 flex-1" onClick={() => openDesigner(draftFromTemplate(t))}>
                            <PencilLine className="w-3 h-3" />
                            Open
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 gap-1 flex-1" onClick={() => openPreview(t)}>
                            <Eye className="w-3 h-3" />
                            Preview
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Schedule email delivery"
                            aria-label="Schedule email delivery"
                            onClick={() => openSchedules(t.id)}
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Duplicate"
                            aria-label="Duplicate report"
                            disabled={duplicateMutation.isPending}
                            onClick={() => duplicateMutation.mutate(t)}
                          >
                            {duplicateMutation.isPending && duplicateMutation.variables?.id === t.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                            title="Delete"
                            aria-label="Delete report"
                            onClick={() => setDeleteTarget(t)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              This removes the report template
              {(deleteTarget?._count?.schedules || 0) > 0 && (
                <> and its {deleteTarget!._count!.schedules} email schedule{deleteTarget!._count!.schedules === 1 ? "" : "s"}</>
              )}
              . This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview overlay (from the templates list) */}
      <ReportPreviewOverlay
        open={previewOpen}
        loading={previewMutation.isPending}
        error={previewMutation.isError ? (previewMutation.error as any)?.response?.data?.error || "Render failed" : null}
        report={previewMutation.data || null}
        onClose={() => setPreviewOpen(false)}
        onRetry={() => previewTemplateId && previewMutation.mutate(previewTemplateId)}
        onSchedule={() => {
          setPreviewOpen(false);
          openSchedules(previewTemplateId);
        }}
      />
    </section>
  );
}
