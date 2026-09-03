import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdsRoute } from "@/lib/openai/client";
import { AccountService } from "@/lib/openai/services";
import { AdsApiError } from "@/lib/openai/errors";

/**
 * Re-check every connected ad account.
 *
 * There is no token to refresh here — an OpenAI Ads API key is static and never expires. What CAN
 * change is whether it still works: the advertiser may have deleted it in Ads
 * Manager, and OpenAI sends us no revocation signal. A `401` on this call is the
 * only way we ever find out, which is why this action exists at all.
 *
 * It also refreshes the account's brand-review status, since an account that
 * fails brand review cannot serve a single ad and that outranks every other
 * diagnostic we could show.
 */
export const POST = withAdsRoute(async ({ userId }) => {
  const connections = await prisma.openAiAdsConnection.findMany({ where: { userId } });

  const results = await Promise.all(
    connections.map(async (conn) => {
      try {
        const account = await AccountService.get({ userId, connectionId: conn.id });

        await prisma.openAiAdsConnection.update({
          where: { id: conn.id },
          data: {
            adAccountName: account.name ?? conn.adAccountName,
            accountUrl: account.url ?? conn.accountUrl,
            currencyCode: account.currency_code || conn.currencyCode,
            timezone: account.timezone || conn.timezone,
            reviewStatus: account.review?.status ?? null,
            reviewReason: account.review?.reason ?? null,
            accountStatus: account.status ?? null,
            status: "ACTIVE",
            lastError: null,
            lastValidatedAt: new Date(),
          },
        });

        return {
          id: conn.id,
          adAccountId: conn.adAccountId,
          ok: true,
          reviewStatus: account.review?.status ?? null,
        };
      } catch (err) {
        // The client already marks a connection INVALID on 401. Here we record
        // the human-readable reason so Settings can explain what to do.
        const message =
          err instanceof AdsApiError || err instanceof Error ? err.message : "Validation failed";

        await prisma.openAiAdsConnection
          .update({ where: { id: conn.id }, data: { lastError: message } })
          .catch(() => {});

        return { id: conn.id, adAccountId: conn.adAccountId, ok: false, error: message };
      }
    })
  );

  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    {
      message: failed.length
        ? `${failed.length} of ${results.length} ad accounts need attention.`
        : `All ${results.length} ad account${results.length === 1 ? "" : "s"} are connected.`,
      results,
    },
    { status: 200 }
  );
});
