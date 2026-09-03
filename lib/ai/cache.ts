import crypto from "crypto";
import { redis } from "@/lib/redis";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Caching + throttling for the AI endpoints. AI calls are expensive (an
 * Anthropic request plus several upstream calls to gather account context), so:
 *  - identical inputs are served from cache (app metadata + report-derived
 *    inputs change slowly), and
 *  - each user is rate-limited to bound cost/abuse.
 *
 * Storage: cache entries are grouped into ONE Redis hash per kind
 * (`ai:cache:suggest`, `ai:cache:harvest`) rather than one string key each —
 * small hashes use the compact listpack encoding and avoid the ~per-key
 * overhead, so memory stays low. Hash fields can't carry their own TTL, so we
 * embed an `exp` timestamp per field (lazy expiry on read + HDEL) and put a
 * safety TTL on the whole bucket so an abandoned cache eventually evaporates.
 *
 * Both degrade gracefully: no Redis → no cache (always a miss) and the limiter
 * allows in dev; a configured-but-down Redis fails the limiter closed.
 */

const AI_TTL_SEC = 60 * 60 * 6; // 6h — same app/keyword inputs → same suggestion
const BUCKET_TTL_SEC = AI_TTL_SEC * 4; // whole-bucket safety net (refreshed on write)
const AI_LIMIT = 30; // requests
const AI_WINDOW_SEC = 60 * 60; // per hour, per user

const bucket = (kind: string) => `ai:cache:${kind}`;

/** Stable hash-field from the inputs that determine the AI output. */
export function aiCacheField(parts: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

/** Per-user throttle. Returns `retryAfter` seconds when limited, else null. */
export async function aiRateLimit(userId: string): Promise<number | null> {
  const r = await rateLimit(`ai:${userId}`, AI_LIMIT, AI_WINDOW_SEC);
  return r.ok ? null : r.retryAfter;
}

export async function aiCacheGet<T>(kind: string, field: string): Promise<T | null> {
  const raw = await redis.hget(bucket(kind), field);
  if (!raw) return null;
  try {
    const { exp, value } = JSON.parse(raw) as { exp: number; value: T };
    if (typeof exp === "number" && exp < Date.now()) {
      redis.hdel(bucket(kind), field).catch(() => {}); // lazy per-field expiry
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function aiCacheSet(kind: string, field: string, value: unknown): Promise<void> {
  const raw = JSON.stringify({ exp: Date.now() + AI_TTL_SEC * 1000, value });
  await redis.hset(bucket(kind), field, raw).catch(() => {});
  // Refresh the bucket's safety TTL so an actively-used cache stays, but an
  // abandoned one (no writes for 24h) is dropped whole.
  await redis.expire(bucket(kind), BUCKET_TTL_SEC).catch(() => {});
}
