/**
 * Routing-token layer for the WhatsApp bot signup magic-link.
 *
 * Background: when the bot creates a Riplect profile, the user needs a
 * tap-to-sign-in link delivered over WhatsApp. We can't put a raw Supabase
 * magic-link URL in the message because WhatsApp's link-preview crawler
 * GETs the URL to build the OG thumbnail — which consumes Supabase's
 * single-use OTP and burns the user's subsequent tap (otp_expired).
 *
 * Instead we mint a *routing token* and put `/m/<token>` in the WhatsApp
 * message. The route handler mints a fresh Supabase magic-link OTP on
 * every GET and 302s to it, so:
 *   - WhatsApp's preview crawler hits /m/<token>, mints OTP_A, follows
 *     the 302, consumes OTP_A. No impact on anyone.
 *   - User taps the same link, hits /m/<token>, mints OTP_B (fresh —
 *     `generateLink` overwrites the previous token hash on auth.users),
 *     follows the 302, consumes OTP_B, gets a session. Works.
 *
 * Security model:
 *   - 32 random bytes = 256 bits → unguessable.
 *   - Stored as SHA-256 hash (matches the emailVerifications convention)
 *     so a DB read alone doesn't yield usable plaintext tokens.
 *   - 7-day TTL bounds the blast radius of a phone compromise.
 *   - Multi-use within TTL (each click mints a brand-new OTP). This
 *     matches the existing /claim?phone=... behavior the bot used to send
 *     — possession of the WhatsApp message = the ability to sign in.
 */
import { randomBytes, createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { botMagicLinkTokens } from "@shared/schema";

const TOKEN_BYTES = 32; // 256 bits of entropy
const DEFAULT_TTL_DAYS = 7;

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mint a fresh routing token for a (userId, email) pair. Returns the
 * plaintext token — the caller embeds it in the WhatsApp URL. The DB
 * holds only the SHA-256 hash.
 */
export async function mintBotMagicLinkToken(
  authUserId: string,
  email: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<string> {
  const plaintext = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await db.insert(botMagicLinkTokens).values({
    tokenHash,
    authUserId,
    email,
    expiresAt,
  });

  return plaintext;
}

export type RedeemResult =
  | { ok: true; authUserId: string; email: string }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Look up a routing token, verifying it hasn't expired. Returns the
 * bound (authUserId, email) so the caller can mint a fresh Supabase
 * magic-link OTP for that user.
 *
 * Does NOT consume / single-use the token — the routing layer is
 * intentionally multi-use within TTL; the underlying Supabase OTP is
 * what's single-use, and we mint a new one per click.
 */
export async function redeemBotMagicLinkToken(
  plaintext: string,
): Promise<RedeemResult> {
  if (!plaintext || typeof plaintext !== "string") {
    return { ok: false, reason: "not_found" };
  }
  const tokenHash = hashToken(plaintext);

  const rows = await db
    .select({
      authUserId: botMagicLinkTokens.authUserId,
      email: botMagicLinkTokens.email,
      expiresAt: botMagicLinkTokens.expiresAt,
    })
    .from(botMagicLinkTokens)
    .where(eq(botMagicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, authUserId: row.authUserId, email: row.email };
}

/**
 * Best-effort cleanup of expired token rows. Safe to call opportunistically
 * from the redeem path or a scheduled job. Failures are swallowed — the
 * expiry check in `redeemBotMagicLinkToken` is the authoritative guard.
 */
export async function purgeExpiredBotMagicLinkTokens(): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM bot_magic_link_tokens WHERE expires_at <= now()`,
    );
  } catch (err) {
    console.error("[botMagicLink] purge failed:", err);
  }
}
