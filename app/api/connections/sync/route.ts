import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { syncConnection } from "@/lib/openai/sync";

/**
 * Pull entities and insights for one ad account into our own tables.
 *
 * Everything the UI reads — the dashboard, Serving Doctor, Review Doctor,
 * recommendations, audits — comes from those tables, never from a live upstream
 * call, because OpenAI rate-limits per ad account AND per IP and the customer's
 * other tools share that budget. So until a sync has run, the product is empty
 * no matter how healthy the connection is.
 *
 * Single-flight is enforced inside syncConnection via a Redis lock, so a user
 * hammering the button costs one sync, not many.
 */
export const maxDuration = 300;

export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId, days } = await req.json().catch(() => ({}));

  const connections = await prisma.openAiAdsConnection.findMany({
    where: { userId, ...(adAccountId ? { adAccountId: String(adAccountId) } : {}) },
  });
  if (connections.length === 0) throw new AppError("No connected ad account", 400);

  const results = await Promise.all(
    connections.map((c) =>
      syncConnection(c, { days: Number(days) || undefined, trigger: "manual" }).catch((e) => ({
        runId: "",
        status: "FAILED" as const,
        campaignsSynced: 0,
        adGroupsSynced: 0,
        adsSynced: 0,
        factsWritten: 0,
        error: String((e as Error).message).slice(0, 300),
      }))
    )
  );

  const failed = results.filter((r) => r.status === "FAILED");
  return NextResponse.json(
    {
      message: failed.length
        ? "Sync finished with errors."
        : "Sync complete.",
      results,
    },
    { status: 200 }
  );
});
