/**
 * Concurrency test for Task #150: prove the Google identity-link
 * UPSERT cannot be raced into reassigning ownership of an already-linked
 * Google sub. Two distinct users attempt to link the SAME Google
 * `sub` to themselves at the same time. The expected outcome is:
 *
 *   - Exactly one swap returns ok=true.
 *   - The other returns ok=false with code='GOOGLE_IDENTITY_TAKEN'
 *     (or EMAIL_TAKEN if the second tx loses the email-uniqueness race
 *     instead — both are acceptable refusal modes).
 *   - The auth.identities[provider='google'] row's user_id matches the
 *     winner; never flips later.
 *
 * Run: `npx tsx scripts/test-auth-unification-3.ts`
 */
import { createClient } from "@supabase/supabase-js";
import { db } from "../backend/db";
import { sql } from "drizzle-orm";
import { swapEmailViaLinkedGoogleIdentity } from "../backend/auth/identityLinking";

const tests: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensureTestUser(email: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "Initial_Password_1!",
    user_metadata: { test: true, scope: "task-150-race" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const userId = created.data.user.id;
  const username = `t150r_${userId.replace(/-/g, "").slice(0, 12)}`;
  await db.execute(sql`
    INSERT INTO profiles (id, username, display_name, email, contact_info)
    VALUES (${userId}, ${username}, 'Test User', ${email}, '{}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  `);
  return userId;
}

async function deleteTestUser(userId: string) {
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
  const userIdA = await ensureTestUser(`task150-race-a-${stamp}@riplek.test`);
  const userIdB = await ensureTestUser(`task150-race-b-${stamp}@riplek.test`);
  console.log(`→ user A = ${userIdA}`);
  console.log(`→ user B = ${userIdB}`);

  // Same Google identity — both users want it.
  const sharedSub = `race-sub-${stamp}`;
  const sharedEmail = `task150-race-google-${stamp}@gmail.test`;

  try {
    // Fire both link attempts concurrently against the same sub.
    // Note: the helpers also pre-check email uniqueness, so the second
    // one to commit may be refused on EMAIL_TAKEN before reaching the
    // Google-link UPSERT — that's also a valid refusal.
    const [resA, resB] = await Promise.allSettled([
      swapEmailViaLinkedGoogleIdentity(userIdA, sharedEmail, {
        email: sharedEmail,
        sub: sharedSub,
        emailVerified: true,
      }),
      swapEmailViaLinkedGoogleIdentity(userIdB, sharedEmail, {
        email: sharedEmail,
        sub: sharedSub,
        emailVerified: true,
      }),
    ]);
    const a = resA.status === "fulfilled" ? resA.value : { ok: false, code: "THROWN", error: String(resA.reason) };
    const b = resB.status === "fulfilled" ? resB.value : { ok: false, code: "THROWN", error: String(resB.reason) };
    console.log("A:", a);
    console.log("B:", b);

    const aOk = (a as any).ok === true;
    const bOk = (b as any).ok === true;
    check("exactly one of {A, B} succeeds", (aOk && !bOk) || (!aOk && bOk),
      `A.ok=${aOk} B.ok=${bOk}`);

    const loser = aOk ? b : a;
    const refusalCode = (loser as any).code;
    check(
      "loser refusal code is GOOGLE_IDENTITY_TAKEN or EMAIL_TAKEN",
      refusalCode === "GOOGLE_IDENTITY_TAKEN" || refusalCode === "EMAIL_TAKEN",
      `code=${refusalCode}`,
    );

    const winnerId = aOk ? userIdA : userIdB;
    const ident = (await db.execute(sql`
      SELECT user_id FROM auth.identities
      WHERE provider = 'google' AND provider_id = ${sharedSub}
    `)) as any[];
    check("auth.identities[google] has exactly one row", ident.length === 1, `rows=${ident.length}`);
    check(
      "auth.identities[google].user_id matches the winner (never flipped)",
      ident[0]?.user_id === winnerId,
      `linked_to=${ident[0]?.user_id} winner=${winnerId}`,
    );

    // Now verify the LOSER cannot retroactively steal the Google sub
    // even with a fresh, sequential attempt.
    const loserId = aOk ? userIdB : userIdA;
    const stealAttempt = await swapEmailViaLinkedGoogleIdentity(loserId, sharedEmail, {
      email: sharedEmail,
      sub: sharedSub,
      emailVerified: true,
    });
    check(
      "subsequent steal attempt by loser is refused",
      stealAttempt.ok === false,
      stealAttempt.ok ? "unexpectedly succeeded" : (stealAttempt as any).code,
    );
    const ident2 = (await db.execute(sql`
      SELECT user_id FROM auth.identities
      WHERE provider = 'google' AND provider_id = ${sharedSub}
    `)) as any[];
    check(
      "ownership did not flip after loser retry",
      ident2[0]?.user_id === winnerId,
    );
  } finally {
    await deleteTestUser(userIdA).catch((e) => console.warn("cleanup A:", e.message));
    await deleteTestUser(userIdB).catch((e) => console.warn("cleanup B:", e.message));
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
