-- Task #179: Full Drizzle ↔ Supabase FK cascade sync + auth deletion trigger
--
-- Context:
--   Migration 0006 applied CASCADE constraints using Drizzle-generated long names
--   (e.g. "booking_sessions_profile_id_profiles_id_fk"). Supabase, however, had
--   already created some constraints with short Postgres names (e.g.
--   "booking_sessions_profile_id_fkey"). The mismatch meant some tables still
--   lacked the correct ON DELETE clause in production, causing FK errors when
--   attempting to delete profiles with associated data.
--
--   This migration:
--   1. Cleans up orphaned FK references FIRST (before re-adding constraints).
--   2. Drops both old long-form Drizzle names and short Postgres names
--      (IF EXISTS on both) and recreates with canonical short names.
--   3. Fixes second-level cascade blockers (tables with no own profile_id FK
--      that sit between profiles and their leaf rows).
--   4. Creates the coach_notifications table if it does not exist, then
--      unconditionally drops and re-adds its FK to guarantee correctness.
--   5. Adds an auth.users AFTER DELETE trigger so that deleting a Supabase
--      auth user automatically cascade-deletes the public.profiles row and
--      all child data — no manual cleanup required.
--   6. Drops the stale duplicate guest_profiles_coach_profile_id_fkey
--      (ON DELETE NO ACTION) superseded by the SET NULL constraint.
--
-- Applied to Supabase: May 2025 (Task #179)

BEGIN;

-- ── Step 0: Orphan cleanup — MUST run before FK constraints are added ──
-- tags.created_by had rows pointing to deleted profiles.
-- Without this cleanup the ADD CONSTRAINT below would fail.
UPDATE tags
  SET created_by = NULL
  WHERE created_by IS NOT NULL
    AND created_by NOT IN (SELECT id FROM profiles);

-- ── Step 1: Re-sync all direct profiles.id FK constraints ──────────────
-- (drops both old long-form Drizzle names and short Postgres names,
--  then creates the canonical short-form constraint)

-- CASCADE tables

ALTER TABLE locations
  DROP CONSTRAINT IF EXISTS locations_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS locations_profile_id_fkey,
  ADD CONSTRAINT locations_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE digital_products
  DROP CONSTRAINT IF EXISTS digital_products_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS digital_products_profile_id_fkey,
  ADD CONSTRAINT digital_products_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE physical_products
  DROP CONSTRAINT IF EXISTS physical_products_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS physical_products_profile_id_fkey,
  ADD CONSTRAINT physical_products_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE blog_posts
  DROP CONSTRAINT IF EXISTS blog_posts_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS blog_posts_profile_id_fkey,
  ADD CONSTRAINT blog_posts_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE event_series
  DROP CONSTRAINT IF EXISTS event_series_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS event_series_profile_id_fkey,
  ADD CONSTRAINT event_series_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS events_profile_id_fkey,
  ADD CONSTRAINT events_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE booking_sessions
  DROP CONSTRAINT IF EXISTS booking_sessions_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS booking_sessions_profile_id_fkey,
  ADD CONSTRAINT booking_sessions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS bookings_profile_id_fkey,
  ADD CONSTRAINT bookings_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE coach_payment_settings
  DROP CONSTRAINT IF EXISTS coach_payment_settings_coach_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS coach_payment_settings_coach_id_fkey,
  ADD CONSTRAINT coach_payment_settings_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS event_registrations_profile_id_fkey,
  ADD CONSTRAINT event_registrations_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE mentor_availability
  DROP CONSTRAINT IF EXISTS mentor_availability_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS mentor_availability_profile_id_fkey,
  ADD CONSTRAINT mentor_availability_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE blocked_dates
  DROP CONSTRAINT IF EXISTS blocked_dates_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS blocked_dates_profile_id_fkey,
  ADD CONSTRAINT blocked_dates_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE stripe_accounts
  DROP CONSTRAINT IF EXISTS stripe_accounts_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS stripe_accounts_profile_id_fkey,
  ADD CONSTRAINT stripe_accounts_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS transactions_profile_id_fkey,
  ADD CONSTRAINT transactions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE payouts
  DROP CONSTRAINT IF EXISTS payouts_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS payouts_profile_id_fkey,
  ADD CONSTRAINT payouts_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE wallet_summaries
  DROP CONSTRAINT IF EXISTS wallet_summaries_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS wallet_summaries_profile_id_fkey,
  ADD CONSTRAINT wallet_summaries_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE profile_tags
  DROP CONSTRAINT IF EXISTS profile_tags_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS profile_tags_profile_id_fkey,
  ADD CONSTRAINT profile_tags_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_profile_id_fkey,
  ADD CONSTRAINT whatsapp_sessions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS push_subscriptions_profile_id_fkey,
  ADD CONSTRAINT push_subscriptions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- SET NULL tables (preserve records after creator account deletion)

ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_buyer_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_buyer_profile_id_fkey,
  ADD CONSTRAINT digital_product_purchases_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Drop stale NO ACTION duplicate before re-adding the correct SET NULL constraint
ALTER TABLE guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_origin_coach_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS guest_profiles_origin_coach_id_fkey,
  DROP CONSTRAINT IF EXISTS guest_profiles_coach_profile_id_fkey,
  ADD CONSTRAINT guest_profiles_origin_coach_id_fkey
    FOREIGN KEY (origin_coach_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE tags
  DROP CONSTRAINT IF EXISTS tags_created_by_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS tags_created_by_fkey,
  ADD CONSTRAINT tags_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── Step 2: coach_notifications — create if missing, then sync FK ──────
-- The table was defined in shared/schema.ts and written to in storage.ts
-- but never existed in Supabase, causing every notification insert to fail.
-- CREATE TABLE IF NOT EXISTS is safe to run on both new and existing DBs.
-- The subsequent ALTER TABLE unconditionally corrects the FK on all envs.

CREATE TABLE IF NOT EXISTS coach_notifications (
  id          serial PRIMARY KEY,
  coach_id    text NOT NULL,
  type        varchar NOT NULL,
  title       varchar NOT NULL,
  body        text NOT NULL,
  metadata    jsonb,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_notifications_coach_idx
  ON coach_notifications(coach_id);

CREATE INDEX IF NOT EXISTS coach_notifications_coach_read_idx
  ON coach_notifications(coach_id, is_read);

CREATE INDEX IF NOT EXISTS coach_notifications_coach_created_at_idx
  ON coach_notifications(coach_id, created_at);

-- Unconditional FK sync — guarantees correct ON DELETE regardless of how the
-- table was previously created (with wrong FK, no FK, or correct FK already).
ALTER TABLE coach_notifications
  DROP CONSTRAINT IF EXISTS coach_notifications_coach_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS coach_notifications_coach_id_fkey,
  ADD CONSTRAINT coach_notifications_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ── Step 3: Second-level cascade blockers ─────────────────────────────
-- These tables have no profile_id of their own, so they sit between the
-- profile cascade and the leaf rows. Without CASCADE here, deleting a
-- profile row would fail when Postgres tries to cascade-delete the parent
-- (booking_sessions / bookings / digital_products) but finds these rows
-- still referencing it.

ALTER TABLE booking_slots
  DROP CONSTRAINT IF EXISTS booking_slots_session_id_booking_sessions_id_fk,
  DROP CONSTRAINT IF EXISTS booking_slots_session_id_fkey,
  ADD CONSTRAINT booking_slots_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES booking_sessions(id) ON DELETE CASCADE;

ALTER TABLE booking_messages
  DROP CONSTRAINT IF EXISTS booking_messages_booking_id_bookings_id_fk,
  DROP CONSTRAINT IF EXISTS booking_messages_booking_id_fkey,
  ADD CONSTRAINT booking_messages_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE booking_events
  DROP CONSTRAINT IF EXISTS booking_events_booking_id_bookings_id_fk,
  DROP CONSTRAINT IF EXISTS booking_events_booking_id_fkey,
  ADD CONSTRAINT booking_events_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

-- digital_product_purchases.product_id is NOT NULL so SET NULL is not an option.
-- When a coach deletes their account (cascade removes their products), purchases
-- for those products should also be removed — the files are gone anyway.
ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_product_id_digital_products_id_fk,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_product_id_fkey,
  ADD CONSTRAINT digital_product_purchases_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES digital_products(id) ON DELETE CASCADE;

-- ── Step 4: auth.users → public.profiles cascade trigger ──────────────
-- Supabase does not support a cross-schema FK (auth.users → public.profiles),
-- so a SECURITY DEFINER trigger function is the standard pattern.
-- When an auth user is deleted (dashboard, admin API, or account deletion
-- flow), this trigger fires and deletes the matching profiles row, which then
-- cascades through all child tables automatically.

COMMIT;

-- Trigger must run outside the transaction because CREATE TRIGGER ON auth.users
-- may not be transactional in all Postgres/Supabase configurations.
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();
