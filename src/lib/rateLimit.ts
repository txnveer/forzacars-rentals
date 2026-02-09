/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Keyed by an arbitrary string (e.g. `${userId}:cancel_booking`).
 * This is a per-process store — it resets on server restart and is NOT
 * shared across workers or serverless instances.  Fine for MVP; swap
 * with Redis/Upstash for production multi-instance deployments.
 */

const store = new Map<string, number[]>();

interface RateLimitResult {
  /** Whether the action is allowed. */
  ok: boolean;
  /** Milliseconds until the next allowed attempt (0 when ok). */
  retryAfterMs: number;
}

/**
 * Check and record a hit against the rate limit.
 *
 * @param key     Unique identifier (e.g. `${userId}:action_name`)
 * @param max     Maximum number of allowed calls within the window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  // Prune expired entries
  const timestamps = (store.get(key) ?? []).filter(
    (t) => t > now - windowMs
  );

  if (timestamps.length >= max) {
    const earliest = timestamps[0];
    return { ok: false, retryAfterMs: earliest + windowMs - now };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { ok: true, retryAfterMs: 0 };
}
