import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { NextResponse } from "next/server";

/** Toggle, delete, or edit an alert. Owner only. */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { id, action, enabled, patch } = await req.json();
  if (!id) throw new AppError("id required", 400);

  const alert = await prisma.alert.findFirst({ where: { id, userId } });
  if (!alert) throw new AppError("Alert not found", 404);

  if (action === "delete") {
    await prisma.alert.delete({ where: { id } });
    return NextResponse.json({ message: "Alert deleted" }, { status: 200 });
  }

  if (action === "toggle") {
    const updated = await prisma.alert.update({ where: { id }, data: { enabled: Boolean(enabled) } });
    return NextResponse.json({ alert: updated }, { status: 200 });
  }

  if (action === "edit" && patch && typeof patch === "object") {
    // Whitelist editable fields so kind/scope integrity is preserved.
    const allowed = ["name", "threshold", "comparator", "comparePeriodDays", "lookbackDays", "offsetDays", "sensitivity", "action", "severity", "notifyEmail", "metric"];
    const data: any = {};
    for (const k of allowed) if (k in patch) data[k] = patch[k];
    if (typeof data.name === "string") data.name = data.name.trim().slice(0, 120);
    const updated = await prisma.alert.update({ where: { id }, data });
    return NextResponse.json({ alert: updated }, { status: 200 });
  }

  throw new AppError("Unknown action", 400);
});
