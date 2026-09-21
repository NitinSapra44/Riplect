import {redis} from "./redisClient";

/**
 * Per-phone serialization for inbound WhatsApp turns.
 *
 * Without this, two messages from the same number arriving close together
 * (a user sending a clarification before our reply lands, or Twilio
 * delivering two webhooks in parallel) would race through ensureConversation
 * and addTurn — both reading the same history, both running tool calls,
 * both writing turns out of order. The lock makes them queue instead, so
 * each turn sees the previous turn's state.
 *
 * Margin between lock TTL and LLM timeout is what keeps a slow turn from
 * releasing its own lock under load (after which a second inbound could
 * acquire and the first's release would then DEL the second's lock). We
 * pair LOCK_TTL_SECONDS=180 with the 90s LLM timeout in messageHandlerShared
 * — a 90s margin that absorbs media upload, persistence, and pre/post work.
 *
 * Note: this is a "best effort" lock — no fencing token. The wide margin is
 * the practical guarantee. If we ever raise the LLM timeout, raise
 * LOCK_TTL_SECONDS so the margin stays at ~90s.
 */
const LOCK_TTL_SECONDS = 180;

const lockKey = (phone: string) => `wa:lock:${phone}`;

async function tryAcquire(phone: string): Promise<boolean> {
  const result = await redis.set(lockKey(phone), "1", {
    NX: true,
    EX: LOCK_TTL_SECONDS,
  });
  return result === "OK";
}

/**
 * Acquire the per-phone lock, polling until either we get it or maxWaitMs
 * elapses. Returns true on success, false if the wait timed out (caller
 * should send the user a "still working" message rather than processing
 * against possibly-stale history).
 */
export async function acquireMessageLock(
  phone: string,
  maxWaitMs: number,
): Promise<boolean> {
  if (await tryAcquire(phone)) return true;

  const start = Date.now();
  const pollIntervalMs = 250;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    if (await tryAcquire(phone)) return true;
  }
  return false;
}

export async function releaseMessageLock(phone: string): Promise<void> {
  try {
    await redis.del(lockKey(phone));
  } catch (err) {
    // Swallow — the TTL will clean up regardless. Logging at warn so the
    // signal is there if redis goes flaky.
    console.warn(`[MessageLock] release failed for ${phone}:`, err);
  }
}
