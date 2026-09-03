import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCachedReport } from "@/lib/openai/report";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { resolveDateRange } from "@/lib/dateRanges";
import type { ReportData } from "@/types/reportsDetails";

/** Previous equal-length period immediately before [startTime, endTime]. */
function previousPeriodDays(startTime: string, endTime: string): number {
  const s = new Date(`${startTime}T00:00:00Z`);
  const e = new Date(`${endTime}T00:00:00Z`);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

/**
 * PUBLIC (no auth) read-only dashboard data for a share token.
 *
 * Security model — this is the only unauthenticated route that touches a
 * customer's ad data, so the constraints are worth stating plainly:
 *
 *  - The scope (ad account, date range, widgets) is fixed by the STORED share.
 *    The viewer cannot pass any parameter — not a date, not an account, not a
 *    limit. That is what makes an anonymous endpoint safe here.
 *  - We resolve the OWNER's userId from the share and fetch with their
 *    credentials server-side. The API key never leaves the server and is never
 *    referenced in this file.
 *  - Revocable by the owner via `enabled`, and optionally self-expiring.
 *  - Rate-limited per token+IP, because an anonymous link consuming the owner's
 *    ad-account rate limit would be an attack on their other tooling.
 *  - Only aggregate report data is returned — never identity, connection
 *    internals, or anything derived from the credential.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rl = await rateLimit(`pubdash:${token}:${clientIp(_req)}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const share = await prisma.sharedDashboard.findUnique({ where: { token } });
  if (!share || !share.enabled) {
    return NextResponse.json({ error: "This shared dashboard is no longer available." }, { status: 404 });
  }
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "This shared dashboard link has expired." }, { status: 410 });
  }

  const { startTime, endTime } = resolveDateRange(share.dateRange);
  const days = previousPeriodDays(startTime, endTime);
  const widgets: string[] = share.widgets || [];

  try {
    // Campaign report (cached) using the OWNER's credentials.
    const report: ReportData = await runCachedReport({
      userId: share.userId,
      adAccountId: share.adAccountId,
      reportType: "public-campaign",
      request: { level: "campaign", days, daily: true, limit: 100 },
      ttl: 300,
    });

    // Performance change -> the previous equal-length window. Requested as a
    // longer range and differenced, so it shares one cache entry rather than
    // spending another of the owner's API calls.
    let previousReport: ReportData | null = null;
    if (widgets.includes("performanceChange")) {
      previousReport = await runCachedReport({
        userId: share.userId,
        adAccountId: share.adAccountId,
        reportType: "public-campaign-prev",
        scopeKey: "prev",
        request: { level: "campaign", days: days * 2, daily: true, limit: 100 },
        ttl: 300,
      }).catch(() => null);
    }

    // Bump view stats without blocking the response.
    prisma.sharedDashboard
      .update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
      .catch(() => {});

    return NextResponse.json(
      {
        title: share.title,
        description: share.description,
        adAccountName: share.adAccountName,
        dateRange: share.dateRange,
        widgets: share.widgets,
        currency: report.currency,
        // Stated explicitly so the public view can label modelled figures or
        // omit them, rather than a viewer assuming ROAS came from the platform.
        revenueModelled: report.revenueModelled,
        report,
        previousReport,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch {
    // The owner's connection may be unhealthy (key revoked in Ads Manager).
    // Say so without leaking which account, which key, or the upstream error.
    return NextResponse.json(
      { error: "This dashboard can't be loaded right now. The owner may need to reconnect their ad account." },
      { status: 502 }
    );
  }
}
