"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Feature, PlanId } from "./plans";

/**
 * Client-side view of the current plan.
 *
 * IMPORTANT: this is for AFFORDANCE, not enforcement. The server checks
 * `requireFeature` on every gated route regardless of what the UI believes. A
 * hidden nav item is a hint; the route check is the rule. If these two ever
 * disagree, the server wins and the user sees a clear 402 rather than a broken
 * page.
 *
 * The feature list comes from the same `plans.ts` the server enforces with, so
 * they cannot drift the way a hand-maintained frontend copy would.
 */

export type Meter = {
  meter: string;
  label: string;
  used: number;
  limit: number;
};

export type BillingState = {
  plan: PlanId;
  planName: string;
  isTrialing: boolean;
  isReadOnly: boolean;
  trialDaysLeft: number;
  trialDays: number;
  period: string;
  meters: Meter[];
  adAccounts: { used: number; limit: number };
  features: Feature[];
  limits: Record<string, number>;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  catalog: {
    id: PlanId;
    name: string;
    tagline: string;
    priceUsdCents: number;
    priceInrPaise: number;
    highlight: boolean;
    features: Feature[];
    limits: Record<string, number>;
  }[];
};

export function useBilling() {
  return useQuery<BillingState>({
    queryKey: ["billing"],
    queryFn: async () => (await api.get("/billing")).data as BillingState,
    // Long stale time: a plan doesn't change between page views, and this is
    // fetched on every app render.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Whether the current plan includes a feature. Defaults to TRUE while loading,
 *  so the nav doesn't flash a locked state on every page load for paying users. */
export function useHasFeature(feature: Feature): boolean {
  const { data, isLoading } = useBilling();
  if (isLoading || !data) return true;
  return data.features.includes(feature);
}
