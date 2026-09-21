-- Convert events.start_at / events.end_at / event_series.generated_until from
-- TIMESTAMP WITHOUT TIME ZONE to TIMESTAMPTZ.
--
-- Why:
--   `timestamp` drops any offset on write, leaving a naked wall-clock in the
--   column. Today this works because postgres-js, the Node host, and the PG
--   session all happen to interpret that wall-clock as UTC. Any one of those
--   assumptions changing (Supabase TZ default flip, region migration,
--   non-IST creator, raw SQL with implicit cast, deploy under a different
--   TZ) shifts every event by hours. `timestamptz` stores a real UTC instant;
--   the display TZ is resolved at render time.
--
-- Wall-clock interpretation:
--   Verified empirically against the production dashboard: existing
--   wall-clocks are UTC. Example: event id=723 "Sound Bath" stored as
--   2026-05-05 17:00:00, dashboard shows 10:30 PM IST. 17:00 UTC + 05:30 =
--   22:30 IST = 10:30 PM. So the USING clause interprets the existing
--   wall-clock as UTC and promotes it to a timestamptz instant — preserving
--   the same absolute moment the dashboard currently renders.
--
-- BEFORE RUNNING THIS MIGRATION, sanity-check by re-running:
--
--   SELECT id, title, start_at AS raw_wallclock,
--          (start_at AT TIME ZONE 'UTC')          AS if_wallclock_is_utc,
--          (start_at AT TIME ZONE 'Asia/Kolkata') AS if_wallclock_is_ist
--   FROM events
--   ORDER BY created_at DESC
--   LIMIT 5;
--
-- Then open any one of those rows on the dashboard. The IST time displayed
-- there should match `if_wallclock_is_utc` rendered in IST (Supabase shows
-- timestamptz in IST in the SQL editor). For Sound Bath that's 10:30 PM IST.

BEGIN;

ALTER TABLE "events"
  ALTER COLUMN "start_at" TYPE timestamptz USING "start_at" AT TIME ZONE 'UTC';

ALTER TABLE "events"
  ALTER COLUMN "end_at" TYPE timestamptz USING "end_at" AT TIME ZONE 'UTC';

ALTER TABLE "event_series"
  ALTER COLUMN "generated_until" TYPE timestamptz USING "generated_until" AT TIME ZONE 'UTC';

COMMIT;

-- Rollback (in case anything looks off after deploy):
-- The inverse cast preserves the absolute instant by re-projecting back into
-- the UTC wall-clock the column held before migration.
--
--   BEGIN;
--   ALTER TABLE "events" ALTER COLUMN "start_at" TYPE timestamp
--     USING ("start_at" AT TIME ZONE 'UTC');
--   ALTER TABLE "events" ALTER COLUMN "end_at" TYPE timestamp
--     USING ("end_at" AT TIME ZONE 'UTC');
--   ALTER TABLE "event_series" ALTER COLUMN "generated_until" TYPE timestamp
--     USING ("generated_until" AT TIME ZONE 'UTC');
--   COMMIT;
