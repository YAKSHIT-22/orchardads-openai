import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncConnection } from "@/lib/openai/sync";

/**
 * Scheduled sync for every active connection.
 *
 * Runs before the alert and report crons in the day's order, because both of
 * those read the tables this fills — evaluating alerts against yesterday's
 * facts is worse than not evaluating them.
 *
 * Connections whose key has been revoked (status INVALID) are skipped rather
 * than retried into a rate limit; the user is told to re-enter the key in
 * Settings, and that 401 is the only revocation signal OpenAI gives us.
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.openAiAdsConnection.findMany({
    where: { status: "ACTIVE" },
  });

  const results: Record<string, unknown>[] = [];
  // Sequential on purpose: parallel syncs across accounts share our egress IP,
  // and OpenAI rate-limits per IP as well as per ad account.
  for (const c of connections) {
    try {
      const r = await syncConnection(c, { trigger: "cron" });
      results.push({ adAccountId: c.adAccountId, ...r });
    } catch (e) {
      results.push({ adAccountId: c.adAccountId, status: "FAILED", error: String((e as Error).message).slice(0, 200) });
    }
  }

  return NextResponse.json({ synced: results.length, results }, { status: 200 });
}
