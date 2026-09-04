import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { clientIp } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { JWT_SECRET } from "@/utils/variableConstant";

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

  // Mirror of the connect path: the session token carries hasAccessData, and
  // removing the last connection makes it false. Without reissuing, middleware
  // would keep letting the user into /tools/* with nothing connected.
  const remaining = await prisma.openAiAdsConnection.count({ where: { userId } });
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, verified: true },
  });
  if (owner) {
    const token = await new SignJWT({
      name: owner.name,
      userId,
      email: owner.email,
      role: owner.role,
      emailVerified: owner.verified,
      hasAccessData: remaining > 0,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(JWT_SECRET);

    (await cookies()).set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  return NextResponse.json(
    {
      message: "Ad account disconnected. We've deleted our copy of the API key.",
      note: "To revoke the key itself, delete it in Ads Manager > Settings.",
    },
    { status: 200 }
  );
});
