import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { validateWidgets, isValidRange } from "@/lib/reports/validate";
import { NextResponse } from "next/server";

/** List the user's report templates for an org. */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const templates = await prisma.reportTemplate.findMany({
    where: { userId, adAccountId: String(adAccountId) },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { schedules: true } } },
  });
  return NextResponse.json({ templates }, { status: 200 });
});

/** Create a report template. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const b = await req.json();
  const { adAccountId, adAccountName, name, description, cover, dateRange, widgets } = b;
  if (!adAccountId) throw new AppError("adAccountId is required", 400);
  if (!name || !String(name).trim()) throw new AppError("A name is required", 400);
  const range = isValidRange(dateRange) ? dateRange : "30d";
  const v = validateWidgets(widgets);
  if (!v.ok) throw new AppError(v.error, 400);

  const template = await prisma.reportTemplate.create({
    data: {
      userId, adAccountId: String(adAccountId), adAccountName: adAccountName ? String(adAccountName) : null,
      name: String(name).trim().slice(0, 120),
      description: description ? String(description).trim().slice(0, 400) : null,
      cover: cover && typeof cover === "object" ? cover : undefined,
      dateRange: range,
      widgets: v.widgets as any,
    },
  });
  return NextResponse.json({ template }, { status: 201 });
});
