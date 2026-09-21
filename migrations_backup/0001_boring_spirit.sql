ALTER TABLE "booking_sessions" ADD COLUMN "thumbnail_description" text;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "testimonials" text;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "custom_question" text;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "is_offline" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "is_online" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "location_url" varchar;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "is_featured" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "custom_question_answer" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "short_bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "short_bio_image_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "short_bio_youtube_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "long_bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "long_bio_image_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "long_bio_youtube_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "timezone" varchar DEFAULT 'America/New_York';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_token_expires" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token_expires" timestamp;