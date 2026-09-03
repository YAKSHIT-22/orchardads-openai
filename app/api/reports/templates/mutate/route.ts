import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { validateWidgets, isValidRange } from "@/lib/reports/validate";
import { NextResponse } from "next/server";

/** Edit or delete a report template. Owner only. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { id, action, patch } = await req.json();
  if (!id) throw new AppError("id required", 400);

  const template = await prisma.reportTemplate.findFirst({ where: { id, userId } });
  if (!template) throw new AppError("Template not found", 404);

  if (action === "delete") {
    await prisma.reportTemplate.delete({ where: { id } });
    return NextResponse.json({ message: "Template deleted" }, { status: 200 });
  }

  if (action === "edit" && patch && typeof patch === "object") {
    const data: any = {};
    if (typeof patch.name === "string") data.name = patch.name.trim().slice(0, 120);
    if (typeof patch.description === "string") data.description = patch.description.trim().slice(0, 400);
    if (patch.cover && typeof patch.cover === "object") data.cover = patch.cover;
    if (patch.dateRange && isValidRange(patch.dateRange)) data.dateRange = patch.dateRange;
    if (patch.widgets !== undefined) {
      const v = validateWidgets(patch.widgets);
      if (!v.ok) throw new AppError(v.error, 400);
      data.widgets = v.widgets as any;
    }
    const updated = await prisma.reportTemplate.update({ where: { id }, data });
    return NextResponse.json({ template: updated }, { status: 200 });
  }

  throw new AppError("Unknown action", 400);
});
