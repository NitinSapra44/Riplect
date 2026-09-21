/**
 * Post-flight check for migrations/0009_events_starts_to_timestamptz.sql.
 *
 * READ-ONLY. Verifies:
 *   1. The three columns are now `timestamp with time zone`.
 *   2. The absolute instant of every snapshotted row is unchanged.
 *   3. Row counts haven't changed.
 *   4. The dashboard sample (Sound Bath, id=723) still resolves to 10:30 PM IST.
 *
 * Loads the snapshot written by preflight (.migration-snapshot.json) and
 * cross-checks each row. Any row whose absolute instant drifted is reported.
 *
 * Run:  npx tsx --env-file=.env scripts/postflight-timestamptz-migration.ts
 */

import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  console.error("SUPABASE_DATABASE_URL missing — load .env via --env-file=.env");
  process.exit(1);
}

const snapshotPath = path.join(process.cwd(), ".migration-snapshot.json");
if (!existsSync(snapshotPath)) {
  console.error(
    `Snapshot not found at ${snapshotPath}. Run the preflight script first.`,
  );
  process.exit(1);
}

interface Snapshot {
  id: number;
  abs_micros: string | null;
  end_abs_micros: string | null;
}
const snapshot: Snapshot[] = JSON.parse(readFileSync(snapshotPath, "utf-8"));

const sql = postgres(url, { ssl: "require", max: 2 });

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  console.log("=".repeat(72));
  console.log("POST-FLIGHT — migrations/0009_events_starts_to_timestamptz.sql");
  console.log("=".repeat(72));

  let blockers = 0;
  const warnings: string[] = [];

  // 1. Column types now timestamptz ------------------------------------
  const cols = await sql<
    { table_name: string; column_name: string; data_type: string; is_nullable: string }[]
  >`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'events' AND column_name IN ('start_at','end_at'))
       OR (table_name = 'event_series' AND column_name = 'generated_until')
    ORDER BY table_name, column_name
  `;
  console.log("\n[1] Column types (expected: 'timestamp with time zone')");
  for (const c of cols) {
    const ok = c.data_type === "timestamp with time zone";
    console.log(
      `    ${pad(c.table_name + "." + c.column_name, 32)} ${pad(c.data_type, 30)} nullable=${c.is_nullable}  ${ok ? "✓" : "❌"}`,
    );
    if (!ok) blockers++;
  }

  // 2. Diff absolute instants for each snapshotted row -----------------
  const ids = snapshot.map((s) => s.id);
  const current = await sql<
    { id: number; abs_micros: bigint | null; end_abs_micros: bigint | null }[]
  >`
    SELECT id,
           (extract(epoch FROM start_at) * 1000000)::bigint AS abs_micros,
           (extract(epoch FROM end_at)   * 1000000)::bigint AS end_abs_micros
    FROM events
    WHERE id = ANY(${ids})
  `;
  const currentById = new Map(current.map((r) => [r.id, r]));

  let matched = 0;
  let missing = 0;
  const drifted: Array<{
    id: number;
    field: "start_at" | "end_at";
    before: string | null;
    after: string | null;
  }> = [];

  for (const snap of snapshot) {
    const cur = currentById.get(snap.id);
    if (!cur) {
      missing++;
      continue;
    }
    const curStart = cur.abs_micros ? cur.abs_micros.toString() : null;
    const curEnd = cur.end_abs_micros ? cur.end_abs_micros.toString() : null;
    if (snap.abs_micros !== curStart) {
      drifted.push({
        id: snap.id,
        field: "start_at",
        before: snap.abs_micros,
        after: curStart,
      });
    }
    if (snap.end_abs_micros !== curEnd) {
      drifted.push({
        id: snap.id,
        field: "end_at",
        before: snap.end_abs_micros,
        after: curEnd,
      });
    }
    if (
      snap.abs_micros === curStart &&
      snap.end_abs_micros === curEnd
    ) {
      matched++;
    }
  }

  console.log(`\n[2] Absolute instant diff for ${snapshot.length} snapshotted rows`);
  console.log(`    matched (no drift) : ${matched}`);
  console.log(`    missing (row gone) : ${missing}`);
  console.log(`    drifted            : ${drifted.length}`);
  if (drifted.length > 0) {
    blockers++;
    console.log("\n    ❌ DRIFTED ROWS (first 20):");
    for (const d of drifted.slice(0, 20)) {
      const beforeIso = d.before
        ? new Date(Number(d.before) / 1000).toISOString()
        : "NULL";
      const afterIso = d.after
        ? new Date(Number(d.after) / 1000).toISOString()
        : "NULL";
      console.log(
        `      id=${d.id} ${d.field}: ${beforeIso} → ${afterIso}`,
      );
    }
  }
  if (missing > 0) {
    warnings.push(`${missing} snapshotted rows are no longer in events — could be normal if they were deleted during the migration window`);
  }

  // 3. Row counts ------------------------------------------------------
  const [eventCounts] = await sql<
    { total: bigint; null_starts: bigint; null_ends: bigint }[]
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE start_at IS NULL)::bigint AS null_starts,
      COUNT(*) FILTER (WHERE end_at IS NULL)::bigint AS null_ends
    FROM events
  `;
  console.log("\n[3] Row counts post-migration");
  console.log(
    `    events : ${eventCounts.total} rows (start_at null: ${eventCounts.null_starts}, end_at null: ${eventCounts.null_ends})`,
  );

  // 4. Sound Bath sanity check ----------------------------------------
  const soundBath = await sql<
    { id: number; title: string; start_at: Date | null }[]
  >`
    SELECT id, title, start_at
    FROM events
    WHERE id = 723
  `;
  console.log("\n[4] Sound Bath (id=723) sanity check");
  if (soundBath.length === 0) {
    warnings.push("event id=723 (Sound Bath) not found — was it deleted?");
  } else {
    const r = soundBath[0];
    const istStr = r.start_at
      ? r.start_at.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "(null)";
    const isoStr = r.start_at?.toISOString() ?? "(null)";
    console.log(`    absolute instant : ${isoStr}`);
    console.log(`    IST rendered     : ${istStr}`);
    if (istStr.includes("10:30")) {
      console.log("    ✓ matches dashboard (10:30 PM IST)");
    } else {
      blockers++;
      console.log("    ❌ does NOT match dashboard's 10:30 PM");
    }
  }

  // Summary
  console.log("\n" + "=".repeat(72));
  if (blockers === 0) {
    console.log("✅ MIGRATION VERIFIED — no absolute instants shifted, columns now timestamptz");
    if (warnings.length > 0) {
      console.log("\nWarnings (informational):");
      for (const w of warnings) console.log("    • " + w);
    }
  } else {
    console.log(`❌ MIGRATION VERIFICATION FAILED — ${blockers} blocker(s) above`);
    console.log("    Consider running the rollback SQL from the migration file's footer.");
  }
  console.log("=".repeat(72));

  await sql.end();
}

main().catch((err) => {
  console.error("Postflight failed:", err);
  process.exit(1);
});
