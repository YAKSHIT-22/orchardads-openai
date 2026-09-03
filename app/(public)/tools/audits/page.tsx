"use client";

/**
 * Orchard Inspector — saved-audit manager. An audit is a named set of checks
 * (widgets) that always runs against a fixed last-45-day window. Users keep
 * several audits and run whichever one they need from here.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { auditWidget } from "@/lib/audit/widgets";
import { CreateAuditDialog } from "@/components/audit/CreateAuditDialog";
import { ToolHeader, SkeletonRows, EmptyRow, ErrorRow } from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardCheck, Loader2, Play, Plus, Trash2 } from "lucide-react";

export type SavedAudit = {
  id: string;
  adAccountId: string;
  adAccountName: string | null;
  name: string;
  description: string | null;
  widgets: string[];
  lastRunAt: string | null;
  createdAt: string;
};

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "Never";

export default function AuditsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SavedAudit | null>(null);

  const { data: audits = [], isLoading, isError, error, refetch } = useQuery<SavedAudit[]>({
    queryKey: ["saved-audits"],
    queryFn: async () => {
      const res = await api.get("/audits");
      return (res.data?.audits || []) as SavedAudit[];
    },
    staleTime: 60 * 1000,
  });

  const { mutate: deleteAudit, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      await api.post("/audits/delete", { id });
    },
    onSuccess: () => {
      toast.success("Audit deleted");
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["saved-audits"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || "Couldn't delete the audit."),
  });

  const newAuditButton = (
    <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
      <Plus className="w-4 h-4" />
      New audit
    </Button>
  );

  return (
    <TooltipProvider>
      <section className="w-full p-4 md:p-6">
        <div className="flex flex-col gap-5">
          <ToolHeader
            icon={ClipboardCheck}
            title="Orchard Inspector"
            description="Automated account audits for OpenAI Ads — save a set of checks, run them any time, and get a health score with downloadable findings for the last 45 days. Serving blocks and rejected ads are checked from OpenAI's own diagnostics, so they work even on a brand-new account."
          >
            {newAuditButton}
          </ToolHeader>

          <Card className="border rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Saved audits
                {audits.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({audits.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="px-4 py-2">Audit</TableHead>
                      <TableHead className="px-3 py-2">Org</TableHead>
                      <TableHead className="px-3 py-2">Checks</TableHead>
                      <TableHead className="px-3 py-2">Last run</TableHead>
                      <TableHead className="px-3 py-2">Created</TableHead>
                      <TableHead className="px-3 py-2 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <SkeletonRows rows={4} colSpan={6} />
                    ) : isError ? (
                      <ErrorRow
                        colSpan={6}
                        message={(error as any)?.response?.data?.error || (error as any)?.message}
                        onRetry={() => refetch()}
                      />
                    ) : audits.length > 0 ? (
                      audits.map((a) => {
                        const widgetNames = a.widgets
                          .map((k) => auditWidget(k)?.name)
                          .filter(Boolean) as string[];
                        return (
                          <TableRow key={a.id} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="px-4 py-3 max-w-[260px]">
                              <p className="font-medium truncate" title={a.name}>{a.name}</p>
                              {a.description && (
                                <p className="text-xs text-muted-foreground truncate" title={a.description}>
                                  {a.description}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 text-muted-foreground max-w-[160px] truncate" title={a.adAccountName || a.adAccountId}>
                              {a.adAccountName || a.adAccountId}
                            </TableCell>
                            <TableCell className="px-3 py-3">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs cursor-default">
                                    {a.widgets.length} check{a.widgets.length === 1 ? "" : "s"}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[260px]">
                                  {widgetNames.length ? widgetNames.join(" · ") : "No known checks"}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="px-3 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {fmtDateTime(a.lastRunAt)}
                            </TableCell>
                            <TableCell className="px-3 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {fmtDate(a.createdAt)}
                            </TableCell>
                            <TableCell className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button asChild size="sm" className="gap-1.5 h-8">
                                  <Link href={`/tools/audits/run?id=${a.id}`}>
                                    <Play className="w-3.5 h-3.5" />
                                    Run
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                                  onClick={() => setToDelete(a)}
                                  aria-label={`Delete ${a.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <EmptyRow
                        colSpan={6}
                        icon={ClipboardCheck}
                        title="No audits yet"
                        sub="Create your first audit — pick the checks you care about and run it against the last 45 days."
                        action={newAuditButton}
                      />
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <CreateAuditDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["saved-audits"] })}
        />

        {/* Delete confirmation */}
        <Dialog open={!!toDelete} onOpenChange={(o) => !o && !isDeleting && setToDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete audit?</DialogTitle>
              <DialogDescription>
                {toDelete && (
                  <>
                    “<span className="font-medium text-foreground">{toDelete.name}</span>” and its
                    saved check selection will be removed. Past CSV downloads are unaffected.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setToDelete(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => toDelete && deleteAudit(toDelete.id)}
                disabled={isDeleting}
                className="gap-1.5"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}
