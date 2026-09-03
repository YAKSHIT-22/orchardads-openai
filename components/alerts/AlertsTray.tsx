"use client";

/**
 * Orchard Watch triggered-alerts tray — a right-side sheet listing recent
 * alert events with read / snooze / dismiss actions. Opened from the navbar
 * bell; open state is controlled by the parent.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import {
  type AlertEvent, SEVERITY_META, KIND_META, SCOPE_LABEL,
  relativeTime, eventValue,
} from "@/components/alerts/shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AlarmClock, ArrowRight, CheckCheck, EyeOff, Inbox, Loader2, MoreHorizontal, RotateCcw, TriangleAlert,
} from "lucide-react";

export function AlertsTray({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { adAccountId } = adAccountStore();
  const [filter, setFilter] = useState<"new" | "all">("new");

  const eventsQuery = useQuery<AlertEvent[]>({
    queryKey: ["orchard-alert-events", adAccountId, filter, "", "tray"],
    enabled: open && !!adAccountId,
    queryFn: async () => {
      const res = await api.get("/alerts/events", { params: { adAccountId, status: filter, limit: 50 } });
      return (res.data?.events || []) as AlertEvent[];
    },
  });
  const events = eventsQuery.data || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["orchard-alert-events"] });
    qc.invalidateQueries({ queryKey: ["alerts-unread-count"] });
  };

  const mutate = useMutation({
    mutationFn: async (body: { id?: string; action: string; days?: number; adAccountId?: string }) => {
      await api.post("/alerts/events/mutate", body);
    },
    onSuccess: (_d, v) => {
      if (v.action === "readAll") toast.success("All events marked read");
      else if (v.action === "snooze") toast.success(`Snoozed for ${v.days} day${(v.days || 0) > 1 ? "s" : ""}`);
      else if (v.action === "dismiss") toast.success("Event dismissed");
      invalidate();
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the event"),
  });

  const unreadHere = events.filter((e) => e.status === "NEW").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md gap-0 p-0 flex flex-col">
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="text-base">Triggered alerts</SheetTitle>
          <SheetDescription className="sr-only">
            Recent alert events for the selected organization.
          </SheetDescription>
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              {(["new", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    filter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "new" ? "Unread" : "All"}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              disabled={!adAccountId || mutate.isPending || unreadHere === 0}
              onClick={() => mutate.mutate({ action: "readAll", adAccountId })}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!adAccountId ? (
            <TrayNotice icon={TriangleAlert} title="No organization selected" sub="Pick an org in the header to see its alerts." />
          ) : eventsQuery.isLoading ? (
            <div className="p-4 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : eventsQuery.isError ? (
            <TrayNotice
              icon={TriangleAlert}
              title="Couldn't load alerts"
              sub={(eventsQuery.error as any)?.response?.data?.error || "Something went wrong."}
              action={
                <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => eventsQuery.refetch()}>
                  <RotateCcw className="w-3.5 h-3.5" /> Try again
                </Button>
              }
            />
          ) : events.length === 0 ? (
            <TrayNotice
              icon={Inbox}
              title="All clear — nothing has triggered."
              sub={filter === "new" ? "No unread events. Switch to “All” for history." : "Events appear here when an alert fires."}
            />
          ) : (
            <ul className="divide-y">
              {events.map((e) => {
                const sev = SEVERITY_META[e.severity] || SEVERITY_META.WARNING;
                const isNew = e.status === "NEW";
                return (
                  <li key={e.id} className={cn("relative flex gap-3 px-4 py-3", isNew && "bg-primary/[0.04]")}>
                    <span className={cn("absolute left-0 top-0 bottom-0 w-0.5", sev.stripe)} />
                    <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", sev.dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isNew && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                        <p className="text-sm font-medium truncate">{e.alert?.name || "Alert"}</p>
                        {e.alert?.kind && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {KIND_META[e.alert.kind]?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate" title={e.entityName}>
                        {SCOPE_LABEL[e.entityType] || e.entityType} · {e.entityName}
                      </p>
                      <p className="text-xs text-foreground/80 mt-1 leading-snug line-clamp-3" title={e.message}>
                        {e.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground tabular-nums">
                        <span className="font-medium text-foreground/70">{eventValue(e)}</span>
                        <span>·</span>
                        <span>{relativeTime(e.createdAt)}</span>
                        {e.status === "SNOOZED" && e.effectiveSnoozed && (
                          <>
                            <span>·</span>
                            <span>snoozed</span>
                          </>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1">
                          {mutate.isPending && mutate.variables?.id === e.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="w-4 h-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {isNew && (
                          <DropdownMenuItem onClick={() => mutate.mutate({ id: e.id, action: "read" })}>
                            <CheckCheck className="mr-2 h-3.5 w-3.5" /> Mark read
                          </DropdownMenuItem>
                        )}
                        {e.status === "SNOOZED" && (
                          <DropdownMenuItem onClick={() => mutate.mutate({ id: e.id, action: "unsnooze" })}>
                            <AlarmClock className="mr-2 h-3.5 w-3.5" /> Unsnooze
                          </DropdownMenuItem>
                        )}
                        {[1, 7, 28].map((d) => (
                          <DropdownMenuItem key={d} onClick={() => mutate.mutate({ id: e.id, action: "snooze", days: d })}>
                            <AlarmClock className="mr-2 h-3.5 w-3.5" /> Snooze {d} day{d > 1 ? "s" : ""}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600"
                          onClick={() => mutate.mutate({ id: e.id, action: "dismiss" })}
                        >
                          <EyeOff className="mr-2 h-3.5 w-3.5" /> Dismiss
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t mt-0 py-3">
          <Link
            href="/tools/alerts"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Manage in Orchard Watch
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function TrayNotice({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon: typeof Inbox;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center px-6 py-16">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground/70 text-sm">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
