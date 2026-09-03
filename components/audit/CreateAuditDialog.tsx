"use client";

/**
 * Create-audit dialog: name + optional description + widget picker.
 * An audit is a saved set of widget keys — it always runs against a fixed
 * last-45-day window, so there is deliberately no date-range control here.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { AUDIT_WIDGETS } from "@/lib/audit/widgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarRange, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_KEYS = AUDIT_WIDGETS.map((w) => w.key as string);

export function CreateAuditDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { adAccountId, connections } = adAccountStore();
  const adAccountName =
    connections?.find((o) => String(o.adAccountId) === adAccountId)?.adAccountName || "";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_KEYS));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const reset = () => {
    setName("");
    setDescription("");
    setSelected(new Set(ALL_KEYS));
  };

  const { mutate: create, isPending } = useMutation({
    mutationFn: async () => {
      if (!adAccountId) throw new Error("No organization selected — pick an org first.");
      if (!name.trim()) throw new Error("Give the audit a name.");
      if (selected.size === 0) throw new Error("Select at least one audit widget.");
      const res = await api.post("/audits", {
        adAccountId,
        adAccountName,
        name: name.trim(),
        description: description.trim(),
        widgets: ALL_KEYS.filter((k) => selected.has(k)),
      });
      return res.data?.audit;
    },
    onSuccess: () => {
      toast.success("Audit created");
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || err?.message || "Couldn't create the audit."),
  });

  const canSubmit = !!adAccountId && name.trim().length > 0 && selected.size > 0 && !isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New audit</DialogTitle>
          <DialogDescription>
            Pick the checks to include. Audits run against{" "}
            <span className="font-medium text-foreground">{adAccountName || adAccountId || "your org"}</span>{" "}
            over a fixed last-45-day window.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-name" className="text-xs">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="audit-name"
              value={name}
              maxLength={120}
              placeholder="e.g. Weekly account health check"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-desc" className="text-xs">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="audit-desc"
              value={description}
              maxLength={400}
              rows={2}
              placeholder="What this audit is for…"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Widgets <span className="text-muted-foreground font-normal">({selected.size} of {ALL_KEYS.length} selected)</span>
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setSelected(new Set(ALL_KEYS))}
                  disabled={selected.size === ALL_KEYS.length}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setSelected(new Set())}
                  disabled={selected.size === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AUDIT_WIDGETS.map((w) => {
                const active = selected.has(w.key);
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggle(w.key)}
                    aria-pressed={active}
                    className={cn(
                      "text-left rounded-xl border p-3 transition-colors",
                      active
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug">{w.name}</span>
                      <span
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5",
                          active ? "bg-primary border-primary text-white" : "border-muted-foreground/40"
                        )}
                        aria-hidden
                      >
                        {active && <Check className="w-3 h-3" />}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">{w.description}</p>
                    {w.needsHistory && (
                      <Badge
                        variant="outline"
                        className="mt-1.5 text-[10px] px-1.5 py-0 border-0 bg-sky-100 text-sky-700"
                      >
                        needs history
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="w-3.5 h-3.5" />
            Every run analyzes the last 45 days — no date range to configure.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create audit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
