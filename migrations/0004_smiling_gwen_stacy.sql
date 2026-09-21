ALTER TABLE "digital_product_purchases" ADD COLUMN "guest_profile_id" integer;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "buyer_name" varchar(255);--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "buyer_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "access_token" varchar(255);--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_method_selected" varchar;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_methods_offered" jsonb;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_instruction" text;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_reference_text" text;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD COLUMN "payment_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "digital_products" ADD COLUMN "requires_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "digital_products" ADD COLUMN "payment_instructions" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_method_selected" varchar;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_methods_offered" jsonb;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_instruction" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_proof_url" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_reference_text" text;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "payment_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD CONSTRAINT "digital_product_purchases_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_product_purchases" ADD CONSTRAINT "digital_product_purchases_access_token_unique" UNIQUE("access_token");