/**
 * Phone OTP verification (NOT login).
 *
 * Used by the new unified onboarding flow to attach a verified phone
 * number to the *currently signed-in* auth.users row. The OTP is generated
 * server-side, stored as a SHA-256 hash, and delivered via Twilio.
 *
 * Delivery priority:
 *   1. Twilio Verify (if TWILIO_VERIFY_SERVICE_SID is set) — handles
 *      WhatsApp templates, SMS fallback, and rate limiting natively.
 *   2. Raw Twilio messages.create — works for SMS and for WhatsApp
 *      only when a 24h session window is open (bot-initiated users).
 *
 * We deliberately do not use Supabase's own phone OTP because Supabase's
 * flow either creates a user or signs an existing one in — neither is what
 * we want here. We want to *attach* the phone to an already-known user.
 */
import crypto from "node:crypto";
import twilio from "twilio";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { normalizeToE164 } from "./phoneNumber";

const OTP_TTL_MIN = 10;
const MAX_VERIFY_ATTEMPTS = 5;

export type PhoneOtpChannel = "whatsapp" | "sms";

export type SendOtpResult =
  | { ok: true; expiresAt: Date; phoneE164: string; debugCode?: string; actualChannel?: string }
  | { ok: false; code: "INVALID_PHONE" | "PHONE_TAKEN" | "SEND_FAILED"; error: string };

export type VerifyOtpResult =
  | { ok: true; phoneE164: string }
  | {
      ok: false;
      code:
        | "INVALID_PHONE"
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

function cleanEnv(key: string): string | undefined {
  const v = process.env[key];
  return v ? v.trim() : undefined;
}

async function sendViaTwilioVerify(
  client: ReturnType<typeof twilio>,
  verifySid: string,
  phone: string,
  channel: PhoneOtpChannel,
): Promise<{ ok: true; channel: string } | { ok: false; error: string }> {
  try {
    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({
        to: phone,
        channel: channel === "whatsapp" ? "whatsapp" : "sms",
      });
    console.log(
      `[phoneVerification] Twilio Verify sent to ${phone} via ${verification.channel} (status: ${verification.status})`,
    );
    return { ok: true, channel: verification.channel };
  } catch (err: any) {
    console.error(
      "[phoneVerification] Twilio Verify send failed:",
      err?.message ?? err,
    );
    return { ok: false, error: err?.message ?? "Twilio Verify send failed" };
  }
}

async function sendViaMessagesApi(
  client: ReturnType<typeof twilio>,
  phone: string,
  body: string,
  channel: PhoneOtpChannel,
): Promise<{ ok: true; channel: string } | { ok: false; error: string }> {
  if (channel === "whatsapp") {
    const rawFrom = cleanEnv("TWILIO_WHATSAPP_FROM");
    if (!rawFrom) return { ok: false, error: "TWILIO_WHATSAPP_FROM not set" };
    const from = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${rawFrom}`;
    const to = `whatsapp:${phone}`;
    console.log(`[phoneVerification] messages.create from=${from} to=${to}`);
    try {
      await client.messages.create({ from, to, body });
      return { ok: true, channel: "whatsapp" };
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      console.error("[phoneVerification] WhatsApp send failed:", msg);
      const isChannelMismatch = /same channel|invalid from and to/i.test(msg);
      if (isChannelMismatch) {
        console.warn(
          "[phoneVerification] WhatsApp channel mismatch — falling back to SMS",
        );
        return sendViaMessagesApi(client, phone, body, "sms");
      }
      return { ok: false, error: msg };
    }
  }

  const from = cleanEnv("TWILIO_SMS_FROM") ?? cleanEnv("TWILIO_PHONE_NUMBER");
  if (!from) return { ok: false, error: "TWILIO_SMS_FROM not set" };
  console.log(`[phoneVerification] messages.create (SMS) from=${from} to=${phone}`);
  try {
    await client.messages.create({ from, to: phone, body });
    return { ok: true, channel: "sms" };
  } catch (err: any) {
    console.error("[phoneVerification] SMS send failed:", err?.message ?? err);
    return { ok: false, error: err?.message ?? "SMS send failed" };
  }
}

const VERIFY_SENTINEL = "TWILIO_VERIFY";

/**
 * Generate, persist, and deliver a fresh OTP for `userId` to verify
 * ownership of `rawPhone`. Existing unconsumed codes for the same
 * (user, phone) pair are pre-emptively invalidated.
 */
export async function createAndSendPhoneOtp(
  userId: string,
  rawPhone: string,
  channel: PhoneOtpChannel = "sms",
): Promise<SendOtpResult> {
  const phone = normalizeToE164(rawPhone);
  if (!phone) {
    return { ok: false, code: "INVALID_PHONE", error: "Invalid phone number format. Use +<country code><number>." };
  }

  const conflict = await db.execute(sql`
    SELECT id FROM profiles
    WHERE phone_e164 = ${phone} AND id <> ${userId}
    LIMIT 1
  `);
  if (conflict.length > 0) {
    return {
      ok: false,
      code: "PHONE_TAKEN",
      error: "This phone number is already linked to another Riplect account.",
    };
  }

  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  await db.execute(sql`
    UPDATE phone_verifications
    SET consumed_at = now()
    WHERE user_id = ${userId}
      AND phone_e164 = ${phone}
      AND consumed_at IS NULL
  `);

  const accountSid = cleanEnv("TWILIO_ACCOUNT_SID");
  const authToken = cleanEnv("TWILIO_AUTH_TOKEN");
  const verifySid = cleanEnv("TWILIO_VERIFY_SERVICE_SID");

  console.log(`[phoneVerification] env check: accountSid=${accountSid ? "SET" : "MISSING"} authToken=${authToken ? "SET" : "MISSING"} verifySid=${verifySid ? `SET(${verifySid.slice(0, 8)}...)` : "MISSING"}`);

  if (accountSid && authToken && verifySid) {
    await db.execute(sql`
      INSERT INTO phone_verifications (user_id, phone_e164, code_hash, expires_at)
      VALUES (${userId}, ${phone}, ${VERIFY_SENTINEL}, ${expiresAt.toISOString()})
    `);

    const client = twilio(accountSid, authToken);
    const result = await sendViaTwilioVerify(client, verifySid, phone, channel);
    if (!result.ok) {
      return { ok: false, code: "SEND_FAILED", error: "Failed to send verification code. Please try again." };
    }
    return { ok: true, expiresAt, phoneE164: phone, actualChannel: result.channel };
  }

  const code = generateCode();
  const codeHash = hashCode(code);

  await db.execute(sql`
    INSERT INTO phone_verifications (user_id, phone_e164, code_hash, expires_at)
    VALUES (${userId}, ${phone}, ${codeHash}, ${expiresAt.toISOString()})
  `);

  if (!accountSid || !authToken) {
    console.warn(
      `[phoneVerification] Twilio not configured. Dev OTP for ${userId}/${phone}: ${code}`,
    );
    return {
      ok: true,
      expiresAt,
      phoneE164: phone,
      debugCode: process.env.NODE_ENV !== "production" ? code : undefined,
    };
  }

  const client = twilio(accountSid, authToken);
  const body = `Your Riplect verification code is ${code}. It expires in ${OTP_TTL_MIN} minutes.`;
  const result = await sendViaMessagesApi(client, phone, body, channel);
  if (!result.ok) {
    return { ok: false, code: "SEND_FAILED", error: "Failed to send verification code. Please try again." };
  }

  return { ok: true, expiresAt, phoneE164: phone, actualChannel: result.channel };
}

/**
 * Verify a code submitted by the signed-in user. On success the row is
 * marked `consumed_at`; the caller then runs `attachVerifiedPhoneToCurrentUser`.
 *
 * Two paths:
 *   1. Twilio Verify — if the latest phone_verifications row has the
 *      VERIFY_SENTINEL code_hash, we delegate to Twilio Verify's check API.
 *   2. DB hash check — the original atomic UPDATE path for codes we
 *      generated ourselves via messages.create.
 */
export async function verifyPhoneOtp(
  userId: string,
  rawPhone: string,
  code: string,
): Promise<VerifyOtpResult> {
  const phone = normalizeToE164(rawPhone);
  if (!phone) {
    return { ok: false, code: "INVALID_PHONE", error: "Invalid phone number." };
  }

  const latest = await db.execute(sql`
    SELECT id, code_hash, consumed_at, expires_at, attempts
    FROM phone_verifications
    WHERE user_id = ${userId} AND phone_e164 = ${phone}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (latest.length === 0) {
    return { ok: false, code: "NO_OTP", error: "No verification in progress. Request a new code." };
  }

  const row = latest[0] as unknown as {
    id: number;
    code_hash: string;
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
    return { ok: false, code: "TOO_MANY_ATTEMPTS", error: "Too many attempts. Request a new code." };
  }

  if (row.code_hash === VERIFY_SENTINEL) {
    return verifyViaTwilioVerify(phone, String(code).trim(), row.id);
  }

  return verifyViaDbHash(userId, phone, String(code).trim());
}

async function verifyViaTwilioVerify(
  phone: string,
  code: string,
  rowId: number,
): Promise<VerifyOtpResult> {
  const accountSid = cleanEnv("TWILIO_ACCOUNT_SID");
  const authToken = cleanEnv("TWILIO_AUTH_TOKEN");
  const verifySid = cleanEnv("TWILIO_VERIFY_SERVICE_SID");

  if (!accountSid || !authToken || !verifySid) {
    return { ok: false, code: "WRONG_CODE", error: "Verification service not configured." };
  }

  try {
    const client = twilio(accountSid, authToken);
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: phone, code });

    if (check.status === "approved") {
      await db.execute(sql`
        UPDATE phone_verifications SET consumed_at = now() WHERE id = ${rowId}
      `);
      return { ok: true, phoneE164: phone };
    }

    await db.execute(sql`
      UPDATE phone_verifications
      SET attempts = attempts + 1
      WHERE id = ${rowId} AND consumed_at IS NULL AND attempts < ${MAX_VERIFY_ATTEMPTS}
    `);
    return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
  } catch (err: any) {
    console.error("[phoneVerification] Twilio Verify check failed:", err?.message ?? err);
    return { ok: false, code: "WRONG_CODE", error: "Verification failed. Please try again." };
  }
}

async function verifyViaDbHash(
  userId: string,
  phone: string,
  code: string,
): Promise<VerifyOtpResult> {
  const provided = hashCode(code);

  const consumed = await db.execute(sql`
    UPDATE phone_verifications
    SET consumed_at = now()
    WHERE id = (
      SELECT id FROM phone_verifications
      WHERE user_id = ${userId} AND phone_e164 = ${phone}
      ORDER BY created_at DESC
      LIMIT 1
    )
      AND code_hash = ${provided}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempts < ${MAX_VERIFY_ATTEMPTS}
    RETURNING id
  `);
  if (consumed.length > 0) {
    return { ok: true, phoneE164: phone };
  }

  const bumped = await db.execute(sql`
    UPDATE phone_verifications
    SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM phone_verifications
      WHERE user_id = ${userId} AND phone_e164 = ${phone}
      ORDER BY created_at DESC
      LIMIT 1
    )
      AND code_hash <> ${provided}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempts < ${MAX_VERIFY_ATTEMPTS}
    RETURNING id
  `);
  if (bumped.length > 0) {
    return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
  }

  const rows = await db.execute(sql`
    SELECT consumed_at, expires_at, attempts
    FROM phone_verifications
    WHERE user_id = ${userId} AND phone_e164 = ${phone}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (rows.length === 0) {
    return { ok: false, code: "NO_OTP", error: "No verification in progress. Request a new code." };
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
    return { ok: false, code: "TOO_MANY_ATTEMPTS", error: "Too many attempts. Request a new code." };
  }
  return { ok: false, code: "WRONG_CODE", error: "Incorrect code." };
}
