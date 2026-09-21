import { db } from "../backend/db";
import { sql } from "drizzle-orm";

async function main() {
  const rows = await db.execute(sql`
    SELECT provider, provider_id, identity_data, email
    FROM auth.identities
    LIMIT 5
  `);
  for (const r of rows as any[]) {
    console.log(JSON.stringify(r, null, 2));
    console.log("---");
  }
  process.exit(0);
}
main();
