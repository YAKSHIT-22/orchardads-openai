import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { JWT_SECRET } from "@/utils/variableConstant";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError, adsFetchWithConnection } from "@/lib/openai/client";
import { sealApiKey } from "@/lib/openai/credentials";
import { syncConnection } from "@/lib/openai/sync";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { requireAdAccountSlot } from "@/lib/billing/entitlements";
import type { AdAccount } from "@/lib/openai/types";
import type { OpenAiAdsConnection } from "@prisma/client";

/**
 * Connect an OpenAI Ads account.
 *
 * The advertiser issues a key themselves in Ads Manager (Settings), and each key
 * is scoped by OpenAI to exactly one ad account. We:
 *   1. call GET /ad_account with it, which both proves the key works and tells
 *      us which account it belongs to — the advertiser never has to find or type
 *      an account ID;
 *   2. AES-256-GCM encrypt it and store only the ciphertext plus the last four
 *      characters;
 *   3. audit the connection.
 *
 * The plaintext key exists only inside this request. It is never written
 * anywhere unencrypted, never returned in a response, and never logged.
 */

const connectSchema = z.object({
  apiKey: z.string().trim().min(8, "Paste the full API key from Ads Manager"),
  label: z.string().trim().max(80).optional(),
});

/** Serializer: the API key itself can never cross this boundary. */
function publicShape(c: OpenAiAdsConnection) {
  return {
    id: c.id,
    label: c.label,
    adAccountId: c.adAccountId,
    adAccountName: c.adAccountName,
    accountUrl: c.accountUrl,
    currencyCode: c.currencyCode,
    timezone: c.timezone,
    reviewStatus: c.reviewStatus,
    reviewReason: c.reviewReason,
    accountStatus: c.accountStatus,
    status: c.status,
    lastError: c.lastError,
    apiKeyLast4: c.apiKeyLast4,
    conversionValueMicros: c.conversionValueMicros ? c.conversionValueMicros.toString() : null,
    capabilities: c.capabilities,
    lastValidatedAt: c.lastValidatedAt,
    lastSyncAt: c.lastSyncAt,
    createdAt: c.createdAt,
  };
}

export const GET = withAdsRoute(async ({ userId }) => {
  const connections = await prisma.openAiAdsConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: connections.map(publicShape) }, { status: 200 });
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  // Pasting a live OpenAI Ads key is the most sensitive action in the product,
  // so the address owning the account must be proven first. Read `verified` from
  // the database rather than the JWT: the token is issued for a day and would
  // still say UNVERIFIED after a verification, and stale-in-the-other-direction
  // is exactly the case worth being strict about.
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { verified: true },
  });
  if (owner?.verified !== "VERIFIED") {
    throw new AppError("Verify your email address before connecting an ad account.", 403);
  }

  // A connect attempt is a credential-validation call against a third party.
  // Rate limit it so this endpoint can't be used to test stolen keys in bulk.
  const limit = await rateLimit(`connect:${userId}:${clientIp(req)}`, 10, 300);
  if (!limit.ok) {
    throw new AppError(`Too many connection attempts. Try again in ${limit.retryAfter}s.`, 429);
  }

  const parsed = connectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }
  const { apiKey, label } = parsed.data;

  const sealed = sealApiKey(apiKey);

  // Validate against the real API before persisting anything. `skipRateLimit`
  // because the outbound governor is keyed on an ad account we don't know yet.
  let account: AdAccount;
  try {
    account = await adsFetchWithConnection<AdAccount>(
      { ...sealed, adAccountId: "pending" } as unknown as OpenAiAdsConnection,
      "/ad_account",
      { skipRateLimit: true }
    );
  } catch (err) {
    // Surface a specific, actionable message rather than a bare 401.
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      throw new AppError(
        "OpenAI didn't accept that API key. Copy it again from Ads Manager > Settings, and make sure you pasted the whole value.",
        400
      );
    }
    throw err;
  }

  if (!account?.id) {
    throw new AppError("OpenAI accepted the key but didn't return an ad account. Try again shortly.", 502);
  }

  const existing = await prisma.openAiAdsConnection.findFirst({
    where: { userId, adAccountId: account.id },
  });

  // Enforce the plan's ad-account limit — this is the meter the price is set
  // against, so it has to bind here or the pricing page is decorative.
  //
  // Checked only for a genuinely NEW account. Re-pasting a key for an account
  // already connected is a credential rotation, and a customer at their limit
  // must always be able to rotate a key they already own.
  //
  // Deliberately after the /ad_account call: the account id is what tells us
  // whether this is new or a rotation, and it only exists once OpenAI has
  // validated the key.
  if (!existing) {
    await requireAdAccountSlot(userId);
  }

  const data = {
    userId,
    label: label || account.name || null,
    apiKey: sealed.apiKey,
    apiKeyLast4: sealed.apiKeyLast4,
    adAccountId: account.id,
    adAccountName: account.name ?? null,
    accountUrl: account.url ?? null,
    currencyCode: account.currency_code || "USD",
    timezone: account.timezone || "UTC",
    reviewStatus: account.review?.status ?? null,
    reviewReason: account.review?.reason ?? null,
    accountStatus: account.status ?? null,
    status: "ACTIVE" as const,
    lastError: null,
    lastValidatedAt: new Date(),
  };

  // Re-pasting a key for an account we already hold is a rotation, not a
  // duplicate: keep the row (and its synced history) and swap the credential.
  const connection = existing
    ? await prisma.openAiAdsConnection.update({ where: { id: existing.id }, data })
    : await prisma.openAiAdsConnection.create({ data });

  await prisma.auditLog.create({
    data: {
      userId,
      adAccountId: account.id,
      action: existing ? "CONNECTION_KEY_ROTATED" : "CONNECTION_CREATED",
      entityType: "AD_ACCOUNT",
      entityId: account.id,
      entityName: account.name ?? null,
      meta: {
        apiKeyLast4: sealed.apiKeyLast4,
        currency: data.currencyCode,
        timezone: data.timezone,
        reviewStatus: data.reviewStatus,
      },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  // Kick off the first sync. Everything the UI reads comes from our own tables,
  // so without this a freshly connected account shows an empty dashboard and an
  // empty Serving Doctor — the exact opposite of the promise that this product
  // is useful the minute a key is pasted.
  //
  // Deliberately not awaited: the first pull can take tens of seconds and the
  // user should land in the app immediately. Failures are recorded on SyncRun.
  void syncConnection(connection, { trigger: "manual" }).catch((e) => {
    console.error("initial sync failed:", (e as Error).message);
  });

  // Re-mint the session cookie with hasAccessData: true.
  //
  // The JWT is issued at sign-in and carries hasAccessData, which middleware
  // uses to bounce /tools/* to onboarding. Nothing refreshed it after a
  // successful connection, so the token still said "no ad account" and
  // "Go to dashboard" silently redirected straight back here — the click
  // looked dead. The cookie has to be reissued at the moment the fact changes.
  const owner2 = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, verified: true },
  });
  if (owner2) {
    const token = await new SignJWT({
      name: owner2.name,
      userId,
      email: owner2.email,
      role: owner2.role,
      emailVerified: owner2.verified,
      hasAccessData: true,
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
      message: existing ? "API key updated" : "Ad account connected",
      data: publicShape(connection),
      // Surfaced immediately so onboarding can warn before the first sync:
      // an account whose brand review isn't approved cannot serve any ads.
      accountReview: account.review ?? null,
    },
    { status: existing ? 200 : 201 }
  );
});
