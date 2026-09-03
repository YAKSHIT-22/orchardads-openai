import nodemailer from "nodemailer";
import {
  otpEmailHtml, alertEmailHtml, contactEmailHtml, reportEmailHtml, autopilotEmailHtml,
  passwordResetEmailHtml,
  type EmailSeverity, type AlertEmailRow,
} from "@/lib/emailTemplates";
import type { Alert, Strategy } from "@prisma/client";
import type { EvalMatch } from "@/lib/alerts/evaluate";
import type { Suggestion } from "@/lib/autopilot/types";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = (label: string) => `"${label}" <${process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

export async function sendOtpEmail(to: string, otp: string) {
  await transporter.sendMail({
    from: FROM("OrchardAds"),
    to,
    subject: "Your OrchardAds confirmation code",
    text: `Your verification code is ${otp}`,
    html: otpEmailHtml(otp),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await transporter.sendMail({
    from: FROM("OrchardAds"),
    to,
    subject: "Reset your OrchardAds password",
    text: `Reset your password using this link (expires in 1 hour): ${resetUrl}`,
    html: passwordResetEmailHtml(resetUrl),
  });
}

export async function sendReportEmail(to: string[], subject: string, html: string) {
  await transporter.sendMail({
    from: FROM("OrchardAds Reports"),
    to: to.join(", "),
    subject,
    html: reportEmailHtml({ title: subject, innerHtml: html }),
  });
}

const KIND_LABEL: Record<string, string> = { METRIC: "Metric alert", BUDGET: "Budget alert", ANOMALY: "Anomaly alert" };

/** Notify a user that an alert fired, listing the entities that triggered it. */
export async function sendAlertEmail(to: string, alert: Alert, matches: EvalMatch[]) {
  const severity = (alert.severity as EmailSeverity) || "WARNING";
  const rows: AlertEmailRow[] = matches.map((m) => ({ entityName: m.entityName, message: m.message, severity }));
  const html = alertEmailHtml({
    alertName: alert.name,
    kindLabel: KIND_LABEL[alert.kind] || "Alert",
    severity,
    adAccountName: alert.adAccountName,
    rows,
    actionUrl: APP_URL ? `${APP_URL}/tools/alerts` : undefined,
  });
  await transporter.sendMail({
    from: FROM("OrchardAds Watch"),
    to,
    subject: `${severity === "CRITICAL" ? "🔴" : "🟡"} ${alert.name} — ${matches.length} triggered`,
    text: matches.map((m) => `• ${m.entityName}: ${m.message}`).join("\n"),
    html,
  });
}

/** Notify a user about an automated Autopilot run (applied or suggested). */
export async function sendAutopilotEmail(to: string, strategy: Strategy, suggestions: Suggestion[], applied: number) {
  const rows = suggestions.map((s) => ({ entityName: s.entityName, actionLabel: s.actionLabel, ruleName: s.ruleName }));
  const html = autopilotEmailHtml({
    strategyName: strategy.name,
    adAccountName: strategy.adAccountName,
    applied,
    matched: suggestions.length,
    autoApplied: strategy.autoApply,
    rows,
    actionUrl: APP_URL ? `${APP_URL}/tools/autopilot` : undefined,
  });
  await transporter.sendMail({
    from: FROM("OrchardAds Autopilot"),
    to,
    subject: `🤖 ${strategy.name} — ${strategy.autoApply ? `${applied} applied` : `${suggestions.length} to review`}`,
    text: rows.map((r) => `• ${r.entityName}: ${r.actionLabel}`).join("\n"),
    html,
  });
}

export async function sendContactEmail({
  name,
  email,
  subject,
  message,
}: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  await transporter.sendMail({
    from: FROM("OrchardAds Contact Form"),
    to: process.env.SMTP_USER,
    replyTo: email,
    subject: `📩 Contact Form: ${subject}`,
    html: contactEmailHtml({ name, email, subject, message }),
  });
}
