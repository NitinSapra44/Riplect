import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  serial,
  integer,
  decimal,
  numeric,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { PageBrief } from "./brief";

// Profile information table - uses Supabase auth.users UUID as primary key
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Supabase auth.users UUID
  username: varchar("username").unique().notNull(),
  displayName: varchar("display_name").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  email: varchar("email"),
  // Canonical, normalized phone identity. Unique-when-set (partial index in DB).
  // This is the single source of truth for "which profile owns this phone"
  // for the WhatsApp bot lookup and for duplicate-detection during onboarding.
  phoneE164: varchar("phone_e164", { length: 20 }),
  title: varchar("title"),
  bio: text("bio"),
  bioImageUrl: text("bio_image_url"),
  bioVideoUrl: text("bio_video_url"),
  shortBio: text("short_bio"),
  shortBioImageUrl: text("short_bio_image_url"),
  shortBioYoutubeUrl: text("short_bio_youtube_url"),
  longBio: text("long_bio"),
  longBioImageUrl: text("long_bio_image_url"),
  longBioYoutubeUrl: text("long_bio_youtube_url"),
  profileImageUrl: varchar("profile_image_url"),
  timezone: varchar("timezone").default("Asia/Kolkata"),
  socialLinks: jsonb("social_links").$type<{
    instagram?: string;
    youtube?: string;
    whatsapp?: string;
    linkedin?: string;
    website?: string;
  }>(),
  customLinks: jsonb("custom_links").$type<
    Array<{
      title: string;
      url: string;
      icon?: string;
    }>
  >(),
  homePageLinks: jsonb("home_page_links").$type<
    Array<{
      title: string;
      type: string;
      description: string;
      imageUrl: string;
      url: string;
    }>
  >(),
  galleryImages: jsonb("gallery_images").$type<
    Array<{
      url: string;
      alt: string;
    }>
  >(),
  contactInfo: jsonb("contact_info").$type<{
    phone?: string;
    showPhone?: boolean;
    whatsapp?: string;
    showWhatsApp?: boolean;
    email?: string;
    showEmail?: boolean;
    website?: string;
    showWebsite?: boolean;
    location?: {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
    locationId?: number;
    showExactLocation?: boolean;
    showLocationName?: boolean;
    showStreetAddress?: boolean;
    showMapLocation?: boolean;
    contactLinks?: Array<{
      title: string;
      url: string;
      type: "website" | "social" | "other";
    }>;
    socialMediaLinks?: Array<{
      platform:
      | "facebook"
      | "twitter"
      | "instagram"
      | "linkedin"
      | "youtube"
      | "tiktok"
      | "snapchat"
      | "pinterest";
      url: string;
    }>;
    callToAction?: {
      enableCall?: boolean;
      callNumber?: string;
      enableWhatsApp?: boolean;
      whatsAppNumber?: string;
      enableEmail?: boolean;
      emailAddress?: string;
    };
  }>(),
  testimonials: jsonb("testimonials").$type<
    Array<{
      clientName: string;
      content: string;
      rating?: number;
      clientTitle?: string;
    }>
  >(),
  searchableLocation: varchar("searchable_location"),
  searchTags: text("search_tags").array(),
  isActive: boolean("is_active").default(true),
  isDeactivated: boolean("is_deactivated").default(false),
  showInDiscover: boolean("show_in_discover").default(true),
  deactivatedAt: timestamp("deactivated_at"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  googleCalendarConnected: boolean("google_calendar_connected").default(false),
  sourceChannel: varchar("source_channel", { length: 30 }),
  // Truth-source for "the user has proven ownership of profiles.email."
  // Set by the WhatsApp-claim email-OTP flow and by Google identity link.
  // Magic-link sign-in does NOT set this column — it is sign-in convenience
  // only. NULL means unverified; populated means verified at that timestamp.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Saved locations table - stores coach's reusable locations
export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name").notNull(),
    address: varchar("address"),
    city: varchar("city"),
    state: varchar("state"),
    zipCode: varchar("zip_code"),
    country: varchar("country"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    googleMapsUrl: text("google_maps_url"),
    placeId: varchar("place_id"),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_locations_profile_id").on(table.profileId)],
);

// Digital products table
export const digitalProducts = pgTable("digital_products", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  thumbnailDescription: text("thumbnail_description"),
  productType: varchar("product_type").notNull().default("pdf"), // 'pdf', 'video', 'image'
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  isFree: boolean("is_free").default(false),
  imageUrl: varchar("image_url"), // Preview/cover image
  fileUrl: varchar("file_url"), // Path to file in object storage (private)
  fileName: varchar("file_name"), // Original filename for download
  fileSize: integer("file_size"), // File size in bytes
  fileMimeType: varchar("file_mime_type"), // MIME type of the file
  isActive: boolean("is_active").default(true),
  isFeatured: boolean("is_featured").default(false),
  requiresPayment: boolean("requires_payment").default(false).notNull(),
  paymentInstructions: text("payment_instructions"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Digital product purchases table
export const digitalProductPurchases = pgTable("digital_product_purchases", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => digitalProducts.id, { onDelete: "cascade" })
    .notNull(),
  buyerProfileId: text("buyer_profile_id").references(() => profiles.id, {
    onDelete: "set null",
  }), // Optional - for logged-in buyers; preserve purchase record if buyer deletes account
  guestProfileId: integer("guest_profile_id").references(
    () => guestProfiles.id,
  ), // Link to guest profile for portal access
  email: varchar("email").notNull(), // For guest purchases or verification
  buyerName: varchar("buyer_name", { length: 255 }),
  buyerPhone: varchar("buyer_phone", { length: 50 }),
  accessToken: varchar("access_token", { length: 255 }).unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  stripePaymentId: varchar("stripe_payment_id"),
  status: varchar("status").notNull().default("completed"), // 'pending', 'completed', 'refunded', 'proof_uploaded'
  downloadCount: integer("download_count").default(0),
  // Payment proof fields (for manual payment submission)
  paymentMethodSelected: varchar("payment_method_selected"),
  paymentMethodsOffered: jsonb("payment_methods_offered").$type<any[]>(),
  paymentInstruction: text("payment_instruction"),
  paymentProofUrl: text("payment_proof_url"),
  paymentReferenceText: text("payment_reference_text"),
  paymentMarkedAt: timestamp("payment_marked_at"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  paymentRejectionReason: text("payment_rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Physical products table
export const physicalProducts = pgTable("physical_products", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  imageUrl: varchar("image_url"),
  images: jsonb("images").$type<
    Array<{
      url: string;
      alt: string;
    }>
  >(),
  category: varchar("category"),
  stockQuantity: integer("stock_quantity").default(0),
  sku: varchar("sku"),
  weight: varchar("weight"),
  dimensions: varchar("dimensions"),
  shippingInfo: text("shipping_info"),
  variants: jsonb("variants").$type<
    Array<{
      name: string;
      options: string[];
      price?: string;
    }>
  >(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blog posts table
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title").notNull(),
  slug: varchar("slug").unique().notNull(),
  excerpt: text("excerpt"),
  thumbnailDescription: text("thumbnail_description"),
  content: text("content").notNull(),
  imageUrl: varchar("image_url"),
  readTime: integer("read_time"),
  isPublished: boolean("is_published").default(false),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Event series table — holds the recurrence pattern for recurring events
export const eventSeries = pgTable("event_series", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id").references(() => profiles.id, {
    onDelete: "cascade",
  }),
  pattern: jsonb("pattern")
    .$type<
      | {
        type: "weekly";
        weekdays: number[];
        intervalWeeks: number;
        startDate: string;
        endDate: string | null;
      }
      | {
        type: "monthly_nth";
        nth: number;
        weekday: number;
        startDate: string;
        endDate: string | null;
      }
      | {
        type: "monthly_date";
        dayOfMonth: number;
        startDate: string;
        endDate: string | null;
      }
      | {
        type: "custom";
        dates: string[];
      }
    >()
    .notNull(),
  defaultStartTime: varchar("default_start_time"),
  defaultDurationMins: integer("default_duration_mins"),
  defaultMaxAttendees: integer("default_max_attendees"),
  timezone: varchar("timezone"),
  // timestamptz so the cron-generated upper bound is a real UTC instant, not a
  // wall-clock that has to agree with the session TZ to compare correctly.
  generatedUntil: timestamp("generated_until", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Events table
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    thumbnailDescription: text("thumbnail_description"),
    // timestamptz: domain event time is stored as a real UTC instant so it
    // compares correctly across PG session TZ changes, region migrations, and
    // non-IST creators. Display TZ is resolved at render time from the
    // `timezone` column below.
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    location: varchar("location"),
    locationUrl: varchar("location_url"),
    locationId: integer("location_id").references(() => locations.id),
    locationVisibility: jsonb("location_visibility").$type<{
      name: boolean;
      streetAddress: boolean;
      map: boolean;
    }>(),
    mode: varchar("mode").default("online"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    pricingType: varchar("pricing_type").default("paid"),
    donationNote: text("donation_note"),
    requiresPayment: boolean("requires_payment").default(false),
    paymentInstructions: text("payment_instructions"),
    meetingLink: varchar("meeting_link", { length: 500 }),
    maxAttendees: integer("max_attendees"),
    featuredImage: varchar("featured_image", { length: 500 }),
    // DDL: ALTER TABLE events ADD COLUMN IF NOT EXISTS featured_image_focal_x numeric;
    // DDL: ALTER TABLE events ADD COLUMN IF NOT EXISTS featured_image_focal_y numeric;
    featuredImageFocalX: numeric("featured_image_focal_x"),
    featuredImageFocalY: numeric("featured_image_focal_y"),
    mediaItems: jsonb("media_items").$type<
      Array<{
        type: "image" | "video";
        url: string;
        alt?: string;
      }>
    >(),
    seriesId: integer("series_id").references(() => eventSeries.id),
    sequenceNumber: integer("sequence_number"),
    instanceOverrides: jsonb("instance_overrides").$type<{
      title?: string;
      description?: string;
      location?: string;
      locationId?: number;
      meetingLink?: string;
      maxAttendees?: number;
      startTime?: string;
      cancellationReason?: string;
    }>(),
    isCancelled: boolean("is_cancelled").default(false),
    timezone: varchar("timezone", { length: 100 }),
    qrCodeUrl: varchar("qr_code_url"),
    isActive: boolean("is_active").default(true),
    isFeatured: boolean("is_featured").default(false),
    sourceChannel: varchar("source_channel", { length: 30 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_events_profile_id").on(table.profileId)],
);

// Booking sessions table
export const bookingSessions = pgTable(
  "booking_sessions",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    thumbnailDescription: text("thumbnail_description"),
    duration: integer("duration").notNull(), // in minutes
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    isFree: boolean("is_free").default(false),
    images: jsonb("images").$type<
      Array<{
        url: string;
        alt: string;
      }>
    >(),
    // DDL: ALTER TABLE booking_sessions ADD COLUMN IF NOT EXISTS featured_image_focal_x numeric;
    // DDL: ALTER TABLE booking_sessions ADD COLUMN IF NOT EXISTS featured_image_focal_y numeric;
    featuredImageFocalX: numeric("featured_image_focal_x"),
    featuredImageFocalY: numeric("featured_image_focal_y"),
    availableDays: jsonb("available_days")
      .$type<number[]>()
      .default([0, 1, 2, 3, 4, 5, 6]),
    testimonials: text("testimonials"),
    customQuestion: text("custom_question"),
    isOffline: boolean("is_offline").default(false),
    isOnline: boolean("is_online").default(true),
    locationUrl: varchar("location_url"),
    locationId: integer("location_id").references(() => locations.id),
    showExactLocation: boolean("show_exact_location").default(true),
    showLocationName: boolean("show_location_name").default(true),
    showStreetAddress: boolean("show_street_address").default(false),
    showMapLocation: boolean("show_map_location").default(false),
    timezone: varchar("timezone", { length: 100 }),
    isActive: boolean("is_active").default(true),
    isFeatured: boolean("is_featured").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_booking_sessions_profile_id").on(table.profileId)],
);

// Booking slots table
export const bookingSlots = pgTable("booking_slots", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => bookingSessions.id, { onDelete: "cascade" })
    .notNull(),
  date: timestamp("date").notNull(),
  startTime: varchar("start_time").notNull(),
  endTime: varchar("end_time").notNull(),
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Confirmed bookings table
// Guest profiles table - platform-wide guest profiles linked by unique email
export const guestProfiles = pgTable("guest_profiles", {
  id: serial("id").primaryKey(),
  accessToken: uuid("access_token").defaultRandom().notNull().unique(), // Secure token for guest portal access
  email: varchar("email").notNull().unique(), // Platform-wide unique email
  name: varchar("name").notNull(),
  phone: varchar("phone"),
  originCoachId: text("origin_coach_id").references(() => profiles.id, {
    onDelete: "set null",
  }), // Coach who first brought this guest to the platform (nullable; preserve guest if origin coach deletes)
  magicLinkToken: varchar("magic_link_token").unique(), // Secure token for magic link authentication
  magicLinkExpiresAt: timestamp("magic_link_expires_at"), // Expiration time for magic link
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .references(() => bookingSessions.id)
      .notNull(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    guestProfileId: integer("guest_profile_id").references(
      () => guestProfiles.id,
    ), // Link to guest profile
    clientName: varchar("client_name").notNull(),
    clientEmail: varchar("client_email").notNull(),
    clientPhone: varchar("client_phone"),
    message: text("message"),
    customQuestionAnswer: text("custom_question_answer"),
    bookingDate: timestamp("booking_date").notNull(),
    bookingTime: varchar("booking_time").notNull(),
    status: varchar("status").default("pending").notNull(), // pending, confirmed, declined, cancelled, completed, rescheduled
    paymentStatus: varchar("payment_status").default("pending").notNull(),
    paymentId: varchar("payment_id"),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    confirmationCode: varchar("confirmation_code").notNull().unique(),
    coachMessage: text("coach_message"),
    meetingLink: varchar("meeting_link"),
    cancelToken: varchar("cancel_token"),
    sessionMode: varchar("session_mode").default("online"), // 'online' or 'offline' - client's choice at booking time
    // Cancellation fields
    cancelledBy: varchar("cancelled_by"), // 'coach' or 'client'
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at"),
    // Reschedule fields
    rescheduledFrom: timestamp("rescheduled_from"), // Original date if rescheduled
    rescheduledFromTime: varchar("rescheduled_from_time"), // Original time string if rescheduled
    rescheduledBy: varchar("rescheduled_by"), // 'coach' or 'client'
    paymentMethodSelected: varchar("payment_method_selected"),
    paymentMethodsOffered: jsonb("payment_methods_offered").$type<any[]>(),
    paymentInstruction: text("payment_instruction"),
    paymentMarkedAt: timestamp("payment_marked_at"),
    paymentConfirmedAt: timestamp("payment_confirmed_at"),
    paymentProofUrl: text("payment_proof_url"),
    paymentReferenceText: text("payment_reference_text"),
    googleCalendarEventId: text("google_calendar_event_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_bookings_profile_id").on(table.profileId)],
);

// Coach payment settings table - consolidated payment configuration per coach
export const coachPaymentSettings = pgTable("coach_payment_settings", {
  coachId: text("coach_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  defaultInstructions: text("default_instructions"),
  methods: jsonb("methods")
    .$type<
      Array<{
        type: string;
        enabled: boolean;
        order: number;
        upi_id?: string;
        qr_code_url?: string;
        display_name?: string;
        url?: string;
        email?: string;
        paypal_link?: string;
        account_holder?: string;
        bank_name?: string;
        account_number?: string;
        ifsc?: string;
      }>
    >()
    .default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Booking messages table - for coach-guest communication per booking
export const bookingMessages = pgTable(
  "booking_messages",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .references(() => bookings.id, { onDelete: "cascade" })
      .notNull(),
    senderType: varchar("sender_type").notNull(), // 'coach' or 'guest'
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    bookingIdx: index("booking_messages_booking_idx").on(table.bookingId),
  }),
);

// Booking events table - event-sourced timeline for every booking action
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .references(() => bookings.id, { onDelete: "cascade" })
      .notNull(),
    eventType: varchar("event_type").notNull(),
    actorType: varchar("actor_type").notNull(), // 'coach', 'guest', 'system'
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    bookingIdx: index("booking_events_booking_idx").on(table.bookingId),
  }),
);

// Event registrations table
export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .references(() => events.id)
      .notNull(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    guestProfileId: integer("guest_profile_id").references(
      () => guestProfiles.id,
    ), // Link to guest profile for unified history
    clientName: varchar("client_name").notNull(),
    clientEmail: varchar("client_email").notNull(),
    clientPhone: varchar("client_phone"),
    message: text("message"),
    status: varchar("status").default("confirmed").notNull(), // confirmed, cancelled
    paymentStatus: varchar("payment_status").default("pending").notNull(), // pending, paid, waived, requested, proof_uploaded, verified
    paymentId: varchar("payment_id"),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    confirmationCode: varchar("confirmation_code").notNull(),
    cancellationToken: uuid("cancellation_token").defaultRandom().unique(), // for guest self-cancellation
    attendanceStatus: varchar("attendance_status"), // attended, no_show (set after event)
    // Payment proof fields (for guest payment submission)
    paymentMethodSelected: varchar("payment_method_selected"),
    paymentMethodsOffered: jsonb("payment_methods_offered").$type<any[]>(),
    paymentInstruction: text("payment_instruction"),
    paymentProofUrl: text("payment_proof_url"),
    paymentReferenceText: text("payment_reference_text"),
    paymentMarkedAt: timestamp("payment_marked_at"),
    paymentConfirmedAt: timestamp("payment_confirmed_at"),
    paymentRejectionReason: text("payment_rejection_reason"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_event_registrations_profile_id").on(table.profileId),
    index("idx_event_registrations_event_id").on(table.eventId),
  ],
);

// Mentor availability schedules (weekly recurring)
export const mentorAvailability = pgTable("mentor_availability", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time").notNull(),
  endTime: varchar("end_time").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blocked dates for mentors
export const blockedDates = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  blockedDate: timestamp("blocked_date").notNull(),
  reason: varchar("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stripe Connect account information
export const stripeAccounts = pgTable("stripe_accounts", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  stripeAccountId: varchar("stripe_account_id").notNull().unique(),
  accountStatus: varchar("account_status").notNull().default("pending"),
  chargesEnabled: boolean("charges_enabled").default(false),
  payoutsEnabled: boolean("payouts_enabled").default(false),
  detailsSubmitted: boolean("details_submitted").default(false),
  requirements: jsonb("requirements").$type<{
    currently_due?: string[];
    eventually_due?: string[];
    past_due?: string[];
    pending_verification?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Earnings and transactions tracking
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  stripeAccountId: varchar("stripe_account_id").references(
    () => stripeAccounts.stripeAccountId,
  ),
  type: varchar("type").notNull(),
  sourceType: varchar("source_type").notNull(),
  sourceId: integer("source_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("usd"),
  stripeChargeId: varchar("stripe_charge_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeTransferId: varchar("stripe_transfer_id"),
  stripePayoutId: varchar("stripe_payout_id"),
  status: varchar("status").notNull().default("pending"),
  customerEmail: varchar("customer_email"),
  customerName: varchar("customer_name"),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payouts to bank accounts
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  stripeAccountId: varchar("stripe_account_id")
    .references(() => stripeAccounts.stripeAccountId)
    .notNull(),
  stripePayoutId: varchar("stripe_payout_id").notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("usd"),
  status: varchar("status").notNull(),
  arrivalDate: timestamp("arrival_date"),
  method: varchar("method").notNull().default("standard"),
  description: text("description"),
  failureCode: varchar("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wallet summary for quick access to earnings data
export const walletSummaries = pgTable("wallet_summaries", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  totalPayouts: decimal("total_payouts", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  productSales: integer("product_sales").notNull().default(0),
  eventRegistrations: integer("event_registrations").notNull().default(0),
  sessionBookings: integer("session_bookings").notNull().default(0),
  lastPayoutDate: timestamp("last_payout_date"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Auth identity helper tables (Task #150) ────────────────────────
// Server-issued phone OTPs for attaching a phone to an already
// signed-in auth.users row (verification, NOT login). user_id is the
// auth.users UUID. We deliberately omit a FK to profiles(id) because a
// phone-first user may not have a profiles row yet during onboarding.
export const phoneVerifications = pgTable("phone_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 6-digit email OTPs used by the WhatsApp-claim → verify-email flow
// (parallel to phone_verifications). Codes are SHA-256 hashed, single-use,
// and rate-limited via the per-row attempt counter. user_id references
// auth.users(id) with ON DELETE CASCADE so deleting an account cleans
// these up automatically.
export const emailOtpVerifications = pgTable("email_otp_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  email: varchar("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One-time signed-link tokens for the phone-first → email completion flow
// (email-and-set-password swap). Token plaintext lives only in the user's
// email; the DB stores a SHA-256 hash that is single-use.
export const emailVerifications = pgTable("email_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  email: varchar("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  nextStep: varchar("next_step", { length: 40 }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Routing tokens for the WhatsApp bot signup flow. The plaintext token
// lives only inside the WhatsApp message URL (/m/<token>); we store its
// SHA-256 hash so a DB compromise alone doesn't yield usable sign-in
// links. Multi-use until `expires_at` — each click mints a brand-new
// Supabase magic-link OTP, so WhatsApp's preview crawler consuming one
// OTP doesn't burn the user's subsequent tap.
export const botMagicLinkTokens = pgTable("bot_magic_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  // FK is `auth.users(id) ON DELETE CASCADE` in the live DB (cross-schema
  // — declared inline in the CREATE TABLE DDL applied via Supabase). We
  // can't express the cross-schema reference cleanly in Drizzle's table
  // builder, so the FK lives in the DB only; deleting an auth user
  // automatically purges any pending routing tokens.
  authUserId: uuid("auth_user_id").notNull(),
  email: varchar("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Persistent breadcrumb written *before* an account is hard-deleted, so a
// subsequent sign-in (legacy orphaned auth.users row) or re-signup (same
// email, fresh auth uuid) can be distinguished from a brand-new account
// that simply hasn't completed onboarding yet. Intentionally has no FK —
// it must survive the cascade triggered by `auth.users` deletion.
export const deletedAccountMarkers = pgTable("deleted_account_markers", {
  email: text("email").primaryKey(),
  originalUserId: text("original_user_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PhoneVerification = typeof phoneVerifications.$inferSelect;
export type InsertPhoneVerification = typeof phoneVerifications.$inferInsert;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type InsertEmailVerification = typeof emailVerifications.$inferInsert;
export type BotMagicLinkToken = typeof botMagicLinkTokens.$inferSelect;
export type InsertBotMagicLinkToken = typeof botMagicLinkTokens.$inferInsert;
export type EmailOtpVerification = typeof emailOtpVerifications.$inferSelect;
export type InsertEmailOtpVerification = typeof emailOtpVerifications.$inferInsert;
export type DeletedAccountMarker = typeof deletedAccountMarkers.$inferSelect;
export type InsertDeletedAccountMarker = typeof deletedAccountMarkers.$inferInsert;

// Schema types - Profile is now the main user entity
export type InsertProfile = typeof profiles.$inferInsert;
export type Profile = typeof profiles.$inferSelect;

export type InsertLocation = typeof locations.$inferInsert;
export type Location = typeof locations.$inferSelect;

export type InsertDigitalProduct = typeof digitalProducts.$inferInsert;
export type DigitalProduct = typeof digitalProducts.$inferSelect;

export type InsertPhysicalProduct = typeof physicalProducts.$inferInsert;
export type PhysicalProduct = typeof physicalProducts.$inferSelect;

export type InsertBlogPost = typeof blogPosts.$inferInsert;
export type BlogPost = typeof blogPosts.$inferSelect;

export type InsertEvent = typeof events.$inferInsert;
export type Event = typeof events.$inferSelect;

export type InsertEventSeries = typeof eventSeries.$inferInsert;
export type EventSeries = typeof eventSeries.$inferSelect;

/**
 * Extended event type returned by public API endpoints.
 * Includes computed fields and location/series join data that the base
 * schema Event type does not carry.
 */
export type EventWithExtras = Event & {
  /** True when the event belongs to a recurring series (computed server-side) */
  isRecurring?: boolean;
  /** Human-readable recurrence label (e.g. "Every Mon & Wed"), from event_series.pattern */
  cadenceLabel?: string | null;
  /** Number of upcoming non-cancelled instances in the series */
  upcomingCount?: number | null;
  /** Raw pattern object from event_series, for client-side label generation */
  seriesPattern?: EventSeries["pattern"] | null;
  /** Location name from joined locations table */
  locationName?: string | null;
  /** Street address from joined locations table */
  locationAddress?: string | null;
  /** City from joined locations table */
  locationCity?: string | null;
  /** State/province from joined locations table */
  locationState?: string | null;
  /** Country from joined locations table */
  locationCountry?: string | null;
  /** Google Maps or external map URL from joined locations table */
  locationUrl?: string | null;
  /** Legacy testimonials text field (not in base schema, carried by some older records) */
  testimonials?: string | null;
  /** Legacy field — indicates the event was loaded as a series root via ?asSeriesRoot=true */
  isSeriesRoot?: boolean;
};

// Event form schemas
export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventSeriesSchema = createInsertSchema(eventSeries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBookingSession = typeof bookingSessions.$inferInsert;
export type BookingSession = typeof bookingSessions.$inferSelect;

export type InsertBookingSlot = typeof bookingSlots.$inferInsert;
export type BookingSlot = typeof bookingSlots.$inferSelect;

export type InsertBooking = typeof bookings.$inferInsert;
export type Booking = typeof bookings.$inferSelect;

export type InsertGuestProfile = typeof guestProfiles.$inferInsert;
export type GuestProfile = typeof guestProfiles.$inferSelect;

export type InsertBookingMessage = typeof bookingMessages.$inferInsert;
export type BookingMessage = typeof bookingMessages.$inferSelect;

export type InsertBookingEvent = typeof bookingEvents.$inferInsert;
export type BookingEvent = typeof bookingEvents.$inferSelect;

export type InsertEventRegistration = typeof eventRegistrations.$inferInsert;
export type EventRegistration = typeof eventRegistrations.$inferSelect;

export type InsertMentorAvailability = typeof mentorAvailability.$inferInsert;
export type MentorAvailability = typeof mentorAvailability.$inferSelect;

export type InsertBlockedDate = typeof blockedDates.$inferInsert;
export type BlockedDate = typeof blockedDates.$inferSelect;

export type InsertCoachPaymentSettings =
  typeof coachPaymentSettings.$inferInsert;
export type CoachPaymentSettings = typeof coachPaymentSettings.$inferSelect;

// Insert schemas
export const insertProfileSchema = createInsertSchema(profiles).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDigitalProductSchema = createInsertSchema(
  digitalProducts,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDigitalProductPurchaseSchema = createInsertSchema(
  digitalProductPurchases,
).omit({
  id: true,
  createdAt: true,
});

export type InsertDigitalProductPurchase = z.infer<
  typeof insertDigitalProductPurchaseSchema
>;
export type DigitalProductPurchase =
  typeof digitalProductPurchases.$inferSelect;

export const insertPhysicalProductSchema = createInsertSchema(
  physicalProducts,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBookingSessionSchema = createInsertSchema(
  bookingSessions,
).omit({
  id: true,
  profileId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBookingSlotSchema = createInsertSchema(bookingSlots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGuestProfileSchema = createInsertSchema(guestProfiles).omit({
  id: true,
  accessToken: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBookingMessageSchema = createInsertSchema(
  bookingMessages,
).omit({
  id: true,
  createdAt: true,
});

export const insertBookingEventSchema = createInsertSchema(bookingEvents).omit({
  id: true,
  createdAt: true,
});

export const insertEventRegistrationSchema = createInsertSchema(
  eventRegistrations,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMentorAvailabilitySchema = createInsertSchema(
  mentorAvailability,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlockedDateSchema = createInsertSchema(blockedDates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Search functionality types
export const searchProfilesSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export type SearchProfilesParams = z.infer<typeof searchProfilesSchema>;

// Type exports for wallet functionality
export type StripeAccount = typeof stripeAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type WalletSummary = typeof walletSummaries.$inferSelect;

// Insert schemas for wallet functionality
export const insertStripeAccountSchema = createInsertSchema(
  stripeAccounts,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPayoutSchema = createInsertSchema(payouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWalletSummarySchema = createInsertSchema(
  walletSummaries,
).omit({
  id: true,
  updatedAt: true,
});

export type InsertStripeAccount = z.infer<typeof insertStripeAccountSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type InsertWalletSummary = z.infer<typeof insertWalletSummarySchema>;

// ==================== CENTRALIZED TAGS SYSTEM ====================

// Central tags table - single source of truth for all tags
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  category: varchar("category", { length: 50 }), // specialty, topic, format, level
  usageCount: integer("usage_count").default(0),
  createdBy: text("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  isApproved: boolean("is_approved").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Session Tags
export const sessionTags = pgTable("session_tags", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => bookingSessions.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Event Tags
export const eventTags = pgTable("event_tags", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Digital Product Tags
export const digitalProductTags = pgTable("digital_product_tags", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => digitalProducts.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Physical Product Tags
export const physicalProductTags = pgTable("physical_product_tags", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => physicalProducts.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Blog Post Tags
export const blogPostTags = pgTable("blog_post_tags", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .references(() => blogPosts.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table: Profile Tags (replaces searchTags array)
export const profileTags = pgTable("profile_tags", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tag Types
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export type SessionTag = typeof sessionTags.$inferSelect;
export type EventTag = typeof eventTags.$inferSelect;
export type DigitalProductTag = typeof digitalProductTags.$inferSelect;
export type PhysicalProductTag = typeof physicalProductTags.$inferSelect;
export type BlogPostTag = typeof blogPostTags.$inferSelect;
export type ProfileTag = typeof profileTags.$inferSelect;

// Insert Schemas for Tags
export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  usageCount: true,
  createdAt: true,
});

export const insertSessionTagSchema = createInsertSchema(sessionTags).omit({
  id: true,
  createdAt: true,
});

export const insertEventTagSchema = createInsertSchema(eventTags).omit({
  id: true,
  createdAt: true,
});

export const insertDigitalProductTagSchema = createInsertSchema(
  digitalProductTags,
).omit({
  id: true,
  createdAt: true,
});

export const insertPhysicalProductTagSchema = createInsertSchema(
  physicalProductTags,
).omit({
  id: true,
  createdAt: true,
});

export const insertBlogPostTagSchema = createInsertSchema(blogPostTags).omit({
  id: true,
  createdAt: true,
});

export const insertProfileTagSchema = createInsertSchema(profileTags).omit({
  id: true,
  createdAt: true,
});

export type InsertSessionTag = z.infer<typeof insertSessionTagSchema>;
export type InsertEventTag = z.infer<typeof insertEventTagSchema>;
export type InsertDigitalProductTag = z.infer<
  typeof insertDigitalProductTagSchema
>;
export type InsertPhysicalProductTag = z.infer<
  typeof insertPhysicalProductTagSchema
>;
export type InsertBlogPostTag = z.infer<typeof insertBlogPostTagSchema>;
export type InsertProfileTag = z.infer<typeof insertProfileTagSchema>;

// ── Coach Notifications ───────────────────────────────────────────────
export const coachNotifications = pgTable(
  "coach_notifications",
  {
    id: serial("id").primaryKey(),
    coachId: text("coach_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type").notNull(), // 'new_booking' | 'payment_proof' | 'new_registration'
    title: varchar("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    coachIdx: index("coach_notifications_coach_idx").on(table.coachId),
    coachReadIdx: index("coach_notifications_coach_read_idx").on(
      table.coachId,
      table.isRead,
    ),
    coachCreatedAtIdx: index("coach_notifications_coach_created_at_idx").on(
      table.coachId,
      table.createdAt,
    ),
  }),
);

export const insertCoachNotificationSchema = createInsertSchema(
  coachNotifications,
).omit({ id: true, createdAt: true });
export type InsertCoachNotification = z.infer<
  typeof insertCoachNotificationSchema
>;
export type CoachNotification = typeof coachNotifications.$inferSelect;

// ── WhatsApp Bot ──────────────────────────────────────────────────────

export const whatsappSessions = pgTable(
  "whatsapp_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneNumber: varchar("phone_number").notNull(),
    profileId: text("profile_id").references(() => profiles.id, {
      onDelete: "cascade",
    }),
    isNewCreator: boolean("is_new_creator").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    sourceChannel: varchar("source_channel", { length: 30 }),
    turnsCount: integer("turns_count").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_wa_sessions_phone_status").on(table.phoneNumber, table.status),
  ],
);

// Push notification subscriptions (Web Push / browser push)
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_push_subs_profile").on(table.profileId)],
);

export const insertPushSubscriptionSchema = createInsertSchema(
  pushSubscriptions,
).omit({
  id: true,
  createdAt: true,
});
export type InsertPushSubscription = z.infer<
  typeof insertPushSubscriptionSchema
>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => whatsappSessions.id, { onDelete: "cascade" })
      .notNull(),
    turnIndex: integer("turn_index").notNull(),
    role: varchar("role", { length: 10 }).notNull(),
    content: text("content").notNull(),
    mediaItems: jsonb("media_items")
      .$type<Array<{ url: string; type: "image" | "video" }>>()
      .notNull()
      .default([]),
    llmModel: varchar("llm_model", { length: 50 }),
    llmLatencyMs: integer("llm_latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_wa_messages_session").on(table.sessionId),
    uniqueIndex("uq_wa_messages_session_turn").on(table.sessionId, table.turnIndex),
  ],
);

// ---------------------------------------------------------------------------
// AI-generated standalone landing-page websites (PROTOTYPE feature).
//
// One row per profile. Regenerating overwrites `html` (upsert on profileId).
// `html` is a complete, self-contained HTML document produced by an LLM from
// the creator's live profile data. CTAs inside the HTML link back to the
// canonical Riplek routes (/:username/session/:id, etc.) so bookings and
// payments still flow through the platform.
// ---------------------------------------------------------------------------
export const generatedSites = pgTable("generated_sites", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" })
    .unique(),
  html: text("html").notNull(),
  model: varchar("model", { length: 80 }),
  styleHint: text("style_hint"),
  status: varchar("status", { length: 12 }).notNull().default("draft"), // 'draft' | 'published'
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type GeneratedSite = typeof generatedSites.$inferSelect;
export type InsertGeneratedSite = typeof generatedSites.$inferInsert;

// ---------------------------------------------------------------------------
// AI Profile — Design Brief storage (NEW, additive; see docs/ai-profile-*).
//
// A creator has at most two rows: one `draft` (edited in /studio) and one
// `published` (rendered on their public page). The `brief` JSONB is a PageBrief
// validated by shared/brief.ts on every write. This table is independent of the
// older `generated_sites` prototype — that table is left untouched.
// ---------------------------------------------------------------------------
export const pageBriefs = pgTable(
  "page_briefs",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 12 }).notNull().default("draft"), // 'draft' | 'published'
    brief: jsonb("brief").$type<PageBrief>().notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    model: varchar("model", { length: 80 }), // model that generated it, if any
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    profileStatusIdx: uniqueIndex("page_briefs_profile_status_idx").on(
      t.profileId,
      t.status,
    ),
  }),
);

export type PageBriefRow = typeof pageBriefs.$inferSelect;
export type InsertPageBriefRow = typeof pageBriefs.$inferInsert;
