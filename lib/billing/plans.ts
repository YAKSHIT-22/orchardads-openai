/**
 * Plans, entitlements and the free trial.
 *
 * Pricing model: per connected ad account, never a percentage of ad spend.
 * A product whose whole promise is cutting wasted spend cannot be paid more for
 * recommending bigger budgets. (Reasoning in docs/business/pricing-strategy.md.)
 *
 * TRIAL POLICY — deliberate and important:
 * every new organization gets 14 days with EVERY tool unlocked at Enterprise-tier
 * limits, no card required. Not a crippled trial. The reason is the product's
 * own shape: Serving Doctor and Review Doctor produce value the minute a key is
 * pasted, before any history exists, so the fastest path to a paying customer is
 * to let them see the whole thing work on their real account. Gating the good
 * parts during evaluation would hide exactly the features that sell it.
 *
 * When a trial ends without a subscription the account does not go dark: it
 * falls back to READ-ONLY. Dashboards, reports and diagnostics keep working;
 * what stops is writing to the ad account and running AI analyses. Locking
 * someone out of their own performance data to pressure a renewal is hostile,
 * and they would simply disconnect and never come back.
 */

export type PlanId = "trial" | "basic" | "pro" | "enterprise" | "expired";

/** Every gateable capability in the product. */
export type Feature =
  // Always available, on every plan and after a trial ends.
  | "dashboard"
  | "serving_doctor"
  | "review_doctor"
  | "reports_view"
  | "activity_log"
  // Paid tiers.
  | "recommendations"
  | "apply_actions"
  | "rollback"
  | "waste_finder"
  | "budget_pacing"
  | "bid_optimizer"
  | "context_hints"
  | "time_performance"
  | "alerts"
  | "ai_analyst"
  | "reports_export"
  | "scheduled_reports"
  | "inspector"
  | "spend_limits"
  | "locations"
  | "segments"
  // Higher tiers.
  | "autopilot"
  | "shared_dashboards"
  | "report_designer"
  | "multi_seat"
  | "white_label"
  | "api_access"
  | "priority_support";

export type PlanLimits = {
  /** Connected OpenAI Ads accounts. The meter the price is set against. */
  adAccounts: number;
  seats: number;
  /** LLM-backed analyses per month — the only variable cost that matters. */
  aiAnalysesPerMonth: number;
  /** Writes to a customer's ad account per month. */
  actionsPerMonth: number;
  /** Scheduled report deliveries per month. */
  scheduledReportsPerMonth: number;
  /** Alert monitors. */
  alerts: number;
  /** Autopilot strategies. */
  strategies: number;
  /** Days of synced history retained. */
  historyDays: number;
  /** Minimum minutes between syncs of one ad account. */
  syncIntervalMinutes: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in USD cents. */
  priceUsdCents: number;
  /** Monthly price in INR paise, priced for the Indian market, not converted. */
  priceInrPaise: number;
  tagline: string;
  features: Feature[];
  limits: PlanLimits;
  /** Shown with a "Most popular" badge on the pricing page. */
  highlight?: boolean;
};

/** Features every plan keeps, including after a trial expires. */
export const ALWAYS_ON: Feature[] = [
  "dashboard",
  "serving_doctor",
  "review_doctor",
  "reports_view",
  "activity_log",
];

const BASIC_FEATURES: Feature[] = [
  ...ALWAYS_ON,
  "recommendations",
  "apply_actions",
  "rollback",
  "waste_finder",
  "budget_pacing",
  "spend_limits",
  "reports_export",
  "ai_analyst",
];

const PRO_FEATURES: Feature[] = [
  ...BASIC_FEATURES,
  "bid_optimizer",
  "context_hints",
  "time_performance",
  "alerts",
  "scheduled_reports",
  "inspector",
  "locations",
  "segments",
  "multi_seat",
];

const ENTERPRISE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "autopilot",
  "shared_dashboards",
  "report_designer",
  "white_label",
  "api_access",
  "priority_support",
];

export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, Plan> = {
  /**
   * 14 days, everything unlocked at Enterprise limits, no card. Deliberately not a
   * reduced feature set — see the module comment.
   */
  trial: {
    id: "trial",
    name: "Free trial",
    priceUsdCents: 0,
    priceInrPaise: 0,
    tagline: `${TRIAL_DAYS} days, every tool unlocked. No card required.`,
    features: ENTERPRISE_FEATURES,
    limits: {
      adAccounts: 10,
      seats: 5,
      aiAnalysesPerMonth: 500,
      actionsPerMonth: 300,
      scheduledReportsPerMonth: 30,
      alerts: 25,
      strategies: 10,
      historyDays: 180,
      syncIntervalMinutes: 60,
    },
  },

  basic: {
    id: "basic",
    name: "Basic",
    priceUsdCents: 1500,
    priceInrPaise: 79900,
    tagline: "One ad account. Find the waste, fix it safely.",
    features: BASIC_FEATURES,
    limits: {
      adAccounts: 1,
      seats: 2,
      aiAnalysesPerMonth: 100,
      actionsPerMonth: 100,
      scheduledReportsPerMonth: 4,
      alerts: 5,
      strategies: 0,
      historyDays: 90,
      syncIntervalMinutes: 360, // 4 syncs/day
    },
  },

  pro: {
    id: "pro",
    name: "Pro",
    priceUsdCents: 2900,
    priceInrPaise: 149900,
    tagline: "Up to 5 ad accounts, full optimization toolkit and alerting.",
    features: PRO_FEATURES,
    highlight: true,
    limits: {
      adAccounts: 5,
      seats: 5,
      aiAnalysesPerMonth: 500,
      actionsPerMonth: 400,
      scheduledReportsPerMonth: 20,
      alerts: 25,
      strategies: 0,
      historyDays: 180,
      syncIntervalMinutes: 120, // 12 syncs/day
    },
  },

  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceUsdCents: 4900,
    priceInrPaise: 249900,
    tagline: "Agencies and multi-brand teams. Autopilot, client sharing, API.",
    features: ENTERPRISE_FEATURES,
    limits: {
      adAccounts: 25,
      seats: 20,
      aiAnalysesPerMonth: 2500,
      actionsPerMonth: 2000,
      scheduledReportsPerMonth: 100,
      alerts: 100,
      strategies: 25,
      historyDays: 365,
      syncIntervalMinutes: 60, // hourly
    },
  },

  /**
   * Trial ended, or a subscription lapsed. Read-only: everything that shows the
   * advertiser their own data keeps working; writing and AI stop.
   */
  expired: {
    id: "expired",
    name: "Read-only",
    priceUsdCents: 0,
    priceInrPaise: 0,
    tagline: "Your data stays visible. Subscribe to resume optimizing.",
    features: ALWAYS_ON,
    limits: {
      adAccounts: 1,
      seats: 1,
      aiAnalysesPerMonth: 0,
      actionsPerMonth: 0,
      scheduledReportsPerMonth: 0,
      alerts: 0,
      strategies: 0,
      historyDays: 30,
      syncIntervalMinutes: 1440, // once a day
    },
  },
};

/** The three purchasable plans, in display order. */
export const PURCHASABLE: Plan[] = [PLANS.basic, PLANS.pro, PLANS.enterprise];

// ── Subscription state ──────────────────────────────────────────────────────

export type SubscriptionState = {
  planId: PlanId;
  /** Set while a trial is running. */
  trialEndsAt?: Date | null;
  /** Set on a paid subscription. */
  currentPeriodEnd?: Date | null;
  status?: "trialing" | "active" | "past_due" | "canceled" | "expired";
};

/**
 * Resolve the plan actually in force right now.
 *
 * A trial that has run out silently falls through to `expired` rather than
 * continuing to grant Scale features, and a past-due subscription keeps working
 * until its period ends — dunning is a billing conversation, not a reason to cut
 * someone off mid-month.
 */
export function effectivePlan(sub: SubscriptionState | null | undefined, now = new Date()): Plan {
  if (!sub) return PLANS.expired;

  if (sub.status === "trialing" || sub.planId === "trial") {
    if (sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime()) return PLANS.trial;
    return PLANS.expired;
  }

  if (sub.status === "canceled" || sub.status === "expired") {
    // A cancellation takes effect at the end of the paid period, not instantly.
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()) {
      return PLANS[sub.planId] ?? PLANS.expired;
    }
    return PLANS.expired;
  }

  return PLANS[sub.planId] ?? PLANS.expired;
}

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return plan.features.includes(feature);
}

/** Whole days left in a trial, floored at 0. */
export function trialDaysRemaining(sub: SubscriptionState | null | undefined, now = new Date()): number {
  if (!sub?.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

export function isTrialing(sub: SubscriptionState | null | undefined, now = new Date()): boolean {
  return effectivePlan(sub, now).id === "trial";
}

export function trialEndDate(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * The message shown when a gate blocks something. Written to name the plan that
 * unblocks it, because "upgrade to continue" with no specifics is the most
 * annoying sentence in SaaS.
 */
export function upgradeMessage(feature: Feature, current: Plan): string {
  const target = PURCHASABLE.find((p) => p.features.includes(feature));
  if (!target) return "That feature isn't available on your plan.";
  if (current.id === "expired") {
    return `Your trial has ended. ${target.name} ($${target.priceUsdCents / 100}/mo) restores this — your data is still here.`;
  }
  return `${featureLabel(feature)} is part of ${target.name} ($${target.priceUsdCents / 100}/mo).`;
}

export function featureLabel(feature: Feature): string {
  const labels: Partial<Record<Feature, string>> = {
    recommendations: "Recommendations",
    apply_actions: "Applying changes",
    rollback: "Rollback",
    waste_finder: "Waste Finder",
    budget_pacing: "Budget Pacing",
    bid_optimizer: "Bid Optimizer",
    context_hints: "Context Hints",
    time_performance: "Time Performance",
    alerts: "Orchard Watch alerts",
    ai_analyst: "Ask (AI analyst)",
    reports_export: "Report export",
    scheduled_reports: "Scheduled reports",
    inspector: "Inspector",
    spend_limits: "Spend Limits",
    locations: "Locations",
    segments: "Segment breakdowns",
    autopilot: "Autopilot",
    shared_dashboards: "Live Share",
    report_designer: "Report Designer",
    multi_seat: "Extra seats",
    white_label: "White-label reports",
    api_access: "API access",
  };
  return labels[feature] ?? feature.replace(/_/g, " ");
}
