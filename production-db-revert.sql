-- ============================================================
-- PRODUCTION DB REVERT — Restore values that prod had right
-- These were wrongly overwritten by matching to a stale dev DB.
-- The Drizzle schema (shared/schema.ts) confirms prod was correct.
-- ============================================================

-- 1. Restore profiles.timezone default to 'Asia/Kolkata'
--    (App is India-focused: agent uses ₹ INR + Asia/Kolkata everywhere)
ALTER TABLE profiles ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';

-- 2. Restore bookings.status default to 'pending'
--    (Schema: .default("pending"); code at routes.ts:5827 explicitly relies on
--     bookings starting as 'pending' until coach confirms)
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';

-- 3. Restore events.start_at NOT NULL (Schema: .notNull())
--    Already verified: 0 rows have NULL start_at
ALTER TABLE events ALTER COLUMN start_at SET NOT NULL;

-- 4. Restore bookings.confirmation_code UNIQUE constraint (Schema: .unique())
--    Already verified: 0 duplicate confirmation codes
ALTER TABLE bookings
  ADD CONSTRAINT bookings_confirmation_code_unique UNIQUE (confirmation_code);

-- 5. Restore digital_product_purchases.access_token full UNIQUE
--    (Schema: .unique() without WHERE clause)
DROP INDEX IF EXISTS uq_digital_product_purchases_access_token;
ALTER TABLE digital_product_purchases
  ADD CONSTRAINT digital_product_purchases_access_token_unique UNIQUE (access_token);

-- 6. Restore FK constraints I dropped (schema defines them, dev was missing them)
--    Already verified: 0 orphaned rows for all 4 FKs

ALTER TABLE events
  ADD CONSTRAINT events_location_id_locations_id_fk
    FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE events
  ADD CONSTRAINT events_series_id_event_series_id_fk
    FOREIGN KEY (series_id) REFERENCES event_series(id);

ALTER TABLE booking_sessions
  ADD CONSTRAINT booking_sessions_location_id_locations_id_fk
    FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE digital_product_purchases
  ADD CONSTRAINT digital_product_purchases_guest_profile_id_guest_profiles_id_fk
    FOREIGN KEY (guest_profile_id) REFERENCES guest_profiles(id);
