import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { AppError, errorResponseBody } from "@/lib/openai/errors";
import { type AuditWidgetKey, AUDIT_WIDGET_KEYS } from "@/lib/audit/widgets";

/** List the user's saved audits. */
export async function GET() {
  try {
    const userId = await getUserId();
    await requireFeature(userId, "inspector");
    const audits = await prisma.savedAudit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ audits }, { status: 200 });
  } catch (err) {
    // Preserve the real status: a 402 plan gate must NOT become a 401,
    // which the client interceptor treats as an expired session and
    // force-redirects to /signin.
    if (err instanceof AppError) {
      return NextResponse.json(errorResponseBody(err), { status: err.status });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}

/** Create a saved audit config. */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    await requireFeature(userId, "inspector");
    const { adAccountId, adAccountName, name, description, widgets } = await req.json();

    if (!adAccountId) return NextResponse.json({ error: "adAccountId is required" }, { status: 400 });
    if (!name || !String(name).trim()) return NextResponse.json({ error: "A name is required" }, { status: 400 });

    const cleanWidgets = Array.isArray(widgets) ? widgets.filter((w: string) => AUDIT_WIDGET_KEYS.includes(w as AuditWidgetKey)) : [];
    if (cleanWidgets.length === 0) return NextResponse.json({ error: "Select at least one audit widget" }, { status: 400 });

    // Audits always run against a fixed 45-day window — no user date range.
    const audit = await prisma.savedAudit.create({
      data: {
        userId,
        adAccountId: String(adAccountId),
        adAccountName: adAccountName ? String(adAccountName) : null,
        name: String(name).trim().slice(0, 120),
        description: description ? String(description).trim().slice(0, 400) : null,
        widgets: cleanWidgets,
      },
    });
    return NextResponse.json({ audit }, { status: 201 });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    console.error("audits create:", err);
    return NextResponse.json({ error: "Couldn't create the audit." }, { status: 500 });
  }
}
