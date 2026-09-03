import type { AllCampaignsData } from "@/types/campaignDetails";
import type { AllAdGroupsData } from "@/types/adGroupDetails";
import type { AllAdsData } from "@/types/adDetails";

/**
 * Runtime shape guards.
 *
 * These matter more than usual here: the OpenAI Ads API publishes no error
 * schema, ships changes weekly (five in three months), and several fields are
 * documented only in prose. Anything crossing the boundary from upstream is
 * checked rather than asserted.
 */

export function isCampaign(v: unknown): v is AllCampaignsData {
  const c = v as Record<string, unknown> | null;
  return !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.status === "string";
}

export function isAdGroup(v: unknown): v is AllAdGroupsData {
  const g = v as Record<string, unknown> | null;
  return !!g && typeof g.id === "string" && typeof g.name === "string" && typeof g.status === "string";
}

export function isAd(v: unknown): v is AllAdsData {
  const a = v as Record<string, unknown> | null;
  return !!a && typeof a.id === "string" && typeof a.creative === "object" && a.creative !== null;
}

/** A cursor-paginated list envelope, which every list endpoint returns. */
export function isListEnvelope<T>(v: unknown): v is { data: T[]; has_more?: boolean; last_id?: string } {
  const e = v as Record<string, unknown> | null;
  return !!e && Array.isArray(e.data);
}

/** Coerce anything to a finite number, defaulting to 0. Never returns NaN. */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}
