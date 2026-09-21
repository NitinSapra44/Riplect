-- Backfill ON DELETE behavior for every foreign key that references profiles.id.
--
-- Why: server/storage.ts:deleteUserAccount manually deletes from ~20 tables to
-- remove a user's data. When a new feature adds a table that references
-- profiles.id (as happened with event_series — see task #103), it silently
-- breaks account deletion until a user hits the bug in production.
--
-- Policy enforced by this migration:
--   * "Owned by user" tables → ON DELETE CASCADE
--   * "User did this" historical rows we want to preserve → ON DELETE SET NULL
--
-- After this migration, every direct FK to profiles.id is database-enforced.
-- The manual deletes in deleteUserAccount remain as defense-in-depth and
-- to keep transaction ordering predictable, but new tables that follow the
-- policy in shared/schema.ts will be cleaned up automatically.

-- ── CASCADE: rows owned by the user ──────────────────────────────────

ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "digital_products" DROP CONSTRAINT IF EXISTS "digital_products_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "digital_products" ADD CONSTRAINT "digital_products_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "physical_products" DROP CONSTRAINT IF EXISTS "physical_products_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "physical_products" ADD CONSTRAINT "physical_products_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "blog_posts" DROP CONSTRAINT IF EXISTS "blog_posts_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "event_series" DROP CONSTRAINT IF EXISTS "event_series_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "booking_sessions" DROP CONSTRAINT IF EXISTS "booking_sessions_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "event_registrations" DROP CONSTRAINT IF EXISTS "event_registrations_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mentor_availability" DROP CONSTRAINT IF EXISTS "mentor_availability_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "mentor_availability" ADD CONSTRAINT "mentor_availability_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "blocked_dates" DROP CONSTRAINT IF EXISTS "blocked_dates_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "stripe_accounts" DROP CONSTRAINT IF EXISTS "stripe_accounts_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "payouts" DROP CONSTRAINT IF EXISTS "payouts_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "wallet_summaries" DROP CONSTRAINT IF EXISTS "wallet_summaries_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "wallet_summaries" ADD CONSTRAINT "wallet_summaries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT IF EXISTS "whatsapp_sessions_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- session_reviews is not (yet) declared in shared/schema.ts but the table
-- exists in production from migration 0001 with all-NOT-NULL FKs. Without
-- CASCADE, leftover review rows would block account deletion. Cascade every
-- FK so the row goes when its booking, session, guest, or coach goes.
ALTER TABLE "session_reviews" DROP CONSTRAINT IF EXISTS "session_reviews_coach_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_coach_profile_id_profiles_id_fk" FOREIGN KEY ("coach_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" DROP CONSTRAINT IF EXISTS "session_reviews_booking_id_bookings_id_fk";--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" DROP CONSTRAINT IF EXISTS "session_reviews_session_id_booking_sessions_id_fk";--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" DROP CONSTRAINT IF EXISTS "session_reviews_guest_profile_id_guest_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ── SET NULL: historical rows we want to preserve ────────────────────

ALTER TABLE "digital_product_purchases" DROP CONSTRAINT IF EXISTS "digital_product_purchases_buyer_profile_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD CONSTRAINT "digital_product_purchases_buyer_profile_id_profiles_id_fk" FOREIGN KEY ("buyer_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "guest_profiles" DROP CONSTRAINT IF EXISTS "guest_profiles_origin_coach_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_origin_coach_id_profiles_id_fk" FOREIGN KEY ("origin_coach_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_created_by_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
