CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"role" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"media_url" varchar(500),
	"draft_state_before" jsonb,
	"draft_state_after" jsonb,
	"llm_model" varchar(50),
	"llm_latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" varchar NOT NULL,
	"profile_id" text,
	"is_new_creator" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"source_channel" varchar(30),
	"draft_event_data" jsonb DEFAULT '{}'::jsonb,
	"draft_creator_data" jsonb DEFAULT '{}'::jsonb,
	"turns_count" integer DEFAULT 0 NOT NULL,
	"published_event_id" integer,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_from_time" varchar;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "cancellation_token" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "attendance_status" varchar;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "requires_payment" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "payment_instructions" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meeting_link" varchar(500);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "media_items" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_recurring" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence_pattern" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "parent_event_id" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_session_id_whatsapp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_published_event_id_events_id_fk" FOREIGN KEY ("published_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wa_messages_session" ON "whatsapp_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_wa_sessions_phone_status" ON "whatsapp_sessions" USING btree ("phone_number","status");--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_cancellation_token_unique" UNIQUE("cancellation_token");