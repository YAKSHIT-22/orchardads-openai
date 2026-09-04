"use client";

/**
 * Live preview of a chat-card creative.
 *
 * Ads Manager shows one beside the ad form, and it earns its space: this is a
 * conversational ad, so the thing that matters is how the title and body read
 * inside a chat turn, not how they look in a form field. A 50-character title
 * that fits the input can still be wrong in the card.
 *
 * Explicitly an approximation. It is drawn from our own markup, not from
 * `POST /ads/{id}/preview` (which needs a saved ad), so it must never claim to
 * be exactly what will serve.
 */

import { ImageIcon } from "lucide-react";
import type { CreativeDraft } from "@/components/user/forms/CreativeFields";

export function CreativePreview({
  creative,
  advertiser,
}: {
  creative: CreativeDraft;
  advertiser?: string | null;
}) {
  const title = creative.title?.trim() || "Your title";
  const body = creative.body?.trim() || "Your ad description";

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Preview</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Roughly how this reads in a conversation. Not the served render.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex gap-3">
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {advertiser || "Your business"}
              </span>
              <span className="text-[10px] uppercase tracking-wide rounded px-1 py-0.5 bg-muted text-muted-foreground shrink-0">
                Ad
              </span>
            </div>
            {/* Clamped, because the card truncates rather than growing. */}
            <p className="text-sm font-medium leading-snug line-clamp-2 break-words">{title}</p>
            <p className="text-sm text-muted-foreground leading-snug line-clamp-3 break-words mt-0.5">
              {body}
            </p>
            {creative.price?.trim() && (
              <p className="text-sm font-medium mt-1">{creative.price.trim()}</p>
            )}
          </div>
        </div>
      </div>

      {creative.target_url?.trim() && (
        <p className="text-xs text-muted-foreground truncate">
          Goes to <span className="text-foreground">{creative.target_url.trim()}</span>
        </p>
      )}
    </div>
  );
}
