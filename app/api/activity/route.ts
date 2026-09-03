import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdsRoute } from "@/lib/openai/client";

/**
 * The audit log.
 *
 * Every write against a customer's ad account produces a row, with the state
 * before and after. That is not a nice-to-have on a tool that can spend money:
 * it is the only way to answer "who changed this, when, and what was it before"
 * — and the only way a rollback can be a replay rather than a guess.
 *
 * The table is append-only. Nothing in the app updates or deletes a row.
 */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const url = new URL(req.url);
  const adAccountId = url.searchParams.get("adAccountId");
  const cursor = url.searchParams.get("cursor");
  const action = url.searchParams.get("action");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const rows = await prisma.auditLog.findMany({
    where: {
      userId,
      ...(adAccountId ? { adAccountId } : {}),
      ...(action ? { action: { startsWith: action } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json(
    {
      data: page.map((r) => ({
        id: r.id,
        action: r.action,
        outcome: r.outcome,
        entityType: r.entityType,
        entityId: r.entityId,
        entityName: r.entityName,
        before: r.before,
        after: r.after,
        meta: r.meta,
        adAccountId: r.adAccountId,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    },
    { status: 200 }
  );
});
