/**
 * One-shot script to apply auth-unification-1-schema.sql to Supabase.
 *
 * Run with: tsx scripts/apply-auth-unification-1-schema.ts
 *
 * The application's `db` client already points at SUPABASE_DATABASE_URL,
 * so this script applies the schema to the same database the running app uses.
 *
 * Safe to re-run: every statement uses IF NOT EXISTS / IF EXISTS guards.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const sqlPath = resolve(process.cwd(), "auth-unification-1-schema.sql");
const sql = readFileSync(sqlPath, "utf8");

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  ssl: "require",
});

async function main() {
  console.log("Applying auth-unification-1-schema.sql to Supabase...");
  await client.unsafe(sql);
  console.log("✔ Schema applied successfully.");

  const checks = await client.unsafe(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'phone_e164'
      ) AS profiles_phone_e164,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'phone_verifications'
      ) AS phone_verifications,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'email_verifications'
      ) AS email_verifications;
  `);
  console.log("Verification:", checks[0]);
}

main()
  .catch((err) => {
    console.error("✘ Schema apply failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
