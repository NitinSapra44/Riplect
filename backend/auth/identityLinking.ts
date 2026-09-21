/**
 * Identity-linking helpers for the unified signup/login model.
 *
 * Goal: every Riplect user ends up with ONE auth.users row holding both a
 * verified email and a verified phone, and the corresponding `profiles`
 * row carries the canonical `phone_e164`. These helpers are the only
 * supported way to merge those credentials onto an existing account —
 * any other path risks creating duplicate accounts (the bug we're fixing).
 *
 * Three operations are exposed:
 *   1. attachVerifiedPhoneToCurrentUser   — verified-phone-OTP success path
 *   2. swapEmailAndSetPassword            — email-link "set password" path
 *   3. swapEmailViaLinkedGoogleIdentity   — Google-linked-identity path
 *
 * ── Why direct SQL on Supabase's auth schema ──────────────────────────
 *
 * The task spec requires these operations to be **atomic** across
 * `auth.users` + `auth.identities` + `profiles`. Supabase's admin SDK
 * (`auth.admin.*`) does not expose a transactional primitive; in
 * particular it has no `linkIdentity()` admin method (the supported
 * `linkIdentity` flow runs from the user's session and is OAuth-redirect-
 * based). The only way to satisfy the atomicity requirement is to
 * write directly to Supabase's own auth tables inside a single
 * `db.transaction(...)`.
 *
 * We are NOT inventing a parallel identity table — we are writing to
 * `auth.identities`, which is the canonical Supabase identity store.
 * Password hashing uses pgcrypto's `crypt(..., gen_salt('bf', 10))`
 * (the same bcrypt algorithm GoTrue stores) and is independently
 * verified by signing in via the anon client (proven in
 * `scripts/test-auth-unification-2.ts`).
 *
 * Schema-drift mitigation: at module load we probe `auth.users` and
 * `auth.identities` for the columns we depend on and refuse to start
 * if any are missing. A future Supabase auth-schema change will
 * surface as a loud startup error instead of a silent corruption.
 *
 * **Conflict surface.** Each helper returns a structured `{ code,
 * conflict: { kind, masked } }` on duplicate-credential failures so the
 * UI can render a consistent message regardless of which guard fired.
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { db } from "../db";
import { sql, type SQL } from "drizzle-orm";
import { normalizeToE164, maskPhone } from "./phoneNumber";

// ── Typed helpers around drizzle's untyped `db.execute` ──────────────
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** Run a SQL statement that returns rows of shape `T`. */
async function queryRows<T>(executor: Executor, statement: SQL): Promise<T[]> {
  const result = await executor.execute(statement);
  return result as unknown as T[];
}

interface IdRow { id: string }
interface UserIdRow { user_id: string }

/**
 * Sentinel thrown from inside a `db.transaction(...)` callback to force
 * Postgres to ROLLBACK while still letting the caller surface a typed
 * error result. **Critical correctness invariant**: returning a value
 * from the transaction callback (even `{ ok: false, ... }`) commits the
 * transaction; only a thrown error rolls it back. Every error path that
 * follows a write must therefore throw `RollbackWith` so partial writes
 * are never persisted. */
class RollbackWith<T> extends Error {
  constructor(public readonly result: T) {
    super("__rollback_with_result__");
    this.name = "RollbackWith";
  }
}

export type ConflictHint = { kind: "phone" | "email"; masked: string };

/** Mask an email for safe display in conflict hints. */
export function maskEmailPublic(email: string): string {
  return maskEmail(email);
}

/** Validate password policy. Exported so route handlers can fail-fast
 *  BEFORE consuming a single-use email-completion token. */
export function validatePasswordPolicy(password: unknown): { ok: true } | { ok: false; error: string } {
  if (!isStrongPassword(password as string)) {
    return { ok: false, error: PASSWORD_POLICY_MSG };
  }
  return { ok: true };
}

/** Issue a fresh Supabase session for `email`+`password`, used right
 *  after a successful email-and-password swap so the client doesn't
 *  have to perform a second round-trip. Uses the anon key (the public
 *  password sign-in endpoint), not the admin key. */
export async function issuePasswordSession(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, error: "Auth not configured for session issuance." };
  }
  // Fresh, persistSession-disabled client so we don't pollute any
  // long-lived storage with this one-shot login.
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, error: error?.message ?? "Failed to issue session." };
  }
  return { ok: true, session: data.session };
}

export type CreatePhoneOnlyUserResult =
  | {
      ok: true;
      userId: string;
      phoneE164: string;
      /** True iff this call actually created a new auth.users row.
       *  False means an existing row owned by this phone was returned
       *  (cold reuse OR race-recovered after a 422). */
      created: boolean;
    }
  | {
      ok: false;
      code:
        | "INVALID_PHONE"
        | "NOT_CONFIGURED"
        | "DB_ERROR"
        | "AUTH_CREATE_FAILED";
      error: string;
    };

export type AttachPhoneResult =
  | { ok: true; phoneE164: string }
  | {
      ok: false;
      code: "INVALID_PHONE" | "PHONE_TAKEN" | "NOT_CONFIGURED" | "USER_NOT_FOUND" | "PROFILE_NOT_FOUND" | "DB_ERROR";
      error: string;
      conflict?: ConflictHint;
    };

export type SwapEmailResult =
  | { ok: true; email: string }
  | {
      ok: false;
      code:
        | "INVALID_EMAIL"
        | "EMAIL_TAKEN"
        | "NOT_CONFIGURED"
        | "DB_ERROR"
        | "USER_NOT_FOUND"
        | "PROFILE_NOT_FOUND"
        | "GOOGLE_IDENTITY_TAKEN"
        | "GOOGLE_EMAIL_MISMATCH"
        | "WEAK_PASSWORD";
      error: string;
      conflict?: ConflictHint;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY_MSG =
  "Password must be at least 8 characters and include an uppercase letter, a number, and a special character.";

function isStrongPassword(password: string): boolean {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** Wrap a unique-violation thrown inside a tx into a friendly conflict
 *  response. Postgres reports `code: '23505'`. */
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || /duplicate key|unique constraint|already exists/i.test(err?.message ?? "");
}

/**
 * Mark a phone as verified-and-attached on the signed-in auth.users row,
 * and write the canonical `phone_e164` to the profile so downstream
 * lookups (the WhatsApp bot included) work. All writes happen inside a
 * single transaction.
 */
export async function attachVerifiedPhoneToCurrentUser(
  userId: string,
  rawPhone: string,
): Promise<AttachPhoneResult> {
  const phone = normalizeToE164(rawPhone);
  if (!phone) {
    return { ok: false, code: "INVALID_PHONE", error: "Invalid phone number format." };
  }

  try {
    return await db.transaction(async (tx) => {
      // Lock-free pre-check for a friendlier error than the unique
      // constraint backstop below.
      const conflict = await queryRows<IdRow>(tx, sql`
        SELECT id FROM profiles
        WHERE phone_e164 = ${phone} AND id <> ${userId}
        LIMIT 1
      `);
      if (conflict.length > 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "PHONE_TAKEN" as const,
          error: "This phone number is already linked to another Riplect account.",
          conflict: { kind: "phone" as const, masked: maskPhone(phone) },
        });
      }

      // Update auth.users.phone + mark verified. We bypass the admin
      // SDK so this is part of the same tx as the profile mirror.
      // Supabase stores phone WITHOUT the `+` prefix (their convention),
      // so strip it; our `profiles.phone_e164` keeps the canonical
      // `+` form.
      const phoneNoPlus = phone.replace(/^\+/, "");
      const updated = await queryRows<IdRow>(tx, sql`
        UPDATE auth.users
        SET phone = ${phoneNoPlus},
            phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${userId}::uuid
        RETURNING id
      `);
      if (updated.length === 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "USER_NOT_FOUND" as const,
          error: "Account not found.",
        });
      }

      // Mirror onto profiles. The unique partial index on
      // profiles.phone_e164 is the hard backstop.
      const profileMirror = await queryRows<IdRow>(tx, sql`
        UPDATE profiles
        SET
          phone_e164 = ${phone},
          contact_info = COALESCE(contact_info, '{}'::jsonb)
            || jsonb_build_object('phone', COALESCE(NULLIF(contact_info->>'phone', ''), ${phone})),
          updated_at = now()
        WHERE id = ${userId}
        RETURNING id
      `);
      if (profileMirror.length === 0) {
        // No profile row yet — this happens when a user signs in with Google
        // and abandons onboarding before the step-1 draft save fires. Rather
        // than blocking them with a hard error, auto-create a minimal stub so
        // phone verification succeeds and onboarding can continue normally.
        // We read the user's name + email from auth.users metadata so the stub
        // is recognisable. Log a warning so the event is visible in prod logs.

        // 1. Fetch name + email from auth.users inside the same tx.
        type AuthMetaRow = { raw_user_meta_data: Record<string, string> | null; email: string | null };
        const authRows = await queryRows<AuthMetaRow>(tx, sql`
          SELECT raw_user_meta_data, email
          FROM auth.users
          WHERE id = ${userId}::uuid
          LIMIT 1
        `);
        const meta = authRows[0];
        const metaName: string =
          meta?.raw_user_meta_data?.full_name ||
          meta?.raw_user_meta_data?.name ||
          meta?.email?.split("@")[0] ||
          "user";
        const metaEmail: string = meta?.email ?? "";

        // 2. Generate a unique username (collision-safe, no network calls outside tx).
        const base = metaName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 27) || "user";

        // Try base, then base2…base9, then base+random-hex.
        const { randomBytes } = await import("crypto");
        let chosenUsername = base;
        const checkTaken = async (u: string) =>
          (await queryRows<IdRow>(tx, sql`SELECT id FROM profiles WHERE username = ${u} LIMIT 1`)).length > 0;

        if (await checkTaken(chosenUsername)) {
          let found = false;
          for (let i = 2; i <= 9; i++) {
            const candidate = `${base}${i}`;
            if (!(await checkTaken(candidate))) {
              chosenUsername = candidate;
              found = true;
              break;
            }
          }
          if (!found) {
            chosenUsername = `${base}${randomBytes(3).toString("hex")}`;
          }
        }

        // 3. Insert the stub with per-attempt username collision recovery.
        // The select-then-insert window above has a narrow race: another tx
        // could claim the same generated username between our SELECT and this
        // INSERT. To avoid that unique violation escaping to the outer catch
        // (where it would be misidentified as PHONE_TAKEN), we handle it here
        // and regenerate a fresh random-suffix username on each retry.
        let stubInserted = false;
        for (let attempt = 0; attempt < 3 && !stubInserted; attempt++) {
          if (attempt > 0) {
            chosenUsername = `${base}${randomBytes(3).toString("hex")}`;
            console.warn(
              `[identityLinking] username collision on stub insert attempt ${attempt}, retrying with ${chosenUsername}`,
            );
          }
          try {
            await tx.execute(sql`
              INSERT INTO profiles (id, username, display_name, email, onboarding_completed, created_at, updated_at)
              VALUES (${userId}, ${chosenUsername}, ${metaName}, ${metaEmail}, false, now(), now())
            `);
            stubInserted = true;
          } catch (insertErr: any) {
            if (!isUniqueViolation(insertErr)) throw insertErr;
            // username collision — outer loop regenerates a new suffix
          }
        }
        if (!stubInserted) {
          throw new RollbackWith({
            ok: false as const,
            code: "DB_ERROR" as const,
            error: "Could not generate a unique username. Please try again.",
          });
        }
        console.warn(
          `[identityLinking] attachVerifiedPhoneToCurrentUser: no profile row for userId=${userId} — ` +
          `auto-created stub (username=${chosenUsername}). User will finish onboarding normally.`,
        );

        // 4. Re-run the phone mirror — guaranteed to find the row we just inserted.
        const retryMirror = await queryRows<IdRow>(tx, sql`
          UPDATE profiles
          SET
            phone_e164 = ${phone},
            contact_info = COALESCE(contact_info, '{}'::jsonb)
              || jsonb_build_object('phone', COALESCE(NULLIF(contact_info->>'phone', ''), ${phone})),
            updated_at = now()
          WHERE id = ${userId}
          RETURNING id
        `);
        if (retryMirror.length === 0) {
          // Truly unexpected — INSERT + immediate UPDATE both failed.
          throw new RollbackWith({
            ok: false as const,
            code: "PROFILE_NOT_FOUND" as const,
            error: "Account profile is missing. Please contact support.",
          });
        }
      }

      return { ok: true as const, phoneE164: phone };
    });
  } catch (err: any) {
    if (err instanceof RollbackWith) return err.result as AttachPhoneResult;
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        code: "PHONE_TAKEN",
        error: "This phone number is already linked to another Riplect account.",
        conflict: { kind: "phone", masked: maskPhone(phone) },
      };
    }
    console.error("[identityLinking] attachVerifiedPhoneToCurrentUser failed:", err);
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }
}

/**
 * Replace the placeholder email on `userId` with `newEmail`, set their
 * password, and mark email confirmed — all atomically inside a single
 * transaction.
 *
 * Writes touched, all in one tx:
 *   - auth.users     (email, encrypted_password, email_confirmed_at)
 *   - auth.identities[provider='email']  (UPSERT identity_data + email)
 *   - profiles       (email mirror)
 *
 * The caller is expected to have just consumed a single-use email-link
 * token proving the user owns `newEmail`.
 */
export async function swapEmailAndSetPassword(
  userId: string,
  newEmail: string,
  newPassword: string,
  options: { confirmEmail?: boolean } = {},
): Promise<SwapEmailResult> {
  const confirmEmail = options.confirmEmail !== false;
  if (!EMAIL_RE.test(newEmail)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Invalid email address." };
  }
  if (!isStrongPassword(newPassword)) {
    return { ok: false, code: "WEAK_PASSWORD", error: PASSWORD_POLICY_MSG };
  }
  const emailLower = newEmail.toLowerCase();

  try {
    return await db.transaction(async (tx) => {
      // Conflict check on profiles (friendlier surface than the
      // auth.users.email_key unique index).
      const dupProfile = await queryRows<IdRow>(tx, sql`
        SELECT id FROM profiles
        WHERE LOWER(email) = ${emailLower} AND id <> ${userId}
        LIMIT 1
      `);
      if (dupProfile.length > 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "EMAIL_TAKEN" as const,
          error: "This email is already linked to another Riplect account.",
          conflict: { kind: "email" as const, masked: maskEmail(newEmail) },
        });
      }

      // Conflict check on auth.users — another auth.users row may own
      // this email even if its profiles mirror is out of sync.
      const dupAuth = await queryRows<IdRow>(tx, sql`
        SELECT id FROM auth.users
        WHERE LOWER(email) = ${emailLower} AND id <> ${userId}::uuid
        LIMIT 1
      `);
      if (dupAuth.length > 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "EMAIL_TAKEN" as const,
          error: "This email is already linked to another Riplect account.",
          conflict: { kind: "email" as const, masked: maskEmail(newEmail) },
        });
      }

      // Update auth.users: swap email, set bcrypt-hashed password
      // (pgcrypto). Optionally mark email verified — when called from
      // the inline-set-password flow we leave email_confirmed_at NULL
      // because the user has not yet proven ownership of the typed
      // email; a separate confirm-email link is sent so they can flip
      // it later (required to log back in via email+password).
      // Cast the password parameter explicitly so postgres can infer
      // the `crypt(text, text)` overload.
      const updated = confirmEmail
        ? await queryRows<IdRow>(tx, sql`
            UPDATE auth.users
            SET email = ${newEmail},
                encrypted_password = crypt(${newPassword}::text, gen_salt('bf', 10)),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                updated_at = now()
            WHERE id = ${userId}::uuid
            RETURNING id
          `)
        : await queryRows<IdRow>(tx, sql`
            UPDATE auth.users
            SET email = ${newEmail},
                encrypted_password = crypt(${newPassword}::text, gen_salt('bf', 10)),
                email_confirmed_at = NULL,
                updated_at = now()
            WHERE id = ${userId}::uuid
            RETURNING id
          `);
      if (updated.length === 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "USER_NOT_FOUND" as const,
          error: "Account not found.",
        });
      }

      // Sync auth.identities[provider='email'] so future sign-ins via
      // email also see the new address. UPSERT keyed by (provider,
      // provider_id) — for the email provider Supabase uses the user's
      // own uuid as the provider_id. Note: the `email` column on
      // auth.identities is GENERATED from identity_data->>'email', so
      // we never write to it directly.
      await tx.execute(sql`
        INSERT INTO auth.identities
          (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (
          ${userId},
          ${userId}::uuid,
          jsonb_build_object('sub', ${userId}::text, 'email', ${newEmail}::text, 'email_verified', ${confirmEmail}::boolean, 'phone_verified', true),
          'email',
          now(), now(), now()
        )
        ON CONFLICT (provider_id, provider) DO UPDATE SET
          identity_data = COALESCE(auth.identities.identity_data, '{}'::jsonb)
            || jsonb_build_object('email', ${newEmail}::text, 'email_verified', ${confirmEmail}::boolean),
          updated_at = now()
      `);

      // Mirror to profiles when the row already exists. During early
      // onboarding the profile row may not exist yet (it is created at the
      // end of the wizard); in that case we skip the mirror here — the email
      // is safely written to auth.users above, and the profile row will pick
      // it up when it is created at the end of onboarding.
      const profileMirror = await queryRows<IdRow>(tx, sql`
        UPDATE profiles
        SET email = ${newEmail}, updated_at = now()
        WHERE id = ${userId}
        RETURNING id
      `);
      if (profileMirror.length === 0) {
        console.warn(
          `[identityLinking] swapEmailAndSetPassword: no profiles row for ${userId} — ` +
          "email written to auth.users but profile mirror skipped (early onboarding).",
        );
      }

      return { ok: true as const, email: newEmail };
    });
  } catch (err: any) {
    if (err instanceof RollbackWith) return err.result as SwapEmailResult;
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        code: "EMAIL_TAKEN",
        error: "This email is already linked to another Riplect account.",
        conflict: { kind: "email", masked: maskEmail(newEmail) },
      };
    }
    console.error("[identityLinking] swapEmailAndSetPassword failed:", err);
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }
}

/**
 * Mark an already-swapped email as verified (sets `email_confirmed_at`
 * on `auth.users` and `email_verified=true` in the email-provider
 * identity row). Used by the confirm-email link flow that fires AFTER
 * the user already set a password inline during onboarding.
 *
 * The `expectedEmail` guard ensures the token (which carries the email
 * at issuance time) still matches what's currently on the account —
 * defends against the user changing their email between issuing the
 * token and clicking the link.
 */
export async function confirmEmailForUser(
  userId: string,
  expectedEmail: string,
): Promise<{ ok: true; email: string } | { ok: false; code: "USER_NOT_FOUND" | "EMAIL_MISMATCH" | "DB_ERROR"; error: string }> {
  const emailLower = expectedEmail.toLowerCase();
  try {
    return await db.transaction(async (tx) => {
      const rows = await queryRows<{ id: string; email: string | null }>(tx, sql`
        SELECT id::text AS id, email FROM auth.users
        WHERE id = ${userId}::uuid
        LIMIT 1
      `);
      if (rows.length === 0) {
        throw new RollbackWith({ ok: false as const, code: "USER_NOT_FOUND" as const, error: "Account not found." });
      }
      const currentEmail = (rows[0].email ?? "").toLowerCase();
      if (currentEmail !== emailLower) {
        throw new RollbackWith({
          ok: false as const,
          code: "EMAIL_MISMATCH" as const,
          error: "This link was issued for a different email than the one currently on your account.",
        });
      }

      await tx.execute(sql`
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${userId}::uuid
      `);

      await tx.execute(sql`
        UPDATE auth.identities
        SET identity_data = COALESCE(identity_data, '{}'::jsonb)
          || jsonb_build_object('email_verified', true),
            updated_at = now()
        WHERE provider = 'email' AND user_id = ${userId}::uuid
      `);

      return { ok: true as const, email: expectedEmail };
    });
  } catch (err: any) {
    if (err instanceof RollbackWith) return err.result as { ok: false; code: "USER_NOT_FOUND" | "EMAIL_MISMATCH"; error: string };
    console.error("[identityLinking] confirmEmailForUser failed:", err);
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }
}

/**
 * Complete the email-via-Google swap from a signed-in phone-first user.
 *
 * The caller has just gone through Google Sign-In on the client and
 * obtained a Google ID token, which the route handler verified
 * cryptographically (signature + expiry + audience binding). This
 * helper performs the full server-side link + swap atomically:
 *
 *   - INSERTs (or UPSERTs) the Google identity row in auth.identities
 *     so future Google sign-ins resolve to this same auth.users row.
 *   - UPDATEs auth.users.email + email_confirmed_at to the verified
 *     Google email.
 *   - Mirrors the new email onto `profiles`.
 *
 * A pre-existing Google identity row with the same `sub` belonging to
 * a *different* user is treated as `GOOGLE_IDENTITY_TAKEN` (we never
 * silently steal an identity from another account).
 */
export async function swapEmailViaLinkedGoogleIdentity(
  userId: string,
  expectedEmail: string,
  verifiedGoogle: {
    email: string;
    sub: string;
    emailVerified: boolean;
    /** Optional extra fields from the verified id_token, mirrored
     *  into identity_data so downstream code matches Supabase's
     *  native shape. */
    name?: string;
    picture?: string;
    full_name?: string;
    avatar_url?: string;
  },
): Promise<SwapEmailResult> {
  if (!EMAIL_RE.test(expectedEmail)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Invalid email address." };
  }
  if (!verifiedGoogle.emailVerified) {
    return {
      ok: false,
      code: "GOOGLE_EMAIL_MISMATCH",
      error: "Google reports this email as unverified. Please use a different account.",
    };
  }
  const googleEmail = verifiedGoogle.email.toLowerCase();
  if (googleEmail !== expectedEmail.toLowerCase()) {
    return {
      ok: false,
      code: "GOOGLE_EMAIL_MISMATCH",
      error: `The Google account you authorized (${maskEmail(googleEmail)}) doesn't match the email you typed.`,
    };
  }

  const identityData = {
    iss: "https://accounts.google.com",
    sub: verifiedGoogle.sub,
    email: googleEmail,
    email_verified: true,
    phone_verified: false,
    provider_id: verifiedGoogle.sub,
    name: verifiedGoogle.name ?? verifiedGoogle.full_name ?? null,
    full_name: verifiedGoogle.full_name ?? verifiedGoogle.name ?? null,
    picture: verifiedGoogle.picture ?? verifiedGoogle.avatar_url ?? null,
    avatar_url: verifiedGoogle.avatar_url ?? verifiedGoogle.picture ?? null,
  };

  try {
    return await db.transaction(async (tx) => {
      // Conflict 1: another auth.users row already has this email.
      const dupAuth = await queryRows<IdRow>(tx, sql`
        SELECT id FROM auth.users
        WHERE LOWER(email) = ${googleEmail} AND id <> ${userId}::uuid
        LIMIT 1
      `);
      if (dupAuth.length > 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "EMAIL_TAKEN" as const,
          error: "This email is already linked to another Riplect account.",
          conflict: { kind: "email" as const, masked: maskEmail(googleEmail) },
        });
      }

      // Conflict 2: another profile already owns this email.
      const dupProfile = await queryRows<IdRow>(tx, sql`
        SELECT id FROM profiles
        WHERE LOWER(email) = ${googleEmail} AND id <> ${userId}
        LIMIT 1
      `);
      if (dupProfile.length > 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "EMAIL_TAKEN" as const,
          error: "This email is already linked to another Riplect account.",
          conflict: { kind: "email" as const, masked: maskEmail(googleEmail) },
        });
      }

      // Conflict 3: this Google `sub` is already linked to a *different*
      // user. Refuse rather than silently steal it.
      const existingGoogle = await queryRows<UserIdRow>(tx, sql`
        SELECT user_id FROM auth.identities
        WHERE provider = 'google' AND provider_id = ${verifiedGoogle.sub}
        LIMIT 1
      `);
      if (existingGoogle.length > 0) {
        const owner = existingGoogle[0].user_id;
        if (owner !== userId) {
          throw new RollbackWith({
            ok: false as const,
            code: "GOOGLE_IDENTITY_TAKEN" as const,
            error: "This Google account is already linked to another Riplect account.",
            conflict: { kind: "email" as const, masked: maskEmail(googleEmail) },
          });
        }
      }

      // Confirm the user exists, then update auth.users.
      const updated = await queryRows<IdRow>(tx, sql`
        UPDATE auth.users
        SET email = ${googleEmail},
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${userId}::uuid
        RETURNING id
      `);
      if (updated.length === 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "USER_NOT_FOUND" as const,
          error: "Account not found.",
        });
      }

      // INSERT/UPSERT the Google identity row. UPSERT key is the
      // composite unique (provider_id, provider). The pre-check above
      // ran inside this same transaction but a concurrent transaction
      // could still race us between that SELECT and this INSERT.
      // We close that TOCTOU gap by NEVER reassigning user_id on
      // conflict — the WHERE clause restricts the UPDATE to rows that
      // already belong to *this* user. If the conflicting row belongs
      // to anyone else, the UPDATE matches 0 rows and we surface
      // GOOGLE_IDENTITY_TAKEN (no silent identity theft).
      // Note: `email` column is generated from identity_data->>'email'.
      const linked = await queryRows<UserIdRow>(tx, sql`
        INSERT INTO auth.identities
          (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (
          ${verifiedGoogle.sub},
          ${userId}::uuid,
          ${JSON.stringify(identityData)}::jsonb,
          'google',
          now(), now(), now()
        )
        ON CONFLICT (provider_id, provider) DO UPDATE SET
          identity_data = EXCLUDED.identity_data,
          last_sign_in_at = now(),
          updated_at = now()
        WHERE auth.identities.user_id = ${userId}::uuid
        RETURNING user_id
      `);
      if (linked.length === 0) {
        throw new RollbackWith({
          ok: false as const,
          code: "GOOGLE_IDENTITY_TAKEN" as const,
          error: "This Google account is already linked to another Riplect account.",
          conflict: { kind: "email" as const, masked: maskEmail(googleEmail) },
        });
      }

      // Sync auth.identities[provider='email'] (so the email-provider
      // identity row also reflects the new email + verified state).
      await tx.execute(sql`
        INSERT INTO auth.identities
          (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (
          ${userId},
          ${userId}::uuid,
          jsonb_build_object('sub', ${userId}::text, 'email', ${googleEmail}::text, 'email_verified', true, 'phone_verified', true),
          'email',
          now(), now(), now()
        )
        ON CONFLICT (provider_id, provider) DO UPDATE SET
          identity_data = COALESCE(auth.identities.identity_data, '{}'::jsonb)
            || jsonb_build_object('email', ${googleEmail}::text, 'email_verified', true),
          updated_at = now()
      `);

      // Mirror onto profiles when the row already exists. During early
      // onboarding the profile row may not exist yet (it is created at
      // the end of the wizard); in that case skip the mirror here —
      // the email is safely written to auth.users + identities above,
      // and the profile row will pick it up when created at onboarding end.
      const profileMirror = await queryRows<IdRow>(tx, sql`
        UPDATE profiles
        SET email = ${googleEmail}, updated_at = now()
        WHERE id = ${userId}
        RETURNING id
      `);
      if (profileMirror.length === 0) {
        console.warn(
          `[identityLinking] swapEmailViaLinkedGoogleIdentity: no profiles row for ${userId} — ` +
          "email written to auth.users but profile mirror skipped (early onboarding).",
        );
      }

      return { ok: true as const, email: googleEmail };
    });
  } catch (err: any) {
    if (err instanceof RollbackWith) return err.result as SwapEmailResult;
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        code: "EMAIL_TAKEN",
        error: "This email is already linked to another Riplect account.",
        conflict: { kind: "email", masked: maskEmail(googleEmail) },
      };
    }
    console.error("[identityLinking] swapEmailViaLinkedGoogleIdentity failed:", err);
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }
}

/**
 * Get-or-create a phone-only `auth.users` row.
 *
 * Centralizes phone-first auth user provisioning so callers (today: the
 * WhatsApp bot at `server/whatsapp/createBotProfile.ts`) don't have to
 * roll their own race-recovery against `auth.admin.listUsers`. This is
 * the unified-identity counterpart to `attachVerifiedPhoneToCurrentUser`:
 * that helper merges a phone onto an EXISTING signed-in account, this
 * helper creates the row in the first place when no such account exists.
 *
 * Behaviour:
 *   1. Normalize phone to E.164 (returns `INVALID_PHONE` if it doesn't
 *      parse).
 *   2. Direct SQL probe of `auth.users` by phone — if a row already
 *      exists, return `{ created: false, userId }`. This handles the
 *      cold "phone is already an auth user" case without needing the
 *      admin SDK at all, and skips paginated `listUsers()` entirely
 *      (which silently breaks past 1000 users).
 *   3. Otherwise call `supabase.auth.admin.createUser({ phone,
 *      phone_confirm: true })` with NO email — we never mint placeholder
 *      `<phone>@phone.riplek.com` rows. This is the architectural
 *      promise of Task #151.
 *   4. Race recovery: if the create call returns "already exists" (a
 *      concurrent request created the user between our probe and our
 *      insert), re-probe `auth.users` by phone and reuse that id.
 *
 * Does NOT touch the `profiles` table — caller-specific profile
 * defaults (sourceChannel, contact_info, sourceChannel) belong with the
 * caller. The caller should mirror `phone_e164` onto the profile row,
 * mirroring what `attachVerifiedPhoneToCurrentUser` does for the merge
 * path.
 */
export async function createPhoneOnlyUserIfMissing(
  rawPhone: string,
): Promise<CreatePhoneOnlyUserResult> {
  const phoneE164 = normalizeToE164(rawPhone);
  if (!phoneE164) {
    return { ok: false, code: "INVALID_PHONE", error: "Invalid phone number." };
  }
  const phoneNoPlus = phoneE164.replace(/^\+/, "");

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Auth is not configured." };
  }

  // 1. Pre-check: direct SQL probe by phone. Handles the "user already
  // exists, no race" case, and avoids `listUsers()` pagination concerns
  // entirely. Same auth-schema discipline as the rest of this file.
  try {
    const existing = await queryRows<{ id: string }>(db, sql`
      SELECT id::text AS id FROM auth.users
      WHERE phone = ${phoneNoPlus} OR phone = ${phoneE164}
      LIMIT 1
    `);
    if (existing.length > 0) {
      return { ok: true, userId: existing[0].id, phoneE164, created: false };
    }
  } catch (err: any) {
    console.error(
      "[identityLinking] createPhoneOnlyUserIfMissing pre-check failed:",
      err?.message ?? err,
    );
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }

  // 2. Phone-only auth user creation via the admin SDK. NO email field.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    phone: phoneE164,
    phone_confirm: true,
  });
  if (!error && data?.user?.id) {
    return { ok: true, userId: data.user.id, phoneE164, created: true };
  }

  // 3. Race recovery: re-probe auth.users by phone (NOT listUsers).
  const isAlreadyExists =
    (error as any)?.status === 422 ||
    /already|registered|exists/i.test(error?.message ?? "");
  if (isAlreadyExists) {
    try {
      const recovered = await queryRows<{ id: string }>(db, sql`
        SELECT id::text AS id FROM auth.users
        WHERE phone = ${phoneNoPlus} OR phone = ${phoneE164}
        LIMIT 1
      `);
      if (recovered.length > 0) {
        return { ok: true, userId: recovered[0].id, phoneE164, created: false };
      }
    } catch (err: any) {
      console.error(
        "[identityLinking] createPhoneOnlyUserIfMissing race-recovery failed:",
        err?.message ?? err,
      );
      return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
    }
  }

  return {
    ok: false,
    code: "AUTH_CREATE_FAILED",
    error: error?.message ?? "Failed to create auth user.",
  };
}

export type CreatePhoneAndEmailUserResult =
  | {
      ok: true;
      userId: string;
      phoneE164: string;
      email: string;
      /** True iff this call actually created a fresh auth.users row.
       *  False means an existing row owned by this phone OR this email
       *  was returned (cold reuse OR race-recovered after a 422). */
      created: boolean;
    }
  | {
      ok: false;
      code:
        | "INVALID_PHONE"
        | "INVALID_EMAIL"
        | "EMAIL_TAKEN"
        | "PHONE_TAKEN_DIFFERENT_EMAIL"
        | "NOT_CONFIGURED"
        | "DB_ERROR"
        | "AUTH_CREATE_FAILED";
      error: string;
      conflict?: ConflictHint;
    };

/**
 * Get-or-create an auth.users row carrying both a verified phone AND
 * an unverified email. Used by the WhatsApp bot signup path: the bot
 * collected both credentials in chat and we want to provision an
 * auth.users row that the user can sign into via the magic link we'll
 * send to that email — without minting a phone-placeholder email.
 *
 * Behaviour:
 *   1. Validate phone (E.164) and email format.
 *   2. Pre-check by phone — if a row exists, accept it ONLY if its
 *      email matches `email` (or is currently NULL). A mismatched
 *      email means the same human signed up earlier with a different
 *      address; surface PHONE_TAKEN_DIFFERENT_EMAIL so the bot can
 *      route to a "you already have an account" recovery flow.
 *   3. Pre-check by email — if a different auth.users row owns this
 *      email, surface EMAIL_TAKEN.
 *   4. Otherwise call admin.createUser({ phone, email, phone_confirm:
 *      true, email_confirm: false }). Race-recover on duplicate.
 *
 * Phone is marked verified (`phone_confirm: true`) because the bot only
 * messages users who already proved possession of the phone via
 * WhatsApp. Email is intentionally left unconfirmed — verification
 * authority lives in `profiles.email_verified_at`, set later by the
 * `/whatsapp-verify` flow.
 */
export async function createPhoneAndEmailUserIfMissing(
  rawPhone: string,
  rawEmail: string,
): Promise<CreatePhoneAndEmailUserResult> {
  const phoneE164 = normalizeToE164(rawPhone);
  if (!phoneE164) {
    return { ok: false, code: "INVALID_PHONE", error: "Invalid phone number." };
  }
  const phoneNoPlus = phoneE164.replace(/^\+/, "");

  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, code: "INVALID_EMAIL", error: "Invalid email address." };
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Auth is not configured." };
  }

  // 1. Pre-check by phone.
  try {
    const byPhone = await queryRows<{ id: string; email: string | null }>(db, sql`
      SELECT id::text AS id, email FROM auth.users
      WHERE phone = ${phoneNoPlus} OR phone = ${phoneE164}
      LIMIT 1
    `);
    if (byPhone.length > 0) {
      const existingEmail = (byPhone[0].email ?? "").toLowerCase();
      if (!existingEmail) {
        // Phone-only row from a prior bot signup that didn't capture
        // an email. Patch in the email so future emails go to it, but
        // leave email_confirmed_at NULL.
        await db.execute(sql`
          UPDATE auth.users
          SET email = ${email}, updated_at = now()
          WHERE id = ${byPhone[0].id}::uuid
        `);
        return { ok: true, userId: byPhone[0].id, phoneE164, email, created: false };
      }
      if (existingEmail === email) {
        return { ok: true, userId: byPhone[0].id, phoneE164, email, created: false };
      }
      return {
        ok: false,
        code: "PHONE_TAKEN_DIFFERENT_EMAIL",
        error:
          "This phone is already linked to a different email. Please use the email on file or contact support.",
        conflict: { kind: "email", masked: maskEmail(existingEmail) },
      };
    }
  } catch (err: any) {
    console.error(
      "[identityLinking] createPhoneAndEmailUserIfMissing phone pre-check failed:",
      err?.message ?? err,
    );
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }

  // 2. Pre-check by email — refuse to create if a different user owns it.
  try {
    const byEmail = await queryRows<IdRow>(db, sql`
      SELECT id::text AS id FROM auth.users
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `);
    if (byEmail.length > 0) {
      return {
        ok: false,
        code: "EMAIL_TAKEN",
        error: "This email is already linked to another Riplect account.",
        conflict: { kind: "email", masked: maskEmail(email) },
      };
    }
  } catch (err: any) {
    console.error(
      "[identityLinking] createPhoneAndEmailUserIfMissing email pre-check failed:",
      err?.message ?? err,
    );
    return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
  }

  // 3. Create both credentials in one shot. Phone is marked verified;
  // email is intentionally NOT marked verified (truth-source for that
  // is profiles.email_verified_at, set by the /whatsapp-verify flow).
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    phone: phoneE164,
    email,
    phone_confirm: true,
    email_confirm: false,
  });
  if (!error && data?.user?.id) {
    return { ok: true, userId: data.user.id, phoneE164, email, created: true };
  }

  // 4. Race recovery.
  const isAlreadyExists =
    (error as any)?.status === 422 ||
    /already|registered|exists/i.test(error?.message ?? "");
  if (isAlreadyExists) {
    try {
      const recovered = await queryRows<{ id: string; email: string | null }>(db, sql`
        SELECT id::text AS id, email FROM auth.users
        WHERE phone = ${phoneNoPlus} OR phone = ${phoneE164} OR LOWER(email) = ${email}
        LIMIT 1
      `);
      if (recovered.length > 0) {
        const recoveredEmail = (recovered[0].email ?? "").toLowerCase();
        if (recoveredEmail && recoveredEmail !== email) {
          return {
            ok: false,
            code: "PHONE_TAKEN_DIFFERENT_EMAIL",
            error:
              "This phone is already linked to a different email. Please use the email on file or contact support.",
            conflict: { kind: "email", masked: maskEmail(recoveredEmail) },
          };
        }
        return { ok: true, userId: recovered[0].id, phoneE164, email, created: false };
      }
    } catch (err: any) {
      console.error(
        "[identityLinking] createPhoneAndEmailUserIfMissing race-recovery failed:",
        err?.message ?? err,
      );
      return { ok: false, code: "DB_ERROR", error: err?.message ?? "Database error." };
    }
  }

  return {
    ok: false,
    code: "AUTH_CREATE_FAILED",
    error: error?.message ?? "Failed to create auth user.",
  };
}

// ── Schema-drift guard ────────────────────────────────────────────────
//
// We rely on specific columns in Supabase's `auth.users` and
// `auth.identities` tables (see the rationale block at the top of this
// file). If Supabase ships a breaking change to that schema, we want to
// surface it as a loud startup error rather than corrupt user records.
// `verifyAuthSchemaCompat()` is invoked once at server boot from
// `server/index.ts`; in production a missing column throws and prevents
// the process from starting. In dev/test we log a warning so the rest
// of the app still boots and the test runner can surface the failure.

const REQUIRED_AUTH_USERS_COLUMNS = [
  "id",
  "email",
  "encrypted_password",
  "phone",
  "phone_confirmed_at",
  "email_confirmed_at",
  "updated_at",
] as const;

const REQUIRED_AUTH_IDENTITIES_COLUMNS = [
  "id",
  "provider_id",
  "provider",
  "user_id",
  "identity_data",
  "last_sign_in_at",
  "created_at",
  "updated_at",
] as const;

interface ColumnRow { column_name: string }

export interface SchemaCompatReport {
  ok: boolean;
  missing: { table: string; column: string }[];
}

export async function verifyAuthSchemaCompat(): Promise<SchemaCompatReport> {
  const missing: { table: string; column: string }[] = [];

  const usersCols = await queryRows<ColumnRow>(db, sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users'
  `);
  const usersSet = new Set(usersCols.map((r) => r.column_name));
  for (const col of REQUIRED_AUTH_USERS_COLUMNS) {
    if (!usersSet.has(col)) missing.push({ table: "auth.users", column: col });
  }

  const identCols = await queryRows<ColumnRow>(db, sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
  `);
  const identSet = new Set(identCols.map((r) => r.column_name));
  for (const col of REQUIRED_AUTH_IDENTITIES_COLUMNS) {
    if (!identSet.has(col)) missing.push({ table: "auth.identities", column: col });
  }

  return { ok: missing.length === 0, missing };
}
