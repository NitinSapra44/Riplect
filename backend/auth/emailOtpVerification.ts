/**
 * Email OTP verification — 6-digit codes for the WhatsApp-claim flow.
 *
 * Mirrors `phoneVerification.ts`: SHA-256 hashed codes, single-use,
 * 10-minute TTL, per-row attempt counter. Delivery is via Resend through
 * `sendEmailOtpEmail` in `server/emailService.ts`.
 *
 * Used only by the `/whatsapp-verify` flow to prove ownership of the
 * email the bot collected during signup. Verification authority lives
 * in `profiles.email_verified_at`; this helper just decides whether
 * the caller may flip that column.
 */
import crypto from "node:crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { sendEmailOtpEmail } from "../emailService";

const OTP_TTL_MIN = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendEmailOtpResult =
  | { ok: true; expiresAt: Date; email: string; debugCode?: string }
  | {
      ok: false;
      code: "INVALID_EMAIL" | "SEND_FAILED";
      error: string;
    };

export type VerifyEmailOtpResult =
  | { ok: true; email: string }
  | {
      ok: false;
      code:
        | "INVALID_EMAIL"
        | "NO_OTP"
        | "USED"
        | "EXPIRED"
        | "TOO_MANY_ATTEMPTS"
        | "WRONG_CODE";
      error: string;
    };

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Generate, persist, and email a fresh 6-digit OTP for `userId` to verify
 * ownership of `email`. Older unconsumed codes for the same (user, email)
 * pair are pre-emptively invalidated so only the latest code works.
 *
 * Caller is expected to have already validated the email is the one
 * stored on the user's profile (this helper is not a generic
 * email-OTP service — it's tied to the WhatsApp-claim flow).
 */
export async function createAndSendEmailOtp(
  userId: string,
  rawEmail: string,
  recipientName: string | null,
): Promise<SendEmailOtpResult> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Invalid email address." };
  }

  // Cooldown: if a valid code was already sent within the last
  // RESEND_COOLDOWN_SEC seconds, return its expiry without sending
  // a new email. This prevents duplicate emails from rapid re-renders
  // or network retries on the client.
  const recentRows = await db.execute(sql`
    SELECT expires_at FROM email_otp_verifications
    WHERE user_id = ${userId}::uuid
      AND LOWER(email) = ${email}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND created_at > now() - (${RESEND_COOLDOWN_SEC} || ' seconds')::interval
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (recentRows.length > 0) {
    const row = recentRows[0] as unknown as { expires_at: string | Date };
    return {
      ok: true,
      email,
      expiresAt: new Date(row.expires_at),
    };
  }

  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  await db.execute(sql`
    UPDATE email_otp_verifications
    SET consumed_at = now()
    WHERE user_id = ${userId}::uuid
      AND LOWER(email) = ${email}
      AND consumed_at IS NULL
  `);

  const code = generateCode();
  const codeHash = hashCode(code);

  await db.execute(sql`
    INSERT INTO email_otp_verifications (user_id, email, code_hash, expires_at)
    VALUES (${userId}::uuid, ${email}, ${codeHash}, ${expiresAt.toISOString()})
  `);

  try {
    await sendEmailOtpEmail(email, recipientName, code, OTP_TTL_MIN);
  } catch (err: any) {
    console.error(
      "[emailOtpVerification] send failed:",
      err?.message ?? err,
    );
    return {
      ok: false,
      code: "SEND_FAILED",
      error: "Failed to send verification code. Please try again.",
    };
  }

  return {
    ok: true,
    email,
    expiresAt,
    debugCode: process.env.NODE_ENV !== "production" ? code : undefined,
  };
}

/**
 * Verify a code submitted by the signed-in user against the latest
 * outstanding OTP for `(userId, email)`. On success the row is marked
 * `consumed_at`; the caller then flips `profiles.email_verified_at`.
 */
export async function verifyEmailOtp(
  userId: string,
  rawEmail: string,
  code: string,
): Promise<VerifyEmailOtpResult> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Invalid email address." };
  }
  const provided = String(code ?? "").trim();
  if (!/^\d{4,8}$/.test(provided)) {
    return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
  }
  const providedHash = hashCode(provided);

  // Atomic consume: only one concurrent submission can win.
  const consumed = await db.execute(sql`
    UPDATE email_otp_verifications
    SET consumed_at = now()
    WHERE id = (
      SELECT id FROM email_otp_verifications
      WHERE user_id = ${userId}::uuid AND LOWER(email) = ${email}
      ORDER BY created_at DESC
      LIMIT 1
    )
      AND code_hash = ${providedHash}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempts < ${MAX_VERIFY_ATTEMPTS}
    RETURNING id
  `);
  if (consumed.length > 0) {
    return { ok: true, email };
  }

  // Wrong code on a still-valid row: bump attempts so brute force is bounded.
  const bumped = await db.execute(sql`
    UPDATE email_otp_verifications
    SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM email_otp_verifications
      WHERE user_id = ${userId}::uuid AND LOWER(email) = ${email}
      ORDER BY created_at DESC
      LIMIT 1
    )
      AND code_hash <> ${providedHash}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempts < ${MAX_VERIFY_ATTEMPTS}
    RETURNING id
  `);
  if (bumped.length > 0) {
    return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
  }

  // Neither path matched — diagnose why for a useful error message.
  const rows = await db.execute(sql`
    SELECT consumed_at, expires_at, attempts
    FROM email_otp_verifications
    WHERE user_id = ${userId}::uuid AND LOWER(email) = ${email}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (rows.length === 0) {
    return {
      ok: false,
      code: "NO_OTP",
      error: "No verification in progress. Request a new code.",
    };
  }
  const row = rows[0] as unknown as {
    consumed_at: string | Date | null;
    expires_at: string | Date;
    attempts: number | null;
  };
  if (row.consumed_at) {
    return { ok: false, code: "USED", error: "Code already used. Request a new code." };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, code: "EXPIRED", error: "Code expired. Request a new code." };
  }
  if ((row.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    return {
      ok: false,
      code: "TOO_MANY_ATTEMPTS",
      error: "Too many attempts. Request a new code.",
    };
  }
  return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
}
