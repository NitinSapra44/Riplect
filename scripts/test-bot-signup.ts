/**
 * Integration test for Task #151 — WhatsApp bot identity adaptation.
 *
 * Verifies that the new bot signup path:
 *   1. Creates a phone-only Supabase auth user (NO fake @phone.riplek.com email).
 *   2. Inserts a profiles row with phone_e164 set, onboardingCompleted=false,
 *      no hardcoded location/timezone.
 *   3. Returns a stable claim link of the form `${baseUrl}/claim?phone=<E.164>`.
 *   4. Reconciles to the existing profile (no duplicate auth user) when called
 *      twice for the same phone.
 *   5. Reconciles to a pre-existing email-only profile when the bot sees that
 *      phone for the first time AFTER it was attached on the web.
 *
 * Run: `npx tsx scripts/test-bot-signup.ts`
 */
import { createClient } from "@supabase/supabase-js";
import { db } from "../backend/db";
import { sql } from "drizzle-orm";
import { createBotProfile, buildBotClaimLink } from "../backend/whatsapp/createBotProfile";
import { findProfileByWhatsApp } from "../backend/whatsapp/profileLookup";

const tests: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  tests.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Use a deterministic-but-unique phone per run so reruns don't collide.
const stamp = Date.now().toString().slice(-9);
const PHONE_NEW = `+1555${stamp.slice(0, 7)}`;
const PHONE_EXISTING = `+1444${stamp.slice(0, 7)}`;

async function cleanupByPhone(phone: string) {
  const phoneNoPlus = phone.replace(/^\+/, "");
  // Find any auth users by phone and delete them
  const { data: list } = await admin.auth.admin.listUsers();
  const matches =
    list?.users?.filter((u) => u.phone === phoneNoPlus || u.phone === phone) ?? [];
  for (const u of matches) {
    await db.execute(sql`DELETE FROM profiles WHERE id = ${u.id}`);
    await admin.auth.admin.deleteUser(u.id);
  }
  // Defensive: also clear any orphan profiles bound to this phone
  await db.execute(sql`DELETE FROM profiles WHERE phone_e164 = ${phone}`);
}

async function fetchAuthUserByPhone(phone: string) {
  const phoneNoPlus = phone.replace(/^\+/, "");
  const { data: list } = await admin.auth.admin.listUsers();
  return list?.users?.find((u) => u.phone === phoneNoPlus || u.phone === phone) ?? null;
}

async function main() {
  await cleanupByPhone(PHONE_NEW);
  await cleanupByPhone(PHONE_EXISTING);

  try {
    // ── Test 1: brand-new phone → fresh phone-only auth + profile ──
    const r1 = await createBotProfile({
      phone: PHONE_NEW,
      displayName: "Bot Test User",
      title: "Yoga Teacher",
      sourceChannel: "whatsapp",
    });
    check("createBotProfile (new) returns ok", r1.ok === true);
    if (!r1.ok) throw new Error("Stopping — fresh signup failed: " + r1.error);

    check("returns a profileId", typeof r1.profileId === "string" && r1.profileId.length > 0);
    check("not flagged as reconciled", r1.reconciled === false);
    check(
      "claimLink is /claim?phone=<E.164>",
      r1.claimLink.includes("/claim?phone=") && r1.claimLink.includes(encodeURIComponent(PHONE_NEW)),
      r1.claimLink,
    );
    check(
      "buildBotClaimLink is the same shape",
      r1.claimLink === buildBotClaimLink(PHONE_NEW),
    );

    // Verify auth user state
    const au = await fetchAuthUserByPhone(PHONE_NEW);
    check("auth.users row exists for the phone", au !== null);
    check(
      "auth.users.email is NOT a fake @phone.riplek.com",
      !!au && (au.email === undefined || au.email === null || au.email === "" || !au.email.includes("@phone.riplek.com")),
      `email=${au?.email ?? "<null>"}`,
    );
    check(
      "auth.users.phone matches",
      !!au && (au.phone === PHONE_NEW || au.phone === PHONE_NEW.replace(/^\+/, "")),
      `phone=${au?.phone}`,
    );
    check("auth.users.phone_confirmed_at is set", !!au && !!au.phone_confirmed_at);

    // Verify profile state
    const prows = await db.execute(sql`
      SELECT id, phone_e164, email, onboarding_completed, searchable_location,
             contact_info, source_channel, display_name
      FROM profiles WHERE id = ${r1.profileId}
    `);
    const prof = prows[0] as any;
    check("profiles row exists", !!prof);
    check("profiles.phone_e164 is set to canonical E.164", prof?.phone_e164 === PHONE_NEW);
    check(
      "profiles.email is NOT a fake @phone.riplek.com",
      !prof?.email || !String(prof.email).includes("@phone.riplek.com"),
      `email=${prof?.email ?? "<null>"}`,
    );
    check("profiles.onboarding_completed = false", prof?.onboarding_completed === false);
    check(
      "profiles.searchable_location was NOT hardcoded to Dharamkot",
      prof?.searchable_location === null || prof?.searchable_location === undefined,
      `searchable_location=${prof?.searchable_location ?? "<null>"}`,
    );
    check(
      "profiles.contact_info.whatsapp populated for backward compat",
      prof?.contact_info?.whatsapp === PHONE_NEW,
    );
    check("profiles.source_channel = whatsapp", prof?.source_channel === "whatsapp");

    // ── Test 2: same phone again → reconciles, no duplicate ──
    const r2 = await createBotProfile({
      phone: PHONE_NEW,
      displayName: "Bot Test User Again",
      title: "Different Title",
      sourceChannel: "whatsapp",
    });
    check("second call for same phone returns ok", r2.ok === true);
    if (r2.ok) {
      check("second call flagged reconciled=true", r2.reconciled === true);
      check("second call returns the SAME profileId", r2.profileId === r1.profileId);
    }
    // Confirm only one auth user exists for the phone
    const phoneNoPlus = PHONE_NEW.replace(/^\+/, "");
    const { data: list } = await admin.auth.admin.listUsers();
    const matches =
      list?.users?.filter((u) => u.phone === phoneNoPlus || u.phone === PHONE_NEW) ?? [];
    check(
      "only ONE auth.users row exists for this phone after second call",
      matches.length === 1,
      `count=${matches.length}`,
    );

    // ── Test 3: profile-by-phone lookup returns the bot profile ──
    const lookedUp = await findProfileByWhatsApp(PHONE_NEW);
    check("findProfileByWhatsApp resolves the bot profile", lookedUp === r1.profileId);

    // ── Test 4: existing email-only profile + bot sees phone first time → reconcile ──
    // Simulate a user who already signed up via email on the web AND had their
    // phone attached (phone_e164 set on profile). The bot should reconcile
    // and not create a new auth user.
    const seedEmail = `t151-seed-${stamp}@example.com`;
    const seedAuth = await admin.auth.admin.createUser({
      email: seedEmail,
      email_confirm: true,
      password: "Seed_Password_1!",
    });
    if (seedAuth.error || !seedAuth.data.user) throw new Error("seed create failed");
    const seedId = seedAuth.data.user.id;
    const seedUsername = `t151seed${stamp}`;
    await db.execute(sql`
      INSERT INTO profiles (id, username, display_name, email, phone_e164, contact_info)
      VALUES (${seedId}, ${seedUsername}, 'Seed User', ${seedEmail}, ${PHONE_EXISTING},
              ${JSON.stringify({ phone: PHONE_EXISTING, whatsapp: PHONE_EXISTING })}::jsonb)
    `);

    const r3 = await createBotProfile({
      phone: PHONE_EXISTING,
      displayName: "Bot Sees Existing User",
      title: "Should Be Ignored",
      sourceChannel: "whatsapp",
    });
    check("bot signup for already-claimed phone returns ok", r3.ok === true);
    if (r3.ok) {
      check("reconciled=true", r3.reconciled === true);
      check("reconciled to the SEED profileId", r3.profileId === seedId);
      check("bot did NOT overwrite displayName", r3.displayName === "Seed User");
    }
    // Confirm exactly ONE auth user owns the existing phone
    const { data: list2 } = await admin.auth.admin.listUsers();
    const phoneNoPlus2 = PHONE_EXISTING.replace(/^\+/, "");
    const matches2 =
      list2?.users?.filter((u) => u.phone === phoneNoPlus2 || u.phone === PHONE_EXISTING) ?? [];
    check(
      "still only seed user, no new auth user created",
      matches2.length === 0 || (matches2.length === 1 && matches2[0].id === seedId),
      `count=${matches2.length}`,
    );

    // Cleanup seed
    await db.execute(sql`DELETE FROM profiles WHERE id = ${seedId}`);
    await admin.auth.admin.deleteUser(seedId);
  } finally {
    await cleanupByPhone(PHONE_NEW);
    await cleanupByPhone(PHONE_EXISTING);
  }

  const passed = tests.filter((t) => t.ok).length;
  const failed = tests.length - passed;
  console.log(`\n${passed}/${tests.length} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
