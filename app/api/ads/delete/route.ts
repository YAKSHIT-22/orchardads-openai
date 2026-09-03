import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

/** Ad state change: pause, activate, or archive (irreversible, confirmed). */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const { adAccountId, adId, action = "pause", confirm } = await req.json().catch(() => ({}));
  if (!adAccountId || !adId) throw new AppError("adAccountId and adId required", 400);
  if (!["pause", "activate", "archive"].includes(action)) {
    throw new AppError("action must be pause, activate or archive", 400);
  }
  if (action === "archive" && confirm !== "ARCHIVE") {
    throw new AppError("Archiving an ad can't be undone. Re-send with confirm: \"ARCHIVE\" to proceed.", 400);
  }

  const ctx = { userId, adAccountId };
  const before = await AdService.get(ctx, adId);
  const after =
    action === "activate"
      ? await AdService.activate(ctx, adId)
      : action === "archive"
        ? await AdService.archive(ctx, adId)
        : await AdService.pause(ctx, adId);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: `AD_${action.toUpperCase()}`,
      entityType: "AD",
      entityId: adId,
      entityName: before.name,
      before: before as never,
      after: after as never,
      meta: { irreversible: action === "archive" },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allAds*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json({ message: `Ad ${action}d`, ad: after }, { status: 200 });
});
