import Redis from "ioredis";

/**
 * Resilient Redis wrapper.
 *
 * Redis is used purely as a performance cache (Apple token cache, rate-limit
 * counters). It is NOT the source of truth — the Apple access token is also
 * persisted in the DB, so the app degrades gracefully without Redis.
 *
 * - No REDIS_URL configured  → every op is a safe no-op (cache always "misses",
 *   callers fall back to the DB / direct fetch). Run Redis locally if you want
 *   caching; production works fine without it.
 * - REDIS_URL configured but unreachable → ops fail fast and are swallowed,
 *   so a Redis outage never takes down a request.
 */
const url = process.env.REDIS_URL?.trim();

let raw: Redis | null = null;
if (url) {
  // Upstash (and most managed Redis) require TLS. If the URL uses the plain
  // `redis://` scheme against an Upstash host, enable TLS anyway — otherwise the
  // connection is reset and every command throws (which, with the fail-closed
  // rate limiter, would 429 every sign-in).
  const needsTls = url.startsWith("rediss://") || /upstash\.io/i.test(url);
  raw = new Redis(url, {
    maxRetriesPerRequest: 2,
    // Queue commands until the connection is ready instead of throwing — avoids
    // spurious failures on serverless cold starts (first request after a warm-up).
    enableOfflineQueue: true,
    ...(needsTls ? { tls: { rejectUnauthorized: false } } : {}),
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
  });
  // Swallow connection errors; the wrapper below returns safe fallbacks.
  raw.on("error", () => {});
}

async function safe<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  if (!raw) return fallback;
  try {
    return await op();
  } catch {
    return fallback;
  }
}

/** Whether a Redis URL is configured at all (used to decide fail-open vs -closed). */
export const redisConfigured = !!raw;

export const redis = {
  get: (key: string) => safe<string | null>(() => raw!.get(key), null),
  set: (...args: any[]) => safe<string | null>(() => (raw!.set as any)(...args), "OK"),
  del: (...keys: string[]) => safe<number>(() => raw!.del(...keys), 0),
  keys: (pattern: string) => safe<string[]>(() => raw!.keys(pattern), []),
  incr: (key: string) => safe<number>(() => raw!.incr(key), 1),
  expire: (key: string, seconds: number) => safe<number>(() => raw!.expire(key, seconds), 1),
  ttl: (key: string) => safe<number>(() => raw!.ttl(key), -1),
  // Hash ops — used by the AI cache to group many small entries under one key
  // (compact listpack encoding + far less per-key overhead than one key each).
  hget: (key: string, field: string) => safe<string | null>(() => raw!.hget(key, field), null),
  hset: (key: string, field: string, value: string) => safe<number>(() => raw!.hset(key, field, value), 0),
  hdel: (key: string, field: string) => safe<number>(() => raw!.hdel(key, field), 0),
  quit: () => safe<string>(() => raw!.quit(), "OK"),
  /**
   * incr that returns null when Redis isn't configured and THROWS when it's
   * configured but the op fails — lets the rate limiter tell "no cache in dev"
   * apart from "Redis outage in prod" and fail closed for the latter.
   */
  incrStrict: async (key: string): Promise<number | null> => {
    if (!raw) return null;
    return raw.incr(key);
  },
};
