import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

const TYPES = ["campaign", "adgroup", "keyword", "searchterm", "ad"];
const FREQS = ["DAILY", "WEEKLY", "MONTHLY"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "scheduled_reports");

  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const schedules = await prisma.reportSchedule.findMany({
    where: { userId, adAccountId: String(adAccountId) },
    orderBy: { createdAt: "desc" },
    include: { template: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ schedules }, { status: 200 });
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "scheduled_reports");

  const { adAccountId, name, reportType, templateId, campaignId, adGroupId, lookbackDays, frequency, recipients } = await req.json();
  if (!adAccountId || !name || !recipients) throw new AppError("Missing required fields", 400);
  if (!FREQS.includes(frequency || "WEEKLY")) throw new AppError("Invalid frequency", 400);

  const emails = String(recipients).split(",").map((r: string) => r.trim()).filter(Boolean);
  if (!emails.length || !emails.every((e: string) => EMAIL_RE.test(e))) throw new AppError("Enter one or more valid email addresses", 400);

  // A designer schedule references a saved template; a legacy schedule uses reportType.
  let data: any = {
    userId, adAccountId: String(adAccountId), name: String(name).slice(0, 120),
    lookbackDays: Math.min(90, Math.max(1, Number(lookbackDays) || 7)),
    frequency: frequency || "WEEKLY",
    recipients: emails.join(","),
  };

  if (templateId) {
    const template = await prisma.reportTemplate.findFirst({ where: { id: templateId, userId, adAccountId: String(adAccountId) }, select: { id: true } });
    if (!template) throw new AppError("Template not found", 404);
    data.templateId = templateId;
    data.reportType = "template";
  } else {
    if (!reportType || !TYPES.includes(reportType)) throw new AppError("Invalid report type", 400);
    if (reportType !== "campaign" && !campaignId) throw new AppError("A campaign is required for this report type", 400);
    data.reportType = reportType;
    data.campaignId = campaignId ? String(campaignId) : null;
    data.adGroupId = adGroupId ? String(adGroupId) : null;
  }

  const schedule = await prisma.reportSchedule.create({ data });
  return NextResponse.json({ schedule }, { status: 201 });
});
