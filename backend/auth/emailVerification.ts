/**
 * Email completion verification — single-use opaque tokens (DB-backed,
 * NOT a self-contained JWT/HMAC). Each token is 256 bits of CSPRNG
 * randomness embedded in the verification link; only its SHA-256 hash
 * is persisted in `email_verifications`. Clicking the link opens
 * `/verify-email-and-set-password?token=...`, which validates the
 * token, lets the user set a password, then atomically swaps their
 * placeholder email for the verified one.
 *
 * Why opaque + DB-backed (not signed/JWT):
 *   - Single-use semantics are enforced by an UPDATE ... WHERE
 *     consumed_at IS NULL guard, which is impossible with a stateless
 *     signed token.
 *   - Revocation/expiry is a row update — no key rotation needed.
 *   - The token plaintext never touches the database (only its SHA-256
 *     hash), so a DB compromise does not yield usable links.
 *
 * Used by the phone-first flow: when a user types a non-Google email
 * during onboarding, we send them this link.
 */
import crypto from "node:crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

const TOKEN_TTL_MIN = 30;

export type EmailCompletionStep = "set-password" | "confirm-email";

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

interface EmailVerificationRow {
  user_id: string;
  email: string;
  next_step: string | null;
  expires_at: string | Date;
  consumed_at: string | Date | null;
}

export interface IssueTokenResult {
  token: string; // raw token to embed in the email link (never persisted)
  expiresAt: Date;
}

/**
 * Issue a fresh single-use token for `userId` to confirm `email`.
 * Older outstanding tokens for the same user are invalidated so that only
 * the most recent link works.
 */
export async function issueEmailCompletionToken(
  userId: string,
  email: string,
  nextStep: EmailCompletionStep = "set-password",
): Promise<IssueTokenResult> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

  // Invalidate older outstanding tokens for this user → email pair so the
  // user can never accidentally complete with a stale link.
  await db.execute(sql`
    UPDATE email_verifications
    SET consumed_at = now()
    WHERE user_id = ${userId}
      AND email = ${email}
      AND consumed_at IS NULL
  `);

  await db.execute(sql`
    INSERT INTO email_verifications (user_id, email, token_hash, next_step, expires_at)
    VALUES (${userId}, ${email}, ${tokenHash}, ${nextStep}, ${expiresAt.toISOString()})
  `);

  return { token, expiresAt };
}

export type InspectTokenResult =
  | {
      ok: true;
      userId: string;
      email: string;
      nextStep: string | null;
    }
  | {
      ok: false;
      code: "MISSING" | "NOT_FOUND";
      error: string;
    }
  | {
      // EXPIRED / USED rows still exist in the table, so we can safely
      // surface the email back to the caller — possession of the token
      // already implied knowledge of the email at issuance time. The
      // verify-email-and-set-password page uses this to offer in-place
      // resend without forcing the user to re-type their email.
      ok: false;
      code: "EXPIRED" | "USED";
      error: string;
      email: string;
      userId: string;
    };

/**
 * Look up a token by hash without consuming it. Used by the verification
 * page on initial load to show the right form (and to refuse expired
 * links politely).
 */
export async function inspectEmailCompletionToken(
  token: string | null | undefined,
): Promise<InspectTokenResult> {
  if (!token) return { ok: false, code: "MISSING", error: "Missing token." };
  const tokenHash = hashToken(token);

  const rows = await db.execute(sql`
    SELECT user_id, email, next_step, expires_at, consumed_at
    FROM email_verifications
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `);

  if (rows.length === 0) {
    return { ok: false, code: "NOT_FOUND", error: "This verification link is no longer valid." };
  }

  const row = rows[0] as unknown as EmailVerificationRow;
  if (row.consumed_at) {
    return {
      ok: false,
      code: "USED",
      error: "This verification link has already been used.",
      email: row.email,
      userId: row.user_id,
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      code: "EXPIRED",
      error: "This verification link has expired. Please request a new one.",
      email: row.email,
      userId: row.user_id,
    };
  }

  return {
    ok: true,
    userId: row.user_id,
    email: row.email,
    nextStep: row.next_step ?? null,
  };
}

/**
 * Atomically consume a token (mark consumed_at) and return its payload.
 * Returns the same error codes as `inspect…` if the token is invalid.
 *
 * Uses an UPDATE…WHERE consumed_at IS NULL guard so concurrent submissions
 * cannot both succeed.
 */
export async function consumeEmailCompletionToken(
  token: string,
): Promise<InspectTokenResult> {
  const tokenHash = hashToken(token);

  const rows = await db.execute(sql`
    UPDATE email_verifications
    SET consumed_at = now()
    WHERE token_hash = ${tokenHash}
      AND consumed_at IS NULL
      AND expires_at > now()
    RETURNING user_id, email, next_step
  `);

  if (rows.length === 0) {
    // Distinguish between "never existed", "expired", and "already used"
    // by re-inspecting (best-effort UX).
    return inspectEmailCompletionToken(token);
  }

  const row = rows[0] as unknown as EmailVerificationRow;
  return {
    ok: true,
    userId: row.user_id,
    email: row.email,
    nextStep: row.next_step ?? null,
  };
}
