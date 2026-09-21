/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * Used by the new identity-linking endpoints to throttle OTP sends and
 * email-completion attempts. In-memory is fine here because:
 *   - the limits are short-window (minutes/hours)
 *   - the consequences of a single instance restart are minor (slightly
 *     more generous limits for one person, never less generous)
 *
 * If we later horizontally scale we can swap this for a Redis or
 * Postgres-backed implementation behind the same `consumeRateLimit` API.
 */
type Bucket = number[];
const buckets = new Map<string, Bucket>();

/**
 * Returns true if the action is allowed; false if it would exceed `limit`
 * occurrences within the trailing `windowMs`.
 *
 * On allow, the current timestamp is recorded against the key.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const recent = arr.filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const oldest = recent[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  buckets.set(key, recent);
  // Opportunistically drop fully-expired buckets to bound memory.
  if (buckets.size > 5000) {
    const cutoff = now - windowMs;
    const entries = Array.from(buckets.entries());
    for (const [k, v] of entries) {
      const filtered = v.filter((t: number) => t >= cutoff);
      if (filtered.length === 0) buckets.delete(k);
      else if (filtered.length !== v.length) buckets.set(k, filtered);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}
