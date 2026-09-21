-- ============================================================
-- PRODUCTION DATABASE FIX
-- Aligns production Supabase to match the working dev database
-- Run in Supabase SQL Editor (or via psql against prod URL)
-- All operations are idempotent and safe to re-run
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 1: MISSING TABLES                                ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS analytics_creator_lifecycle (
  id              SERIAL PRIMARY KEY,
  profile_id      VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_channel  VARCHAR(30),
  signup_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  first_event_at  TIMESTAMP WITH TIME ZONE,
  first_booking_at TIMESTAMP WITH TIME ZONE,
  first_payout_at TIMESTAMP WITH TIME ZONE,
  total_events    INTEGER DEFAULT 0,
  total_bookings  INTEGER DEFAULT 0,
  total_revenue_cents INTEGER DEFAULT 0,
  last_active_at  TIMESTAMP WITH TIME ZONE,
  status          VARCHAR(30) DEFAULT 'active',
  metadata        JSONB,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_supply_inventory (
  id              SERIAL PRIMARY KEY,
  profile_id      VARCHAR(255) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inventory_type  VARCHAR(30) NOT NULL,
  inventory_id    INTEGER,
  status          VARCHAR(30),
  source_channel  VARCHAR(30),
  metadata        JSONB,
  recorded_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 2: MISSING COLUMNS                               ║
-- ╚══════════════════════════════════════════════════════════╝

-- events
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_exact_location  BOOLEAN DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_location_name   BOOLEAN DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_street_address  BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_map_location    BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_recurring         BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_pattern   JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id      INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_data        JSONB;

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by   VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_path  VARCHAR(255);

-- whatsapp_messages: dev has BOTH media_urls (nullable) and media_items (NOT NULL)
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 3: COLUMN DEFAULT/NULLABILITY ALIGNMENT          ║
-- ╚══════════════════════════════════════════════════════════╝

-- events.start_at: prod is NOT NULL but dev allows NULL (for draft events)
ALTER TABLE events ALTER COLUMN start_at DROP NOT NULL;

-- profiles.timezone default: prod has 'Asia/Kolkata', dev has 'America/New_York'
-- (Existing rows are unaffected; only new rows inherit this default)
ALTER TABLE profiles ALTER COLUMN timezone SET DEFAULT 'America/New_York';

-- bookings.status default: prod 'pending', dev 'confirmed'
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'confirmed';

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 4: ORPHAN CLEANUP (before adding FK constraints) ║
-- ╚══════════════════════════════════════════════════════════╝

UPDATE tags SET created_by = NULL
  WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM profiles);

UPDATE digital_product_purchases SET buyer_profile_id = NULL
  WHERE buyer_profile_id IS NOT NULL AND buyer_profile_id NOT IN (SELECT id FROM profiles);

UPDATE guest_profiles SET origin_coach_id = NULL
  WHERE origin_coach_id IS NOT NULL AND origin_coach_id NOT IN (SELECT id FROM profiles);

DELETE FROM whatsapp_sessions
  WHERE profile_id IS NOT NULL AND profile_id NOT IN (SELECT id FROM profiles);

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 5: DROP EXTRA FK CONSTRAINTS (not in dev)        ║
-- ╚══════════════════════════════════════════════════════════╝
-- These constraints exist in prod but not in dev. Dropping to match dev.

ALTER TABLE booking_sessions
  DROP CONSTRAINT IF EXISTS booking_sessions_location_id_locations_id_fk,
  DROP CONSTRAINT IF EXISTS booking_sessions_location_id_fkey;

ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_guest_profile_id_guest_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_guest_profile_id_fkey;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_location_id_locations_id_fk,
  DROP CONSTRAINT IF EXISTS events_location_id_fkey;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_series_id_event_series_id_fk,
  DROP CONSTRAINT IF EXISTS events_series_id_fkey;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 6: ADD/FIX FK CONSTRAINTS → profiles (CASCADE)   ║
-- ╚══════════════════════════════════════════════════════════╝

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

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_stripe_account_id_stripe_accounts_id_fk,
  DROP CONSTRAINT IF EXISTS transactions_stripe_account_id_fkey,
  ADD CONSTRAINT transactions_stripe_account_id_fkey
    FOREIGN KEY (stripe_account_id) REFERENCES stripe_accounts(stripe_account_id);

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

ALTER TABLE whatsapp_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_profile_id_fkey,
  ADD CONSTRAINT whatsapp_sessions_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 7: FK CONSTRAINTS → profiles (SET NULL)          ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_buyer_profile_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_buyer_profile_id_fkey,
  ADD CONSTRAINT digital_product_purchases_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_origin_coach_id_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS guest_profiles_origin_coach_id_fkey,
  ADD CONSTRAINT guest_profiles_origin_coach_id_fkey
    FOREIGN KEY (origin_coach_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE tags
  DROP CONSTRAINT IF EXISTS tags_created_by_profiles_id_fk,
  DROP CONSTRAINT IF EXISTS tags_created_by_fkey,
  ADD CONSTRAINT tags_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 8: SECOND-LEVEL CASCADE FK FIXES                 ║
-- ╚══════════════════════════════════════════════════════════╝

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

ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_product_id_digital_products_id_fk,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_product_id_fkey,
  ADD CONSTRAINT digital_product_purchases_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES digital_products(id) ON DELETE CASCADE;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 9: MISSING INDEXES                               ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_post_tags_post_tag
  ON blog_post_tags (post_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON bookings (payment_status);

-- digital_product_purchases.access_token: prod has unique without WHERE clause; dev has WHERE NOT NULL
ALTER TABLE digital_product_purchases
  DROP CONSTRAINT IF EXISTS digital_product_purchases_access_token_key,
  DROP CONSTRAINT IF EXISTS digital_product_purchases_access_token_unique;
DROP INDEX IF EXISTS digital_product_purchases_access_token_key;
DROP INDEX IF EXISTS digital_product_purchases_access_token_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_product_purchases_access_token
  ON digital_product_purchases (access_token) WHERE (access_token IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_product_tags_product_tag
  ON digital_product_tags (product_id, tag_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_tags_event_tag
  ON event_tags (event_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_events_source_channel
  ON events (source_channel) WHERE (source_channel IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_physical_product_tags_product_tag
  ON physical_product_tags (product_id, tag_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_tags_profile_tag
  ON profile_tags (profile_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_profiles_source_channel
  ON profiles (source_channel) WHERE (source_channel IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_tags_session_tag
  ON session_tags (session_id, tag_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_session_turn
  ON whatsapp_messages (session_id, turn_index);

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 10: DROP EXTRA INDEXES (not in dev)              ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_confirmation_code_key,
  DROP CONSTRAINT IF EXISTS bookings_confirmation_code_unique;
DROP INDEX IF EXISTS bookings_confirmation_code_key;
DROP INDEX IF EXISTS bookings_confirmation_code_unique;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 11: MISSING FUNCTIONS                            ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.get_profile_by_phone(phone_number text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id::text
  WHERE u.phone = phone_number
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id::text;
  RETURN OLD;
END;
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ SECTION 12: MISSING TRIGGER                              ║
-- ╚══════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- ============================================================
-- DONE. Re-run safely; all statements use IF EXISTS / IF NOT EXISTS.
-- ============================================================
