"use client";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { usePaddle } from "@/components/billing/usePaddle";

import Link from "next/link";
import { Check, Clock, Lock, Sparkles, TriangleAlert } from "lucide-react";

import { useBilling } from "@/lib/billing/useEntitlements";
import { featureLabel, type Feature } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Plan and usage.
 *
 * Two deliberate choices:
 *
 *  - USAGE METERS ARE SHOWN BEFORE PLANS. The most common reason someone opens
 *    this page is "why did that stop working", not "I'd like to spend money".
 *    Answering that first is more useful than a pricing wall.
 *  - Only the meters that cost us money are shown, because they're the only ones
 *    we count. Displaying a meter we don't enforce would be theatre.
 *
 * Checkout runs through Paddle, which is the MERCHANT OF RECORD: it sells to
 * the customer and handles sales tax / VAT / GST. Entitlements are never
 * granted from the browser's success callback — only the signed webhook
 * promotes a plan, so closing the tab at the right moment wins nothing.
 *
 * When Paddle isn't configured the buttons fall back to "Talk to us" rather
 * than a Subscribe that goes nowhere.
 */

const HIGHLIGHT_FEATURES: Record<string, Feature[]> = {
  basic: ["recommendations", "apply_actions", "waste_finder", "budget_pacing", "ai_analyst"],
  pro: ["bid_optimizer", "context_hints", "alerts", "inspector", "scheduled_reports", "segments"],
  enterprise: ["autopilot", "shared_dashboards", "report_designer", "white_label", "api_access"],
};

export default function BillingPage() {
  const { data, isLoading } = useBilling();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  // Paddle fires `checkout.completed` as soon as payment succeeds, but the
  // subscription is only real once the signed webhook lands. Refetch on a short
  // delay rather than optimistically promoting the plan in the UI.
  const paddle = usePaddle(
    useCallback(
      (e: unknown) => {
        const name = (e as { name?: string })?.name;
        if (name === "checkout.completed") {
          toast.success("Payment received — activating your plan…");
          setPending(null);
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ["billing"] }), 2500);
        }
        if (name === "checkout.closed") setPending(null);
      },
      [queryClient]
    )
  );

  const paymentsReady = Boolean(paddle);
  const hasPaidPlan =
    data?.subscription?.status === "active" || data?.subscription?.status === "past_due";

  async function startCheckout(planId: string) {
    setPending(planId);
    try {
      const res = await api.post("/billing/checkout", { plan: planId });
      // An existing subscriber is switched server-side; no overlay involved.
      if (res.data?.changed) {
        toast.success(res.data.message ?? "Plan updated.");
        queryClient.invalidateQueries({ queryKey: ["billing"] });
        setPending(null);
        return;
      }
      paddle?.Checkout.open({ transactionId: res.data.transactionId });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : "Could not start checkout.";
      toast.error(msg);
      setPending(null);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="p-5 max-w-5xl mx-auto flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Plan &amp; usage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What you&apos;re on, what you&apos;ve used this month, and what else is available.
          </p>
        </header>

        {/* Current plan */}
        <div
          className={cn(
            "rounded-xl border p-5",
            data.isReadOnly ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{data.planName}</h2>
                {data.isTrialing && (
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Sparkles className="w-3 h-3" />
                    Trial
                  </Badge>
                )}
                {data.isReadOnly && (
                  <Badge variant="outline" className="gap-1 font-normal border-amber-500/30 text-amber-600">
                    <Lock className="w-3 h-3" />
                    Read-only
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                {data.isTrialing ? (
                  <>
                    {data.trialDaysLeft === 0
                      ? "Your trial ends today."
                      : `${data.trialDaysLeft} of ${data.trialDays} days left.`}{" "}
                    Every tool is unlocked — nothing is held back during evaluation.
                  </>
                ) : data.isReadOnly ? (
                  <>
                    Your data is all still here and still visible. What&apos;s paused is applying
                    changes to your ad account and running AI analysis.
                  </>
                ) : (
                  <>
                    Renews{" "}
                    {data.subscription.currentPeriodEnd
                      ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString()
                      : "monthly"}
                    .
                  </>
                )}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-muted-foreground">Ad accounts</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                {data.adAccounts.used} / {data.adAccounts.limit}
              </p>
            </div>
          </div>
        </div>

        {/* Usage — first, because "why did that stop working" is the common question. */}
        <section>
          <h2 className="text-sm font-semibold text-foreground">
            Usage this month{" "}
            <span className="font-normal text-muted-foreground">({data.period})</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Only what costs real money is metered: AI analyses and changes applied to your ad
            account.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            {data.meters.map((m) => {
              const pct = m.limit > 0 ? Math.min(1, m.used / m.limit) : 0;
              const exhausted = m.limit > 0 && m.used >= m.limit;
              const nearly = pct >= 0.85 && !exhausted;

              return (
                <div key={m.meter} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {m.label}
                    </span>
                    {exhausted && <TriangleAlert className="w-3.5 h-3.5 text-destructive" />}
                  </div>

                  <p className="text-2xl font-semibold text-foreground mt-1.5 tabular-nums">
                    {m.used.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {m.limit.toLocaleString()}
                    </span>
                  </p>

                  <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        exhausted ? "bg-destructive" : nearly ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>

                  {exhausted && (
                    <p className="text-[11px] text-destructive mt-1.5">
                      Limit reached — resets on the 1st.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Plans */}
        <section>
          <h2 className="text-sm font-semibold text-foreground">Plans</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Priced per connected ad account. Never a percentage of your ad spend — a tool that
            exists to cut waste shouldn&apos;t earn more when you spend more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            {data.catalog.map((plan) => {
              const current = data.plan === plan.id;
              const highlights = HIGHLIGHT_FEATURES[plan.id] ?? [];

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-xl border bg-card p-5 flex flex-col",
                    plan.highlight ? "border-primary shadow-sm" : "border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    {plan.highlight && !current && (
                      <Badge className="text-[10px] font-medium">Most popular</Badge>
                    )}
                    {current && (
                      <Badge variant="outline" className="text-[10px] font-medium">
                        Current
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2">
                    <span className="text-3xl font-semibold text-foreground tabular-nums">
                      ${plan.priceUsdCents / 100}
                    </span>
                    <span className="text-sm text-muted-foreground"> /month</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    or ₹{(plan.priceInrPaise / 100).toLocaleString("en-IN")} + GST in India
                  </p>

                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{plan.tagline}</p>

                  <ul className="mt-4 flex flex-col gap-2 flex-1">
                    <li className="flex gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-foreground">{plan.limits.adAccounts}</strong> ad
                        account{plan.limits.adAccounts === 1 ? "" : "s"},{" "}
                        <strong className="text-foreground">{plan.limits.seats}</strong> seats
                      </span>
                    </li>
                    <li className="flex gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        {plan.limits.aiAnalysesPerMonth.toLocaleString()} AI analyses ·{" "}
                        {plan.limits.actionsPerMonth.toLocaleString()} applied changes
                      </span>
                    </li>
                    {highlights.map((f) => (
                      <li key={f} className="flex gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{featureLabel(f)}</span>
                      </li>
                    ))}
                  </ul>

                  {current ? (
                    <Button className="rounded-lg mt-5 w-full" variant="outline" disabled>
                      Current plan
                    </Button>
                  ) : paymentsReady ? (
                    <Button
                      className="rounded-lg mt-5 w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      disabled={pending !== null}
                      onClick={() => startCheckout(plan.id)}
                    >
                      {pending === plan.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Opening checkout…
                        </>
                      ) : hasPaidPlan ? (
                        `Switch to ${plan.name}`
                      ) : (
                        `Subscribe to ${plan.name}`
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="rounded-lg mt-5 w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      asChild
                    >
                      <Link href={`/contact?plan=${plan.id}`}>Talk to us about {plan.name}</Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 mt-4 flex gap-2.5">
            <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {paymentsReady ? (
                <>
                  Payments are handled by Paddle, our reseller — they appear on your statement and
                  handle any VAT or GST. Cancelling stops the next renewal; you keep everything
                  until the end of the period you&apos;ve already paid for.
                </>
              ) : (
                <>
                  Self-serve checkout isn&apos;t switched on yet. Until then, plan changes go through
                  us directly rather than a button that pretends to charge you.
                </>
              )}
            </p>
          </div>
        </section>

        {/* Always-on */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            What keeps working, whatever happens
          </h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
            Even after a trial ends or a subscription lapses, your dashboard, Serving Doctor, Review
            Doctor, reports and activity log stay available. We won&apos;t lock you out of your own
            performance data to pressure a renewal.
          </p>
        </section>
      </div>
    </div>
  );
}
