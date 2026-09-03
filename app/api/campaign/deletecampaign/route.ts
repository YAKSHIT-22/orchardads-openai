import { redis } from "@/lib/redis";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { CampaignService } from "@/lib/openai/services";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";
import { requireFeature } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

/**
 * Campaign state change: pause, activate, or archive.
 *
 * There is no DELETE in this API. The closest operation is `/archive`, which the
 * official docs describe as NOT reversible — so it is:
 *   - never reachable from a rule, a schedule, or the AI agent;
 *   - only performed on an explicit request carrying `confirm: "ARCHIVE"`, so it
 *     cannot happen through a mis-set default or a replayed pause request;
 *   - always audited with the full prior state, which is the only record of what
 *     the campaign looked like once it's gone.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const { adAccountId, campaignId, action = "pause", confirm } = await req.json().catch(() => ({}));
  if (!adAccountId || !campaignId) throw new AppError("adAccountId and campaignId required", 400);

  if (!["pause", "activate", "archive"].includes(action)) {
    throw new AppError("action must be pause, activate or archive", 400);
  }
  if (action === "archive" && confirm !== "ARCHIVE") {
    throw new AppError(
      "Archiving a campaign can't be undone. Re-send with confirm: \"ARCHIVE\" to proceed.",
      400
    );
  }

  const before = await CampaignService.get({ userId, adAccountId }, campaignId);

  const ctx = { userId, adAccountId };
  const after =
    action === "activate"
      ? await CampaignService.activate(ctx, campaignId)
      : action === "archive"
        ? await CampaignService.archive(ctx, campaignId)
        : await CampaignService.pause(ctx, campaignId);

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: `CAMPAIGN_${action.toUpperCase()}`,
      entityType: "CAMPAIGN",
      entityId: campaignId,
      entityName: before.name,
      before: before as never,
      after: after as never,
      meta: { irreversible: action === "archive" },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  const keys = await redis.keys(`*${userId}*${adAccountId}*allCampaigns*`);
  if (keys.length) await redis.del(...keys);

  return NextResponse.json({ message: `Campaign ${action}d`, campaign: after }, { status: 200 });
});
