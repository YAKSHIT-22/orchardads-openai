/**
 * Apply a single Autopilot suggestion to the OpenAI Ads API. Server-side only.
 *
 * Three API details this file exists to handle correctly, each of which
 * silently damages a customer's setup if done naively:
 *
 * 1. Updates are POST on the resource path — not PUT, not PATCH — and there is
 *    no envelope around the body.
 * 2. NESTED OBJECTS ARE REPLACED WHOLE. Writing `{budget: {lifetime...}}` drops
 *    a daily limit that was set; writing `{bidding_config: {max_bid_micros}}`
 *    drops the billing event type and every audience bid multiplier. So every
 *    nested write below reads the current entity and merges.
 * 3. State changes have dedicated endpoints (`/pause`, `/activate`) rather than
 *    a status field, and `/archive` is irreversible — which is why archiving is
 *    not an action Autopilot can express at all.
 *
 * Every write here is recorded by the caller in the audit log with before/after
 * state, so any automated change can be explained and undone.
 */

import { CampaignService, AdGroupService, AdService } from "@/lib/openai/services";
import { AppError } from "@/lib/openai/errors";
import type { Suggestion } from "./types";

type Ctx = { userId: string; adAccountId: string };

/** Apply one suggestion. Throws on failure (caller records failedCount). */
export async function applySuggestion(userId: string, adAccountId: string, s: Suggestion): Promise<void> {
  const ctx: Ctx = { userId, adAccountId };

  switch (s.actionType) {
    case "NOTIFY":
      return; // nothing to apply

    case "PAUSE":
    case "ENABLE": {
      const pausing = s.actionType === "PAUSE";
      if (s.scope === "CAMPAIGN") {
        await (pausing ? CampaignService.pause(ctx, s.entityId) : CampaignService.activate(ctx, s.entityId));
      } else if (s.scope === "ADGROUP") {
        await (pausing ? AdGroupService.pause(ctx, s.entityId) : AdGroupService.activate(ctx, s.entityId));
      } else if (s.scope === "AD") {
        await (pausing ? AdService.pause(ctx, s.entityId) : AdService.activate(ctx, s.entityId));
      } else {
        throw new AppError(`Can't ${s.actionType.toLowerCase()} a ${s.scope}.`, 400);
      }
      return;
    }

    case "SET_BUDGET":
    case "ADJUST_BUDGET": {
      if (s.scope !== "CAMPAIGN" || s.newValue == null) {
        throw new AppError("A budget action needs a campaign and an amount.", 400);
      }
      // Merge: sending a partial budget would clear the other limit.
      const current = await CampaignService.get(ctx, s.entityId);
      await CampaignService.update(ctx, s.entityId, {
        budget: {
          ...current.budget,
          lifetime_spend_limit_micros: Math.round(s.newValue),
        },
      });
      return;
    }

    case "SET_BID":
    case "ADJUST_BID": {
      if (s.newValue == null) throw new AppError("A bid action needs an amount.", 400);
      if (s.scope !== "ADGROUP") throw new AppError(`Can't set a bid on a ${s.scope}.`, 400);

      // Merge: bidding_config is replaced whole, and billing_event_type must
      // keep matching the parent campaign or the write is rejected.
      const current = await AdGroupService.get(ctx, s.entityId);
      await AdGroupService.update(ctx, s.entityId, {
        bidding_config: {
          ...current.bidding_config,
          max_bid_micros: Math.round(s.newValue),
        },
      });
      return;
    }

    case "EXCLUDE_GEO": {
      if (s.scope !== "GEO" || !s.campaignId || !s.geo) {
        throw new AppError("A geo exclusion needs a campaign and a location.", 400);
      }

      const current = await CampaignService.get(ctx, s.campaignId);
      const included = current.targeting?.locations?.include ?? [];
      const next = included.filter((l) => l.id !== s.geo && l.country_code !== s.geo);

      if (next.length === included.length) return; // already excluded / not present

      // Removing the last location would make the campaign target everywhere,
      // which is the opposite of what "exclude this country" means. Refuse.
      if (next.length === 0) {
        throw new AppError(
          "Refusing to remove the campaign's only targeted location — that would widen targeting to everywhere, not narrow it.",
          400
        );
      }

      await CampaignService.update(ctx, s.campaignId, {
        targeting: {
          ...current.targeting,
          locations: { include: next.map((l) => ({ id: l.id })) },
        },
      });
      return;
    }

    default:
      throw new AppError(`Unknown action ${s.actionType}.`, 400);
  }
}
