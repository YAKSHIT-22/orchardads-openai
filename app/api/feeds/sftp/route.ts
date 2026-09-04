import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { FeedService } from "@/lib/openai/services";
import { requireFeature } from "@/lib/billing/entitlements";

/**
 * SFTP credentials for a product feed.
 *
 * This is the ONLY way a catalogue gets in: the Advertiser API has no HTTP
 * endpoint that accepts a feed file. The customer's system pushes to this SFTP
 * host on their own schedule.
 *
 * The password comes back exactly once, at creation. We deliberately do NOT
 * store it — a feed credential is the customer's to keep, and holding one adds
 * a secret to our breach surface for no benefit they asked for. The UI shows it
 * once and says plainly that it will not be shown again.
 */
const createSchema = z.object({
  adAccountId: z.string().min(1),
  feedId: z.string().min(1),
  authentication_method: z.enum(["password", "ssh_key"]),
  ssh_public_key: z.string().trim().max(8192).optional(),
});

export const GET = withAdsRoute(async ({ userId, req }) => {
  const url = new URL(req.url);
  const adAccountId = url.searchParams.get("adAccountId");
  const feedId = url.searchParams.get("feedId");
  if (!adAccountId || !feedId) throw new AppError("adAccountId and feedId required", 400);

  const access = await FeedService.sftp({ userId, adAccountId }, feedId).catch(() => null);
  return NextResponse.json({ access }, { status: 200 });
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const body = await req.json().catch(() => ({}));
  const action = String((body as { action?: string }).action ?? "create");
  const adAccountId = String((body as { adAccountId?: string }).adAccountId ?? "");
  const feedId = String((body as { feedId?: string }).feedId ?? "");
  if (!adAccountId || !feedId) throw new AppError("adAccountId and feedId required", 400);

  const ctx = { userId, adAccountId };

  if (action === "activate" || action === "pause") {
    const access =
      action === "activate"
        ? await FeedService.activateSftp(ctx, feedId)
        : await FeedService.pauseSftp(ctx, feedId);
    await prisma.auditLog.create({
      data: {
        userId,
        adAccountId,
        action: `FEED_SFTP_${action.toUpperCase()}D`,
        entityType: "FEED",
        entityId: feedId,
      },
    });
    return NextResponse.json(
      { message: action === "activate" ? "SFTP access activated." : "SFTP access paused.", access },
      { status: 200 }
    );
  }

  const parsed = createSchema.safeParse({ ...(body as object), adAccountId, feedId });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  if (parsed.data.authentication_method === "ssh_key" && !parsed.data.ssh_public_key) {
    throw new AppError("Paste the SSH public key you want to authorise.", 400);
  }

  const access = await FeedService.createSftp(ctx, feedId, {
    authentication_method: parsed.data.authentication_method,
    ...(parsed.data.ssh_public_key ? { ssh_public_key: parsed.data.ssh_public_key } : {}),
  });

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId,
      action: "FEED_SFTP_CREATED",
      entityType: "FEED",
      entityId: feedId,
      // Records that credentials were issued, never the credential itself.
      meta: { authentication_method: parsed.data.authentication_method },
    },
  });

  return NextResponse.json(
    {
      message: "SFTP access created. Copy the password now — it isn't shown again.",
      access,
    },
    { status: 201 }
  );
});
