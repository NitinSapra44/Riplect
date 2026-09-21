/**
 * One-shot backfill that adds structured location data to records the
 * WhatsApp bot created before the location-stamping fix landed.
 *
 * Background:
 *   The homepage city filter requires structured city/state/country, which it
 *   reads from `profiles.searchable_location` (coaches) and from a `locations`
 *   row joined via `events.location_id` / `booking_sessions.location_id`
 *   (events + sessions). Bot tools historically wrote only the free-text
 *   `events.location` and never touched `searchable_location` or `location_id`,
 *   so bot-created records were invisible to the filter (default city:
 *   Dharamshala). The bot side has been patched in
 *   `server/agent/tools/{createProfile,createEvent,createRecurringEvent,createSession}.ts`;
 *   this script retroactively fixes existing rows.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Profiles: sets `searchable_location` = "Dharamshala, Himachal Pradesh,
 *      India" on every bot-onboarded profile whose value is currently empty.
 *   2. Single events: inserts one `locations` row per event (name = the
 *      free-text venue, falling back to "Event Location"), sets `location_id`.
 *   3. Recurring events: groups instances by `series_id`, inserts ONE
 *      `locations` row per series, sets `location_id` on every instance.
 *   4. Sessions: for each coach with sessions missing `location_id`, finds-or-
 *      creates the coach's Dharamshala row (matching the runtime helper in
 *      createSession.ts) and links every such session to it.
 *
 * Scope:
 *   Bot-channel profiles are `source_channel IN ('whatsapp', 'whatsapp_cm')`.
 *   Rows already linked to a `locations` row (location_id IS NOT NULL) are
 *   skipped unconditionally — we never overwrite a real linkage.
 *
 * Usage:
 *   tsx scripts/backfill-bot-locations.ts [--dry-run]
 *
 * Recommended rollout:
 *   - Run with `--dry-run` against staging, eyeball the preview counts.
 *   - Run for real against staging, verify the post-run consistency block.
 *   - Repeat against production.
 */

import { sql, type SQL } from "drizzle-orm";
import { db } from "../backend/db";
import {
  BOT_DEFAULT_CITY,
  BOT_DEFAULT_STATE,
  BOT_DEFAULT_COUNTRY,
  BOT_DEFAULT_SEARCHABLE_LOCATION,
} from "../backend/agent/tools/botLocationDefaults";

const DRY_RUN = process.argv.includes("--dry-run");
const BOT_CHANNELS = ["whatsapp", "whatsapp_cm"];
// Pre-expanded SQL fragment for use inside `IN (...)` — drizzle binds JS
// arrays as records, which Postgres can't cast to text[], so we splice the
// values in one-by-one via sql.join.
const BOT_CHANNELS_SQL = sql.join(
  BOT_CHANNELS.map((c) => sql`${c}`),
  sql`, `,
);

interface ExecResult<TRow> extends Array<TRow> {
  count: number;
}

async function execRows<TRow extends Record<string, unknown>>(
  query: SQL,
): Promise<ExecResult<TRow>> {
  return (await db.execute<TRow>(query)) as unknown as ExecResult<TRow>;
}

const toNum = (v: number | string | undefined | null): number =>
  typeof v === "number" ? v : Number(v ?? 0);

async function backfillProfiles(): Promise<number> {
  const previewRows = await execRows<{ pending: number | string }>(sql`
    SELECT COUNT(*) AS pending
    FROM profiles
    WHERE source_channel IN (${BOT_CHANNELS_SQL})
      AND (searchable_location IS NULL OR searchable_location = '')
  `);
  const pending = toNum(previewRows[0]?.pending);
  console.log(`[backfill-bot-locations] profiles: ${pending} pending`);

  if (DRY_RUN || pending === 0) return 0;

  const result = await execRows(sql`
    UPDATE profiles
    SET searchable_location = ${BOT_DEFAULT_SEARCHABLE_LOCATION},
        updated_at = NOW()
    WHERE source_channel IN (${BOT_CHANNELS_SQL})
      AND (searchable_location IS NULL OR searchable_location = '')
  `);
  console.log(`[backfill-bot-locations] profiles: updated ${result.count}`);
  return result.count;
}

async function backfillSingleEvents(): Promise<number> {
  // Non-recurring events only — recurring ones share a single row per series
  // and are handled in backfillRecurringEvents below.
  const rows = await execRows<{
    id: number;
    profile_id: string;
    location: string | null;
    location_url: string | null;
  }>(sql`
    SELECT e.id, e.profile_id, e.location, e.location_url
    FROM events e
    JOIN profiles p ON e.profile_id = p.id
    WHERE p.source_channel IN (${BOT_CHANNELS_SQL})
      AND e.location_id IS NULL
      AND e.series_id IS NULL
    ORDER BY e.id
  `);
  console.log(`[backfill-bot-locations] single events: ${rows.length} pending`);

  if (DRY_RUN || rows.length === 0) return 0;

  let updated = 0;
  for (const row of rows) {
    const name =
      row.location && row.location.trim().length > 0
        ? row.location
        : "Event Location";
    // CTE so the insert + update happens atomically per event without a
    // round-trip to JS to capture the new id.
    await execRows(sql`
      WITH new_loc AS (
        INSERT INTO locations (
          profile_id, name, city, state, country, google_maps_url, is_default
        )
        VALUES (
          ${row.profile_id}, ${name}, ${BOT_DEFAULT_CITY},
          ${BOT_DEFAULT_STATE}, ${BOT_DEFAULT_COUNTRY},
          ${row.location_url}, FALSE
        )
        RETURNING id
      )
      UPDATE events
      SET location_id = (SELECT id FROM new_loc),
          updated_at = NOW()
      WHERE id = ${row.id}
    `);
    updated++;
  }
  console.log(`[backfill-bot-locations] single events: updated ${updated}`);
  return updated;
}

async function backfillRecurringEvents(): Promise<number> {
  // One representative row per series — use the instance with the lowest
  // sequence_number (or earliest start_at as a tiebreak) as the venue source,
  // so the new locations row gets the same name the series was originally
  // created with.
  const seriesRows = await execRows<{
    series_id: number;
    profile_id: string;
    location: string | null;
    location_url: string | null;
    instance_count: number | string;
  }>(sql`
    WITH bot_series AS (
      SELECT DISTINCT e.series_id
      FROM events e
      JOIN profiles p ON e.profile_id = p.id
      WHERE p.source_channel IN (${BOT_CHANNELS_SQL})
        AND e.location_id IS NULL
        AND e.series_id IS NOT NULL
    ),
    representative AS (
      SELECT DISTINCT ON (e.series_id)
        e.series_id,
        e.profile_id,
        e.location,
        e.location_url
      FROM events e
      JOIN bot_series bs ON bs.series_id = e.series_id
      ORDER BY e.series_id,
               COALESCE(e.sequence_number, 0) ASC,
               e.start_at ASC
    )
    SELECT
      r.series_id,
      r.profile_id,
      r.location,
      r.location_url,
      (SELECT COUNT(*) FROM events e2
         WHERE e2.series_id = r.series_id
           AND e2.location_id IS NULL) AS instance_count
    FROM representative r
    ORDER BY r.series_id
  `);
  console.log(
    `[backfill-bot-locations] recurring series: ${seriesRows.length} pending`,
  );

  if (DRY_RUN || seriesRows.length === 0) return 0;

  let totalInstancesUpdated = 0;
  for (const row of seriesRows) {
    const name =
      row.location && row.location.trim().length > 0
        ? row.location
        : "Event Location";
    const result = await execRows(sql`
      WITH new_loc AS (
        INSERT INTO locations (
          profile_id, name, city, state, country, google_maps_url, is_default
        )
        VALUES (
          ${row.profile_id}, ${name}, ${BOT_DEFAULT_CITY},
          ${BOT_DEFAULT_STATE}, ${BOT_DEFAULT_COUNTRY},
          ${row.location_url}, FALSE
        )
        RETURNING id
      )
      UPDATE events
      SET location_id = (SELECT id FROM new_loc),
          updated_at = NOW()
      WHERE series_id = ${row.series_id}
        AND location_id IS NULL
    `);
    totalInstancesUpdated += result.count;
  }
  console.log(
    `[backfill-bot-locations] recurring series: ${seriesRows.length} new location rows, ${totalInstancesUpdated} instance(s) linked`,
  );
  return totalInstancesUpdated;
}

async function backfillSessions(): Promise<number> {
  // Group by profile_id — every session of a given coach shares ONE
  // coach-level Dharamshala row. Mirrors getOrCreateCoachBotLocation in
  // server/agent/tools/createSession.ts.
  const profiles = await execRows<{
    profile_id: string;
    session_count: number | string;
  }>(sql`
    SELECT bs.profile_id, COUNT(*) AS session_count
    FROM booking_sessions bs
    JOIN profiles p ON bs.profile_id = p.id
    WHERE p.source_channel IN (${BOT_CHANNELS_SQL})
      AND bs.location_id IS NULL
    GROUP BY bs.profile_id
    ORDER BY bs.profile_id
  `);
  console.log(
    `[backfill-bot-locations] sessions: ${profiles.length} coaches, ${profiles.reduce((a, p) => a + toNum(p.session_count), 0)} session(s) pending`,
  );

  if (DRY_RUN || profiles.length === 0) return 0;

  let sessionsUpdated = 0;
  let locationsCreated = 0;
  for (const row of profiles) {
    // Find an existing Dharamshala row for this coach before inserting a new
    // one — keeps the script idempotent if it's re-run after a partial pass,
    // and reuses any row the runtime helper may have already created.
    const existing = await execRows<{ id: number }>(sql`
      SELECT id FROM locations
      WHERE profile_id = ${row.profile_id}
        AND city = ${BOT_DEFAULT_CITY}
      ORDER BY id
      LIMIT 1
    `);
    let locationId: number;
    if (existing[0]) {
      locationId = existing[0].id;
    } else {
      const inserted = await execRows<{ id: number }>(sql`
        INSERT INTO locations (
          profile_id, name, city, state, country, is_default
        )
        VALUES (
          ${row.profile_id}, ${BOT_DEFAULT_CITY}, ${BOT_DEFAULT_CITY},
          ${BOT_DEFAULT_STATE}, ${BOT_DEFAULT_COUNTRY}, FALSE
        )
        RETURNING id
      `);
      locationId = inserted[0].id;
      locationsCreated++;
    }

    const result = await execRows(sql`
      UPDATE booking_sessions
      SET location_id = ${locationId},
          updated_at = NOW()
      WHERE profile_id = ${row.profile_id}
        AND location_id IS NULL
    `);
    sessionsUpdated += result.count;
  }
  console.log(
    `[backfill-bot-locations] sessions: created ${locationsCreated} new location row(s), linked ${sessionsUpdated} session(s)`,
  );
  return sessionsUpdated;
}

async function verify(): Promise<void> {
  const rows = await execRows<{
    profiles_missing: number | string;
    events_missing: number | string;
    sessions_missing: number | string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM profiles
        WHERE source_channel IN (${BOT_CHANNELS_SQL})
          AND (searchable_location IS NULL OR searchable_location = '')
      ) AS profiles_missing,
      (SELECT COUNT(*) FROM events e
        JOIN profiles p ON e.profile_id = p.id
        WHERE p.source_channel IN (${BOT_CHANNELS_SQL})
          AND e.location_id IS NULL
      ) AS events_missing,
      (SELECT COUNT(*) FROM booking_sessions bs
        JOIN profiles p ON bs.profile_id = p.id
        WHERE p.source_channel IN (${BOT_CHANNELS_SQL})
          AND bs.location_id IS NULL
      ) AS sessions_missing
  `);
  const r = rows[0] ?? {
    profiles_missing: 0,
    events_missing: 0,
    sessions_missing: 0,
  };
  console.log("[backfill-bot-locations] Post-backfill check (all should be 0):");
  console.log(`  - profiles missing searchable_location:  ${toNum(r.profiles_missing)}`);
  console.log(`  - bot events missing location_id:        ${toNum(r.events_missing)}`);
  console.log(`  - bot sessions missing location_id:      ${toNum(r.sessions_missing)}`);
}

async function main(): Promise<void> {
  console.log(
    `[backfill-bot-locations] Starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}...`,
  );
  const profilesChanged = await backfillProfiles();
  const singleEventsChanged = await backfillSingleEvents();
  const recurringEventsChanged = await backfillRecurringEvents();
  const sessionsChanged = await backfillSessions();

  if (!DRY_RUN) {
    await verify();
    console.log(
      `[backfill-bot-locations] Done. Profiles ${profilesChanged}, single events ${singleEventsChanged}, recurring event instances ${recurringEventsChanged}, sessions ${sessionsChanged}.`,
    );
  } else {
    console.log("[backfill-bot-locations] Dry run complete — no rows written.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[backfill-bot-locations] FAILED:", err);
    process.exit(1);
  });
