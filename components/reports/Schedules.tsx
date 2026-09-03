"use client";

/**
 * Report schedules — email delivery for saved report templates. Lists every
 * schedule on the account (template-backed ones plus any legacy entity-report
 * schedules), with toggle / send-now / delete, and a creator that picks a
 * saved template + frequency + recipients.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyRow, ErrorRow, SkeletonRows } from "@/components/optimize/ui";
import type { ReportTemplateRow } from "@/components/reports/shared";
import { CalendarClock, Loader2, Mail, Plus, Send, Trash2 } from "lucide-react";

const LEGACY_TYPE_LABELS: Record<string, string> = {
  campaign: "Campaigns report",
  adgroup: "Ad groups report",
  keyword: "Keywords report",
  searchterm: "Search terms report",
  ad: "Ads report",
};

const FREQUENCIES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const freqLabel = (v: string) => FREQUENCIES.find((f) => f.value === v)?.label || v;

export type ScheduleRow = {
  id: string;
  name: string;
  reportType: string;
  templateId: string | null;
  template: { id: string; name: string } | null;
  frequency: string;
  recipients: string;
  enabled: boolean;
  lastSentAt: string | null;
  lookbackDays: number;
  campaignId: string | null;
};

export default function Schedules({
  adAccountId,
  templates,
  initialTemplateId,
}: {
  adAccountId: string;
  templates: ReportTemplateRow[];
  initialTemplateId?: string;
}) {
  const qc = useQueryClient();
  const [sendingId, setSendingId] = useState("");
  const [toDelete, setToDelete] = useState<ScheduleRow | null>(null);
  const [form, setForm] = useState({ name: "", templateId: initialTemplateId || "", frequency: "WEEKLY", recipients: "" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /* When the user arrives via a "Schedule" button, preselect that template. */
  useEffect(() => {
    if (!initialTemplateId) return;
    setForm((f) => {
      const t = templates.find((x) => x.id === initialTemplateId);
      return {
        ...f,
        templateId: initialTemplateId,
        name: f.name || (t ? `${t.name} — email` : f.name),
      };
    });
  }, [initialTemplateId, templates]);

  const listQuery = useQuery({
    queryKey: ["report-schedules", adAccountId],
    queryFn: async () => (await api.get(`/optimize/reports/schedules?adAccountId=${adAccountId}`)).data.schedules as ScheduleRow[],
    enabled: !!adAccountId,
  });
  const schedules = listQuery.data || [];

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/optimize/reports/schedules", {
        adAccountId,
        name: form.name,
        templateId: form.templateId,
        frequency: form.frequency,
        recipients: form.recipients,
      }),
    onSuccess: () => {
      toast.success("Schedule created", { description: "The report will be emailed on its cadence." });
      setForm({ name: "", templateId: "", frequency: "WEEKLY", recipients: "" });
      qc.invalidateQueries({ queryKey: ["report-schedules", adAccountId] });
      qc.invalidateQueries({ queryKey: ["report-templates", adAccountId] });
    },
    onError: (err: any) => adsErrorToast(err, "Failed to create schedule"),
  });

  const mutate = useMutation({
    mutationFn: async (v: { id: string; action: string; enabled?: boolean }) =>
      api.post("/optimize/reports/schedules/mutate", v),
    onSuccess: (_r, v) => {
      if (v.action !== "toggle") toast.success(v.action === "send" ? "Report sent" : "Schedule deleted");
      setSendingId("");
      if (v.action === "delete") setToDelete(null);
      qc.invalidateQueries({ queryKey: ["report-schedules", adAccountId] });
      qc.invalidateQueries({ queryKey: ["report-templates", adAccountId] });
    },
    onError: (err: any) => {
      adsErrorToast(err, "Action failed");
      setSendingId("");
      setToDelete(null);
    },
  });

  const canSubmit = form.name.trim() && form.templateId && form.recipients.trim();

  const scheduleLabel = (s: ScheduleRow) =>
    s.template?.name ||
    (s.reportType === "template" ? "Deleted report" : LEGACY_TYPE_LABELS[s.reportType] || s.reportType);

  return (
    <div className="flex flex-col gap-4">
      {/* Create */}
      <Card className="border rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New email schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Save a report in the Designer first — schedules deliver a saved report template by email.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input className="h-8 text-sm" placeholder="Weekly performance recap" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    Report template <span className="text-red-500">*</span>
                  </Label>
                  <Select value={form.templateId} onValueChange={(v) => set("templateId", v)}>
                    <SelectTrigger className="h-8 text-sm w-full">
                      <SelectValue placeholder="Pick a saved report" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Frequency</Label>
                  <Select value={form.frequency} onValueChange={(v) => set("frequency", v)}>
                    <SelectTrigger className="h-8 text-sm w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    Recipients <span className="text-muted-foreground">(comma-separated)</span> <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="you@co.com, team@co.com"
                    value={form.recipients}
                    onChange={(e) => set("recipients", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create schedule
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" />
            Your schedules{" "}
            {schedules.length > 0 && <span className="text-xs font-normal text-muted-foreground">({schedules.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="px-4 py-2">Schedule</TableHead>
                  <TableHead className="px-3 py-2">Frequency</TableHead>
                  <TableHead className="px-3 py-2">Recipients</TableHead>
                  <TableHead className="px-3 py-2">Last sent</TableHead>
                  <TableHead className="px-3 py-2">On</TableHead>
                  <TableHead className="px-3 py-2 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading ? (
                  <SkeletonRows rows={3} colSpan={6} />
                ) : listQuery.isError ? (
                  <ErrorRow
                    colSpan={6}
                    message={(listQuery.error as any)?.response?.data?.error || "Couldn't load your schedules."}
                    onRetry={() => listQuery.refetch()}
                  />
                ) : schedules.length > 0 ? (
                  schedules.map((s) => (
                    <TableRow key={s.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-2.5">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {scheduleLabel(s)}
                          {!s.templateId && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                              legacy · last {s.lookbackDays}d
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {freqLabel(s.frequency)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px] truncate" title={s.recipients}>
                        {s.recipients}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                        {s.lastSentAt ? new Date(s.lastSentAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <Switch checked={s.enabled} onCheckedChange={(v) => mutate.mutate({ id: s.id, action: "toggle", enabled: v })} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1"
                            disabled={sendingId === s.id}
                            onClick={() => {
                              setSendingId(s.id);
                              mutate.mutate({ id: s.id, action: "send" });
                            }}
                          >
                            {sendingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Send now
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7" onClick={() => setToDelete(s)} aria-label="Delete schedule">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRow
                    colSpan={6}
                    icon={Mail}
                    title="No schedules yet"
                    sub="Create one above to get a report in your inbox automatically."
                  />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && !mutate.isPending && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete schedule?</DialogTitle>
            <DialogDescription>
              &ldquo;{toDelete?.name}&rdquo; will stop emailing its report. The saved report template
              itself is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setToDelete(null)} disabled={mutate.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={mutate.isPending}
              onClick={() => toDelete && mutate.mutate({ id: toDelete.id, action: "delete" })}
            >
              {mutate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
