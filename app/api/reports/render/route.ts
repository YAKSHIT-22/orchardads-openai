import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { renderReport } from "@/lib/reports/render";
import { validateWidgets, isValidRange } from "@/lib/reports/validate";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/billing/entitlements";

/**
 * Render a report to a data payload for preview / PDF. Accepts a saved
 * `templateId`, or an inline `template` (name/dateRange/cover/widgets) so the
 * designer can preview before saving. Computes each widget's data server-side.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "reports_export");

  const { adAccountId, adAccountName, templateId, template } = await req.json();
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  let name: string, dateRange: string, cover: any, widgets: any;
  if (templateId) {
    const t = await prisma.reportTemplate.findFirst({ where: { id: templateId, userId } });
    if (!t) throw new AppError("Template not found", 404);
    name = t.name; dateRange = t.dateRange; cover = t.cover; widgets = t.widgets;
  } else if (template) {
    name = String(template.name || "Report");
    dateRange = isValidRange(template.dateRange) ? template.dateRange : "30d";
    cover = template.cover || null;
    const v = validateWidgets(template.widgets);
    if (!v.ok) throw new AppError(v.error, 400);
    widgets = v.widgets;
  } else {
    throw new AppError("templateId or template required", 400);
  }

  const report = await renderReport({
    userId, adAccountId: String(adAccountId), adAccountName, name, cover, dateRange, widgets: widgets as any,
  });
  return NextResponse.json({ report }, { status: 200 });
});
