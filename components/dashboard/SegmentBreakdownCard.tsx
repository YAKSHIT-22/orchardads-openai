"use client";

import { useMemo, useState } from "react";
import { Globe, Smartphone, PackageOpen } from "lucide-react";

import { useSegmentReport } from "@/lib/dashboard/widgetHooks";
import { aggregateSegments } from "@/lib/dashboard/insights";
import { money, count, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WidgetCard, WidgetEmpty, WidgetSkeleton, WidgetError } from "./bits";

/**
 * Segment breakdown — country or device.
 *
 * Replaces the Apple build's "top placements" widget. There are no placements
 * on this platform (no App Store search results / Today tab / product pages);
 * the only breakdown the insights API offers is `segments[]`, and it accepts
 * exactly ONE value per request. That constraint is why this is a tabbed widget
 * that refetches on switch rather than a single table with three columns — a
 * country-by-device cross-tab is not something the API can return.
 *
 * Segments also require the ad account to have them enabled. An account without
 * them gets an empty result rather than an error, which is rendered as an
 * explanation instead of a silent blank.
 */

type SegmentKey = "country" | "device";

const TABS: { key: SegmentKey; label: string; icon: typeof Globe }[] = [
  { key: "country", label: "Country", icon: Globe },
  { key: "device", label: "Device", icon: Smartphone },
];

export function SegmentBreakdownCard({
  adAccountId,
  days,
  currency,
}: {
  adAccountId: string;
  days: number;
  currency: string;
}) {
  const [segment, setSegment] = useState<SegmentKey>("country");
  const query = useSegmentReport(adAccountId, segment, days);

  const slices = useMemo(
    () => aggregateSegments(query.data?.segments ?? []).slice(0, 8),
    [query.data]
  );

  return (
    <WidgetCard
      icon={segment === "country" ? Globe : Smartphone}
      title="Where spend goes"
      action={
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSegment(t.key)}
              className={cn(
                "px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors",
                segment === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
      flush
    >
      {query.isLoading ? (
        <div className="px-4 pb-3">
          <WidgetSkeleton rows={5} />
        </div>
      ) : query.isError ? (
        <WidgetError message="This breakdown couldn't be loaded." />
      ) : slices.length === 0 ? (
        <WidgetEmpty
          icon={PackageOpen}
          title={`No ${segment} breakdown available`}
          sub="Segmented reporting is enabled per ad account by OpenAI. If you need it, ask your OpenAI contact to turn it on."
        />
      ) : (
        <div className="divide-y divide-border">
          {slices.map((s) => (
            <div key={s.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="text-sm tabular-nums shrink-0">{money(currency, s.spendMicros)}</span>
              </div>

              <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, s.share * 100)}%` }}
                />
              </div>

              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {percent(s.share, 0)} of spend · {count(s.clicks)} clicks · {count(s.conversions)}{" "}
                conversions
                {/* An em dash when there are no conversions — a CPA of 0.00
                    would read as "conversions were free". */}
                {s.cpaMicros !== null && ` · ${money(currency, s.cpaMicros)} CPA`}
              </p>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
