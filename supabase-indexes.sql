-- Performance indexes: add profile_id (and event_id) indexes to the five core tables
-- that power dashboard queries. All statements use IF NOT EXISTS so this script is
-- safe to re-run at any time without error.
--
-- Paste this entire block into the Supabase SQL editor and click Run.

CREATE INDEX IF NOT EXISTS idx_locations_profile_id
  ON locations (profile_id);

CREATE INDEX IF NOT EXISTS idx_events_profile_id
  ON events (profile_id);

CREATE INDEX IF NOT EXISTS idx_booking_sessions_profile_id
  ON booking_sessions (profile_id);

CREATE INDEX IF NOT EXISTS idx_bookings_profile_id
  ON bookings (profile_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_profile_id
  ON event_registrations (profile_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id
  ON event_registrations (event_id);
