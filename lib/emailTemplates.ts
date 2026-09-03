/**
 * Branded, email-client-safe HTML templates for OrchardAds.
 *
 * All layout is table-based with inline styles so it renders consistently in
 * Gmail / Apple Mail / Outlook. One shared `emailLayout` shell wraps every
 * message (OTP, alerts, reports, contact) for a consistent look.
 */

const BRAND = "#0f7b56"; // orchard green
const INK = "#18181b";
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const BG = "#f4f4f5";

export type EmailSeverity = "INFO" | "WARNING" | "CRITICAL";

const SEVERITY: Record<EmailSeverity, { color: string; bg: string; label: string }> = {
  INFO: { color: "#1d4ed8", bg: "#eff6ff", label: "Info" },
  WARNING: { color: "#b45309", bg: "#fffbeb", label: "Attention" },
  CRITICAL: { color: "#b91c1c", bg: "#fef2f2", label: "Critical" },
};

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** Wrap body content in the branded shell. `preheader` is hidden preview text. */
export function emailLayout(opts: { title: string; preheader?: string; bodyHtml: string; accent?: string }): string {
  const accent = opts.accent || BRAND;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
        <tr><td style="height:4px;background:${accent}"></td></tr>
        <tr><td style="padding:22px 28px 6px 28px">
          <span style="font-size:18px;font-weight:800;letter-spacing:-.3px;color:${INK}">Orchard<span style="color:${accent}">Ads</span></span>
        </td></tr>
        <tr><td style="padding:8px 28px 26px 28px">${opts.bodyHtml}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${BORDER};background:#fafafa">
          <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5">
            Sent by OrchardAds — Apple Search Ads management. You're receiving this because of your account settings.
          </p>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:${MUTED}">© ${new Date().getFullYear()} OrchardAds</p>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string, accent = BRAND): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:9px">${esc(label)}</a>`;
}

/** OTP / email-verification code. */
export function otpEmailHtml(otp: string): string {
  const body = `
    <h1 style="margin:6px 0 4px;font-size:20px;font-weight:700">Confirm your email</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED};line-height:1.6">Enter this code to verify your email address. It expires shortly, so use it soon.</p>
    <div style="text-align:center;margin:8px 0 22px">
      <div style="display:inline-block;background:${BG};border:1px solid ${BORDER};border-radius:12px;padding:16px 28px;font-size:32px;font-weight:800;letter-spacing:10px;color:${INK}">${esc(otp)}</div>
    </div>
    <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.6">If you didn't request this, you can safely ignore this email.</p>`;
  return emailLayout({ title: "Your confirmation code", preheader: `Your OrchardAds code is ${otp}`, bodyHtml: body });
}

/** Password-reset email with a one-time link. */
export function passwordResetEmailHtml(resetUrl: string): string {
  const body = `
    <h1 style="margin:6px 0 4px;font-size:20px;font-weight:700">Reset your password</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED};line-height:1.6">We got a request to reset your OrchardAds password. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <div style="margin:8px 0 22px">${button(resetUrl, "Reset password")}</div>
    <p style="margin:0 0 6px;font-size:12px;color:${MUTED};line-height:1.6">Or paste this link into your browser:</p>
    <p style="margin:0 0 18px;font-size:12px;word-break:break-all"><a href="${esc(resetUrl)}" style="color:${BRAND}">${esc(resetUrl)}</a></p>
    <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.6">If you didn't request this, you can safely ignore this email — your password won't change.</p>`;
  return emailLayout({ title: "Reset your password", preheader: "Reset your OrchardAds password", bodyHtml: body });
}

export type AlertEmailRow = {
  entityName: string;
  message: string;
  severity?: EmailSeverity;
};

/** Triggered-alert notification listing the entities that fired. */
export function alertEmailHtml(opts: {
  alertName: string;
  kindLabel: string;
  severity: EmailSeverity;
  adAccountName?: string | null;
  rows: AlertEmailRow[];
  actionUrl?: string;
}): string {
  const sev = SEVERITY[opts.severity] || SEVERITY.WARNING;
  const items = opts.rows.slice(0, 20).map((r) => `
    <tr>
      <td style="padding:12px 14px;border:1px solid ${BORDER};border-radius:10px">
        <div style="font-size:14px;font-weight:600;color:${INK};margin-bottom:2px">${esc(r.entityName)}</div>
        <div style="font-size:13px;color:${MUTED};line-height:1.5">${esc(r.message)}</div>
      </td>
    </tr>
    <tr><td style="height:8px"></td></tr>`).join("");
  const more = opts.rows.length > 20 ? `<p style="margin:2px 0 0;font-size:12px;color:${MUTED}">+ ${opts.rows.length - 20} more</p>` : "";

  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${sev.bg};color:${sev.color};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px">${sev.label} · ${esc(opts.kindLabel)}</td></tr></table>
    <h1 style="margin:14px 0 4px;font-size:20px;font-weight:700">${esc(opts.alertName)}</h1>
    <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.6">
      ${opts.rows.length} ${opts.rows.length === 1 ? "item" : "items"} triggered this alert${opts.adAccountName ? ` in <strong style="color:${INK}">${esc(opts.adAccountName)}</strong>` : ""}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    ${more}
    ${opts.actionUrl ? `<div style="margin:22px 0 4px">${button(opts.actionUrl, "Open Orchard Watch")}</div>` : ""}`;
  return emailLayout({
    title: `Alert: ${opts.alertName}`,
    preheader: `${opts.rows.length} item(s) triggered "${opts.alertName}"`,
    bodyHtml: body,
    accent: sev.color,
  });
}

/** Contact-form submission (internal). */
export function contactEmailHtml(opts: { name: string; email: string; subject: string; message: string }): string {
  const row = (k: string, v: string) => `<tr><td style="padding:8px 12px;font-size:13px;color:${MUTED};width:90px">${esc(k)}</td><td style="padding:8px 12px;font-size:14px;color:${INK};font-weight:600">${esc(v)}</td></tr>`;
  const body = `
    <h1 style="margin:6px 0 14px;font-size:20px;font-weight:700">New contact submission</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-radius:10px;margin-bottom:16px">
      ${row("Name", opts.name)}${row("Email", opts.email)}${row("Subject", opts.subject)}
    </table>
    <div style="font-size:13px;color:${MUTED};margin-bottom:6px">Message</div>
    <div style="font-size:14px;color:${INK};line-height:1.6;white-space:pre-wrap;border:1px solid ${BORDER};border-radius:10px;padding:14px">${esc(opts.message)}</div>`;
  return emailLayout({ title: `Contact: ${opts.subject}`, bodyHtml: body });
}

/** Wrap arbitrary report HTML (built elsewhere) in the branded shell. */
export function reportEmailHtml(opts: { title: string; innerHtml: string }): string {
  return emailLayout({ title: opts.title, preheader: opts.title, bodyHtml: opts.innerHtml });
}

export type AutopilotEmailRow = { entityName: string; actionLabel: string; ruleName: string };

/** Autopilot automation summary — what a scheduled strategy matched / applied. */
export function autopilotEmailHtml(opts: {
  strategyName: string;
  adAccountName?: string | null;
  applied: number;
  matched: number;
  autoApplied: boolean;
  rows: AutopilotEmailRow[];
  actionUrl?: string;
}): string {
  const items = opts.rows.slice(0, 25).map((r) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:13px;color:${INK};font-weight:600">${esc(r.entityName)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:13px;color:${MUTED}">${esc(r.actionLabel)}</td>
    </tr>`).join("");
  const more = opts.rows.length > 25 ? `<p style="margin:8px 0 0;font-size:12px;color:${MUTED}">+ ${opts.rows.length - 25} more</p>` : "";
  const verb = opts.autoApplied
    ? `Applied <strong style="color:${INK}">${opts.applied}</strong> of ${opts.matched} suggested change${opts.matched === 1 ? "" : "s"}`
    : `Found <strong style="color:${INK}">${opts.matched}</strong> suggested change${opts.matched === 1 ? "" : "s"} to review`;

  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#eefaf3;color:${BRAND};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px">Autopilot</td></tr></table>
    <h1 style="margin:14px 0 4px;font-size:20px;font-weight:700">${esc(opts.strategyName)}</h1>
    <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.6">${verb}${opts.adAccountName ? ` in <strong style="color:${INK}">${esc(opts.adAccountName)}</strong>` : ""}.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden">
      <tr><td style="padding:8px 12px;background:${BG};font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.4px">Entity</td><td style="padding:8px 12px;background:${BG};font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.4px">Change</td></tr>
      ${items}
    </table>
    ${more}
    ${!opts.autoApplied ? `<p style="margin:16px 0 0;font-size:13px;color:${MUTED}">These are suggestions only — open Autopilot to review and apply them.</p>` : ""}
    ${opts.actionUrl ? `<div style="margin:20px 0 4px">${button(opts.actionUrl, "Open Autopilot")}</div>` : ""}`;
  return emailLayout({
    title: `Autopilot: ${opts.strategyName}`,
    preheader: `${opts.strategyName} — ${opts.matched} suggestion(s)`,
    bodyHtml: body,
  });
}
