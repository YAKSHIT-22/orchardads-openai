"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small inline help icon with an explanatory tooltip.
 *
 * Usage: <label>Sensitivity <InfoHint>Explanation…</InfoHint></label>
 *
 * The shadcn Tooltip root already self-wraps in a TooltipProvider,
 * so InfoHint works anywhere without an ancestor provider.
 */
export function InfoHint({
  children,
  side = "top",
  className,
}: {
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label="More info"
          tabIndex={0}
          className={cn(
            "inline-flex shrink-0 align-middle cursor-help text-muted-foreground hover:text-foreground focus:outline-none",
            className
          )}
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-[260px] text-xs leading-relaxed whitespace-normal"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export default InfoHint;

/**
 * Canonical one-liners for Apple Search Ads metric jargon, so every page
 * explains a metric the same way. Use on the first occurrence per page:
 * <>TTR <InfoHint>{METRIC_HINTS.TTR}</InfoHint></>
 */
export const METRIC_HINTS = {
  TTR: "Tap-through rate — taps ÷ impressions. Apple's version of click-through rate.",
  CPT: "Cost per tap — spend ÷ taps.",
  CPA: "Cost per install — spend ÷ installs. Apple's only conversion is an install.",
  CPM: "Cost per 1,000 impressions.",
  CR: "Conversion rate — installs ÷ taps.",
  IMPRESSIONS: "How many times your ad was shown on the App Store.",
  TAPS: "How many times users tapped your ad (Apple's term for clicks).",
  INSTALLS: "App downloads attributed to your ads.",
  SPEND: "What you paid Apple over the selected period.",
  ROAS: "Return on ad spend — revenue attributed to ads ÷ spend.",
} as const;
