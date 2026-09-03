import { redis } from "@/lib/redis";

/**
 * Outbound rate-limit governor for the OpenAI Ads API.
 *
 * Documented limits (api-overview, "Rate limits"):
 *   per endpoint : 600 requests / minute
 *   overall      : 1,200 requests / minute
 *   bulk create  : 10 requests / 10 seconds per ad account
 *
 * and, critically:
 *
 *   "The Advertiser API enforces limits by both ad account AND IP address.
 *    Requests must stay within both."
 *
 * The per-IP half is the dangerous one for us. On serverless we share a rotating
 * egress pool with every other tenant of the platform, so one customer's large
 * sync can 429 everybody else's dashboard. We therefore keep TWO budgets: one
 * per ad account (theirs) and one process-wide (ours), and we spend headroom
 * conservatively — 80% of the documented ceiling — so a burst from a
 * co-tenant's traffic doesn't push us over.
 *
 * This is a pacing governor, not a hard limiter: on saturation it *waits* rather
 * than failing, because the caller is a background sync that would rather be
 * slow than incomplete. The client's 429 backoff remains the real safety net.
 */

const WINDOW_SEC = 60;

// 80% of documented ceilings, leaving headroom for co-tenant traffic on a
// shared egress IP and for the customer's own use of other tools.
const PER_ENDPOINT_LIMIT = 480; // of 600
const OVERALL_LIMIT = 960; // of 1,200

const MAX_WAIT_MS = 15_000;
const POLL_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Collapse a concrete path to its endpoint shape so that
 * `/campaigns/cmpn_1/insights` and `/campaigns/cmpn_2/insights` share a bucket,
 * which is what "per endpoint" means.
 */
export function endpointKey(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^(adacct|cmpn|adgrp|ad|file|feed|ces|caud|blkmtnjob|lf|ba)_[A-Za-z0-9]+$/.test(seg) ? ":id" : seg))
    .join("/");
}

async function tryConsume(key: string, limit: number): Promise<boolean> {
  const redisKey = `oai:rl:${key}`;
  const count = await redis.incrStrict(redisKey).catch(() => null);

  // No Redis configured (local dev): allow. The client's 429 backoff still
  // protects us; a dev machine cannot realistically approach 600 req/min.
  if (count === null) return true;

  if (count === 1) await redis.expire(redisKey, WINDOW_SEC);
  return count <= limit;
}

/**
 * Wait for a slot in both the per-ad-account endpoint budget and the overall
 * budget, then return. Gives up waiting after MAX_WAIT_MS and proceeds — at that
 * point letting the request through to meet a real 429 (with Retry-After) is
 * better than stalling a job indefinitely.
 */
export async function acquireRateLimitSlot(adAccountId: string, path: string): Promise<void> {
  const bucket = Math.floor(Date.now() / (WINDOW_SEC * 1000));
  const endpoint = endpointKey(path);
  const started = Date.now();

  for (;;) {
    const endpointOk = await tryConsume(`${adAccountId}:${endpoint}:${bucket}`, PER_ENDPOINT_LIMIT);
    const overallOk = await tryConsume(`${adAccountId}:all:${bucket}`, OVERALL_LIMIT);

    if (endpointOk && overallOk) return;
    if (Date.now() - started > MAX_WAIT_MS) return;

    await sleep(POLL_MS);
  }
}

/**
 * Bulk job creation has its own documented budget: 10 requests per 10 seconds
 * per ad account. Returns false when the caller should back off.
 */
export async function acquireBulkSlot(adAccountId: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 10_000);
  const redisKey = `oai:rl:bulk:${adAccountId}:${bucket}`;
  const count = await redis.incrStrict(redisKey).catch(() => null);
  if (count === null) return true;
  if (count === 1) await redis.expire(redisKey, 10);
  return count <= 10;
}
