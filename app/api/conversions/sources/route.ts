import { withAdsRoute, AppError, AdsApiError } from "@/lib/openai/client";
import { ConversionService } from "@/lib/openai/services";
import { NextResponse } from "next/server";

/**
 * List conversion sources (pixels) plus a plain-language tracking diagnosis.
 *
 * This powers the Tracking check: a campaign optimizing to conversions with no
 * active source will report zero conversions forever, and cutting its budget on
 * that basis is the worst mistake this product could make.
 */
export const POST = withAdsRoute(async ({ userId, req }) => {
  const { adAccountId } = await req.json().catch(() => ({}));
  if (!adAccountId) throw new AppError("adAccountId required", 400);

  try {
    const [sources, settings] = await Promise.all([
      ConversionService.listSources({ userId, adAccountId }),
      ConversionService.listEventSettings({ userId, adAccountId }),
    ]);

    const sourceList = sources?.data ?? [];
    const settingList = (settings?.data ?? []).filter((s) => !s.archived);

    return NextResponse.json(
      {
        sources: sourceList,
        eventSettings: settingList,
        diagnosis: {
          hasSource: sourceList.length > 0,
          hasEventSetting: settingList.length > 0,
          // An event setting pointing at no source is the silent failure mode:
          // it looks configured, and reports nothing.
          orphanedSettings: settingList
            .filter((s) => (s.source_ids ?? []).length === 0)
            .map((s) => ({ id: s.id, name: s.name })),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    // A gated account returns 404 here. That is a capability answer, not an
    // error the user can act on by retrying, so it is reported as such.
    if (err instanceof AdsApiError && err.capabilityGated) {
      return NextResponse.json(
        {
          sources: [],
          eventSettings: [],
          capabilityGated: true,
          message: err.message,
          diagnosis: { hasSource: false, hasEventSetting: false, orphanedSettings: [] },
        },
        { status: 200 }
      );
    }
    throw err;
  }
});
