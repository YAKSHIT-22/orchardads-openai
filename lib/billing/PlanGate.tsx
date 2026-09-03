/**
 * Server-side entitlement guard for a whole tool page.
 *
 * Why this exists: the sidebar already hides and redirects locked tools, but
 * that is client-side decoration — typing the URL still rendered the page, and
 * the read-side tools are backed by shared report endpoints
 * (`/reports/campaign`, `/reports/adgroup`) that the always-on dashboard also
 * uses. Those endpoints cannot carry a `requireFeature` for a paid tool without
 * breaking the dashboard, and they take no parameter that distinguishes the
 * two callers, so the gate has to live at the page.
 *
 * Wrapping a tool's `layout.tsx` in this makes the check server-side and
 * unskippable: a Basic user who types /tools/optimize/time-performance gets the
 * upgrade wall, not a working Pro tool.
 *
 * Write paths keep their own `requireFeature` in the API route. This is defence
 * in depth, not a replacement.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getUserId } from "@/lib/openai/client";
import { getEntitlements } from "@/lib/billing/entitlements";
import { hasFeature, featureLabel, upgradeMessage, type Feature } from "@/lib/billing/plans";

export async function PlanGate({
  feature,
  children,
}: {
  feature: Feature;
  children: React.ReactNode;
}) {
  let userId: string;
  try {
    userId = await getUserId();
  } catch {
    redirect("/signin");
  }

  const ent = await getEntitlements(userId);
  if (hasFeature(ent.plan, feature)) return <>{children}</>;

  return (
    <section className="w-full p-4 md:p-6">
      <div className="mx-auto max-w-lg rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">
          {featureLabel(feature)} isn&apos;t on your {ent.plan.name} plan
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {upgradeMessage(feature, ent.plan)}
        </p>
        <Link
          href="/tools/billing"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          See plans
        </Link>
      </div>
    </section>
  );
}

/** Build a tool `layout.tsx` in one line. */
export function planGateLayout(feature: Feature) {
  return function GatedLayout({ children }: { children: React.ReactNode }) {
    return <PlanGate feature={feature}>{children}</PlanGate>;
  };
}
