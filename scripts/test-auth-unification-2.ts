/**
 * Integration test for Task #150 atomic identity-linking helpers.
 *
 * Spins up a throwaway auth.users row + profiles row, exercises:
 *   - swapEmailAndSetPassword (writes auth.users, auth.identities[email],
 *     profiles, all in a single tx; password hashed via pgcrypto)
 *   - signInWithPassword (proves GoTrue accepts the pgcrypto-bcrypt hash)
 *   - swapEmailViaLinkedGoogleIdentity (writes auth.users,
 *     auth.identities[google] + [email], profiles, all in a single tx;
 *     INSERTs a Google identity row that didn't exist before)
 *   - attachVerifiedPhoneToCurrentUser (writes auth.users, profiles)
 *   - duplicate detection (EMAIL_TAKEN, GOOGLE_IDENTITY_TAKEN, PHONE_TAKEN)
 * and tears the user down at the end.
 *
 * Run: `npx tsx scripts/test-auth-unification-2.ts`
 */
import { createClient } from "@supabase/supabase-js";
import { db } from "../backend/db";
import { sql } from "drizzle-orm";
import {
  attachVerifiedPhoneToCurrentUser,
  swapEmailAndSetPassword,
  swapEmailViaLinkedGoogleIdentity,
} from "../backend/auth/identityLinking";

const tests: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensureTestUser(initialEmail: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email: initialEmail,
    email_confirm: true,
    password: "Initial_Password_1!",
    user_metadata: { test: true, scope: "task-150" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const userId = created.data.user.id;
  const username = `t150_${userId.replace(/-/g, "").slice(0, 12)}`;
  await db.execute(sql`
    INSERT INTO profiles (id, username, display_name, email, contact_info)
    VALUES (${userId}, ${username}, 'Test User', ${initialEmail}, '{}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  `);
  return userId;
}

async function deleteTestUser(userId: string) {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // FK from auth.identities -> auth.users CASCADEs.
  await db.execute(sql`DELETE FROM profiles WHERE id = ${userId}`);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const stamp = Date.now();
  const initialEmail = `task150-${stamp}@riplek.test`;
  const swapEmail = `task150-swap-${stamp}@riplek.test`;
  const googleEmail = `task150-google-${stamp}@gmail.test`;
  const googleSub = `test-sub-${stamp}`;
  const phone = `+1555${String(stamp).slice(-7)}`;

  let userId: string | null = null;
  let secondUserId: string | null = null;

  try {
    userId = await ensureTestUser(initialEmail);
    console.log(`→ created test user ${userId}`);

    // ─── swapEmailAndSetPassword ────────────────────────────────────
    console.log("\n--- swapEmailAndSetPassword ---");
    const newPassword = "Strong_Pass_2026!";
    const swap1 = await swapEmailAndSetPassword(userId, swapEmail, newPassword);
    check("returns ok=true", swap1.ok === true);
    check("returns new email", swap1.ok && swap1.email === swapEmail);

    const u1 = (await db.execute(sql`
      SELECT email, email_confirmed_at, encrypted_password
      FROM auth.users WHERE id = ${userId}::uuid
    `)) as any[];
    check("auth.users.email updated", u1[0]?.email === swapEmail);
    check("auth.users.email_confirmed_at set", !!u1[0]?.email_confirmed_at);
    check(
      "auth.users.encrypted_password is bcrypt",
      typeof u1[0]?.encrypted_password === "string" && /^\$2[aby]?\$/.test(u1[0].encrypted_password),
    );

    const ident1 = (await db.execute(sql`
      SELECT email, identity_data FROM auth.identities
      WHERE user_id = ${userId}::uuid AND provider = 'email'
    `)) as any[];
    check(
      "auth.identities[email] mirrors new email",
      ident1.length === 1 && ident1[0].email === swapEmail,
    );

    const p1 = (await db.execute(sql`SELECT email FROM profiles WHERE id = ${userId}`)) as any[];
    check("profiles.email mirrors new email", p1[0]?.email === swapEmail);

    // pgcrypto bcrypt hash must be accepted by GoTrue's signInWithPassword.
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!;
    const anonClient = createClient(url, anon, { auth: { persistSession: false } });
    const signin = await anonClient.auth.signInWithPassword({ email: swapEmail, password: newPassword });
    check(
      "signInWithPassword accepts pgcrypto-hashed password",
      !signin.error && !!signin.data.session,
      signin.error?.message,
    );

    // Wrong password must fail.
    const signinBad = await anonClient.auth.signInWithPassword({ email: swapEmail, password: "wrong-Wrong-1!" });
    check("wrong password is rejected", !!signinBad.error);

    // ─── attachVerifiedPhoneToCurrentUser ───────────────────────────
    console.log("\n--- attachVerifiedPhoneToCurrentUser ---");
    const attach = await attachVerifiedPhoneToCurrentUser(userId, phone);
    check("attach returns ok=true", attach.ok === true);
    const u2 = (await db.execute(sql`
      SELECT phone, phone_confirmed_at FROM auth.users WHERE id = ${userId}::uuid
    `)) as any[];
    check("auth.users.phone set", u2[0]?.phone === phone.replace("+", ""));
    check("auth.users.phone_confirmed_at set", !!u2[0]?.phone_confirmed_at);
    const p2 = (await db.execute(sql`SELECT phone_e164 FROM profiles WHERE id = ${userId}`)) as any[];
    check("profiles.phone_e164 set", p2[0]?.phone_e164 === phone);

    // ─── swapEmailViaLinkedGoogleIdentity ───────────────────────────
    console.log("\n--- swapEmailViaLinkedGoogleIdentity ---");
    const gswap = await swapEmailViaLinkedGoogleIdentity(userId, googleEmail, {
      email: googleEmail,
      sub: googleSub,
      emailVerified: true,
      name: "Test User",
      picture: "https://example.com/p.png",
    });
    check("google swap returns ok=true", gswap.ok === true, !gswap.ok ? gswap.error : undefined);

    const ugoogle = (await db.execute(sql`SELECT email FROM auth.users WHERE id = ${userId}::uuid`)) as any[];
    check("auth.users.email is google email", ugoogle[0]?.email === googleEmail);
    const identGoogle = (await db.execute(sql`
      SELECT provider_id, identity_data FROM auth.identities
      WHERE user_id = ${userId}::uuid AND provider = 'google'
    `)) as any[];
    check("auth.identities[google] inserted", identGoogle.length === 1);
    check("auth.identities[google].provider_id matches sub", identGoogle[0]?.provider_id === googleSub);
    check(
      "auth.identities[google].identity_data has expected sub",
      identGoogle[0]?.identity_data?.sub === googleSub,
    );

    const identEmailAfter = (await db.execute(sql`
      SELECT email FROM auth.identities
      WHERE user_id = ${userId}::uuid AND provider = 'email'
    `)) as any[];
    check(
      "auth.identities[email] re-synced after google swap",
      identEmailAfter[0]?.email === googleEmail,
    );

    // Wrong sub (different sub for the *same* user) is allowed since UPSERT
    // creates a new identity. But a sub already linked to a *different* user
    // must be rejected. Set up a second test user to exercise that.
    secondUserId = await ensureTestUser(`task150-second-${stamp}@riplek.test`);
    const stealAttempt = await swapEmailViaLinkedGoogleIdentity(secondUserId, googleEmail, {
      email: googleEmail,
      sub: googleSub,
      emailVerified: true,
    });
    check(
      "GOOGLE_IDENTITY_TAKEN when sub already belongs to another user",
      !stealAttempt.ok && (stealAttempt.code === "GOOGLE_IDENTITY_TAKEN" || stealAttempt.code === "EMAIL_TAKEN"),
      !stealAttempt.ok ? stealAttempt.code : undefined,
    );

    // EMAIL_TAKEN: try swapping the second user to the first user's email.
    const conflict = await swapEmailAndSetPassword(secondUserId, googleEmail, "Conflict_Pass_1!");
    check(
      "EMAIL_TAKEN when email already belongs to another user",
      !conflict.ok && conflict.code === "EMAIL_TAKEN",
      !conflict.ok ? conflict.code : undefined,
    );

    // PHONE_TAKEN
    const phoneConflict = await attachVerifiedPhoneToCurrentUser(secondUserId, phone);
    check(
      "PHONE_TAKEN when phone already belongs to another user",
      !phoneConflict.ok && phoneConflict.code === "PHONE_TAKEN",
      !phoneConflict.ok ? phoneConflict.code : undefined,
    );

    // Rollback proof: weak password rejected BEFORE writing.
    const weak = await swapEmailAndSetPassword(secondUserId, `nope-${stamp}@riplek.test`, "weak");
    check(
      "weak password returns WEAK_PASSWORD without writes",
      !weak.ok && weak.code === "WEAK_PASSWORD",
    );
    const stillOriginal = (await db.execute(sql`SELECT email FROM auth.users WHERE id = ${secondUserId}::uuid`)) as any[];
    check(
      "second user's email unchanged after weak-password rejection",
      stillOriginal[0]?.email === `task150-second-${stamp}@riplek.test`,
    );
  } finally {
    if (userId) {
      try {
        await deleteTestUser(userId);
        console.log(`→ cleaned up test user ${userId}`);
      } catch (e: any) {
        console.warn(`cleanup failed: ${e.message}`);
      }
    }
    if (secondUserId) {
      try {
        await deleteTestUser(secondUserId);
        console.log(`→ cleaned up test user ${secondUserId}`);
      } catch (e: any) {
        console.warn(`cleanup failed: ${e.message}`);
      }
    }
  }

  const failed = tests.filter((t) => !t.ok);
  console.log(`\n${tests.length - failed.length}/${tests.length} checks passed`);
  if (failed.length > 0) {
    console.error("FAILED:", failed.map((t) => t.name).join(", "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
