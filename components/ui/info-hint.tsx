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
 * Canonical one-liners for OpenAI Ads metric jargon, so every page explains a
 * metric the same way. Use on the first occurrence per page:
 *   <>CTR <InfoHint>{METRIC_HINTS.CTR}</InfoHint></>
 *
 * Two of these carry a warning rather than a definition, because the honest
 * answer is more useful than a formula: OpenAI Ads reports conversion COUNTS
 * and no value, so revenue and ROAS are modelled from a number you supply.
 */
export const METRIC_HINTS = {
  CTR: "Click-through rate — clicks / impressions.",
  CPC: "Cost per click — spend / clicks.",
  CPA: "Cost per conversion — spend / conversions. Blank when nothing has converted yet: a campaign with no conversions has no CPA, and showing 0.00 would read as 'conversions were free'.",
  CPM: "Cost per 1,000 impressions.",
  CR: "Conversion rate — conversions / clicks.",
  IMPRESSIONS: "How many times your ad was shown inside a ChatGPT conversation.",
  CLICKS: "How many times someone clicked through to your site.",
  CONVERSIONS: "Click-through conversions attributed to your ads. View-through conversions are reported separately and are never added to this total — they don't feed CPA, bidding or billing.",
  SPEND: "What you paid OpenAI over the selected period.",
  REVENUE: "MODELLED, not reported. OpenAI Ads returns conversion counts and no value, so this is conversions x the value per conversion you configured.",
  ROAS: "MODELLED, not reported. Modelled revenue / spend. Set a value per conversion to enable it — we won't estimate one for you.",
  CONTEXT_HINTS: "Free-text descriptions of when your product is useful. The only targeting text this platform has — there are no keywords and no match types, and no per-hint reporting.",
  SERVING_ISSUE: "A typed code from OpenAI explaining why something can't deliver. Read directly from the platform, not inferred.",
} as const;
