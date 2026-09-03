import { prisma } from "@/lib/prisma";
import { withAdsRoute } from "@/lib/openai/client";
import { isEncrypted } from "@/lib/crypto";
import { NextResponse } from "next/server";

/**
 * Connection-health snapshot for the Settings page.
 *
 * Returns no secrets — not the key, not a prefix, only the last four characters
 * (which is already stored separately for display) and whether the stored value
 * is actually in encrypted form. `keyEncrypted: false` in production means
 * ENCRYPTION_KEY was missing when the row was written and the key needs to be
 * re-entered, so it is surfaced rather than hidden.
 */
export const GET = withAdsRoute(async ({ userId }) => {
  const conns = await prisma.openAiAdsConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const connections = conns.map((c) => ({
    id: c.id,
    label: c.label,
    adAccountId: c.adAccountId,
    adAccountName: c.adAccountName,
    currencyCode: c.currencyCode,
    timezone: c.timezone,
    status: c.status,
    lastError: c.lastError,
    apiKeyLast4: c.apiKeyLast4,
    keyEncrypted: c.apiKey ? isEncrypted(c.apiKey) : false,
    // An account whose brand review isn't approved cannot serve any ads at all,
    // which outranks every other diagnostic we could show here.
    reviewStatus: c.reviewStatus,
    reviewReason: c.reviewReason,
    accountStatus: c.accountStatus,
    conversionValueMicros: c.conversionValueMicros ? c.conversionValueMicros.toString() : null,
    capabilities: (c.capabilities as Record<string, boolean> | null) ?? {},
    lastValidatedAt: c.lastValidatedAt,
    lastSyncAt: c.lastSyncAt,
  }));

  return NextResponse.json(
    {
      connections,
      hasConnection: connections.length > 0,
      // Any connection whose key OpenAI has since rejected needs re-entry.
      needsAttention: connections.filter((c) => c.status !== "ACTIVE").map((c) => c.id),
      // Revenue and ROAS are modelled from this value; without it those tiles
      // stay empty rather than showing a guess.
      missingConversionValue: connections
        .filter((c) => !c.conversionValueMicros)
        .map((c) => c.id),
    },
    { status: 200 }
  );
});
