import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/openai/errors";
import {
  effectivePlan,
  hasFeature,
  trialDaysRemaining,
  trialEndDate,
  upgradeMessage,
  type Feature,
  type Plan,
  type SubscriptionState,
} from "./plans";

/**
 * Server-side entitlement checks.
 *
 * Plan gating is enforced HERE, in route handlers — never only in the UI. A
 * hidden nav item is a hint; a server check is a rule. This matters more than
 * usual for this product because the gated actions write to a customer's live
 * ad account.
 */

export type Entitlements = {
  plan: Plan;
  subscription: SubscriptionState;
  trialDaysLeft: number;
  isTrialing: boolean;
  isReadOnly: boolean;
};

/**
 * Load the user's entitlements, creating the 14-day trial on first access.
 *
 * Creating it lazily rather than at signup means a user who never returns costs
 * us no row, and a user who signs up today starts their trial when they actually
 * begin evaluating rather than burning days on an unused account.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  let sub = await prisma.subscription.findUnique({ where: { userId } });

  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        userId,
        planId: "trial",
        status: "trialing",
        trialStartedAt: new Date(),
        trialEndsAt: trialEndDate(),
      },
    });
  }

  const state: SubscriptionState = {
    planId: sub.planId,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
  };

  const plan = effectivePlan(state);

  return {
    plan,
    subscription: state,
    trialDaysLeft: trialDaysRemaining(state),
    isTrialing: plan.id === "trial",
    isReadOnly: plan.id === "expired",
  };
}

/** Throw 402 unless the plan includes `feature`. */
export async function requireFeature(userId: string, feature: Feature): Promise<Entitlements> {
  const ent = await getEntitlements(userId);
  if (!hasFeature(ent.plan, feature)) {
    throw new AppError(upgradeMessage(feature, ent.plan), 402);
  }
  return ent;
}

/** Throw 402 when connecting another ad account would exceed the plan limit. */
export async function requireAdAccountSlot(userId: string): Promise<Entitlements> {
  const ent = await getEntitlements(userId);
  const used = await prisma.openAiAdsConnection.count({ where: { userId } });
  if (used >= ent.plan.limits.adAccounts) {
    throw new AppError(
      `Your ${ent.plan.name} plan covers ${ent.plan.limits.adAccounts} ad account${
        ent.plan.limits.adAccounts === 1 ? "" : "s"
      }. Upgrade to connect more.`,
      402
    );
  }
  return ent;
}

// ── Metering ────────────────────────────────────────────────────────────────

export type Meter = "ai_analyses" | "actions" | "scheduled_reports";

function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM (UTC)
}

function limitFor(plan: Plan, meter: Meter): number {
  switch (meter) {
    case "ai_analyses":
      return plan.limits.aiAnalysesPerMonth;
    case "actions":
      return plan.limits.actionsPerMonth;
    case "scheduled_reports":
      return plan.limits.scheduledReportsPerMonth;
  }
}

export async function getUsage(userId: string, meter: Meter): Promise<number> {
  const row = await prisma.usageRecord.findUnique({
    where: { userId_meter_period: { userId, meter, period: currentPeriod() } },
  });
  return row?.count ?? 0;
}

/**
 * Reserve one unit of a metered resource.
 *
 * Increments first and checks after, atomically, so two concurrent requests
 * cannot both pass a "is there room?" check and then both consume the last
 * unit. On overflow the increment is rolled back and a 402 is thrown.
 */
export async function consume(userId: string, meter: Meter, amount = 1): Promise<void> {
  const ent = await getEntitlements(userId);
  const limit = limitFor(ent.plan, meter);

  if (limit <= 0) {
    throw new AppError(
      ent.isReadOnly
        ? "Your trial has ended, so this account is read-only. Your data is still here — subscribe to resume."
        : `Your ${ent.plan.name} plan doesn't include this. Upgrade to continue.`,
      402
    );
  }

  const period = currentPeriod();
  const row = await prisma.usageRecord.upsert({
    where: { userId_meter_period: { userId, meter, period } },
    update: { count: { increment: amount } },
    create: { userId, meter, period, count: amount },
  });

  if (row.count > limit) {
    await prisma.usageRecord
      .update({
        where: { userId_meter_period: { userId, meter, period } },
        data: { count: { decrement: amount } },
      })
      .catch(() => {});
    throw new AppError(
      `You've used all ${limit} ${meterLabel(meter)} on ${ent.plan.name} this month. Upgrade for more, or wait for the reset.`,
      402
    );
  }
}

function meterLabel(meter: Meter): string {
  return meter === "ai_analyses"
    ? "AI analyses"
    : meter === "actions"
      ? "applied changes"
      : "scheduled reports";
}

/** Usage summary for the billing page and the in-app meter. */
export async function usageSummary(userId: string) {
  const ent = await getEntitlements(userId);
  const period = currentPeriod();
  const rows = await prisma.usageRecord.findMany({ where: { userId, period } });
  const used = (m: Meter) => rows.find((r) => r.meter === m)?.count ?? 0;

  const meters: Meter[] = ["ai_analyses", "actions", "scheduled_reports"];
  return {
    plan: ent.plan.id,
    planName: ent.plan.name,
    isTrialing: ent.isTrialing,
    isReadOnly: ent.isReadOnly,
    trialDaysLeft: ent.trialDaysLeft,
    period,
    meters: meters.map((meter) => ({
      meter,
      label: meterLabel(meter),
      used: used(meter),
      limit: limitFor(ent.plan, meter),
    })),
    adAccounts: {
      used: await prisma.openAiAdsConnection.count({ where: { userId } }),
      limit: ent.plan.limits.adAccounts,
    },
  };
}
