CREATE TABLE "booking_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "booking_id" integer NOT NULL,
        "sender_type" varchar NOT NULL,
        "message" text NOT NULL,
        "is_read" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_profiles" (
        "id" serial PRIMARY KEY NOT NULL,
        "access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
        "email" varchar NOT NULL,
        "name" varchar NOT NULL,
        "phone" varchar,
        "origin_coach_id" text,
        "magic_link_token" varchar,
        "magic_link_expires_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "guest_profiles_access_token_unique" UNIQUE("access_token"),
        CONSTRAINT "guest_profiles_email_unique" UNIQUE("email"),
        CONSTRAINT "guest_profiles_magic_link_token_unique" UNIQUE("magic_link_token")
);
--> statement-breakpoint
CREATE TABLE "session_reviews" (
        "id" serial PRIMARY KEY NOT NULL,
        "booking_id" integer NOT NULL,
        "session_id" integer NOT NULL,
        "guest_profile_id" integer NOT NULL,
        "coach_profile_id" text NOT NULL,
        "rating" integer NOT NULL,
        "feedback" text,
        "is_public" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "session_reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "timezone" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_profile_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "session_mode" varchar DEFAULT 'online';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_from" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_by" varchar;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "guest_profile_id" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timezone" varchar(100);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "show_in_discover" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_origin_coach_id_profiles_id_fk" FOREIGN KEY ("origin_coach_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reviews" ADD CONSTRAINT "session_reviews_coach_profile_id_profiles_id_fk" FOREIGN KEY ("coach_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_messages_booking_idx" ON "booking_messages" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "booking_id" integer NOT NULL,
        "event_type" varchar NOT NULL,
        "actor_type" varchar NOT NULL,
        "message" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coach_payment_settings" (
        "coach_id" text PRIMARY KEY NOT NULL,
        "default_instructions" text,
        "methods" jsonb DEFAULT '[]'::jsonb,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payment_settings" ADD CONSTRAINT "coach_payment_settings_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_status" varchar DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_method_selected" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_methods_offered" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_instruction" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_reference_text" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;