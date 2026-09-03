import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AdGroupService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/billing/entitlements";
import { clientIp } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

/**
 * Ad group state change: pause, activate, or archive.
 * Archive is irreversible per the official docs, so it needs explicit
 * confirmation and can never be reached from automation. See the campaign
 * equivalent for the full reasoning.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const { adAccountId, adGroupId, action = "pause", confirm } = await req.json().catch(() => ({}));
  if (!adAccountId || !adGroupId) throw new AppError("adAccountId and adGroupId required", 400);
  if (!["pause", "activate", "archive"].includes(action)) {
    throw new AppError("action must be pause, activate or archive", 400);
  }
  if (action === "archive" && confirm !== "ARCHIVE") {
    throw new AppError(
      "Archiving an ad group can't be undone. Re-send with confirm: \"ARCHIVE\" to proceed.",
      400
    );
  }

  const ctx = { userId, adAccountId };
  const before = await AdGroupService.get(ctx, adGroupId);
  const after =
    action === "activate"
      ? await AdGroupService.activate(ctx, adGroupId)
      : action === "archive"
        ? await AdGroupService.archive(ctx, adGroupId)
        : await AdGroupService.pause(ctx, adGroupId);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: `ADGROUP_${action.toUpperCase()}`,
      entityType: "ADGROUP",
      entityId: adGroupId,
      entityName: before.name,
      before: before as never,
      after: after as never,
      meta: { irreversible: action === "archive" },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allAdGroups*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json({ message: `Ad group ${action}d`, adGroup: after }, { status: 200 });
});
