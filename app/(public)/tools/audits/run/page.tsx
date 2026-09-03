"use client";

/**
 * Audit run page — loads a saved audit by ?id=, fetches the reports its
 * widgets need for the FIXED last-45-day window, computes every widget
 * client-side (components/audit/engine) and renders a health-score summary
 * plus one findings card per widget, each with a CSV download.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { appleErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import { auditWidget, type AuditWidgetKey } from "@/lib/audit/widgets";
import {
  runAudit, formatCell, AUDIT_DAYS,
  type AuditRunResult, type WidgetResult,
} from "@/components/audit/engine";
import { buildCsv, downloadCsv, slugify } from "@/components/audit/csv";
import type { SavedAudit } from "../page";
import { ToolHeader } from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Building2, CalendarRange, CircleCheck, ClipboardCheck, Clock,
  Download, Loader2, RefreshCw, RotateCcw, TriangleAlert,
} from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_ROWS = 50;

function scoreColor(s: number) {
  if (s >= 80) return "text-green-600";
  if (s >= 60) return "text-amber-500";
  return "text-rose-600";
}
function scoreRing(s: number) {
  if (s >= 80) return "#16a34a";
  if (s >= 60) return "#f59e0b";
  return "#e11d48";
}

/* ── Health-score dial (ring gauge) ───────────────────────────────────────── */
function HealthDial({ score, pending }: { score: number | null; pending: boolean }) {
  const c = 2 * Math.PI * 52;
  const s = score ?? 0;
  if (pending) {
    return <div className="w-32 h-32 rounded-full border-[11px] border-muted animate-pulse shrink-0" />;
  }
  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="11" />
        {score !== null && (
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke={scoreRing(s)} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={`${(s / 100) * c} ${c}`}
            style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.6s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold tabular-nums", score !== null && scoreColor(s))}>
          {score !== null ? s : "—"}
        </span>
        <span className="text-xs text-muted-foreground">
          health / 100{" "}
          <InfoHint side="bottom">
            A 0–100 summary of this audit: each check&apos;s findings deduct points, so fewer issues means a higher score. 80+ is healthy, 60–79 needs attention, below 60 has serious issues to fix.
          </InfoHint>
        </span>
      </div>
    </div>
  );
}

/* ── Per-widget findings card ─────────────────────────────────────────────── */
function WidgetCard({
  widget, currency, auditName,
}: {
  widget: WidgetResult;
  currency: string;
  auditName: string;
}) {
  const colSpan = Math.max(1, widget.columns.length);
  const visible = widget.rows.slice(0, MAX_VISIBLE_ROWS);
  const isScore = widget.key === "healthScore";

  const exportCsv = () => {
    const csv = buildCsv(
      widget.columns.map((c) => c.label),
      widget.rows.map((r) => widget.columns.map((c) => formatCell(r[c.key], c.format, currency)))
    );
    downloadCsv(`audit-${slugify(auditName)}-${slugify(widget.name)}.csv`, csv);
  };

  return (
    <Card className="border rounded-xl">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            {widget.name}
            {!widget.error && (
              isScore ? (
                <Badge variant="outline" className="text-xs px-1.5 py-0">{widget.metricValue}</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-1.5 py-0 border-0",
                    widget.count > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                  )}
                >
                  {widget.count > 0
                    ? `${widget.count} finding${widget.count === 1 ? "" : "s"} · ${widget.metricLabel}: ${widget.metricValue}`
                    : "0 findings"}
                </Badge>
              )
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{widget.description}</p>
          {widget.notes.map((n, i) => (
            <p key={i} className="text-[11px] text-muted-foreground/80 mt-0.5">{n}</p>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 h-8"
          onClick={exportCsv}
          disabled={!!widget.error || widget.rows.length === 0}
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {widget.error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
              <TriangleAlert className="w-4.5 h-4.5 text-rose-500" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">{widget.error}</p>
          </div>
        ) : widget.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <CircleCheck className="w-5 h-5 text-green-600" />
            </div>
            <p className="font-medium text-foreground/70 text-sm">No issues found — nice!</p>
            <p className="text-xs text-muted-foreground">Nothing crossed this check in the last {AUDIT_DAYS} days.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {widget.columns.map((c) => (
                    <TableHead
                      key={c.key}
                      className={cn("px-4 py-2 whitespace-nowrap", c.format !== "text" && "text-right")}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                    {widget.columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "px-4 py-2.5",
                          c.format === "text"
                            ? "max-w-[260px] truncate font-medium"
                            : "text-right tabular-nums"
                        )}
                        title={c.format === "text" ? String(row[c.key] ?? "") : undefined}
                      >
                        {formatCell(row[c.key], c.format, currency)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {widget.rows.length > MAX_VISIBLE_ROWS && (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                      Showing {MAX_VISIBLE_ROWS} of {widget.rows.length} rows — download the CSV for the full list.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Page body ─────────────────────────────────────────────────────────────── */
function RunAuditPage() {
  const searchParams = useSearchParams();
  const auditId = searchParams.get("id") || "";
  const { currency: storeCurrency, connections } = adAccountStore();

  const [result, setResult] = useState<AuditRunResult | null>(null);
  const [stage, setStage] = useState("Preparing…");

  const auditsQuery = useQuery<SavedAudit[]>({
    queryKey: ["saved-audits"],
    queryFn: async () => {
      const res = await api.get("/audits");
      return (res.data?.audits || []) as SavedAudit[];
    },
    staleTime: 60 * 1000,
  });
  const audit = useMemo(
    () => (auditsQuery.data || []).find((a) => a.id === auditId) || null,
    [auditsQuery.data, auditId]
  );

  const orgCurrency =
    (audit && connections?.find((o) => String(o.adAccountId) === audit.adAccountId)?.currencyCode) ||
    storeCurrency ||
    "USD";

  const { mutate: run, isPending, isError, error } = useMutation({
    mutationFn: async () => {
      if (!audit) throw new Error("Audit not found");
      setStage("Loading performance\u2026");
      return runAudit(audit.adAccountId, audit.widgets as AuditWidgetKey[]);
    },
    onSuccess: (r) => {
      setResult(r);
      // Record the run — fire and forget, a failure shouldn't disturb the view.
      api.post("/audits/touch", { id: audit!.id }).catch(() => {});
    },
    onError: (err: any) => appleErrorToast(err, "Audit run failed"),
  });

  // Auto-run once the saved audit arrives.
  useEffect(() => {
    if (audit) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit?.id]);

  const exportSummaryCsv = () => {
    if (!result || !audit) return;
    const rows = result.widgets.map((w) => [
      w.name,
      w.error ? "error" : w.key === "healthScore" ? "—" : w.count,
      w.error ? w.error : `${w.metricLabel}: ${w.metricValue}`,
    ]);
    const csv = buildCsv(["Check", "Findings", "Key metric"], rows);
    downloadCsv(`audit-${slugify(audit.name)}-summary.csv`, csv);
  };

  const generatedAt = result
    ? new Date(result.generatedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "";

  const backButton = (
    <Button asChild variant="outline" className="gap-1.5">
      <Link href="/tools/audits"><ArrowLeft className="w-4 h-4" />All audits</Link>
    </Button>
  );

  /* Audit lookup states */
  if (auditsQuery.isLoading) {
    return (
      <section className="w-full p-4 md:p-6">
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading audit…</p>
        </div>
      </section>
    );
  }
  if (auditsQuery.isError || !audit) {
    return (
      <section className="w-full p-4 md:p-6">
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-rose-500" />
          </div>
          <p className="font-medium text-foreground/70">
            {auditsQuery.isError ? "Couldn't load your audits." : "Audit not found"}
          </p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {auditsQuery.isError
              ? "Something went wrong while fetching your saved audits."
              : "It may have been deleted, or the link is stale."}
          </p>
          {backButton}
        </div>
      </section>
    );
  }

  const widgetDefsSelected = audit.widgets.map((k) => auditWidget(k)).filter(Boolean);

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={ClipboardCheck}
          title={audit.name}
          description={audit.description || "Account audit over the fixed last-45-day window."}
        >
          {backButton}
          <Button variant="outline" onClick={() => run()} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />}
            Re-run
          </Button>
        </ToolHeader>

        {/* ── Top summary bar ──────────────────────────────────────────────── */}
        <Card className="border rounded-xl">
          <CardContent className="py-5">
            {isError && !isPending ? (
              <div className="flex flex-col items-center gap-2.5 py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <TriangleAlert className="w-5 h-5 text-rose-500" />
                </div>
                <p className="font-medium text-foreground/70">Audit run failed</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  {(error as any)?.response?.data?.error || (error as any)?.message || "Something went wrong while fetching reports."}
                </p>
                <Button variant="outline" size="sm" onClick={() => run()} className="gap-1.5 mt-1">
                  <RotateCcw className="w-3.5 h-3.5" />Try again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <HealthDial score={result?.healthScore ?? null} pending={isPending} />
                <div className="flex-1 min-w-0">
                  {isPending ? (
                    <div className="flex flex-col gap-2">
                      <div className="h-5 bg-muted rounded animate-pulse w-2/3" />
                      <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{stage}
                      </p>
                    </div>
                  ) : result ? (
                    <>
                      <p className="text-lg font-semibold leading-snug">
                        {result.totalFindings > 0
                          ? `${result.totalFindings} finding${result.totalFindings === 1 ? "" : "s"} across ${result.widgets.length} check${result.widgets.length === 1 ? "" : "s"}`
                          : "All checks passed — no issues found"}
                      </p>
                      {result.headline.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {result.headline.map((h) => (
                            <Badge key={h} variant="outline" className="text-xs font-normal">{h}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />{audit.adAccountName || audit.adAccountId}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarRange className="w-3.5 h-3.5" />
                          Last {AUDIT_DAYS} days ({result.startTime} → {result.endTime})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />Generated {generatedAt}
                        </span>
                      </div>
                      {result.warnings.length > 0 && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          {result.warnings.map((w, i) => (
                            <p key={i} className="text-[11px] text-amber-800 leading-snug">{w}</p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">The audit runs automatically.</p>
                  )}
                </div>
                <div className="shrink-0 self-start md:self-center">
                  <Button
                    onClick={exportSummaryCsv}
                    disabled={!result || isPending}
                    className="gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download summary CSV
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Per-widget cards ─────────────────────────────────────────────── */}
        {isPending
          ? widgetDefsSelected.map((def) => (
              <Card key={def!.key} className="border rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{def!.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{def!.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${85 - i * 15}%` }} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          : result?.widgets.map((w) => (
              <WidgetCard key={w.key} widget={w} currency={result.currency} auditName={audit.name} />
            ))}
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <section className="w-full p-4 md:p-6">
          <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading audit…</p>
          </div>
        </section>
      }
    >
      <RunAuditPage />
    </Suspense>
  );
}
