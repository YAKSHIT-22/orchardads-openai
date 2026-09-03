import { NextResponse } from "next/server";
import { withAdsRoute } from "@/lib/openai/client";
import { usageSummary, getEntitlements } from "@/lib/billing/entitlements";
import { PURCHASABLE, PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

/**
 * Plan, usage and entitlements for the current user.
 *
 * The feature list is returned so the UI can gate navigation from the SAME
 * source the server enforces with. A second, hand-maintained list in the
 * frontend is how a nav item and its route drift apart until someone finds a
 * tool that opens and then 402s.
 */
export const GET = withAdsRoute(async ({ userId }) => {
  const [summary, ent] = await Promise.all([usageSummary(userId), getEntitlements(userId)]);

  return NextResponse.json(
    {
      ...summary,
      trialDays: TRIAL_DAYS,
      features: ent.plan.features,
      limits: ent.plan.limits,
      subscription: {
        status: ent.subscription.status,
        trialEndsAt: ent.subscription.trialEndsAt,
        currentPeriodEnd: ent.subscription.currentPeriodEnd,
      },
      catalog: PURCHASABLE.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        priceUsdCents: p.priceUsdCents,
        priceInrPaise: p.priceInrPaise,
        highlight: !!p.highlight,
        features: p.features,
        limits: p.limits,
      })),
      readOnlyPlan: { id: PLANS.expired.id, name: PLANS.expired.name, tagline: PLANS.expired.tagline },
    },
    { status: 200 }
  );
});
