-- Ensure published_event_id column exists (may be missing if migration 0003 was never applied)
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "published_event_id" integer;--> statement-breakpoint
-- Drop the old FK constraint (ON DELETE no action) if it exists
ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT IF EXISTS "whatsapp_sessions_published_event_id_events_id_fk";--> statement-breakpoint
-- Re-add FK constraint with ON DELETE SET NULL so deleting events auto-nullifies the reference
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_published_event_id_events_id_fk" FOREIGN KEY ("published_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
