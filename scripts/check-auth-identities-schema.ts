import { db } from "../backend/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
    ORDER BY ordinal_position
  `);
  console.log("auth.identities columns:");
  for (const row of r as any[]) {
    console.log(` ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
  }
  const c = await db.execute(sql`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'auth.identities'::regclass
  `);
  console.log("\nauth.identities constraints:");
  for (const row of c as any[]) {
    console.log(` ${row.conname}: ${row.def}`);
  }
  process.exit(0);
}
main();
