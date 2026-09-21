/**
 * Pre-flight check for migrations/0009_events_starts_to_timestamptz.sql.
 *
 * READ-ONLY. Runs a battery of SELECTs against the Supabase DB and prints a
 * report so a human can give the migration a green light.
 *
 * Run:  npx tsx --env-file=.env scripts/preflight-timestamptz-migration.ts
 *
 * After the migration is applied, run:
 *   npx tsx --env-file=.env scripts/postflight-timestamptz-migration.ts
 * which compares the captured absolute instants against the new column type.
 */

import postgres from "postgres";
import { writeFileSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  console.error("SUPABASE_DATABASE_URL missing — load .env via --env-file=.env");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 2 });

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  const findings: string[] = [];
  let blockers = 0;

  console.log("=".repeat(72));
  console.log("PRE-FLIGHT — migrations/0009_events_starts_to_timestamptz.sql");
  console.log("=".repeat(72));

  // 1. Server context ---------------------------------------------------
  const [serverTz] = await sql<{ tz: string }[]>`SELECT current_setting('timezone') AS tz`;
  const [pgVersion] = await sql<{ version: string }[]>`SELECT version()`;
  console.log("\n[1] Server context");
  console.log("    PG timezone setting :", serverTz.tz);
  console.log("    PG version          :", pgVersion.version.split(" ").slice(0, 2).join(" "));

  // 2. Current column types AND nullability ----------------------------
  const cols = await sql<
    {
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
    }[]
  >`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'events' AND column_name IN ('start_at','end_at'))
       OR (table_name = 'event_series' AND column_name = 'generated_until')
    ORDER BY table_name, column_name
  `;
  console.log("\n[2] Current column types (expected: 'timestamp without time zone')");
  for (const c of cols) {
    const ok = c.data_type === "timestamp without time zone";
    console.log(
      `    ${pad(c.table_name + "." + c.column_name, 32)} ${pad(c.data_type, 30)} nullable=${c.is_nullable}  ${ok ? "✓" : "⚠"}`,
    );
    if (!ok) {
      blockers++;
      findings.push(`${c.table_name}.${c.column_name} is already ${c.data_type} — migration may already be partly applied`);
    }
  }

  // 3. Row counts and null counts --------------------------------------
  const [eventCounts] = await sql<
    { total: bigint; null_starts: bigint; null_ends: bigint }[]
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE start_at IS NULL)::bigint AS null_starts,
      COUNT(*) FILTER (WHERE end_at IS NULL)::bigint AS null_ends
    FROM events
  `;
  const [seriesCounts] = await sql<
    { total: bigint; null_generated_until: bigint }[]
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE generated_until IS NULL)::bigint AS null_generated_until
    FROM event_series
  `;
  console.log("\n[3] Row counts");
  console.log(`    events                 : ${eventCounts.total} rows (start_at null: ${eventCounts.null_starts}, end_at null: ${eventCounts.null_ends})`);
  console.log(`    event_series           : ${seriesCounts.total} rows (generated_until null: ${seriesCounts.null_generated_until})`);

  const startCol = cols.find(
    (c) => c.table_name === "events" && c.column_name === "start_at",
  );
  if (startCol && startCol.is_nullable === "NO" && Number(eventCounts.null_starts) > 0) {
    blockers++;
    findings.push(
      `events.start_at column is NOT NULL in DB but has ${eventCounts.null_starts} NULL rows — impossible without a constraint exception; investigate before migrating`,
    );
  } else if (Number(eventCounts.null_starts) > 0) {
    findings.push(
      `events.start_at has ${eventCounts.null_starts} NULL rows. The DB column is actually nullable (despite Drizzle declaring .notNull()) — schema/DB drift. The migration handles NULLs fine (NULL AT TIME ZONE returns NULL), but this drift is a separate bug to file.`,
    );
  }

  // 3b. Investigate the NULL rows --------------------------------------
  if (Number(eventCounts.null_starts) > 0) {
    const sampleNulls = await sql<
      {
        id: number;
        title: string | null;
        profile_id: string | null;
        is_active: boolean | null;
        is_cancelled: boolean | null;
        series_id: number | null;
        created_at: Date | null;
      }[]
    >`
      SELECT id, title, profile_id, is_active, is_cancelled, series_id, created_at
      FROM events
      WHERE start_at IS NULL
      ORDER BY created_at DESC NULLS LAST
      LIMIT 10
    `;
    console.log("\n[3b] Sample of events with NULL start_at (first 10)");
    console.log("    id    is_active is_cancelled series_id title");
    for (const r of sampleNulls) {
      console.log(
        "    " +
          pad(String(r.id), 6) +
          pad(String(r.is_active ?? "?"), 10) +
          pad(String(r.is_cancelled ?? "?"), 13) +
          pad(String(r.series_id ?? "—"), 10) +
          (r.title ?? "(no title)"),
      );
    }

    // breakdown
    const [breakdown] = await sql<
      {
        active: bigint;
        inactive: bigint;
        cancelled: bigint;
        from_series: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE is_active IS TRUE)::bigint AS active,
        COUNT(*) FILTER (WHERE is_active IS NOT TRUE)::bigint AS inactive,
        COUNT(*) FILTER (WHERE is_cancelled IS TRUE)::bigint AS cancelled,
        COUNT(*) FILTER (WHERE series_id IS NOT NULL)::bigint AS from_series
      FROM events
      WHERE start_at IS NULL
    `;
    console.log(
      `    breakdown: active=${breakdown.active} inactive=${breakdown.inactive} cancelled=${breakdown.cancelled} from_series=${breakdown.from_series}`,
    );
  }

  // 4. Wall-clock interpretation sample --------------------------------
  const sample = await sql<
    {
      id: number;
      title: string | null;
      raw_wallclock: string | null;
      if_wallclock_is_utc: Date | null;
      if_wallclock_is_ist: Date | null;
    }[]
  >`
    SELECT id, title,
           to_char(start_at, 'YYYY-MM-DD HH24:MI:SS') AS raw_wallclock,
           (start_at AT TIME ZONE 'UTC')          AS if_wallclock_is_utc,
           (start_at AT TIME ZONE 'Asia/Kolkata') AS if_wallclock_is_ist
    FROM events
    WHERE start_at IS NOT NULL
    ORDER BY created_at DESC NULLS LAST
    LIMIT 5
  `;
  console.log("\n[4] Wall-clock interpretation sample (5 most recent events with non-null start_at)");
  console.log("    id   raw_wallclock        if_wallclock_is_utc (UTC)        if_wallclock_is_ist (UTC)");
  for (const r of sample) {
    console.log(
      "    " +
        pad(String(r.id), 5) +
        pad(r.raw_wallclock ?? "", 21) +
        pad(r.if_wallclock_is_utc?.toISOString() ?? "", 33) +
        (r.if_wallclock_is_ist?.toISOString() ?? ""),
    );
  }
  console.log("    → The 'if_wallclock_is_utc' column is the absolute instant the migration");
  console.log("      will preserve. Dashboard renders this in IST.");

  // 5. Snapshot N rows' absolute instants for post-flight comparison ---
  const snapshot = await sql<
    { id: number; abs_micros: bigint | null; end_abs_micros: bigint | null }[]
  >`
    SELECT id,
           (extract(epoch FROM start_at AT TIME ZONE 'UTC') * 1000000)::bigint AS abs_micros,
           (extract(epoch FROM end_at   AT TIME ZONE 'UTC') * 1000000)::bigint AS end_abs_micros
    FROM events
    ORDER BY id DESC
    LIMIT 200
  `;
  const snapshotPath = path.join(process.cwd(), ".migration-snapshot.json");
  writeFileSync(
    snapshotPath,
    JSON.stringify(
      snapshot.map((r) => ({
        id: r.id,
        abs_micros: r.abs_micros ? r.abs_micros.toString() : null,
        end_abs_micros: r.end_abs_micros ? r.end_abs_micros.toString() : null,
      })),
      null,
      2,
    ),
  );
  console.log(`\n[5] Snapshot of ${snapshot.length} events' absolute instants written to ${snapshotPath}`);
  console.log("    Post-flight will diff this against the migrated values.");

  // 6. Indexes ---------------------------------------------------------
  const indexes = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE (tablename = 'events' AND (indexdef LIKE '%start_at%' OR indexdef LIKE '%end_at%'))
       OR (tablename = 'event_series' AND indexdef LIKE '%generated_until%')
  `;
  console.log("\n[6] Indexes touching the affected columns");
  if (indexes.length === 0) {
    console.log("    (none)");
  } else {
    for (const idx of indexes) {
      console.log(`    ${idx.indexname}`);
      console.log(`      ${idx.indexdef}`);
    }
  }

  // 7. Triggers --------------------------------------------------------
  const triggers = await sql<
    { event_object_table: string; trigger_name: string; event_manipulation: string }[]
  >`
    SELECT event_object_table, trigger_name, event_manipulation
    FROM information_schema.triggers
    WHERE event_object_table IN ('events','event_series')
  `;
  console.log("\n[7] Triggers on events / event_series");
  if (triggers.length === 0) {
    console.log("    (none)");
  } else {
    for (const t of triggers) {
      console.log(`    ${t.event_object_table} :: ${t.trigger_name} (${t.event_manipulation})`);
    }
  }

  // 8. Active queries --------------------------------------------------
  const activeTx = await sql<
    { pid: number; state: string; query: string; query_age_seconds: number }[]
  >`
    SELECT pid, state,
           LEFT(query, 100) AS query,
           EXTRACT(EPOCH FROM (NOW() - query_start))::int AS query_age_seconds
    FROM pg_stat_activity
    WHERE state <> 'idle'
      AND datname = current_database()
      AND pid <> pg_backend_pid()
      AND (query ILIKE '%events%' OR query ILIKE '%event_series%')
  `;
  console.log("\n[8] Active queries against events/event_series (other connections)");
  if (activeTx.length === 0) {
    console.log("    (none — ALTER will acquire its lock immediately)");
  } else {
    for (const t of activeTx) {
      console.log(`    pid=${t.pid} state=${t.state} age=${t.query_age_seconds}s — ${t.query}`);
    }
    findings.push(`${activeTx.length} active queries touching the tables — ALTER will wait briefly`);
  }

  // 9. Foreign keys ----------------------------------------------------
  const fks = await sql<
    { table_name: string; constraint_name: string; column_name: string }[]
  >`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (
        (kcu.table_name = 'events' AND kcu.column_name IN ('start_at','end_at'))
        OR (kcu.table_name = 'event_series' AND kcu.column_name = 'generated_until')
      )
  `;
  console.log("\n[9] Foreign keys referencing the affected columns");
  if (fks.length === 0) {
    console.log("    (none)");
  } else {
    for (const f of fks) console.log(`    ${f.table_name}.${f.column_name} via ${f.constraint_name}`);
  }

  // Summary
  console.log("\n" + "=".repeat(72));
  if (blockers === 0) {
    console.log("✅ SAFE TO APPLY — migrations/0009_events_starts_to_timestamptz.sql");
    if (findings.length > 0) {
      console.log("\nCaveats (non-blocking):");
      for (const f of findings) console.log("    • " + f);
    }
  } else {
    console.log(`❌ DO NOT APPLY — ${blockers} blocker(s):`);
    for (const f of findings) console.log("    • " + f);
  }
  console.log("=".repeat(72));

  await sql.end();
}

main().catch((err) => {
  console.error("Preflight failed:", err);
  process.exit(1);
});
