import { redis, redisConfigured } from "@/lib/redis";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfter: number };

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Fail behaviour: if Redis is not configured (typical local dev) the limiter
 * allows the request — you can't lock everyone out of an app with no cache.
 * But if Redis IS configured and the op fails (an outage in production), we
 * FAIL CLOSED so a Redis blip can't silently disable brute-force protection.
 *
 * @param key         unique bucket (e.g. `signin:<email>:<ip>`)
 * @param limit       max requests allowed within the window
 * @param windowSec   window length in seconds
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  let count: number | null;
  try {
    count = await redis.incrStrict(redisKey);
  } catch {
    // Redis is configured but unreachable → deny (fail closed).
    return { ok: false, remaining: 0, retryAfter: windowSec };
  }
  if (count === null) {
    // No Redis configured (dev) → allow.
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
  if (count === 1) await redis.expire(redisKey, windowSec);
  let ttl = count === 1 ? windowSec : await redis.ttl(redisKey);
  // Self-heal: if a key somehow lost its TTL (e.g. a crash between INCR and
  // EXPIRE), re-apply one so a counter can never persist forever and lock a
  // user out permanently.
  if (ttl < 0) {
    await redis.expire(redisKey, windowSec);
    ttl = windowSec;
  }
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfter: ttl > 0 ? ttl : windowSec,
  };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
