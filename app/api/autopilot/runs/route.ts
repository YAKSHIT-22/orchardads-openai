import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { NextResponse } from "next/server";

/** Run history for a strategy (most recent first). */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const url = new URL(req.url);
  const strategyId = url.searchParams.get("strategyId");
  if (!strategyId) throw new AppError("strategyId required", 400);

  const owns = await prisma.strategy.findFirst({ where: { id: strategyId, userId }, select: { id: true } });
  if (!owns) throw new AppError("Strategy not found", 404);

  const runs = await prisma.strategyRun.findMany({
    where: { strategyId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ runs }, { status: 200 });
});
