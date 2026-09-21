-- ============================================================
-- PRODUCTION DATABASE VERIFICATION QUERY
-- Run this in Supabase SQL Editor to see what exists vs what's missing
-- ============================================================

-- 1. Check which NEW tables exist
SELECT 'phone_verifications' AS table_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='phone_verifications') AS exists
UNION ALL
SELECT 'email_verifications', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_verifications')
UNION ALL
SELECT 'coach_notifications', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coach_notifications')
UNION ALL
SELECT 'push_subscriptions', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_subscriptions')
UNION ALL
SELECT 'whatsapp_sessions', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_sessions')
UNION ALL
SELECT 'whatsapp_messages', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_messages');

-- 2. Check which NEW columns exist on profiles
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('phone_e164', 'source_channel', 'onboarding_completed', 'timezone', 'google_calendar_connected', 'show_in_discover')
ORDER BY column_name;

-- 3. Check which NEW columns exist on events
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='events'
  AND column_name IN ('source_channel', 'start_at', 'end_at', 'mode', 'pricing_type', 'donation_note', 'requires_payment', 'payment_instructions', 'meeting_link', 'media_items', 'series_id', 'sequence_number', 'instance_overrides', 'is_cancelled', 'qr_code_url', 'location_visibility')
ORDER BY column_name;

-- 4. Check whatsapp_sessions columns (to see old vs new structure)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='whatsapp_sessions'
ORDER BY ordinal_position;

-- 5. Check whatsapp_messages columns (to see old vs new structure)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='whatsapp_messages'
ORDER BY ordinal_position;

-- 6. Check FK constraints on profiles — are they CASCADE or NO ACTION?
SELECT
  tc.table_name,
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND rc.unique_constraint_schema = 'public'
  AND EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage ccu
    WHERE ccu.constraint_name = tc.constraint_name
      AND ccu.table_name = 'profiles'
  )
ORDER BY tc.table_name;

-- 7. Check if the get_profile_by_phone function exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='get_profile_by_phone';

-- 8. Check if the auth user deletion trigger exists
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_schema='auth' AND trigger_name='on_auth_user_deleted';

-- 9. Check the phone_e164 unique index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename='profiles' AND indexname LIKE '%phone_e164%';
