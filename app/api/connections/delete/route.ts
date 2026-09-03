import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { clientIp } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

/**
 * Disconnect one ad account.
 *
 * Deleting the row destroys the only copy of the encrypted key we hold. It does
 * NOT revoke the key at OpenAI — only the advertiser can do that, in Ads Manager
 * — so the response says so explicitly rather than implying we did more than we
 * did. Synced entities and facts cascade; the audit log deliberately does not.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { connectionId } = await req.json().catch(() => ({}));
  if (!connectionId) throw new AppError("connectionId required", 400);

  const conn = await prisma.openAiAdsConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) throw new AppError("Connection not found.", 404);

  await prisma.openAiAdsConnection.delete({ where: { id: conn.id } });

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId: conn.adAccountId,
      action: "CONNECTION_DELETED",
      entityType: "AD_ACCOUNT",
      entityId: conn.adAccountId,
      entityName: conn.adAccountName,
      meta: { apiKeyLast4: conn.apiKeyLast4 },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  return NextResponse.json(
    {
      message: "Ad account disconnected. We've deleted our copy of the API key.",
      note: "To revoke the key itself, delete it in Ads Manager > Settings.",
    },
    { status: 200 }
  );
});
