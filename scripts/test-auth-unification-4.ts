/**
 * Integration test for Task #150 — fail-closed behavior when no profiles
 * row exists for the user.
 *
 * Creates an auth.users row WITHOUT a corresponding profiles row, then:
 *   1. attaches a phone via attachVerifiedPhoneToCurrentUser → expects
 *      PROFILE_NOT_FOUND, expects auth.users.phone to remain NULL
 *      (transaction rolled back).
 *   2. swaps email + password via swapEmailAndSetPassword → expects
 *      PROFILE_NOT_FOUND, expects auth.users.email to remain unchanged.
 *   3. swaps email via swapEmailViaLinkedGoogleIdentity → expects
 *      PROFILE_NOT_FOUND, expects no auth.identities[google] row created.
 *
 * Run: `npx tsx scripts/test-auth-unification-4.ts`
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

async function createOrphanAuthUser(initialEmail: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email: initialEmail,
    email_confirm: true,
    password: "Initial_Password_1!",
    user_metadata: { test: true, scope: "task-150-orphan" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  // Deliberately do NOT create a profiles row.
  // Defensive: in case some trigger auto-created one, delete it.
  await db.execute(sql`DELETE FROM profiles WHERE id = ${created.data.user.id}`);
  return created.data.user.id;
}

async function deleteOrphanAuthUser(userId: string) {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  await db.execute(sql`DELETE FROM profiles WHERE id = ${userId}`);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const stamp = Date.now();
  const initialEmail = `task150-orphan-${stamp}@riplek.test`;
  const swapEmail = `task150-orphan-swap-${stamp}@riplek.test`;
  const googleEmail = `task150-orphan-google-${stamp}@gmail.test`;
  const googleSub = `test-orphan-sub-${stamp}`;
  const phone = `+1555${String(stamp).slice(-7)}`;

  let userId: string | null = null;
  try {
    userId = await createOrphanAuthUser(initialEmail);
    console.log(`→ orphan user (no profiles row) = ${userId}`);

    // Sanity: there's no profiles row.
    const noProfile = (await db.execute(sql`
      SELECT id FROM profiles WHERE id = ${userId}
    `)) as any[];
    check("baseline: no profiles row exists for the user", noProfile.length === 0);

    // 1. attach phone → PROFILE_NOT_FOUND, no phone written.
    const attach = await attachVerifiedPhoneToCurrentUser(userId, phone);
    check(
      "attachVerifiedPhoneToCurrentUser returns PROFILE_NOT_FOUND",
      !attach.ok && attach.code === "PROFILE_NOT_FOUND",
      `code=${attach.ok ? "OK" : attach.code}`,
    );
    const afterAttach = (await db.execute(sql`
      SELECT phone, phone_confirmed_at FROM auth.users WHERE id = ${userId}::uuid
    `)) as any[];
    check(
      "auth.users.phone NOT written (transaction rolled back)",
      afterAttach[0]?.phone == null,
      `phone=${afterAttach[0]?.phone ?? "<null>"}`,
    );
    check(
      "auth.users.phone_confirmed_at NOT set (rolled back)",
      afterAttach[0]?.phone_confirmed_at == null,
    );

    // 2. swap email + password → PROFILE_NOT_FOUND, no email change.
    const swap = await swapEmailAndSetPassword(userId, swapEmail, "Strong_Password_9$");
    check(
      "swapEmailAndSetPassword returns PROFILE_NOT_FOUND",
      !swap.ok && swap.code === "PROFILE_NOT_FOUND",
      `code=${swap.ok ? "OK" : swap.code}`,
    );
    const afterSwap = (await db.execute(sql`
      SELECT email FROM auth.users WHERE id = ${userId}::uuid
    `)) as any[];
    check(
      "auth.users.email unchanged after rejected swap (rolled back)",
      afterSwap[0]?.email === initialEmail,
      `email=${afterSwap[0]?.email}`,
    );

    // 3. google swap → PROFILE_NOT_FOUND, no google identity row.
    const gswap = await swapEmailViaLinkedGoogleIdentity(userId, googleEmail, {
      email: googleEmail,
      sub: googleSub,
      emailVerified: true,
    });
    check(
      "swapEmailViaLinkedGoogleIdentity returns PROFILE_NOT_FOUND",
      !gswap.ok && gswap.code === "PROFILE_NOT_FOUND",
      `code=${gswap.ok ? "OK" : gswap.code}`,
    );
    const afterGoogle = (await db.execute(sql`
      SELECT user_id FROM auth.identities
      WHERE provider = 'google' AND provider_id = ${googleSub}
    `)) as any[];
    check(
      "auth.identities[google] NOT inserted (rolled back)",
      afterGoogle.length === 0,
      `rows=${afterGoogle.length}`,
    );
  } finally {
    if (userId) {
      try {
        await deleteOrphanAuthUser(userId);
        console.log(`→ cleaned up orphan user ${userId}`);
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
