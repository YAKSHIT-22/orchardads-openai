import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { ensureDefaultAlerts } from "@/lib/alerts/defaults";
import { ALERT_METRIC_KEYS } from "@/lib/alerts/metrics";
import { NextResponse } from "next/server";

const KINDS = ["METRIC", "BUDGET", "ANOMALY"];
const SCOPES = ["ACCOUNT", "CAMPAIGN", "ADGROUP", "AD"];
const COMPARATORS = ["ABOVE", "BELOW", "CHANGE_UP", "CHANGE_DOWN"];
const SEVERITIES = ["INFO", "WARNING", "CRITICAL"];
const ACTIONS = ["NOTIFY", "PAUSE"];

/** List the user's alerts for an org (seeding default anomaly monitors first). */
export const GET = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "alerts");

  const url = new URL(req.url);
  const adAccountId = url.searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const adAccountName = url.searchParams.get("adAccountName");

  await ensureDefaultAlerts(userId, String(adAccountId), adAccountName);

  const alerts = await prisma.alert.findMany({
    where: { userId, adAccountId: String(adAccountId) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ alerts }, { status: 200 });
});

/** Create an alert. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "alerts");

  const b = await req.json();
  const {
    adAccountId, adAccountName, name, kind, scope, campaignId, campaignName,
    metric, comparator, threshold, comparePeriodDays, lookbackDays, offsetDays,
    sensitivity, action, severity, notifyEmail,
  } = b;

  if (!adAccountId) throw new AppError("adAccountId is required", 400);
  if (!name || !String(name).trim()) throw new AppError("A name is required", 400);
  if (!KINDS.includes(kind)) throw new AppError("Invalid alert type", 400);
  if (!SCOPES.includes(scope)) throw new AppError("Invalid scope", 400);
  if ((scope === "ADGROUP" || scope === "AD") && !campaignId) {
    throw new AppError("A campaign is required for ad-group and ad alerts", 400);
  }

  const data: any = {
    userId, adAccountId: String(adAccountId), adAccountName: adAccountName ? String(adAccountName) : null,
    name: String(name).trim().slice(0, 120),
    kind, scope,
    campaignId: campaignId ? String(campaignId) : null,
    campaignName: campaignName ? String(campaignName) : null,
    lookbackDays: Math.min(90, Math.max(1, Number(lookbackDays) || 7)),
    offsetDays: Math.min(30, Math.max(0, Number(offsetDays) || 0)),
    comparePeriodDays: Math.min(90, Math.max(1, Number(comparePeriodDays) || 7)),
    action: ACTIONS.includes(action) ? action : "NOTIFY",
    severity: SEVERITIES.includes(severity) ? severity : "WARNING",
    notifyEmail: Boolean(notifyEmail),
  };

  if (kind === "METRIC") {
    if (!ALERT_METRIC_KEYS.includes(metric)) throw new AppError("Invalid metric", 400);
    if (!COMPARATORS.includes(comparator)) throw new AppError("Invalid condition", 400);
    if (threshold === undefined || threshold === null || Number.isNaN(Number(threshold))) throw new AppError("Threshold must be a number", 400);
    data.metric = metric;
    data.comparator = comparator;
    data.threshold = Number(threshold);
  } else if (kind === "BUDGET") {
    if (threshold === undefined || threshold === null || Number.isNaN(Number(threshold))) throw new AppError("A pace % threshold is required", 400);
    data.scope = "CAMPAIGN";
    data.comparator = comparator === "BELOW" ? "BELOW" : "ABOVE";
    data.threshold = Number(threshold);
  } else {
    // ANOMALY
    if (metric && !ALERT_METRIC_KEYS.includes(metric)) throw new AppError("Invalid metric", 400);
    if (scope !== "ACCOUNT" && scope !== "CAMPAIGN") throw new AppError("Anomaly alerts watch the account or a campaign", 400);
    data.metric = metric || null;
    data.sensitivity = Math.min(5, Math.max(1, Number(sensitivity) || 2.5));
  }

  const alert = await prisma.alert.create({ data });
  return NextResponse.json({ alert }, { status: 201 });
});
