CREATE TABLE "blocked_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"blocked_date" timestamp NOT NULL,
	"reason" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"title" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"image_url" varchar,
	"read_time" integer,
	"is_published" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"images" jsonb,
	"available_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"is_available" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"client_name" varchar NOT NULL,
	"client_email" varchar NOT NULL,
	"client_phone" varchar,
	"message" text,
	"booking_date" timestamp NOT NULL,
	"booking_time" varchar NOT NULL,
	"status" varchar DEFAULT 'confirmed' NOT NULL,
	"payment_status" varchar DEFAULT 'pending' NOT NULL,
	"payment_id" varchar,
	"total_amount" numeric(10, 2) NOT NULL,
	"confirmation_code" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "digital_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"image_url" varchar,
	"file_url" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"client_name" varchar NOT NULL,
	"client_email" varchar NOT NULL,
	"client_phone" varchar,
	"message" text,
	"status" varchar DEFAULT 'confirmed' NOT NULL,
	"payment_status" varchar DEFAULT 'pending' NOT NULL,
	"payment_id" varchar,
	"total_amount" numeric(10, 2) NOT NULL,
	"confirmation_code" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"date" timestamp NOT NULL,
	"start_time" varchar,
	"end_time" varchar,
	"location" varchar,
	"price" numeric(10, 2) NOT NULL,
	"max_attendees" integer,
	"featured_image" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mentor_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"stripe_account_id" varchar NOT NULL,
	"stripe_payout_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar DEFAULT 'usd' NOT NULL,
	"status" varchar NOT NULL,
	"arrival_date" timestamp,
	"method" varchar DEFAULT 'standard' NOT NULL,
	"description" text,
	"failure_code" varchar,
	"failure_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payouts_stripe_payout_id_unique" UNIQUE("stripe_payout_id")
);
--> statement-breakpoint
CREATE TABLE "physical_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"image_url" varchar,
	"images" jsonb,
	"category" varchar,
	"stock_quantity" integer DEFAULT 0,
	"sku" varchar,
	"weight" varchar,
	"dimensions" varchar,
	"shipping_info" text,
	"variants" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"username" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"title" varchar,
	"bio" text,
	"bio_image_url" text,
	"bio_video_url" text,
	"profile_image_url" varchar,
	"social_links" jsonb,
	"custom_links" jsonb,
	"gallery_images" jsonb,
	"contact_info" jsonb,
	"testimonials" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"stripe_account_id" varchar NOT NULL,
	"account_status" varchar DEFAULT 'pending' NOT NULL,
	"charges_enabled" boolean DEFAULT false,
	"payouts_enabled" boolean DEFAULT false,
	"details_submitted" boolean DEFAULT false,
	"requirements" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stripe_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"stripe_account_id" varchar,
	"type" varchar NOT NULL,
	"source_type" varchar NOT NULL,
	"source_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar DEFAULT 'usd' NOT NULL,
	"stripe_charge_id" varchar,
	"stripe_payment_intent_id" varchar,
	"stripe_transfer_id" varchar,
	"stripe_payout_id" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"customer_email" varchar,
	"customer_name" varchar,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"total_earnings" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"available_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"pending_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_payouts" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"product_sales" integer DEFAULT 0 NOT NULL,
	"event_registrations" integer DEFAULT 0 NOT NULL,
	"session_bookings" integer DEFAULT 0 NOT NULL,
	"last_payout_date" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "wallet_summaries_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_products" ADD CONSTRAINT "digital_products_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_availability" ADD CONSTRAINT "mentor_availability_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_stripe_account_id_stripe_accounts_stripe_account_id_fk" FOREIGN KEY ("stripe_account_id") REFERENCES "public"."stripe_accounts"("stripe_account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_products" ADD CONSTRAINT "physical_products_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_stripe_account_id_stripe_accounts_stripe_account_id_fk" FOREIGN KEY ("stripe_account_id") REFERENCES "public"."stripe_accounts"("stripe_account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_summaries" ADD CONSTRAINT "wallet_summaries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");