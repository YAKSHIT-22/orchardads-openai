"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, ShieldAlert, Wallet } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Spend Limits — account-level spending caps for a date window.
 *
 * A spend limit window is a HARD CAP on what the entire ad account can spend
 * between two dates.
 *
 * That makes it the single highest-blast-radius control in this product. Every
 * campaign in the account stops when the window is exhausted, so:
 *   - the form states the consequence before you submit, not after;
 *   - the risk engine bands it HIGH regardless of amount;
 *   - no automation rule can create or change one. Only a person, here.
 */

type Window = {
  window_id: string;
  start_date: string;
  end_date: string;
  amount_micros: number;
  spent_micros?: number;
  name: string | null;
  io_id: string | null;
  status: string;
  can_edit: boolean;
  can_delete: boolean;
};

export default function SpendLimitsPage() {
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["spend-limits", adAccountId],
    enabled: !!adAccountId,
    queryFn: async () => {
      const res = await api.get("/spend-limits", { params: { adAccountId } });
      return (res.data?.data ?? []) as Window[];
    },
  });

  const windows = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [query.data]
  );

  const active = windows.filter((w) => isActive(w));

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to manage spend limits.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Spend Limits</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            A hard cap on what this entire ad account can spend between two dates. When a window is
            exhausted, every campaign stops — not just one.
          </p>
        </div>
        <Button className="rounded-lg" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New spend limit
        </Button>
      </header>

      {active.length === 0 && !query.isLoading && windows.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-2.5">
          <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            No spend limit is currently in force. Campaign budgets still apply, but nothing caps
            total account spend.
          </p>
        </div>
      )}

      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : windows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-2">
          <Wallet className="w-10 h-10 text-muted-foreground/30" />
          <h2 className="text-base font-semibold text-foreground">No spend limits set</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Without one, total account spend is bounded only by the sum of your campaign budgets.
            A limit is a useful safety net when several campaigns run at once.
          </p>
          <Button className="rounded-lg mt-1" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create the first one
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {windows.map((w) => (
            <WindowCard key={w.window_id} window={w} currency={currency} />
          ))}
        </div>
      )}

      <CreateDialog
        open={open}
        onOpenChange={setOpen}
        adAccountId={adAccountId}
        currency={currency}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["spend-limits"] });
          setOpen(false);
        }}
      />
    </div>
  );
}

function isActive(w: Window): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return w.start_date <= today && w.end_date >= today;
}

function WindowCard({ window: w, currency }: { window: Window; currency: string }) {
  const spent = w.spent_micros ?? 0;
  const used = w.amount_micros > 0 ? spent / w.amount_micros : 0;
  const exhausted = used >= 1;
  const nearly = used >= 0.85 && !exhausted;
  const active = isActive(w);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {w.name || "Spend limit"}
            </h3>
            {active && (
              <Badge variant="outline" className="text-[11px] font-normal border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                In force
              </Badge>
            )}
            {exhausted && (
              <Badge variant="outline" className="text-[11px] font-normal border-destructive/30 text-destructive">
                Exhausted — account stopped
              </Badge>
            )}
            {nearly && (
              <Badge variant="outline" className="text-[11px] font-normal border-amber-500/30 text-amber-600">
                Nearly spent
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {w.start_date} to {w.end_date}
            {w.io_id && <span className="ml-1">· IO {w.io_id}</span>}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold text-foreground tabular-nums">
            {money(currency, w.amount_micros)}
          </p>
          {w.spent_micros !== undefined && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {money(currency, spent)} spent · {percent(used, 0)}
            </p>
          )}
        </div>
      </div>

      {w.spent_micros !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              exhausted ? "bg-destructive" : nearly ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(100, used * 100)}%` }}
          />
        </div>
      )}

      {exhausted && active && (
        <p className="text-xs text-destructive mt-2 leading-relaxed">
          This window is fully spent, so nothing in the account can deliver until it ends or the
          limit is raised in Ads Manager.
        </p>
      )}
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  adAccountId,
  currency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adAccountId: string;
  currency: string;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      api.post("/spend-limits", {
        adAccountId,
        name: name.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
        amount_micros: Math.round(Number(amount) * 1_000_000),
      }),
    onSuccess: () => {
      toast.success("Spend limit created");
      setName("");
      setAmount("");
      setEndDate("");
      onCreated();
    },
    onError: (err) => adsErrorToast(err, "Couldn't create the spend limit"),
  });

  const valid =
    !!startDate && !!endDate && endDate > startDate && Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New spend limit</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This caps the <strong className="text-foreground">whole ad account</strong>. When the
              amount is spent, every campaign stops delivering until the window ends — campaign
              budgets won&apos;t override it.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Name (optional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 budget"
              className="rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">End date</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Limit ({currency})</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="rounded-lg"
            />
            <p className="text-xs text-muted-foreground">
              Total the account may spend across this whole window, not per day.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-lg"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create spend limit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
