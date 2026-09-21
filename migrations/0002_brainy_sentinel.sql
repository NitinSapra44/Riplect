CREATE TABLE "booking_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"event_type" varchar NOT NULL,
	"actor_type" varchar NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_payment_settings" (
	"coach_id" text PRIMARY KEY NOT NULL,
	"default_instructions" text,
	"methods" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_method_selected" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_methods_offered" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_instruction" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_reference_text" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "google_calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "google_calendar_connected" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payment_settings" ADD CONSTRAINT "coach_payment_settings_coach_id_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmation_code_unique" UNIQUE("confirmation_code");