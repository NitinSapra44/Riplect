/**
 * One-off DDL migration for the WhatsApp email-verification flow.
 *
 * Run with: npx tsx scripts/migrations/2026-05-12-whatsapp-email-verification.ts
 *
 * Applies to Supabase (the project's only database) via SUPABASE_DATABASE_URL.
 * Idempotent — safe to run multiple times.
 *
 * Adds:
 *   1. profiles.email_verified_at (timestamptz, nullable, no default)
 *      Truth-source for "this user has proven ownership of profiles.email."
 *      Magic-link sign-in does NOT set this column; only the OTP/Google
 *      verification path does.
 *
 *   2. email_otp_verifications (parallel to phone_verifications)
 *      6-digit OTPs hashed with SHA-256, single-use, 10-minute TTL,
 *      per-row attempt counter. user_id references auth.users(id) with
 *      ON DELETE CASCADE so an account deletion cleans these up.
 */
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  console.error("SUPABASE_DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 2 });

async function main() {
  console.log("[migration] connecting to Supabase…");

  console.log("[migration] adding profiles.email_verified_at …");
  await sql.unsafe(`
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz
  `);

  console.log("[migration] creating email_otp_verifications …");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.email_otp_verifications (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      email       varchar NOT NULL,
      code_hash   text NOT NULL,
      attempts    integer NOT NULL DEFAULT 0,
      consumed_at timestamptz,
      expires_at  timestamptz NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS email_otp_verifications_user_email_created_idx
      ON public.email_otp_verifications (user_id, email, created_at DESC)
  `);

  console.log("[migration] verifying …");
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'profiles' AND column_name = 'email_verified_at')
        OR (table_name = 'email_otp_verifications'))
    ORDER BY table_name, ordinal_position
  `;
  console.table(cols);

  const fk = await sql`
    SELECT tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'email_otp_verifications'
      AND tc.constraint_type = 'FOREIGN KEY'
  `;
  console.table(fk);

  console.log("[migration] done.");
  await sql.end();
}

main().catch(async (err) => {
  console.error("[migration] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
