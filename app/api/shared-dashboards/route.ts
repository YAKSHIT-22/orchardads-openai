import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";
import { requireFeature } from "@/lib/billing/entitlements";
import { AppError, errorResponseBody } from "@/lib/openai/errors";
import { SHARE_DATE_RANGES } from "@/lib/dateRanges";

const DATE_RANGES: string[] = SHARE_DATE_RANGES;
// Widgets that can be included in a public share (KPIs are always included).
// Deep-dive (keywords/search terms) and PPC investigator are intentionally
// excluded from public shares.
const WIDGET_KEYS = [
  "trend", "comparison", "topCampaigns", "budgetPacing",
  "projectedSpend", "performanceChange",
];

/** List the current user's shared dashboards. */
export async function GET() {
  try {
    const userId = await getUserId();
    await requireFeature(userId, "shared_dashboards");
    const shares = await prisma.sharedDashboard.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, token: true, adAccountId: true, adAccountName: true, title: true, description: true,
        dateRange: true, widgets: true, enabled: true, expiresAt: true, viewCount: true,
        lastViewedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ shares }, { status: 200 });
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

/** Create a new shareable dashboard link for one org. */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    await requireFeature(userId, "shared_dashboards");
    const body = await req.json();
    const { adAccountId, adAccountName, title, description, dateRange, widgets, expiresInDays } = body || {};

    if (!adAccountId) return NextResponse.json({ error: "adAccountId is required" }, { status: 400 });
    if (!title || !String(title).trim()) return NextResponse.json({ error: "A title is required" }, { status: 400 });

    const range = DATE_RANGES.includes(dateRange) ? dateRange : "30d";
    const cleanWidgets = Array.isArray(widgets) ? widgets.filter((w: string) => WIDGET_KEYS.includes(w)) : WIDGET_KEYS;
    const expiresAt =
      Number(expiresInDays) > 0 ? new Date(Date.now() + Number(expiresInDays) * 86400000) : null;

    const share = await prisma.sharedDashboard.create({
      data: {
        userId,
        token: randomBytes(32).toString("base64url"),
        adAccountId: String(adAccountId),
        adAccountName: adAccountName ? String(adAccountName) : null,
        title: String(title).trim().slice(0, 120),
        description: description ? String(description).trim().slice(0, 400) : null,
        dateRange: range,
        widgets: cleanWidgets,
        expiresAt,
      },
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (err: any) {
    // getUserId throws AppError(401) when the session is missing/expired.
    if (err?.status === 401) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    console.error("shared-dashboards create:", err);
    return NextResponse.json({ error: "Couldn't create the shared dashboard." }, { status: 500 });
  }
}
