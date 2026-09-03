import { prisma } from "@/lib/prisma";
import { runCachedReport } from "@/lib/openai/report";
import { GET_CAMPAIGN_REPORTS, GET_ADGROUP_REPORTS, GET_AD_REPORTS } from "@/utils/redisExpire";
import { dailyFromReport, mergeDaily, DailyPoint } from "@/lib/optimize/anomalies";
import { AdGroupService, AdService, CampaignService } from "@/lib/openai/services";
import { resolveConnection } from "@/lib/openai/credentials";
import {
  evaluateThreshold,
  evaluateChange,
  evaluateBudget,
  evaluateAnomaly,
  evaluateServing,
  evaluateReview,
  EvalConfig,
  EvalMatch,
  EvalRow,
  AlertScope,
} from "./evaluate";
import { sendAlertEmail } from "@/lib/mailer";
import type { Alert, AlertSeverity } from "@prisma/client";
import type { ReportData } from "@/types/reportsDetails";

/**
 * Alert runner.
 *
 * Reads through the cached report layer rather than calling the API directly:
 * a user with 25 alerts would otherwise make 25+ upstream calls per run against
 * a rate limit shared with their own tools, for data that is identical across
 * alerts.
 *
 * AUTO-PAUSE POLICY: an alert may pause a campaign, ad group or ad. It may never
 * pause the ad account (that stops the advertiser's entire business) and may
 * never archive anything (documented as irreversible). Those are enforced here
 * and again in the risk engine.
 */

export type AlertRunResult = {
  alertId: string;
  alertName: string;
  kind: string;
  matchCount: number;
  matches: EvalMatch[];
  newEvents: number;
  appliedCount: number;
  error?: string;
};

function ttlFor(scope: AlertScope): number {
  if (scope === "ADGROUP") return GET_ADGROUP_REPORTS;
  if (scope === "AD") return GET_AD_REPORTS;
  return GET_CAMPAIGN_REPORTS;
}

function levelFor(scope: AlertScope): "ad_account" | "campaign" | "ad_group" | "ad" {
  if (scope === "ACCOUNT") return "ad_account";
  if (scope === "ADGROUP") return "ad_group";
  if (scope === "AD") return "ad";
  return "campaign";
}

/**
 * Fetch a report for one alert window.
 *
 * `offsetDays` exists because conversions arrive late: an advertiser with a
 * 7-day attribution window will see the last few days' CPA keep improving after
 * the fact. Alerting on those days would fire a "CPA spike" that resolves itself
 * by tomorrow, so alerts can ignore the most recent N days.
 */
async function fetchReport(
  userId: string,
  adAccountId: string,
  alert: Alert,
  days: number,
  offsetDays: number,
  daily = false
): Promise<ReportData> {
  const scope = alert.scope as AlertScope;
  // The report layer takes a plain window; `offsetDays` shifts it back by
  // requesting a longer window and trimming, which keeps one cache entry shared
  // across alerts that use the same lookback.
  const windowDays = days + offsetDays;

  const report = await runCachedReport({
    userId,
    adAccountId,
    reportType: `alert-${levelFor(scope)}${daily ? "-daily" : ""}`,
    scopeKey: alert.campaignId || "",
    request: {
      level: levelFor(scope),
      scope: alert.campaignId ? { level: "campaign", id: alert.campaignId } : { level: "account" },
      days: windowDays,
      daily,
      limit: 1000,
    },
    ttl: ttlFor(scope),
  });

  if (offsetDays > 0 && report.dailyData.length) {
    const cutoff = new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
    return { ...report, dailyData: report.dailyData.filter((d) => d.date < cutoff) };
  }
  return report;
}

/** Turn a report into evaluator rows for the alert's scope. */
function rowsFor(report: ReportData, scope: AlertScope, adAccountId: string): EvalRow[] {
  if (scope === "CAMPAIGN") {
    return report.campaigns.map((c) => ({
      entityId: c.campaignId,
      entityName: c.campaignName,
      campaignId: c.campaignId,
      performance: c.performance,
      lifetimeBudgetMicros: c.lifetimeBudgetMicros ?? null,
      dailyBudgetMicros: c.dailyBudgetMicros ?? null,
      servingIssues: c.servingIssues,
    }));
  }
  if (scope === "ADGROUP") {
    return report.adGroups.map((g) => ({
      entityId: g.adGroupId,
      entityName: g.adGroupName,
      campaignId: g.campaignId,
      adGroupId: g.adGroupId,
      performance: g.performance,
      servingIssues: g.servingIssues,
    }));
  }
  if (scope === "AD") {
    return report.ads.map((a) => ({
      entityId: a.adId,
      entityName: a.adName,
      campaignId: a.campaignId,
      adGroupId: a.adGroupId,
      performance: a.performance,
      servingIssues: a.servingIssues,
      reviewStatus: a.reviewStatus,
      reviewReason: a.reviewReason,
    }));
  }

  // ACCOUNT: one synthetic total row built from the daily series, so it always
  // agrees with what the trend chart shows.
  const totals = report.dailyData.reduce(
    (acc, d) => ({
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      spendMicros: acc.spendMicros + d.spendMicros,
      conversions: acc.conversions + d.conversions,
      revenueMicros:
        d.revenueMicros == null ? acc.revenueMicros : (acc.revenueMicros ?? 0) + d.revenueMicros,
    }),
    { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0, revenueMicros: null as number | null }
  );

  const div = (a: number, b: number) => (b > 0 ? a / b : null);

  return [
    {
      entityId: adAccountId,
      entityName: "Account total",
      performance: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr: div(totals.clicks, totals.impressions),
        spendMicros: totals.spendMicros,
        cpcMicros: div(totals.spendMicros, totals.clicks),
        cpmMicros: totals.impressions > 0 ? (totals.spendMicros / totals.impressions) * 1000 : null,
        conversions: totals.conversions,
        viewThroughConversions: 0,
        cpaMicros: div(totals.spendMicros, totals.conversions),
        cvr: div(totals.conversions, totals.clicks),
        revenueMicros: totals.revenueMicros,
        roas: totals.revenueMicros == null ? null : div(totals.revenueMicros, totals.spendMicros),
        currency: report.currency,
        date: "",
      },
    },
  ];
}

/** Per-campaign (or single account) daily series for anomaly detection. */
function dailySeries(
  report: ReportData,
  alert: Alert,
  adAccountId: string
): { entity: { id: string; name: string; campaignId?: string }; series: DailyPoint[]; currency: string }[] {
  const currency = report.currency;

  if (alert.scope === "CAMPAIGN" && alert.campaignId) {
    return [
      {
        entity: { id: alert.campaignId, name: alert.campaignName || `Campaign ${alert.campaignId}`, campaignId: alert.campaignId },
        series: dailyFromReport(report.dailyData),
        currency,
      },
    ];
  }

  return [
    {
      entity: { id: adAccountId, name: "Account total" },
      series: mergeDaily([dailyFromReport(report.dailyData)]),
      currency,
    },
  ];
}

/** Evaluate one alert and return the entities that fire (no persistence). */
export async function evaluateAlert(userId: string, adAccountId: string, alert: Alert): Promise<EvalMatch[]> {
  const scope = alert.scope as AlertScope;
  const cfg: EvalConfig = {
    kind: alert.kind as EvalConfig["kind"],
    scope,
    metric: alert.metric as EvalConfig["metric"],
    comparator: alert.comparator as EvalConfig["comparator"],
    threshold: alert.threshold,
    sensitivity: alert.sensitivity,
  };

  if (alert.kind === "METRIC") {
    if (alert.comparator === "CHANGE_UP" || alert.comparator === "CHANGE_DOWN") {
      const period = Math.max(1, alert.comparePeriodDays);
      const cur = await fetchReport(userId, adAccountId, alert, period, alert.offsetDays);
      const prior = await fetchReport(userId, adAccountId, alert, period, alert.offsetDays + period);
      return evaluateChange(rowsFor(cur, scope, adAccountId), rowsFor(prior, scope, adAccountId), cfg);
    }
    const report = await fetchReport(userId, adAccountId, alert, alert.lookbackDays, alert.offsetDays);
    return evaluateThreshold(rowsFor(report, scope, adAccountId), cfg);
  }

  if (alert.kind === "BUDGET") {
    const report = await fetchReport(
      userId,
      adAccountId,
      { ...alert, scope: "CAMPAIGN" } as Alert,
      alert.lookbackDays,
      alert.offsetDays
    );
    return evaluateBudget(rowsFor(report, "CAMPAIGN", adAccountId), cfg, alert.lookbackDays);
  }

  if (alert.kind === "SERVING") {
    const report = await fetchReport(userId, adAccountId, alert, alert.lookbackDays, 0);
    return evaluateServing(rowsFor(report, scope, adAccountId), cfg);
  }

  if (alert.kind === "REVIEW") {
    const report = await fetchReport(
      userId,
      adAccountId,
      { ...alert, scope: "AD" } as Alert,
      alert.lookbackDays,
      0
    );
    return evaluateReview(rowsFor(report, "AD", adAccountId), cfg);
  }

  // ANOMALY — needs a daily series and at least three weeks of baseline.
  const report = await fetchReport(
    userId,
    adAccountId,
    alert,
    Math.max(21, alert.lookbackDays),
    alert.offsetDays,
    true
  );
  const groups = dailySeries(report, alert, adAccountId);
  const out: EvalMatch[] = [];
  for (const g of groups) out.push(...evaluateAnomaly(g.entity, g.series, cfg, g.currency));
  return out;
}

/**
 * Pause the entity an alert fired on.
 *
 * Deliberately narrow. There is no account-level branch: pausing the ad account
 * would stop everything the advertiser is running, and no automated rule should
 * ever be able to do that.
 */
async function pauseEntity(userId: string, adAccountId: string, m: EvalMatch): Promise<void> {
  const ctx = { userId, adAccountId };
  if (m.entityType === "CAMPAIGN") {
    await CampaignService.pause(ctx, m.entityId);
  } else if (m.entityType === "ADGROUP") {
    await AdGroupService.pause(ctx, m.entityId);
  } else if (m.entityType === "AD") {
    await AdService.pause(ctx, m.entityId);
  } else {
    throw new Error("Account-level alerts can't be auto-paused.");
  }
}

const dayStamp = () => new Date().toISOString().slice(0, 10);

/**
 * Evaluate a set of alerts for one user+account. When `persist` is true, new
 * firings are written as AlertEvents (deduped per entity+metric+day), PAUSE
 * alerts pause the breaching entities, and email is sent where enabled.
 */
export async function runAlertsForOrg({
  userId,
  adAccountId,
  alerts,
  persist,
  userEmail,
}: {
  userId: string;
  adAccountId: string;
  alerts: Alert[];
  persist: boolean;
  userEmail?: string | null;
}): Promise<AlertRunResult[]> {
  const results: AlertRunResult[] = [];

  // Resolve once: a missing connection should fail the whole run cleanly rather
  // than producing an identical error on every alert.
  await resolveConnection(userId, { adAccountId });

  for (const alert of alerts) {
    let matches: EvalMatch[] = [];
    let error: string | undefined;
    try {
      matches = (await evaluateAlert(userId, adAccountId, alert)).slice(0, 200);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to evaluate";
    }

    let newEvents = 0;
    let appliedCount = 0;
    const emailBatch: EvalMatch[] = [];

    if (persist && !error) {
      const stamp = dayStamp();
      for (const m of matches) {
        let actionTaken = "NOTIFY";

        if (alert.action === "PAUSE" && m.entityType !== "ACCOUNT") {
          try {
            await pauseEntity(userId, adAccountId, m);
            actionTaken = "PAUSED";
            appliedCount++;

            await prisma.auditLog.create({
              data: {
                userId,
                adAccountId,
                action: `ALERT_PAUSED_${m.entityType}`,
                entityType: m.entityType,
                entityId: m.entityId,
                entityName: m.entityName,
                meta: { alertId: alert.id, alertName: alert.name, reason: m.message },
              },
            });
          } catch {
            actionTaken = "PAUSE_FAILED";
          }
        }

        try {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              userId,
              adAccountId,
              entityType: m.entityType,
              entityId: m.entityId,
              entityName: m.entityName,
              metric: m.metric,
              value: m.value,
              baseline: m.baseline,
              threshold: m.threshold,
              changePct: m.changePct,
              currency: m.currency,
              severity: alert.severity as AlertSeverity,
              message: m.message,
              actionTaken,
              // One event per alert+entity+metric+day so a standing breach
              // doesn't re-notify on every run.
              dedupeKey: `${m.metric}:${stamp}`,
            },
          });
          newEvents++;
          emailBatch.push(m);
        } catch {
          // Unique violation -> this firing was already recorded today; skip.
        }
      }

      if (newEvents > 0) {
        await prisma.alert
          .update({ where: { id: alert.id }, data: { lastTriggeredAt: new Date() } })
          .catch(() => {});
      }
      await prisma.alert.update({ where: { id: alert.id }, data: { lastRunAt: new Date() } }).catch(() => {});

      if (alert.notifyEmail && userEmail && emailBatch.length > 0) {
        try {
          await sendAlertEmail(userEmail, alert, emailBatch);
        } catch {
          /* an email failure shouldn't fail the run */
        }
      }
    }

    results.push({
      alertId: alert.id,
      alertName: alert.name,
      kind: alert.kind,
      matchCount: matches.length,
      matches,
      newEvents,
      appliedCount,
      error,
    });
  }

  return results;
}
