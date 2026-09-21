/**
 * Quick functional smoke test for Task #150 helpers.
 *
 * Run with: tsx scripts/test-auth-unification-1.ts
 *
 * Exercises the modules directly (bypassing HTTP) so we can validate
 * the OTP storage, the email-token store, and the normalizers without
 * needing a live Supabase JWT.
 *
 * Side effects:
 *   - Inserts and removes one row in `phone_verifications` keyed by a
 *     synthetic `user_id` ("test-task-150-...").
 *   - Inserts and removes one row in `email_verifications` keyed by the
 *     same synthetic user.
 * The cleanup at the end deletes only those rows.
 */
import { db } from "../backend/db";
import { sql } from "drizzle-orm";
import { normalizeToE164, maskPhone } from "../backend/auth/phoneNumber";
import {
  createAndSendPhoneOtp,
  verifyPhoneOtp,
} from "../backend/auth/phoneVerification";
import {
  issueEmailCompletionToken,
  inspectEmailCompletionToken,
  consumeEmailCompletionToken,
} from "../backend/auth/emailVerification";
import { isGoogleManagedDomain } from "../backend/auth/googleDomain";
import { consumeRateLimit } from "../backend/auth/rateLimit";

const TEST_USER = `test-task-150-${Date.now()}`;
const TEST_PHONE = "+15551234999";
const TEST_EMAIL = "task150smoke@example.com";

function assert(cond: any, msg: string) {
  if (!cond) {
    console.error("✘ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✔", msg);
  }
}

async function cleanup() {
  await db.execute(sql`DELETE FROM phone_verifications WHERE user_id = ${TEST_USER}`);
  await db.execute(sql`DELETE FROM email_verifications WHERE user_id = ${TEST_USER}`);
}

async function main() {
  console.log(`\n--- normalizeToE164 ---`);
  assert(normalizeToE164("+1 (555) 123-4567") === "+15551234567", "normalizes US format");
  assert(normalizeToE164("whatsapp:+919876543210") === "+919876543210", "strips whatsapp prefix");
  assert(normalizeToE164("5551234567") === null, "rejects no plus");
  assert(normalizeToE164("+12") === null, "rejects too short");
  assert(normalizeToE164("") === null, "rejects empty");
  assert(maskPhone("+15551234567").startsWith("+•••"), "maskPhone hides prefix");

  console.log(`\n--- consumeRateLimit ---`);
  const k = `rl-test-${Date.now()}`;
  const a = consumeRateLimit(k, 2, 60_000);
  const b = consumeRateLimit(k, 2, 60_000);
  const c = consumeRateLimit(k, 2, 60_000);
  assert(a.allowed && b.allowed && !c.allowed, "third call is throttled");
  assert(c.retryAfterSec > 0, "retryAfterSec is positive when throttled");

  console.log(`\n--- isGoogleManagedDomain ---`);
  assert(await isGoogleManagedDomain("alice@gmail.com"), "gmail.com is google");
  assert(!(await isGoogleManagedDomain("alice@yahoo.com")), "yahoo.com is not google");

  console.log(`\n--- phoneVerification (full round-trip) ---`);
  await cleanup(); // ensure clean state
  const send = await createAndSendPhoneOtp(TEST_USER, TEST_PHONE, "whatsapp");
  if (!send.ok) {
    console.error("send not ok:", send);
    return cleanup();
  }
  assert(send.ok, "createAndSendPhoneOtp returned ok");
  const code = (send as any).debugCode as string | undefined;
  assert(typeof code === "string" && code.length === 6, "debugCode present in dev (Twilio not configured)");

  // Wrong code → fail with WRONG_CODE
  const wrong = await verifyPhoneOtp(TEST_USER, TEST_PHONE, "000000");
  assert(!wrong.ok && wrong.code === "WRONG_CODE", "wrong code returns WRONG_CODE");

  // Right code → ok
  const right = await verifyPhoneOtp(TEST_USER, TEST_PHONE, code!);
  assert(right.ok && (right as any).phoneE164 === TEST_PHONE, "correct code verifies");

  // Re-using the same code → USED
  const reused = await verifyPhoneOtp(TEST_USER, TEST_PHONE, code!);
  assert(!reused.ok && reused.code === "USED", "consumed code can't be reused");

  console.log(`\n--- emailVerification (full round-trip) ---`);
  const issued = await issueEmailCompletionToken(TEST_USER, TEST_EMAIL, "set-password");
  assert(typeof issued.token === "string" && issued.token.length > 30, "token is opaque random string");

  const inspected = await inspectEmailCompletionToken(issued.token);
  assert(inspected.ok && (inspected as any).email === TEST_EMAIL, "inspect returns the email");

  const inspectedAgain = await inspectEmailCompletionToken(issued.token);
  assert(inspectedAgain.ok, "inspect does NOT consume the token");

  const consumed = await consumeEmailCompletionToken(issued.token);
  assert(consumed.ok && (consumed as any).userId === TEST_USER, "consume returns userId");

  const consumedAgain = await consumeEmailCompletionToken(issued.token);
  assert(!consumedAgain.ok && consumedAgain.code === "USED", "double-consume returns USED");

  const bogus = await consumeEmailCompletionToken("not-a-real-token");
  assert(!bogus.ok && bogus.code === "NOT_FOUND", "bogus token returns NOT_FOUND");

  await cleanup();
  console.log(`\n${process.exitCode ? "✘ Some checks failed" : "✔ All checks passed"}`);
}

main()
  .catch(async (err) => {
    console.error("✘ Crash:", err);
    process.exitCode = 1;
    await cleanup().catch(() => {});
  })
  .finally(async () => {
    // Close the postgres connection so the script exits cleanly.
    process.exit(process.exitCode ?? 0);
  });
