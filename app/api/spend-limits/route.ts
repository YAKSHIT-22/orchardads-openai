import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { SpendLimitService } from "@/lib/openai/services";
import { requireFeature } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";

/**
 * Account spend-limit windows.
 *
 * These are the highest-blast-radius control in the entire API: a spend limit
 * gates whether the WHOLE AD ACCOUNT can spend, across every campaign. So:
 *
 *  - reads are open to any connected user;
 *  - writes require the paid feature and are audited;
 *  - the risk engine classifies UPDATE_SPEND_LIMIT as HIGH regardless of size,
 *    and no automation rule can produce one.
 *
 * `spent_micros` on each window is what makes account pacing exact rather than
 * estimated, which is why this is worth its own call during sync.
 */
export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  const windows = await SpendLimitService.list({ userId, adAccountId });
  return NextResponse.json({ data: windows?.data ?? [] }, { status: 200 });
});

const createSchema = z.object({
  adAccountId: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  amount_micros: z.number().int().min(0),
  name: z.string().max(256).optional(),
  io_id: z.string().max(256).optional(),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "spend_limits");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const { adAccountId, ...input } = parsed.data;
  if (input.end_date <= input.start_date) {
    throw new AppError("The window must end after it starts.", 400);
  }

  const created = await SpendLimitService.create({ userId, adAccountId }, input);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "SPEND_LIMIT_CREATED",
      entityType: "ACCOUNT",
      entityId: adAccountId,
      entityName: input.name ?? null,
      after: created as never,
      meta: { amount_micros: input.amount_micros, window: `${input.start_date}..${input.end_date}` },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  return NextResponse.json({ message: "Spend limit created", window: created }, { status: 201 });
});
