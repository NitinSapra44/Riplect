import { db } from "../backend/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    const r = await db.execute(sql`SELECT crypt('test', gen_salt('bf', 10)) AS hash`);
    console.log("pgcrypto OK:", (r as any[])[0]);
  } catch (err: any) {
    console.error("pgcrypto FAIL:", err.message);
  }

  try {
    const r = await db.execute(sql`
      SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')
    `);
    console.log("Extensions:", r);
  } catch (err: any) {
    console.error(err);
  }

  // Check auth.users columns we care about
  const cols = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='auth' AND table_name='users'
      AND column_name IN ('email', 'encrypted_password', 'email_confirmed_at', 'confirmed_at', 'updated_at', 'phone', 'phone_confirmed_at')
  `);
  console.log("auth.users key columns:", cols);

  process.exit(0);
}
main();
