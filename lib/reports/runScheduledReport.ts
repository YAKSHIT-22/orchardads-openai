import { prisma } from "@/lib/prisma";
import { runCachedReport } from "@/lib/openai/report";
import { sendReportEmail } from "@/lib/mailer";
import { money } from "@/lib/format";
import { GET_CAMPAIGN_REPORTS } from "@/utils/redisExpire";
import { renderReport } from "@/lib/reports/render";
import { renderReportHtml } from "@/lib/reports/html";
import type { ReportSchedule } from "@prisma/client";
import type { Performance, ReportData } from "@/types/reportsDetails";

const TYPE_LABEL: Record<string, string> = {
  campaign: "Campaign",
  adgroup: "Ad Group",
  ad: "Ad",
};

/**
 * Legacy (non-designer) schedules name an entity level rather than a template.
 * There is no keyword or search-term level on this platform.
 */
function levelFor(s: ReportSchedule): "campaign" | "ad_group" | "ad" | null {
  switch (s.reportType) {
    case "campaign":
      return "campaign";
    case "adgroup":
      return "ad_group";
    case "ad":
      return "ad";
    default:
      return null;
  }
}

type EmailRow = { name: string; performance: Performance };

function rowsFrom(report: ReportData, level: "campaign" | "ad_group" | "ad"): EmailRow[] {
  if (level === "ad_group") return report.adGroups.map((g) => ({ name: g.adGroupName, performance: g.performance }));
  if (level === "ad") return report.ads.map((a) => ({ name: a.adName, performance: a.performance }));
  return report.campaigns.map((c) => ({ name: c.campaignName, performance: c.performance }));
}

function esc(s: string) { return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!)); }

function buildEmail(
  s: ReportSchedule,
  rows: EmailRow[],
  startTime: string,
  endTime: string,
  currency: string
) {
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.performance.impressions,
      clicks: acc.clicks + r.performance.clicks,
      conversions: acc.conversions + r.performance.conversions,
      spend: acc.spend + r.performance.spendMicros,
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0 }
  );

  const top = [...rows].sort((a, b) => b.performance.spendMicros - a.performance.spendMicros).slice(0, 10);

  const rowsHtml = top
    .map((r) => {
      const p = r.performance;
      return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${esc(r.name)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${p.impressions.toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${p.clicks.toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${p.conversions.toLocaleString()}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(currency, p.spendMicros)}</td>
    </tr>`;
    })
    .join("");

  // An em dash, not "0.00": a report period with no conversions has no CPA, and
  // a zero here would read as "conversions were free".
  const cpa = totals.conversions > 0 ? money(currency, totals.spend / totals.conversions) : "\u2014";
  const subject = `${s.name} — ${TYPE_LABEL[s.reportType] || "Report"} (${startTime} → ${endTime})`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;color:#18181b">
    <h2 style="margin:0 0 4px">${esc(s.name)}</h2>
    <p style="color:#71717a;margin:0 0 16px">${TYPE_LABEL[s.reportType] || "Report"} report · ${startTime} → ${endTime}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        ${[["Impressions", totals.impressions.toLocaleString()], ["Clicks", totals.clicks.toLocaleString()], ["Conversions", totals.conversions.toLocaleString()], ["Spend", `${money(currency, totals.spend)}`], ["CPA", `${currency} ${cpa}`]]
          .map(([k, v]) => `<td style="padding:10px;background:#f4f4f5;border-radius:8px;text-align:center"><div style="font-size:11px;color:#71717a">${k}</div><div style="font-size:16px;font-weight:700">${v}</div></td>`)
          .join('<td style="width:8px"></td>')}
      </tr>
    </table>
    <h3 style="font-size:14px;margin:0 0 8px">Top ${top.length} by spend</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;color:#71717a">
        <th style="padding:8px">Name</th><th style="padding:8px;text-align:right">Impr.</th><th style="padding:8px;text-align:right">Clicks</th><th style="padding:8px;text-align:right">Conversions</th><th style="padding:8px;text-align:right">Spend</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#a1a1aa">No data in this range.</td></tr>`}</tbody>
    </table>
    <p style="color:#a1a1aa;font-size:11px;margin-top:24px">Sent by OrchardAds · you're receiving this because a report schedule is active.</p>
  </div>`;

  return { subject, html };
}

/**
 * Fetch a schedule's report, render it, and email it to the recipients.
 * Returns whether it was sent. Used by the cron and the "send now" action.
 */
export async function runScheduledReport(schedule: ReportSchedule): Promise<{ sent: boolean; error?: string }> {
  const recipients = schedule.recipients.split(",").map((r) => r.trim()).filter(Boolean);
  if (!recipients.length) return { sent: false, error: "No recipients" };

  // Designer schedules render a saved ReportTemplate; legacy ones use reportType.
  if (schedule.templateId) {
    const template = await prisma.reportTemplate.findUnique({ where: { id: schedule.templateId } });
    if (!template) return { sent: false, error: "Template not found" };
    const rendered = await renderReport({
      userId: schedule.userId, adAccountId: schedule.adAccountId, adAccountName: template.adAccountName,
      name: template.name, cover: template.cover as any, dateRange: template.dateRange,
      widgets: template.widgets as any,
    });
    const { subject, html } = renderReportHtml(rendered);
    await sendReportEmail(recipients, subject, html);
    await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastSentAt: new Date() } }).catch(() => {});
    return { sent: true };
  }

  const level = levelFor(schedule);
  if (!level) return { sent: false, error: "Invalid schedule configuration" };

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - schedule.lookbackDays);
  const startTime = start.toISOString().slice(0, 10);
  const endTime = end.toISOString().slice(0, 10);

  const report = await runCachedReport({
    userId: schedule.userId,
    adAccountId: schedule.adAccountId,
    reportType: `sched-${schedule.reportType}`,
    scopeKey: schedule.campaignId || "",
    request: {
      level,
      scope: schedule.campaignId ? { level: "campaign", id: schedule.campaignId } : { level: "account" },
      days: schedule.lookbackDays,
      daily: false,
      limit: 500,
    },
    ttl: GET_CAMPAIGN_REPORTS,
  });

  const rows = rowsFrom(report, level);
  const currency = report.currency || "USD";
  const { subject, html } = buildEmail(schedule, rows, startTime, endTime, currency);

  await sendReportEmail(recipients, subject, html);
  await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastSentAt: new Date() } }).catch(() => {});
  return { sent: true };
}

/** True if a schedule is due to send now, given its frequency + lastSentAt. */
export function isDue(s: ReportSchedule, now = new Date()): boolean {
  if (!s.enabled) return false;
  if (!s.lastSentAt) return true;
  const hours = (now.getTime() - new Date(s.lastSentAt).getTime()) / 3600000;
  if (s.frequency === "DAILY") return hours >= 20;
  if (s.frequency === "MONTHLY") return hours >= 24 * 27;
  return hours >= 24 * 6.5; // WEEKLY
}
