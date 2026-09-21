import {
  profiles,
  locations,
  digitalProducts,
  digitalProductPurchases,
  physicalProducts,
  blogPosts,
  events,
  eventSeries,
  bookingSessions,
  bookingSlots,
  bookings,
  eventRegistrations,
  mentorAvailability,
  blockedDates,
  walletSummaries,
  transactions,
  stripeAccounts,
  tags,
  sessionTags,
  eventTags,
  digitalProductTags,
  physicalProductTags,
  blogPostTags,
  profileTags,
  guestProfiles,
  bookingMessages,
  bookingEvents,
  whatsappSessions,
  pushSubscriptions,
  type Profile,
  type InsertProfile,
  type Location,
  type InsertLocation,
  type DigitalProduct,
  type InsertDigitalProduct,
  type DigitalProductPurchase,
  type InsertDigitalProductPurchase,
  type PhysicalProduct,
  type InsertPhysicalProduct,
  type BlogPost,
  type InsertBlogPost,
  type Event,
  type EventWithExtras,
  type InsertEvent,
  type EventSeries,
  type InsertEventSeries,
  type BookingSession,
  type InsertBookingSession,
  type BookingSlot,
  type InsertBookingSlot,
  type Booking,
  type InsertBooking,
  type EventRegistration,
  type InsertEventRegistration,
  type MentorAvailability,
  type InsertMentorAvailability,
  type BlockedDate,
  type InsertBlockedDate,
  type WalletSummary,
  type InsertWalletSummary,
  type Transaction,
  type InsertTransaction,
  type StripeAccount,
  type InsertStripeAccount,
  type Tag,
  type InsertTag,
  type GuestProfile,
  type InsertGuestProfile,
  type BookingMessage,
  type InsertBookingMessage,
  type BookingEvent,
  type InsertBookingEvent,
  coachPaymentSettings,
  type CoachPaymentSettings,
  type InsertCoachPaymentSettings,
  payouts,
  coachNotifications,
  type CoachNotification,
  type InsertCoachNotification,
  type PushSubscription,
  type InsertPushSubscription,
} from "@shared/schema";
import {db} from "./db";
import {
  eq,
  and,
  desc,
  or,
  ilike,
  sql,
  inArray,
  notInArray,
  exists,
} from "drizzle-orm";

export interface IStorage {
  // Profile operations - profile.id is now the Supabase auth.users UUID
  getProfileByUsername(username: string): Promise<Profile | undefined>;
  getProfileById(id: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(id: string, updates: Partial<InsertProfile>): Promise<Profile>;
  deleteUserAccount(profileId: string): Promise<void>;
  deactivateAccount(profileId: string): Promise<void>;
  reactivateAccount(profileId: string): Promise<void>;

  // Location operations
  getLocationsByProfileId(profileId: string): Promise<Location[]>;
  getLocationById(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(
    id: number,
    updates: Partial<InsertLocation>,
  ): Promise<Location>;
  deleteLocation(id: number): Promise<void>;
  setDefaultLocation(profileId: string, locationId: number): Promise<void>;

  // Digital products operations
  getDigitalProductsByProfileId(profileId: string): Promise<DigitalProduct[]>;
  getDigitalProductById(id: number): Promise<DigitalProduct | undefined>;
  createDigitalProduct(product: InsertDigitalProduct): Promise<DigitalProduct>;
  updateDigitalProduct(
    id: number,
    updates: Partial<InsertDigitalProduct>,
  ): Promise<DigitalProduct>;
  deleteDigitalProduct(id: number): Promise<void>;

  // Digital product purchase operations
  getProductPurchaseByEmail(
    productId: number,
    email: string,
  ): Promise<DigitalProductPurchase | undefined>;
  getProductPurchaseById(
    purchaseId: number,
  ): Promise<(DigitalProductPurchase & {productTitle: string}) | undefined>;
  createProductPurchase(
    purchase: InsertDigitalProductPurchase,
  ): Promise<DigitalProductPurchase>;
  incrementProductDownloadCount(purchaseId: number): Promise<void>;
  getProductPurchasesByProfileId(
    profileId: string,
  ): Promise<
    (DigitalProductPurchase & {productTitle: string; productId: number})[]
  >;
  updateProductPurchaseStatus(
    purchaseId: number,
    status: string,
  ): Promise<DigitalProductPurchase>;
  verifyProductPurchase(
    purchaseId: number,
    accessToken: string,
  ): Promise<DigitalProductPurchase>;
  getProductPurchaseByAccessToken(
    token: string,
  ): Promise<DigitalProductPurchase | undefined>;

  // Physical products operations
  getPhysicalProductsByProfileId(profileId: string): Promise<PhysicalProduct[]>;
  getPhysicalProductById(id: number): Promise<PhysicalProduct | undefined>;
  createPhysicalProduct(
    product: InsertPhysicalProduct,
  ): Promise<PhysicalProduct>;
  updatePhysicalProduct(
    id: number,
    updates: Partial<InsertPhysicalProduct>,
  ): Promise<PhysicalProduct>;
  deletePhysicalProduct(id: number): Promise<void>;

  // Blog operations
  getBlogPostsByProfileId(profileId: string): Promise<BlogPost[]>;
  getAllBlogPostsByProfileId(profileId: string): Promise<BlogPost[]>;
  getBlogPostById(id: number): Promise<BlogPost | undefined>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(
    id: number,
    updates: Partial<InsertBlogPost>,
  ): Promise<BlogPost>;
  deleteBlogPost(id: number): Promise<void>;

  // Events operations
  getEventsByProfileId(profileId: string): Promise<Event[]>;
  getPublicEventsByProfileId(profileId: string): Promise<EventWithExtras[]>;
  getEventById(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  getEventSeriesInstances(seriesId: number): Promise<Event[]>;
  createRecurringEventInstances(instancesData: InsertEvent[]): Promise<Event[]>;
  updateEventSeries(
    seriesId: number,
    updates: Partial<InsertEvent>,
  ): Promise<void>;
  deleteEventSeries(seriesId: number): Promise<void>;
  deleteEventSeriesFromDate(seriesId: number, fromDate: Date): Promise<void>;
  createEventSeries(data: InsertEventSeries): Promise<EventSeries>;
  getEventSeriesById(id: number): Promise<EventSeries | undefined>;
  updateEventSeriesRecord(seriesId: number, data: Partial<InsertEventSeries>): Promise<EventSeries>;
  cancelEventInstance(eventId: number): Promise<void>;
  convertSeriesInstanceToStandalone(
    keepEventId: number,
    seriesId: number,
    updates: Partial<InsertEvent>,
  ): Promise<Event>;
  // eventId → count of non-cancelled/non-refunded registrations, for every
  // active instance in the series. Used by the CM update flow to decide which
  // upcoming instances must be preserved when the recurrence pattern changes.
  getActiveRegistrationCountsBySeriesId(
    seriesId: number,
  ): Promise<Map<number, number>>;
  softDeleteEventsByIds(ids: number[]): Promise<void>;
  getUpcomingInstancesWithCounts(
    seriesId: number,
    afterDate: Date,
    limit: number,
    offset: number,
  ): Promise<Array<Event & { registrationCount: number; isFull: boolean }>>;

  // Bulk fetch events + registrations in a single query (anti-N+1)
  getEventsWithRegistrationsForProfile(
    profileId: string,
  ): Promise<Array<{event: Event; registrations: EventRegistration[]}>>;

  // Event registration operations
  getEventRegistrationsByEventId(eventId: number): Promise<EventRegistration[]>;
  getConfirmedRegistrationsByEventId(
    eventId: number,
  ): Promise<EventRegistration[]>;
  getEventRegistrationByCancellationToken(
    token: string,
  ): Promise<EventRegistration | undefined>;
  getEventRegistrationById(id: number): Promise<EventRegistration | undefined>;
  updateEventRegistration(
    id: number,
    updates: Partial<InsertEventRegistration>,
  ): Promise<EventRegistration>;
  getAllEventRegistrationsForProfile(
    profileId: string,
  ): Promise<Array<EventRegistration & {event: Event}>>;
  getConfirmedRegistrationCountForEvent(eventId: number): Promise<number>;
  createEventRegistration(
    registration: InsertEventRegistration,
  ): Promise<EventRegistration>;

  // Booking operations
  getBookingSessionsByProfileId(profileId: string): Promise<BookingSession[]>;
  getBookingSessionById(id: number): Promise<BookingSession | undefined>;
  createBookingSession(session: InsertBookingSession): Promise<BookingSession>;
  updateBookingSession(
    id: number,
    updates: Partial<InsertBookingSession>,
  ): Promise<BookingSession>;
  deleteBookingSession(id: number): Promise<void>;

  getBookingSlotsBySessionId(sessionId: number): Promise<BookingSlot[]>;
  createBookingSlot(slot: InsertBookingSlot): Promise<BookingSlot>;
  updateBookingSlot(
    id: number,
    updates: Partial<InsertBookingSlot>,
  ): Promise<BookingSlot>;
  deleteBookingSlot(id: number): Promise<void>;

  // Booking management
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBookingsByProfileId(profileId: string): Promise<Booking[]>;
  getBookingsBySessionId(sessionId: number): Promise<Booking[]>;
  getBookedSlotsForProfile(
    profileId: string,
    date?: string,
  ): Promise<{bookingDate: string; bookingTime: string}[]>;
  getBookingById(id: number): Promise<Booking | undefined>;
  getBookingByConfirmationCode(
    confirmationCode: string,
  ): Promise<Booking | undefined>;
  getBookingByCancelToken(cancelToken: string): Promise<Booking | undefined>;
  updateBooking(id: number, updates: Partial<InsertBooking>): Promise<Booking>;
  updateBookingConditional(
    id: number,
    updates: Partial<InsertBooking>,
    expectedStatus: string,
  ): Promise<Booking | null>;
  updateBookingStatus(id: number, status: string): Promise<Booking>;
  updateBookingWithConfirmation(
    id: number,
    data: {
      status: string;
      coachMessage: string | null;
      meetingLink: string | null;
      cancelToken?: string;
    },
  ): Promise<Booking>;

  // Coach payment settings
  getCoachPaymentSettings(
    coachId: string,
  ): Promise<CoachPaymentSettings | undefined>;
  upsertCoachPaymentSettings(
    coachId: string,
    data: {defaultInstructions?: string | null; methods?: any[]},
  ): Promise<CoachPaymentSettings>;

  // Booking payment operations
  updateBookingPaymentRequested(
    bookingId: number,
    methodsOffered: any[] | null,
    customInstruction: string | null,
  ): Promise<Booking>;
  updateBookingProofUploaded(
    bookingId: number,
    proofUrl: string | null,
    referenceText: string | null,
    selectedMethod: string | null,
  ): Promise<Booking | null>;
  updateBookingPaymentVerified(
    bookingId: number,
    meetingLink?: string | null,
    coachMessage?: string | null,
  ): Promise<Booking | null>;
  updateBookingPaymentRejected(bookingId: number): Promise<Booking | null>;

  // Mentor availability operations
  getMentorAvailabilityByProfileId(
    profileId: string,
  ): Promise<MentorAvailability[]>;
  getAllMentorAvailabilityByProfileId(
    profileId: string,
  ): Promise<MentorAvailability[]>;
  createMentorAvailability(
    availability: InsertMentorAvailability,
  ): Promise<MentorAvailability>;
  updateMentorAvailability(
    id: number,
    updates: Partial<InsertMentorAvailability>,
  ): Promise<MentorAvailability>;
  deleteMentorAvailability(id: number): Promise<void>;

  // Blocked dates operations
  getBlockedDatesByProfileId(profileId: string): Promise<BlockedDate[]>;
  createBlockedDate(blockedDate: InsertBlockedDate): Promise<BlockedDate>;
  deleteBlockedDate(id: number): Promise<void>;

  // Search operations
  searchProfiles(
    query: string,
    limit: number,
    offset: number,
  ): Promise<Profile[]>;

  // Discovery endpoints for homepage
  getAllPublicSessions(query: string, limit: number): Promise<any[]>;
  getAllPublicEvents(query: string, limit: number): Promise<any[]>;

  // Available locations for filtering (separate by category)
  getCoachLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  >;
  getSessionLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  >;
  getEventLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  >;
  getEventDates(): Promise<string[]>;

  // Wallet operations
  getWalletSummaryByProfileId(
    profileId: string,
  ): Promise<WalletSummary | undefined>;
  createWalletSummary(summary: InsertWalletSummary): Promise<WalletSummary>;
  updateWalletSummary(
    profileId: string,
    updates: Partial<InsertWalletSummary>,
  ): Promise<WalletSummary>;

  // Transaction operations
  getTransactionsByProfileId(profileId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // Stripe Connect account operations
  getStripeConnectAccountByProfileId(
    profileId: string,
  ): Promise<StripeAccount | undefined>;
  createStripeConnectAccount(
    account: InsertStripeAccount,
  ): Promise<StripeAccount>;
  updateStripeConnectAccount(
    profileId: string,
    updates: Partial<InsertStripeAccount>,
  ): Promise<StripeAccount>;

  // =================== TAG OPERATIONS ===================
  // Tag CRUD
  getAllTags(): Promise<Tag[]>;
  getTagById(id: number): Promise<Tag | undefined>;
  getTagBySlug(slug: string): Promise<Tag | undefined>;
  getTagByName(name: string): Promise<Tag | undefined>;
  createTag(tag: InsertTag): Promise<Tag>;
  updateTag(id: number, updates: Partial<InsertTag>): Promise<Tag>;
  deleteTag(id: number): Promise<void>;
  searchTags(query: string, limit?: number): Promise<Tag[]>;
  getPopularTags(limit?: number): Promise<Tag[]>;

  // Session tags
  getTagsBySessionId(sessionId: number): Promise<Tag[]>;
  setSessionTags(sessionId: number, tagIds: number[]): Promise<void>;

  // Event tags
  getTagsByEventId(eventId: number): Promise<Tag[]>;
  setEventTags(eventId: number, tagIds: number[]): Promise<void>;

  // Digital product tags
  getTagsByDigitalProductId(productId: number): Promise<Tag[]>;
  setDigitalProductTags(productId: number, tagIds: number[]): Promise<void>;

  // Physical product tags
  getTagsByPhysicalProductId(productId: number): Promise<Tag[]>;
  setPhysicalProductTags(productId: number, tagIds: number[]): Promise<void>;

  // Blog post tags
  getTagsByBlogPostId(postId: number): Promise<Tag[]>;
  setBlogPostTags(postId: number, tagIds: number[]): Promise<void>;

  // Profile tags
  getTagsByProfileId(profileId: string): Promise<Tag[]>;
  setProfileTags(profileId: string, tagIds: number[]): Promise<void>;

  // Consolidated tags - all tags from sessions, events, blogs, and products for a profile
  getConsolidatedTagsByProfileId(profileId: string): Promise<{
    profile: Tag[];
    sessions: Tag[];
    events: Tag[];
    blogs: Tag[];
    digitalProducts: Tag[];
    physicalProducts: Tag[];
    all: Tag[];
  }>;

  // =================== GUEST PROFILE OPERATIONS ===================
  getGuestProfileByEmail(email: string): Promise<GuestProfile | undefined>;
  getOrCreateGuestProfile(
    email: string,
    name: string,
    phone: string | null,
    originCoachId: string,
  ): Promise<GuestProfile>;
  getGuestProfileByMagicLinkToken(
    token: string,
  ): Promise<GuestProfile | undefined>;
  getGuestProfileByAccessToken(
    accessToken: string,
  ): Promise<GuestProfile | undefined>;
  getGuestProfileById(id: number): Promise<GuestProfile | undefined>;
  createGuestProfile(guestProfile: InsertGuestProfile): Promise<GuestProfile>;
  updateGuestProfile(
    id: number,
    updates: Partial<InsertGuestProfile>,
  ): Promise<GuestProfile>;
  getBookingsByGuestProfileId(guestProfileId: number): Promise<Booking[]>;
  getEventRegistrationsByGuestProfileId(
    guestProfileId: number,
  ): Promise<EventRegistration[]>;
  getDigitalProductPurchasesByEmail(
    email: string,
  ): Promise<DigitalProductPurchase[]>;
  getDigitalProductPurchasesByGuestProfileId(
    guestProfileId: number,
  ): Promise<DigitalProductPurchase[]>;

  // =================== BOOKING MESSAGE OPERATIONS ===================
  getMessagesByBookingId(bookingId: number): Promise<BookingMessage[]>;
  createBookingMessage(message: InsertBookingMessage): Promise<BookingMessage>;
  markMessagesAsRead(bookingId: number, senderType: string): Promise<void>;
  getUnreadMessageCount(bookingId: number, senderType: string): Promise<number>;

  // =================== BOOKING EVENT OPERATIONS ===================
  createBookingEvent(event: InsertBookingEvent): Promise<BookingEvent>;
  getBookingEventsByBookingId(bookingId: number): Promise<BookingEvent[]>;
  getBookingEventsForProfile(profileId: string): Promise<BookingEvent[]>;

  // =================== COACH NOTIFICATION OPERATIONS ===================
  createCoachNotification(
    notification: InsertCoachNotification,
  ): Promise<CoachNotification>;
  getCoachNotifications(
    coachId: string,
    limit?: number,
  ): Promise<CoachNotification[]>;
  getUnreadCoachNotificationCount(coachId: string): Promise<number>;
  markCoachNotificationRead(
    id: number,
    coachId: string,
  ): Promise<CoachNotification | null>;
  markAllCoachNotificationsRead(coachId: string): Promise<void>;
  pruneOldCoachNotifications(coachId: string): Promise<void>;

  // =================== PUSH SUBSCRIPTION OPERATIONS ===================
  upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getPushSubscriptionsByProfileId(profileId: string): Promise<PushSubscription[]>;
}

export class DatabaseStorage implements IStorage {
  // Profile operations - profile.id is now the Supabase auth.users UUID
  async getProfileByUsername(username: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.username, username),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
        ),
      );
    return profile;
  }

  // Get profile by ID - internal use (doesn't filter deactivated for auth/dashboard purposes)
  async getProfileById(id: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id));
    return profile;
  }

  // Get profile by ID for public display (filters deactivated profiles)
  async getPublicProfileById(id: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.id, id),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
        ),
      );
    return profile;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }

  async updateProfile(
    id: string,
    updates: Partial<InsertProfile>,
  ): Promise<Profile> {
    const [updatedProfile] = await db
      .update(profiles)
      .set({...updates, updatedAt: new Date()})
      .where(eq(profiles.id, id))
      .returning();
    return updatedProfile;
  }

  // Location operations
  async getLocationsByProfileId(profileId: string): Promise<Location[]> {
    return await db
      .select()
      .from(locations)
      .where(eq(locations.profileId, profileId))
      .orderBy(desc(locations.isDefault), desc(locations.createdAt));
  }

  async getLocationById(id: number): Promise<Location | undefined> {
    const [location] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id));
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [newLocation] = await db
      .insert(locations)
      .values(location)
      .returning();
    return newLocation;
  }

  async updateLocation(
    id: number,
    updates: Partial<InsertLocation>,
  ): Promise<Location> {
    const [updatedLocation] = await db
      .update(locations)
      .set({...updates, updatedAt: new Date()})
      .where(eq(locations.id, id))
      .returning();
    return updatedLocation;
  }

  async deleteLocation(id: number): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  async setDefaultLocation(
    profileId: string,
    locationId: number,
  ): Promise<void> {
    await db
      .update(locations)
      .set({isDefault: false, updatedAt: new Date()})
      .where(eq(locations.profileId, profileId));

    await db
      .update(locations)
      .set({isDefault: true, updatedAt: new Date()})
      .where(eq(locations.id, locationId));
  }

  // Digital products operations
  async getDigitalProductsByProfileId(
    profileId: string,
  ): Promise<DigitalProduct[]> {
    return await db
      .select()
      .from(digitalProducts)
      .where(
        and(
          eq(digitalProducts.profileId, profileId),
          eq(digitalProducts.isActive, true),
        ),
      )
      .orderBy(desc(digitalProducts.createdAt));
  }

  async getDigitalProductById(id: number): Promise<DigitalProduct | undefined> {
    const [product] = await db
      .select()
      .from(digitalProducts)
      .where(eq(digitalProducts.id, id));
    return product;
  }

  async createDigitalProduct(
    product: InsertDigitalProduct,
  ): Promise<DigitalProduct> {
    const [newProduct] = await db
      .insert(digitalProducts)
      .values(product)
      .returning();
    return newProduct;
  }

  async updateDigitalProduct(
    id: number,
    updates: Partial<InsertDigitalProduct>,
  ): Promise<DigitalProduct> {
    const [updatedProduct] = await db
      .update(digitalProducts)
      .set({...updates, updatedAt: new Date()})
      .where(eq(digitalProducts.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteDigitalProduct(id: number): Promise<void> {
    await db
      .update(digitalProducts)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(digitalProducts.id, id));
  }

  // Digital product purchase operations
  async getProductPurchaseByEmail(
    productId: number,
    email: string,
  ): Promise<DigitalProductPurchase | undefined> {
    const [purchase] = await db
      .select()
      .from(digitalProductPurchases)
      .where(
        and(
          eq(digitalProductPurchases.productId, productId),
          eq(digitalProductPurchases.email, email),
          eq(digitalProductPurchases.status, "completed"),
        ),
      );
    return purchase;
  }

  async getProductPurchaseById(
    purchaseId: number,
  ): Promise<(DigitalProductPurchase & {productTitle: string}) | undefined> {
    const [result] = await db
      .select({
        ...digitalProductPurchases,
        productTitle: digitalProducts.title,
      })
      .from(digitalProductPurchases)
      .innerJoin(
        digitalProducts,
        eq(digitalProductPurchases.productId, digitalProducts.id),
      )
      .where(eq(digitalProductPurchases.id, purchaseId));
    return result as
      | (DigitalProductPurchase & {productTitle: string})
      | undefined;
  }

  async createProductPurchase(
    purchase: InsertDigitalProductPurchase,
  ): Promise<DigitalProductPurchase> {
    const [newPurchase] = await db
      .insert(digitalProductPurchases)
      .values(purchase)
      .returning();
    return newPurchase;
  }

  async incrementProductDownloadCount(purchaseId: number): Promise<void> {
    const [purchase] = await db
      .select()
      .from(digitalProductPurchases)
      .where(eq(digitalProductPurchases.id, purchaseId));

    if (purchase) {
      await db
        .update(digitalProductPurchases)
        .set({downloadCount: (purchase.downloadCount || 0) + 1})
        .where(eq(digitalProductPurchases.id, purchaseId));
    }
  }

  async getProductPurchasesByProfileId(
    profileId: string,
  ): Promise<
    (DigitalProductPurchase & {productTitle: string; productId: number})[]
  > {
    const results = await db
      .select({
        id: digitalProductPurchases.id,
        productId: digitalProductPurchases.productId,
        buyerProfileId: digitalProductPurchases.buyerProfileId,
        guestProfileId: digitalProductPurchases.guestProfileId,
        email: digitalProductPurchases.email,
        buyerName: digitalProductPurchases.buyerName,
        buyerPhone: digitalProductPurchases.buyerPhone,
        accessToken: digitalProductPurchases.accessToken,
        amount: digitalProductPurchases.amount,
        currency: digitalProductPurchases.currency,
        stripePaymentId: digitalProductPurchases.stripePaymentId,
        status: digitalProductPurchases.status,
        downloadCount: digitalProductPurchases.downloadCount,
        paymentMethodSelected: digitalProductPurchases.paymentMethodSelected,
        paymentMethodsOffered: digitalProductPurchases.paymentMethodsOffered,
        paymentInstruction: digitalProductPurchases.paymentInstruction,
        paymentProofUrl: digitalProductPurchases.paymentProofUrl,
        paymentReferenceText: digitalProductPurchases.paymentReferenceText,
        paymentMarkedAt: digitalProductPurchases.paymentMarkedAt,
        paymentConfirmedAt: digitalProductPurchases.paymentConfirmedAt,
        paymentRejectionReason: digitalProductPurchases.paymentRejectionReason,
        createdAt: digitalProductPurchases.createdAt,
        productTitle: digitalProducts.title,
      })
      .from(digitalProductPurchases)
      .innerJoin(
        digitalProducts,
        eq(digitalProductPurchases.productId, digitalProducts.id),
      )
      .where(eq(digitalProducts.profileId, profileId))
      .orderBy(desc(digitalProductPurchases.createdAt));
    return results as any;
  }

  async updateProductPurchaseStatus(
    purchaseId: number,
    status: string,
  ): Promise<DigitalProductPurchase> {
    const [updated] = await db
      .update(digitalProductPurchases)
      .set({status})
      .where(eq(digitalProductPurchases.id, purchaseId))
      .returning();
    return updated;
  }

  async verifyProductPurchase(
    purchaseId: number,
    accessToken: string,
  ): Promise<DigitalProductPurchase> {
    const [updated] = await db
      .update(digitalProductPurchases)
      .set({status: "completed", accessToken})
      .where(eq(digitalProductPurchases.id, purchaseId))
      .returning();
    return updated;
  }

  async getProductPurchaseByAccessToken(
    token: string,
  ): Promise<DigitalProductPurchase | undefined> {
    const [purchase] = await db
      .select()
      .from(digitalProductPurchases)
      .where(eq(digitalProductPurchases.accessToken, token));
    return purchase;
  }

  // Physical products operations
  async getPhysicalProductsByProfileId(
    profileId: string,
  ): Promise<PhysicalProduct[]> {
    return await db
      .select()
      .from(physicalProducts)
      .where(
        and(
          eq(physicalProducts.profileId, profileId),
          eq(physicalProducts.isActive, true),
        ),
      )
      .orderBy(desc(physicalProducts.createdAt));
  }

  async getPhysicalProductById(
    id: number,
  ): Promise<PhysicalProduct | undefined> {
    const [product] = await db
      .select()
      .from(physicalProducts)
      .where(eq(physicalProducts.id, id));
    return product;
  }

  async createPhysicalProduct(
    product: InsertPhysicalProduct,
  ): Promise<PhysicalProduct> {
    const [newProduct] = await db
      .insert(physicalProducts)
      .values(product)
      .returning();
    return newProduct;
  }

  async updatePhysicalProduct(
    id: number,
    updates: Partial<InsertPhysicalProduct>,
  ): Promise<PhysicalProduct> {
    const [updatedProduct] = await db
      .update(physicalProducts)
      .set({...updates, updatedAt: new Date()})
      .where(eq(physicalProducts.id, id))
      .returning();
    return updatedProduct;
  }

  async deletePhysicalProduct(id: number): Promise<void> {
    await db
      .update(physicalProducts)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(physicalProducts.id, id));
  }

  // Bulk fetch: all events for a coach profile with their registrations in 2 queries (anti-N+1)
  async getEventsWithRegistrationsForProfile(
    profileId: string,
  ): Promise<Array<{event: Event; registrations: EventRegistration[]}>> {
    // Query 1: all events for this profile (standalone and series instances)
    const allEvents = await db
      .select()
      .from(events)
      .where(eq(events.profileId, profileId))
      .orderBy(desc(events.startAt));

    if (allEvents.length === 0) return [];

    const eventIds = allEvents.map((e) => e.id);

    // Query 2: all registrations for those event IDs in one query
    const allRegistrations = await db
      .select()
      .from(eventRegistrations)
      .where(inArray(eventRegistrations.eventId, eventIds))
      .orderBy(desc(eventRegistrations.createdAt));

    // Group registrations by eventId
    const regsByEventId = new Map<number, EventRegistration[]>();
    for (const reg of allRegistrations) {
      const list = regsByEventId.get(reg.eventId) ?? [];
      list.push(reg);
      regsByEventId.set(reg.eventId, list);
    }

    // Include an event if: it is standalone (no seriesId), OR if it has registrations
    return allEvents
      .filter(
        (e) => !e.seriesId || (regsByEventId.get(e.id)?.length ?? 0) > 0,
      )
      .map((e) => ({
        event: e,
        registrations: regsByEventId.get(e.id) ?? [],
      }));
  }

  // Event registration operations
  async getEventRegistrationsByEventId(
    eventId: number,
  ): Promise<EventRegistration[]> {
    return await db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId))
      .orderBy(desc(eventRegistrations.createdAt));
  }

  async getConfirmedRegistrationsByEventId(
    eventId: number,
  ): Promise<EventRegistration[]> {
    return await db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "confirmed"),
        ),
      )
      .orderBy(desc(eventRegistrations.createdAt));
  }

  async getEventRegistrationByCancellationToken(
    token: string,
  ): Promise<EventRegistration | undefined> {
    const [registration] = await db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.cancellationToken, token));
    return registration;
  }

  async getEventRegistrationById(
    id: number,
  ): Promise<EventRegistration | undefined> {
    const [registration] = await db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, id));
    return registration;
  }

  async updateEventRegistration(
    id: number,
    updates: Partial<InsertEventRegistration>,
  ): Promise<EventRegistration> {
    const [updated] = await db
      .update(eventRegistrations)
      .set({...updates, updatedAt: new Date()})
      .where(eq(eventRegistrations.id, id))
      .returning();
    return updated;
  }

  async getAllEventRegistrationsForProfile(
    profileId: string,
  ): Promise<Array<EventRegistration & {event: Event}>> {
    const rows = await db
      .select()
      .from(eventRegistrations)
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .where(eq(eventRegistrations.profileId, profileId))
      .orderBy(desc(events.startAt));

    return rows.map((r) => ({...r.event_registrations, event: r.events}));
  }

  async getConfirmedRegistrationCountForEvent(
    eventId: number,
  ): Promise<number> {
    const result = await db
      .select({count: sql<number>`count(*)::int`})
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "confirmed"),
        ),
      );
    return result[0]?.count ?? 0;
  }

  async createEventRegistration(
    registration: InsertEventRegistration,
  ): Promise<EventRegistration> {
    const [newRegistration] = await db
      .insert(eventRegistrations)
      .values(registration)
      .returning();
    return newRegistration;
  }

  // Blog operations
  async getBlogPostsByProfileId(profileId: string): Promise<BlogPost[]> {
    return await db
      .select()
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.profileId, profileId),
          eq(blogPosts.isPublished, true),
        ),
      )
      .orderBy(desc(blogPosts.createdAt));
  }

  async getAllBlogPostsByProfileId(profileId: string): Promise<BlogPost[]> {
    return await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.profileId, profileId))
      .orderBy(desc(blogPosts.createdAt));
  }

  async getBlogPostById(id: number): Promise<BlogPost | undefined> {
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id));
    return post;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublished, true)));
    return post;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const [newPost] = await db.insert(blogPosts).values(post).returning();
    return newPost;
  }

  async updateBlogPost(
    id: number,
    updates: Partial<InsertBlogPost>,
  ): Promise<BlogPost> {
    const [updatedPost] = await db
      .update(blogPosts)
      .set({...updates, updatedAt: new Date()})
      .where(eq(blogPosts.id, id))
      .returning();
    return updatedPost;
  }

  async deleteBlogPost(id: number): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  // Events operations
  async getEventsByProfileId(profileId: string): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(and(eq(events.profileId, profileId), eq(events.isActive, true)))
      .orderBy(events.startAt);
  }

  async getPublicEventsByProfileId(profileId: string): Promise<EventWithExtras[]> {
    // Deduplicate recurring series: show only the best upcoming (or most-recent past)
    // instance per series. Standalone events (seriesId IS NULL) always appear.
    const idRows = await db.execute<{id: number}>(sql`
      WITH ranked AS (
        SELECT
          e.id,
          e.start_at,
          CASE WHEN e.series_id IS NULL THEN NULL
            ELSE ROW_NUMBER() OVER (
              PARTITION BY e.series_id
              ORDER BY
                CASE WHEN e.start_at >= NOW() THEN 0 ELSE 1 END ASC,
                CASE WHEN e.start_at >= NOW() THEN e.start_at END ASC NULLS LAST,
                CASE WHEN e.start_at < NOW() THEN e.start_at END DESC NULLS LAST
            )
          END AS series_rank
        FROM events e
        WHERE
          e.profile_id = ${profileId}
          AND e.is_active = true
          AND (e.is_cancelled IS NULL OR e.is_cancelled = false)
      )
      SELECT id, start_at FROM ranked
      WHERE series_rank IS NULL OR series_rank = 1
      ORDER BY
        CASE WHEN start_at >= NOW() THEN 0 ELSE 1 END ASC,
        CASE WHEN start_at >= NOW() THEN start_at END ASC NULLS LAST,
        CASE WHEN start_at < NOW() THEN start_at END DESC NULLS LAST
    `);

    const orderedIds = idRows.map((r) => Number(r.id));
    if (orderedIds.length === 0) return [];

    const rows = await db
      .select()
      .from(events)
      .where(inArray(events.id, orderedIds));

    // Batch-fetch series data for recurring events
    const seriesIds = [...new Set(rows.filter(r => r.seriesId != null).map(r => r.seriesId!))];
    let seriesMap: Record<number, EventSeries> = {};
    let upcomingCountMap: Record<number, number> = {};
    if (seriesIds.length > 0) {
      const seriesRows = await db.select().from(eventSeries).where(inArray(eventSeries.id, seriesIds));
      seriesMap = Object.fromEntries(seriesRows.map(s => [s.id, s]));
      const now = new Date();
      const countRows = await db
        .select({ seriesId: events.seriesId, cnt: sql<number>`count(*)::int` })
        .from(events)
        .where(and(
          inArray(events.seriesId, seriesIds),
          eq(events.isActive, true),
          sql`(${events.isCancelled} IS NULL OR ${events.isCancelled} = false)`,
          sql`${events.startAt} >= ${now.toISOString()}`,
        ))
        .groupBy(events.seriesId);
      upcomingCountMap = Object.fromEntries(countRows.filter(r => r.seriesId != null).map(r => [r.seriesId!, r.cnt]));
    }

    // Preserve CTE ordering (IN clause does not guarantee order)
    const byId = new Map(rows.map((r) => [r.id, r]));
    return orderedIds.map((id) => {
      const ev = byId.get(id);
      if (!ev) return undefined;
      const seriesData = ev.seriesId ? seriesMap[ev.seriesId] : null;
      const seriesPattern = seriesData?.pattern ?? null;
      return {
        ...ev,
        seriesPattern,
        cadenceLabel: seriesPattern ? this.cadenceLabelFromPattern(seriesPattern) : null,
        upcomingCount: ev.seriesId ? (upcomingCountMap[ev.seriesId] ?? 0) : null,
        isRecurring: ev.seriesId != null,
      } satisfies EventWithExtras;
    }).filter(Boolean) as EventWithExtras[];
  }

  async getEventById(id: number): Promise<Event | undefined> {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.isActive, true)));
    return event;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event> {
    const [updatedEvent] = await db
      .update(events)
      .set({...updates, updatedAt: new Date()})
      .where(eq(events.id, id))
      .returning();
    return updatedEvent;
  }

  async deleteEvent(id: number): Promise<void> {
    await db
      .update(events)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(events.id, id));
  }

  async getEventSeriesInstances(seriesId: number): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(and(eq(events.seriesId, seriesId), eq(events.isActive, true)))
      .orderBy(events.startAt);
  }

  async createRecurringEventInstances(
    instancesData: InsertEvent[],
  ): Promise<Event[]> {
    if (instancesData.length === 0) return [];
    const created = await db.insert(events).values(instancesData).returning();
    return created;
  }

  async updateEventSeries(
    seriesId: number,
    updates: Partial<InsertEvent>,
  ): Promise<void> {
    const {startAt: _s, seriesId: _sid, sequenceNumber: _sn, ...safeUpdates} = updates;
    await db
      .update(events)
      .set({...safeUpdates, updatedAt: new Date()})
      .where(eq(events.seriesId, seriesId));
  }

  async deleteEventSeries(seriesId: number): Promise<void> {
    await db
      .update(events)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(events.seriesId, seriesId));
    await db
      .update(eventSeries)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(eventSeries.id, seriesId));
  }

  async deleteEventSeriesFromDate(
    seriesId: number,
    fromDate: Date,
  ): Promise<void> {
    await db
      .update(events)
      .set({isActive: false, updatedAt: new Date()})
      .where(
        and(
          eq(events.seriesId, seriesId),
          sql`${events.startAt} >= ${fromDate.toISOString()}`,
        ),
      );
  }

  async createEventSeries(data: InsertEventSeries): Promise<EventSeries> {
    const [series] = await db.insert(eventSeries).values(data).returning();
    return series;
  }

  async getEventSeriesById(id: number): Promise<EventSeries | undefined> {
    const [series] = await db
      .select()
      .from(eventSeries)
      .where(eq(eventSeries.id, id));
    return series;
  }

  async updateEventSeriesRecord(seriesId: number, data: Partial<InsertEventSeries>): Promise<EventSeries> {
    const [updated] = await db
      .update(eventSeries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(eventSeries.id, seriesId))
      .returning();
    return updated;
  }

  async cancelEventInstance(eventId: number): Promise<void> {
    await db
      .update(events)
      .set({ isCancelled: true, updatedAt: new Date() })
      .where(eq(events.id, eventId));
  }

  async convertSeriesInstanceToStandalone(
    keepEventId: number,
    seriesId: number,
    updates: Partial<InsertEvent>,
  ): Promise<Event> {
    // Cancel/soft-delete every other instance in the series. They keep their
    // seriesId pointer briefly so the caller can still query registrants by
    // series, but we null it out below before deleting the series row.
    await db
      .update(events)
      .set({ isActive: false, isCancelled: true, updatedAt: new Date() })
      .where(and(eq(events.seriesId, seriesId), sql`${events.id} <> ${keepEventId}`));

    // Detach kept event from series and apply the submitted updates atomically.
    // Strip series-only fields from updates so callers can't reintroduce them.
    const {
      seriesId: _sid,
      sequenceNumber: _sn,
      instanceOverrides: _io,
      ...safeUpdates
    } = updates;

    const [kept] = await db
      .update(events)
      .set({
        ...safeUpdates,
        seriesId: null,
        sequenceNumber: null,
        instanceOverrides: null,
        isCancelled: false,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(events.id, keepEventId))
      .returning();

    // Null out the FK on the now-inactive siblings so the series row can be
    // hard-deleted without violating the FK constraint.
    await db
      .update(events)
      .set({ seriesId: null, updatedAt: new Date() })
      .where(eq(events.seriesId, seriesId));

    await db.delete(eventSeries).where(eq(eventSeries.id, seriesId));

    return kept;
  }

  async getActiveRegistrationCountsBySeriesId(
    seriesId: number,
  ): Promise<Map<number, number>> {
    // One grouped query (anti-N+1). "Active" = not cancelled/refunded, same
    // definition getUpcomingInstancesWithCounts uses, so a refunded signup
    // doesn't pin an instance the CM is trying to reschedule.
    const rows = await db
      .select({
        eventId: events.id,
        count: sql<number>`count(${eventRegistrations.id})::int`,
      })
      .from(events)
      .leftJoin(
        eventRegistrations,
        and(
          eq(eventRegistrations.eventId, events.id),
          sql`${eventRegistrations.status} NOT IN ('cancelled', 'refunded')`,
        ),
      )
      .where(and(eq(events.seriesId, seriesId), eq(events.isActive, true)))
      .groupBy(events.id);
    return new Map(rows.map((r) => [r.eventId, r.count]));
  }

  async softDeleteEventsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(events)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(events.id, ids));
  }

  async getUpcomingInstancesWithCounts(
    seriesId: number,
    afterDate: Date,
    limit: number,
    offset: number,
  ): Promise<Array<Event & { registrationCount: number; isFull: boolean }>> {
    const rows = await db
      .select({
        event: events,
        registrationCount: sql<number>`count(${eventRegistrations.id})::int`,
      })
      .from(events)
      .leftJoin(
        eventRegistrations,
        and(
          eq(eventRegistrations.eventId, events.id),
          sql`${eventRegistrations.status} NOT IN ('cancelled', 'refunded')`,
        ),
      )
      .where(
        and(
          eq(events.seriesId, seriesId),
          eq(events.isActive, true),
          sql`${events.startAt} >= ${afterDate.toISOString()}`,
        ),
      )
      .groupBy(events.id)
      .orderBy(events.startAt)
      .limit(limit)
      .offset(offset);

    return rows.map(({ event, registrationCount }) => ({
      ...event,
      registrationCount,
      isFull: event.maxAttendees != null && registrationCount >= event.maxAttendees,
    }));
  }

  // Booking operations
  async getBookingSessionsByProfileId(
    profileId: string,
  ): Promise<BookingSession[]> {
    return await db
      .select()
      .from(bookingSessions)
      .where(
        and(
          eq(bookingSessions.profileId, profileId),
          eq(bookingSessions.isActive, true),
        ),
      )
      .orderBy(desc(bookingSessions.createdAt));
  }

  async createBookingSession(
    session: InsertBookingSession,
  ): Promise<BookingSession> {
    const [newSession] = await db
      .insert(bookingSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async updateBookingSession(
    id: number,
    updates: Partial<InsertBookingSession>,
  ): Promise<BookingSession> {
    const [updatedSession] = await db
      .update(bookingSessions)
      .set({...updates, updatedAt: new Date()})
      .where(eq(bookingSessions.id, id))
      .returning();
    return updatedSession;
  }

  async deleteBookingSession(id: number): Promise<void> {
    await db
      .update(bookingSessions)
      .set({isActive: false, updatedAt: new Date()})
      .where(eq(bookingSessions.id, id));
  }

  async getBookingSessionById(id: number): Promise<BookingSession | undefined> {
    const [session] = await db
      .select()
      .from(bookingSessions)
      .where(eq(bookingSessions.id, id));
    return session;
  }

  async getBookingSlotsBySessionId(sessionId: number): Promise<BookingSlot[]> {
    return await db
      .select()
      .from(bookingSlots)
      .where(eq(bookingSlots.sessionId, sessionId))
      .orderBy(bookingSlots.date, bookingSlots.startTime);
  }

  async createBookingSlot(slot: InsertBookingSlot): Promise<BookingSlot> {
    const [newSlot] = await db.insert(bookingSlots).values(slot).returning();
    return newSlot;
  }

  async updateBookingSlot(
    id: number,
    updates: Partial<InsertBookingSlot>,
  ): Promise<BookingSlot> {
    const [updatedSlot] = await db
      .update(bookingSlots)
      .set({...updates, updatedAt: new Date()})
      .where(eq(bookingSlots.id, id))
      .returning();
    return updatedSlot;
  }

  async deleteBookingSlot(id: number): Promise<void> {
    await db.delete(bookingSlots).where(eq(bookingSlots.id, id));
  }

  // Booking management methods
  async createBooking(booking: InsertBooking): Promise<Booking> {
    const [newBooking] = await db.insert(bookings).values(booking).returning();
    return newBooking;
  }

  async getBookingsByProfileId(profileId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.profileId, profileId))
      .orderBy(desc(bookings.createdAt));
  }

  async getBookingsBySessionId(sessionId: number): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.sessionId, sessionId))
      .orderBy(desc(bookings.createdAt));
  }

  async getBookedSlotsForProfile(
    profileId: string,
    date?: string,
  ): Promise<{bookingDate: string; bookingTime: string}[]> {
    const conditions = [
      eq(bookings.profileId, profileId),
      notInArray(bookings.status, ["cancelled", "declined"]),
    ];

    if (date) {
      // Filter by explicit date range to avoid timezone risk with DATE()
      conditions.push(
        sql`${bookings.bookingDate} >= ${date}::date AND ${bookings.bookingDate} < ${date}::date + interval '1 day'`,
      );
    } else {
      // When no date supplied, return all booked slots for today and future dates
      conditions.push(sql`${bookings.bookingDate} >= CURRENT_DATE`);
    }

    const rows = await db
      .select({
        bookingDate: sql<string>`to_char(${bookings.bookingDate}, 'YYYY-MM-DD')`,
        bookingTime: bookings.bookingTime,
      })
      .from(bookings)
      .where(and(...conditions));

    return rows.map((r) => ({
      bookingDate: r.bookingDate,
      bookingTime: r.bookingTime,
    }));
  }

  async updateBooking(
    id: number,
    updates: Partial<InsertBooking>,
  ): Promise<Booking> {
    const [updatedBooking] = await db
      .update(bookings)
      .set({...updates, updatedAt: new Date()})
      .where(eq(bookings.id, id))
      .returning();
    return updatedBooking;
  }

  async updateBookingConditional(
    id: number,
    updates: Partial<InsertBooking>,
    expectedStatus: string,
  ): Promise<Booking | null> {
    const result = await db
      .update(bookings)
      .set({...updates, updatedAt: new Date()})
      .where(and(eq(bookings.id, id), eq(bookings.status, expectedStatus)))
      .returning();
    return result.length > 0 ? result[0] : null;
  }

  async getBookingById(id: number): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));
    return booking;
  }

  async getBookingByConfirmationCode(
    confirmationCode: string,
  ): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.confirmationCode, confirmationCode));
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking> {
    const [updatedBooking] = await db
      .update(bookings)
      .set({status, updatedAt: new Date()})
      .where(eq(bookings.id, id))
      .returning();
    return updatedBooking;
  }

  async getBookingByCancelToken(
    cancelToken: string,
  ): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.cancelToken, cancelToken));
    return booking;
  }

  async updateBookingWithConfirmation(
    id: number,
    data: {
      status: string;
      coachMessage: string | null;
      meetingLink: string | null;
      cancelToken?: string;
    },
  ): Promise<Booking> {
    const setData: any = {
      status: data.status,
      coachMessage: data.coachMessage,
      meetingLink: data.meetingLink,
      updatedAt: new Date(),
    };
    if (data.cancelToken) {
      setData.cancelToken = data.cancelToken;
    }
    const [updatedBooking] = await db
      .update(bookings)
      .set(setData)
      .where(eq(bookings.id, id))
      .returning();
    return updatedBooking;
  }

  // Mentor availability operations
  async getMentorAvailabilityByProfileId(
    profileId: string,
  ): Promise<MentorAvailability[]> {
    return await db
      .select()
      .from(mentorAvailability)
      .where(
        and(
          eq(mentorAvailability.profileId, profileId),
          eq(mentorAvailability.isActive, true),
        ),
      )
      .orderBy(mentorAvailability.dayOfWeek, mentorAvailability.startTime);
  }

  async getAllMentorAvailabilityByProfileId(
    profileId: string,
  ): Promise<MentorAvailability[]> {
    return await db
      .select()
      .from(mentorAvailability)
      .where(eq(mentorAvailability.profileId, profileId))
      .orderBy(mentorAvailability.dayOfWeek, mentorAvailability.startTime);
  }

  async createMentorAvailability(
    availability: InsertMentorAvailability,
  ): Promise<MentorAvailability> {
    const [newAvailability] = await db
      .insert(mentorAvailability)
      .values(availability)
      .returning();
    return newAvailability;
  }

  async updateMentorAvailability(
    id: number,
    updates: Partial<InsertMentorAvailability>,
  ): Promise<MentorAvailability> {
    const [updatedAvailability] = await db
      .update(mentorAvailability)
      .set({...updates, updatedAt: new Date()})
      .where(eq(mentorAvailability.id, id))
      .returning();
    return updatedAvailability;
  }

  async deleteMentorAvailability(id: number): Promise<void> {
    await db.delete(mentorAvailability).where(eq(mentorAvailability.id, id));
  }

  // Blocked dates operations
  async getBlockedDatesByProfileId(profileId: string): Promise<BlockedDate[]> {
    return await db
      .select()
      .from(blockedDates)
      .where(eq(blockedDates.profileId, profileId))
      .orderBy(blockedDates.blockedDate);
  }

  async createBlockedDate(
    blockedDate: InsertBlockedDate,
  ): Promise<BlockedDate> {
    const [newBlockedDate] = await db
      .insert(blockedDates)
      .values(blockedDate)
      .returning();
    return newBlockedDate;
  }

  async deleteBlockedDate(id: number): Promise<void> {
    await db.delete(blockedDates).where(eq(blockedDates.id, id));
  }

  // Search operations
  async searchProfiles(
    query: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Profile[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    const isSearching = query.trim().length > 0;

    // Base conditions for all queries
    const baseConditions = and(
      eq(profiles.isActive, true),
      eq(profiles.isDeactivated, false),
    );

    // When not searching (default listing), only show profiles with showInDiscover = true
    // When searching, show all active profiles (so they're still findable)
    if (!isSearching) {
      return await db
        .select()
        .from(profiles)
        .where(and(baseConditions, eq(profiles.showInDiscover, true)))
        .limit(limit)
        .offset(offset);
    }

    // When searching, include all active profiles regardless of showInDiscover
    return await db
      .select()
      .from(profiles)
      .where(
        and(
          baseConditions,
          or(
            // Direct profile field matches
            ilike(profiles.displayName, searchTerm),
            ilike(profiles.username, searchTerm),
            ilike(profiles.title, searchTerm),
            ilike(profiles.searchableLocation, searchTerm),
            ilike(profiles.shortBio, searchTerm),
            // Search in profile tags
            exists(
              db
                .select()
                .from(profileTags)
                .innerJoin(tags, eq(profileTags.tagId, tags.id))
                .where(
                  and(
                    eq(profileTags.profileId, profiles.id),
                    ilike(tags.name, searchTerm),
                  ),
                ),
            ),
            // Search in coach's sessions (title, description, session tags)
            exists(
              db
                .select()
                .from(bookingSessions)
                .where(
                  and(
                    eq(bookingSessions.profileId, profiles.id),
                    eq(bookingSessions.isActive, true),
                    or(
                      ilike(bookingSessions.title, searchTerm),
                      ilike(bookingSessions.thumbnailDescription, searchTerm),
                    ),
                  ),
                ),
            ),
            // Search in session tags
            exists(
              db
                .select()
                .from(bookingSessions)
                .innerJoin(
                  sessionTags,
                  eq(sessionTags.sessionId, bookingSessions.id),
                )
                .innerJoin(tags, eq(sessionTags.tagId, tags.id))
                .where(
                  and(
                    eq(bookingSessions.profileId, profiles.id),
                    eq(bookingSessions.isActive, true),
                    ilike(tags.name, searchTerm),
                  ),
                ),
            ),
            // Search in coach's events (title, description, event tags)
            exists(
              db
                .select()
                .from(events)
                .where(
                  and(
                    eq(events.profileId, profiles.id),
                    eq(events.isActive, true),
                    or(
                      ilike(events.title, searchTerm),
                      ilike(events.description, searchTerm),
                    ),
                  ),
                ),
            ),
            // Search in event tags
            exists(
              db
                .select()
                .from(events)
                .innerJoin(eventTags, eq(eventTags.eventId, events.id))
                .innerJoin(tags, eq(eventTags.tagId, tags.id))
                .where(
                  and(
                    eq(events.profileId, profiles.id),
                    eq(events.isActive, true),
                    ilike(tags.name, searchTerm),
                  ),
                ),
            ),
          ),
        ),
      )
      .limit(limit)
      .offset(offset);
  }

  // Discovery endpoints for homepage
  async getAllPublicSessions(query: string, limit: number): Promise<any[]> {
    const results = await db
      .select({
        session: bookingSessions,
        profile: {
          username: profiles.username,
          displayName: profiles.displayName,
          profileImageUrl: profiles.profileImageUrl,
        },
        location: {
          city: locations.city,
          state: locations.state,
          country: locations.country,
        },
      })
      .from(bookingSessions)
      .innerJoin(profiles, eq(bookingSessions.profileId, profiles.id))
      .leftJoin(locations, eq(bookingSessions.locationId, locations.id))
      .where(
        and(
          eq(bookingSessions.isActive, true),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
          query
            ? or(
                // Session fields
                ilike(bookingSessions.title, `%${query}%`),
                ilike(bookingSessions.thumbnailDescription, `%${query}%`),
                // Coach profile fields
                ilike(profiles.displayName, `%${query}%`),
                ilike(profiles.username, `%${query}%`),
                ilike(profiles.title, `%${query}%`),
                // Session tags
                exists(
                  db
                    .select()
                    .from(sessionTags)
                    .innerJoin(tags, eq(sessionTags.tagId, tags.id))
                    .where(
                      and(
                        eq(sessionTags.sessionId, bookingSessions.id),
                        ilike(tags.name, `%${query}%`),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
      )
      .limit(limit)
      .orderBy(desc(bookingSessions.createdAt));

    // Fetch tags for all sessions in a single query (gracefully handle missing table)
    const sessionIds = results.map((r) => r.session.id);
    let tagsBySession: Record<number, any[]> = {};
    try {
      const sessionTagsData =
        sessionIds.length > 0
          ? await db
              .select({
                sessionId: sessionTags.sessionId,
                tag: tags,
              })
              .from(sessionTags)
              .innerJoin(tags, eq(sessionTags.tagId, tags.id))
              .where(inArray(sessionTags.sessionId, sessionIds))
          : [];

      // Group tags by sessionId
      tagsBySession = sessionTagsData.reduce(
        (acc, {sessionId, tag}) => {
          if (!acc[sessionId]) acc[sessionId] = [];
          acc[sessionId].push(tag);
          return acc;
        },
        {} as Record<number, any[]>,
      );
    } catch (error: any) {
      // Tables may not exist yet - gracefully continue without tags
      if (error?.code !== "42P01") {
        console.error("Error fetching session tags:", error);
      }
    }

    return results.map(({session, profile, location}) => ({
      ...session,
      profile,
      tags: tagsBySession[session.id] || [],
      location:
        location?.city || location?.state || location?.country
          ? location
          : null,
    }));
  }

  // Helper: derive human-readable cadence label from a series pattern object
  private cadenceLabelFromPattern(pattern: EventSeries['pattern'] | null): string | null {
    if (!pattern) return null;
    const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (pattern.type === 'weekly') {
      const days = ([...(pattern.weekdays || [])] as number[]).sort((a, b) => a - b).map((d: number) => WDS[d]).join(' & ');
      if (pattern.intervalWeeks === 2) return `Every other ${days}`;
      if (pattern.intervalWeeks > 2) return `Every ${pattern.intervalWeeks} weeks on ${days}`;
      return `Every ${days}`;
    }
    if (pattern.type === 'monthly_nth') {
      const ords = ['', '1st', '2nd', '3rd', '4th', '5th'];
      return `${ords[pattern.nth] || 'Nth'} ${WD[pattern.weekday]} of each month`;
    }
    if (pattern.type === 'monthly_date') {
      const d = pattern.dayOfMonth;
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      return `${d}${suffix} of each month`;
    }
    if (pattern.type === 'custom') return 'Custom dates';
    return null;
  }

  async getAllPublicEvents(query: string, limit: number): Promise<any[]> {
    // ── Step 1: CTE dedup at SQL level ──────────────────────────────────────
    // ROW_NUMBER() partitioned by parent_event_id picks the best child per series
    // (earliest upcoming, falling back to most recent past).
    // Parent template rows (is_recurring=true) are excluded outright.
    // Tag search uses COALESCE(parent_event_id, id) so recurring-series tags
    // (stored on the parent) are matched when searching by tag name.
    const queryFilter = query
      ? sql`AND (
          e.title ILIKE ${"%" + query + "%"}
          OR e.thumbnail_description ILIKE ${"%" + query + "%"}
          OR p.display_name ILIKE ${"%" + query + "%"}
          OR p.username ILIKE ${"%" + query + "%"}
          OR p.title ILIKE ${"%" + query + "%"}
          OR EXISTS (
            SELECT 1 FROM event_tags et
            JOIN tags t ON et.tag_id = t.id
            WHERE et.event_id = e.id
            AND t.name ILIKE ${"%" + query + "%"}
          )
        )`
      : sql``;

    const idRows = await db.execute<{id: number}>(sql`
      WITH ranked AS (
        SELECT
          e.id,
          e.start_at,
          CASE WHEN e.series_id IS NULL THEN NULL
            ELSE ROW_NUMBER() OVER (
              PARTITION BY e.series_id
              ORDER BY
                CASE WHEN e.start_at >= NOW() THEN 0 ELSE 1 END ASC,
                CASE WHEN e.start_at >= NOW() THEN e.start_at END ASC NULLS LAST,
                CASE WHEN e.start_at < NOW() THEN e.start_at END DESC NULLS LAST
            )
          END AS series_rank
        FROM events e
        INNER JOIN profiles p ON e.profile_id = p.id
        WHERE
          e.is_active = true
          AND (e.is_cancelled IS NULL OR e.is_cancelled = false)
          AND p.is_active = true
          AND p.is_deactivated = false
          AND COALESCE(e.end_at, e.start_at) + INTERVAL '12 hours' > NOW()
          ${queryFilter}
      )
      SELECT id, start_at FROM ranked
      WHERE series_rank IS NULL OR series_rank = 1
      ORDER BY
        CASE WHEN start_at >= NOW() THEN 0 ELSE 1 END ASC,
        CASE WHEN start_at >= NOW() THEN start_at END ASC NULLS LAST,
        CASE WHEN start_at < NOW() THEN start_at END DESC NULLS LAST
      LIMIT ${limit}
    `);

    const orderedIds = idRows.map((r) => Number(r.id));
    if (orderedIds.length === 0) return [];

    // ── Step 2: Fetch full event + profile + location data for the selected IDs
    const results = await db
      .select({
        event: events,
        profile: {
          username: profiles.username,
          displayName: profiles.displayName,
          profileImageUrl: profiles.profileImageUrl,
        },
        location: {
          city: locations.city,
          state: locations.state,
          country: locations.country,
        },
      })
      .from(events)
      .innerJoin(profiles, eq(events.profileId, profiles.id))
      .leftJoin(locations, eq(events.locationId, locations.id))
      .where(inArray(events.id, orderedIds));

    // Preserve the CTE ordering (IN clause does not guarantee order)
    const byId = new Map(results.map((r) => [r.event.id, r]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean) as typeof results;

    // ── Step 3: Fetch tags ──────────────────────────────────────────────────
    // Tags are stored per event instance.
    const tagIdToEventId: Record<number, number> = {};
    ordered.forEach((r) => {
      tagIdToEventId[r.event.id] = r.event.id;
    });
    const uniqueTagLookupIds = [
      ...new Set(ordered.map((r) => r.event.id)),
    ];

    let tagsByEvent: Record<number, any[]> = {};
    try {
      const eventTagsData =
        uniqueTagLookupIds.length > 0
          ? await db
              .select({eventId: eventTags.eventId, tag: tags})
              .from(eventTags)
              .innerJoin(tags, eq(eventTags.tagId, tags.id))
              .where(inArray(eventTags.eventId, uniqueTagLookupIds))
          : [];

      eventTagsData.forEach(({eventId: lookupId, tag}) => {
        const childId = tagIdToEventId[lookupId] ?? lookupId;
        if (!tagsByEvent[childId]) tagsByEvent[childId] = [];
        tagsByEvent[childId].push(tag);
      });
    } catch (error: any) {
      if (error?.code !== "42P01") {
        console.error("Error fetching event tags:", error);
      }
    }

    // ── Step 4: Fetch series patterns + upcoming counts for recurring events ──
    const recurringResults = ordered.filter(r => r.event.seriesId != null);
    const uniqueSeriesIds = [...new Set(recurringResults.map(r => r.event.seriesId!))];

    let seriesBySeriesId: Record<number, EventSeries> = {};
    let upcomingCountBySeriesId: Record<number, number> = {};

    if (uniqueSeriesIds.length > 0) {
      const seriesRows = await db
        .select()
        .from(eventSeries)
        .where(inArray(eventSeries.id, uniqueSeriesIds));
      seriesBySeriesId = Object.fromEntries(seriesRows.map(s => [s.id, s]));

      // Count upcoming non-cancelled instances per series
      const now = new Date();
      const countRows = await db
        .select({
          seriesId: events.seriesId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            inArray(events.seriesId, uniqueSeriesIds),
            eq(events.isActive, true),
            sql`(${events.isCancelled} IS NULL OR ${events.isCancelled} = false)`,
            sql`${events.startAt} >= ${now.toISOString()}`,
          ),
        )
        .groupBy(events.seriesId);
      upcomingCountBySeriesId = Object.fromEntries(
        countRows.filter(r => r.seriesId != null).map(r => [r.seriesId!, r.cnt])
      );
    }

    return ordered.map(({event, profile, location}) => {
      const seriesData = event.seriesId ? seriesBySeriesId[event.seriesId] : null;
      const seriesPattern = seriesData?.pattern ?? null;
      return {
        ...event,
        profile,
        tags: tagsByEvent[event.id] || [],
        locationData:
          location?.city || location?.state || location?.country
            ? location
            : null,
        seriesPattern,
        cadenceLabel: seriesPattern ? this.cadenceLabelFromPattern(seriesPattern) : null,
        upcomingCount: event.seriesId ? (upcomingCountBySeriesId[event.seriesId] ?? 0) : null,
        isRecurring: event.seriesId != null,
      };
    });
  }

  // Get available locations for coaches filtering
  async getCoachLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  > {
    const locationSet = new Map<
      string,
      {city: string; state: string | null; country: string | null}
    >();

    const coachLocations = await db
      .select({searchableLocation: profiles.searchableLocation})
      .from(profiles)
      .where(
        and(
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
          sql`${profiles.searchableLocation} IS NOT NULL AND ${profiles.searchableLocation} != ''`,
        ),
      );

    for (const coach of coachLocations) {
      if (coach.searchableLocation) {
        const parts = coach.searchableLocation.split(",").map((p) => p.trim());
        if (parts.length > 0 && parts[0]) {
          const city = parts[0];
          const state = parts.length >= 2 ? parts[1] : null;
          const country = parts.length >= 3 ? parts[2] : null;
          const key = `${city.toLowerCase()}-${(state || "").toLowerCase()}-${(country || "").toLowerCase()}`;
          if (!locationSet.has(key)) {
            locationSet.set(key, {city, state, country});
          }
        }
      }
    }

    return this.formatLocations(locationSet);
  }

  // Get available locations for sessions filtering
  async getSessionLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  > {
    const locationSet = new Map<
      string,
      {city: string; state: string | null; country: string | null}
    >();

    const dbLocations = await db
      .select({
        city: locations.city,
        state: locations.state,
        country: locations.country,
      })
      .from(locations)
      .innerJoin(bookingSessions, eq(bookingSessions.locationId, locations.id))
      .innerJoin(profiles, eq(bookingSessions.profileId, profiles.id))
      .where(
        and(
          eq(bookingSessions.isActive, true),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
          sql`(${locations.city} IS NOT NULL AND ${locations.city} != '') OR (${locations.state} IS NOT NULL AND ${locations.state} != '') OR (${locations.country} IS NOT NULL AND ${locations.country} != '')`,
        ),
      );

    for (const loc of dbLocations) {
      const primaryLocation = loc.city || loc.state || loc.country;
      if (primaryLocation) {
        const key = `${(loc.city || "").toLowerCase()}-${(loc.state || "").toLowerCase()}-${(loc.country || "").toLowerCase()}`;
        if (!locationSet.has(key)) {
          locationSet.set(key, {
            city: loc.city || "",
            state: loc.state || null,
            country: loc.country || null,
          });
        }
      }
    }

    return this.formatLocations(locationSet);
  }

  // Get available locations for events filtering
  async getEventLocations(): Promise<
    {
      city: string;
      state: string | null;
      country: string | null;
      displayLabel: string;
    }[]
  > {
    const locationSet = new Map<
      string,
      {city: string; state: string | null; country: string | null}
    >();

    const eventLocations = await db
      .select({location: events.location})
      .from(events)
      .innerJoin(profiles, eq(events.profileId, profiles.id))
      .where(
        and(
          eq(events.isActive, true),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
          sql`${events.location} IS NOT NULL AND ${events.location} != ''`,
        ),
      );

    for (const event of eventLocations) {
      if (event.location) {
        const parts = event.location.split(",").map((p) => p.trim());
        if (parts.length > 0 && parts[0]) {
          const city = parts[0];
          const state = parts.length > 1 ? parts[1] : null;
          const country = parts.length > 2 ? parts[2] : null;
          const key = `${city.toLowerCase()}-${(state || "").toLowerCase()}-${(country || "").toLowerCase()}`;
          if (!locationSet.has(key)) {
            locationSet.set(key, {city, state, country});
          }
        }
      }
    }

    return this.formatLocations(locationSet);
  }

  // Get all event dates for calendar highlighting (includes duplicates for count-per-day)
  async getEventDates(): Promise<string[]> {
    const results = await db
      .select({startAt: events.startAt})
      .from(events)
      .innerJoin(profiles, eq(events.profileId, profiles.id))
      .where(
        and(
          eq(events.isActive, true),
          eq(profiles.isActive, true),
          eq(profiles.isDeactivated, false),
          sql`COALESCE(${events.endAt}, ${events.startAt}) + INTERVAL '12 hours' > NOW()`,
        ),
      )
      .orderBy(events.startAt);

    return results.map((r) => {
      if (r.startAt instanceof Date) {
        return r.startAt.toISOString().split("T")[0];
      }
      return String(r.startAt).split("T")[0];
    });
  }

  // Helper to format location results
  private formatLocations(
    locationSet: Map<
      string,
      {city: string; state: string | null; country: string | null}
    >,
  ): {
    city: string;
    state: string | null;
    country: string | null;
    displayLabel: string;
  }[] {
    const result = Array.from(locationSet.values()).map((loc) => {
      const parts = [loc.city, loc.state, loc.country].filter(Boolean);
      const displayLabel = parts.join(", ");
      return {...loc, displayLabel};
    });

    const filteredResult = result.filter((loc) => loc.displayLabel);
    filteredResult.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));

    return filteredResult;
  }

  // Delete user account and all associated data.
  //
  // IMPORTANT — keep this in sync with shared/schema.ts:
  //   Every foreign key to profiles.id MUST declare an onDelete behavior
  //   ("cascade" for user-owned rows, "set null" for historical rows we want
  //   to preserve). The database constraints are the authoritative safety net
  //   for new tables; the explicit deletes below are defense-in-depth and
  //   control transaction ordering. See replit.md → "Foreign Keys to
  //   profiles.id — Account Deletion Policy" for the full policy.
  async deleteUserAccount(profileId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const userBookings = await tx
        .select({id: bookings.id})
        .from(bookings)
        .where(eq(bookings.profileId, profileId));
      const bookingIds = userBookings.map((b) => b.id);

      if (bookingIds.length > 0) {
        await tx
          .delete(bookingMessages)
          .where(inArray(bookingMessages.bookingId, bookingIds));
        await tx
          .delete(bookingEvents)
          .where(inArray(bookingEvents.bookingId, bookingIds));
      }

      // session_reviews is not declared in shared/schema.ts but the table
      // exists in production from migration 0001 with NOT-NULL FKs to
      // bookings, booking_sessions, guest_profiles, and profiles. Clear them
      // out via raw SQL so deletion works even on databases where migration
      // 0006 (cascade FKs) has not yet been applied.
      // Guard with to_regclass so this is a no-op (and doesn't poison the
      // transaction) on databases where the table doesn't exist yet.
      const sessionReviewsExists = await tx.execute(
        sql`SELECT to_regclass('public.session_reviews') AS reg`,
      );
      const reviewsRegRow = (sessionReviewsExists as any)?.[0] ??
        (sessionReviewsExists as any)?.rows?.[0];
      if (reviewsRegRow?.reg) {
        await tx.execute(
          sql`DELETE FROM session_reviews WHERE coach_profile_id = ${profileId}`,
        );
      }

      await tx.delete(bookings).where(eq(bookings.profileId, profileId));

      const sessions = await tx
        .select({id: bookingSessions.id})
        .from(bookingSessions)
        .where(eq(bookingSessions.profileId, profileId));
      const sessionIds = sessions.map((s) => s.id);

      if (sessionIds.length > 0) {
        await tx
          .delete(bookingSlots)
          .where(inArray(bookingSlots.sessionId, sessionIds));
        await tx
          .delete(sessionTags)
          .where(inArray(sessionTags.sessionId, sessionIds));
      }

      await tx
        .delete(bookingSessions)
        .where(eq(bookingSessions.profileId, profileId));

      const eventsList = await tx
        .select({id: events.id})
        .from(events)
        .where(eq(events.profileId, profileId));
      const eventIds = eventsList.map((e) => e.id);

      if (eventIds.length > 0) {
        await tx
          .delete(eventRegistrations)
          .where(inArray(eventRegistrations.eventId, eventIds));
        await tx.delete(eventTags).where(inArray(eventTags.eventId, eventIds));
      }

      await tx.delete(events).where(eq(events.profileId, profileId));

      await tx
        .delete(eventSeries)
        .where(eq(eventSeries.profileId, profileId));

      const digitalProductsList = await tx
        .select({id: digitalProducts.id})
        .from(digitalProducts)
        .where(eq(digitalProducts.profileId, profileId));
      const digitalProductIds = digitalProductsList.map((p) => p.id);

      if (digitalProductIds.length > 0) {
        await tx
          .delete(digitalProductPurchases)
          .where(inArray(digitalProductPurchases.productId, digitalProductIds));
        await tx
          .delete(digitalProductTags)
          .where(inArray(digitalProductTags.productId, digitalProductIds));
      }

      await tx
        .update(digitalProductPurchases)
        .set({buyerProfileId: null})
        .where(eq(digitalProductPurchases.buyerProfileId, profileId));

      await tx
        .delete(digitalProducts)
        .where(eq(digitalProducts.profileId, profileId));

      const physicalProductsList = await tx
        .select({id: physicalProducts.id})
        .from(physicalProducts)
        .where(eq(physicalProducts.profileId, profileId));
      const physicalProductIds = physicalProductsList.map((p) => p.id);

      if (physicalProductIds.length > 0) {
        await tx
          .delete(physicalProductTags)
          .where(inArray(physicalProductTags.productId, physicalProductIds));
      }

      await tx
        .delete(physicalProducts)
        .where(eq(physicalProducts.profileId, profileId));

      const blogPostsList = await tx
        .select({id: blogPosts.id})
        .from(blogPosts)
        .where(eq(blogPosts.profileId, profileId));
      const blogPostIds = blogPostsList.map((p) => p.id);

      if (blogPostIds.length > 0) {
        await tx
          .delete(blogPostTags)
          .where(inArray(blogPostTags.postId, blogPostIds));
      }

      await tx.delete(blogPosts).where(eq(blogPosts.profileId, profileId));

      await tx
        .delete(mentorAvailability)
        .where(eq(mentorAvailability.profileId, profileId));
      await tx
        .delete(blockedDates)
        .where(eq(blockedDates.profileId, profileId));
      await tx.delete(locations).where(eq(locations.profileId, profileId));
      await tx.delete(profileTags).where(eq(profileTags.profileId, profileId));
      await tx.delete(payouts).where(eq(payouts.profileId, profileId));
      await tx
        .delete(walletSummaries)
        .where(eq(walletSummaries.profileId, profileId));
      await tx
        .delete(transactions)
        .where(eq(transactions.profileId, profileId));
      await tx
        .delete(stripeAccounts)
        .where(eq(stripeAccounts.profileId, profileId));
      await tx
        .delete(coachPaymentSettings)
        .where(eq(coachPaymentSettings.coachId, profileId));
      await tx
        .delete(whatsappSessions)
        .where(eq(whatsappSessions.profileId, profileId));
      await tx
        .delete(eventRegistrations)
        .where(eq(eventRegistrations.profileId, profileId));
      await tx
        .update(guestProfiles)
        .set({originCoachId: null})
        .where(eq(guestProfiles.originCoachId, profileId));
      await tx
        .update(tags)
        .set({createdBy: null})
        .where(eq(tags.createdBy, profileId));

      await tx.delete(profiles).where(eq(profiles.id, profileId));
    });
  }

  // Deactivate account - mark as dormant, profile won't show in public/search
  async deactivateAccount(profileId: string): Promise<void> {
    await db
      .update(profiles)
      .set({
        isDeactivated: true,
        deactivatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));
  }

  // Reactivate account - restore account from dormant state
  async reactivateAccount(profileId: string): Promise<void> {
    await db
      .update(profiles)
      .set({
        isDeactivated: false,
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));
  }

  // =================== WALLET OPERATIONS ===================

  // Wallet summary operations
  async getWalletSummaryByProfileId(
    profileId: string,
  ): Promise<WalletSummary | undefined> {
    const [walletSummary] = await db
      .select()
      .from(walletSummaries)
      .where(eq(walletSummaries.profileId, profileId));
    return walletSummary;
  }

  async createWalletSummary(
    summary: InsertWalletSummary,
  ): Promise<WalletSummary> {
    const [newSummary] = await db
      .insert(walletSummaries)
      .values(summary)
      .returning();
    return newSummary;
  }

  async updateWalletSummary(
    profileId: string,
    updates: Partial<InsertWalletSummary>,
  ): Promise<WalletSummary> {
    const [updatedSummary] = await db
      .update(walletSummaries)
      .set({...updates, updatedAt: new Date()})
      .where(eq(walletSummaries.profileId, profileId))
      .returning();
    return updatedSummary;
  }

  // Transaction operations
  async getTransactionsByProfileId(profileId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.profileId, profileId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(
    transaction: InsertTransaction,
  ): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  // Stripe Connect account operations
  async getStripeConnectAccountByProfileId(
    profileId: string,
  ): Promise<StripeAccount | undefined> {
    const [account] = await db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.profileId, profileId));
    return account;
  }

  async createStripeConnectAccount(
    account: InsertStripeAccount,
  ): Promise<StripeAccount> {
    const [newAccount] = await db
      .insert(stripeAccounts)
      .values(account as any)
      .returning();
    return newAccount;
  }

  async updateStripeConnectAccount(
    profileId: string,
    updates: Partial<InsertStripeAccount>,
  ): Promise<StripeAccount> {
    const [updatedAccount] = await db
      .update(stripeAccounts)
      .set({...updates, updatedAt: new Date()} as any)
      .where(eq(stripeAccounts.profileId, profileId))
      .returning();
    return updatedAccount;
  }

  // =================== TAG OPERATIONS ===================
  // All tag operations gracefully handle missing tables (returns empty/undefined instead of throwing)

  async getAllTags(): Promise<Tag[]> {
    try {
      return await db
        .select()
        .from(tags)
        .where(eq(tags.isApproved, true))
        .orderBy(desc(tags.usageCount));
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async getTagById(id: number): Promise<Tag | undefined> {
    try {
      const [tag] = await db.select().from(tags).where(eq(tags.id, id));
      return tag;
    } catch (error: any) {
      if (error?.code === "42P01") return undefined; // Table doesn't exist
      throw error;
    }
  }

  async getTagBySlug(slug: string): Promise<Tag | undefined> {
    try {
      const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
      return tag;
    } catch (error: any) {
      if (error?.code === "42P01") return undefined; // Table doesn't exist
      throw error;
    }
  }

  async getTagByName(name: string): Promise<Tag | undefined> {
    try {
      const [tag] = await db
        .select()
        .from(tags)
        .where(eq(tags.name, name.toLowerCase().trim()));
      return tag;
    } catch (error: any) {
      if (error?.code === "42P01") return undefined; // Table doesn't exist
      throw error;
    }
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    const slug = tag.name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const [newTag] = await db
      .insert(tags)
      .values({...tag, name: tag.name.toLowerCase().trim(), slug})
      .returning();
    return newTag;
  }

  async updateTag(id: number, updates: Partial<InsertTag>): Promise<Tag> {
    const updateData: any = {...updates};
    if (updates.name) {
      updateData.name = updates.name.toLowerCase().trim();
      updateData.slug = updates.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }
    const [updatedTag] = await db
      .update(tags)
      .set(updateData)
      .where(eq(tags.id, id))
      .returning();
    return updatedTag;
  }

  async deleteTag(id: number): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async searchTags(query: string, limit: number = 20): Promise<Tag[]> {
    try {
      return await db
        .select()
        .from(tags)
        .where(and(eq(tags.isApproved, true), ilike(tags.name, `%${query}%`)))
        .orderBy(desc(tags.usageCount))
        .limit(limit);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async getPopularTags(limit: number = 20): Promise<Tag[]> {
    try {
      return await db
        .select()
        .from(tags)
        .where(eq(tags.isApproved, true))
        .orderBy(desc(tags.usageCount))
        .limit(limit);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  // Session tags
  async getTagsBySessionId(sessionId: number): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(sessionTags)
        .innerJoin(tags, eq(sessionTags.tagId, tags.id))
        .where(eq(sessionTags.sessionId, sessionId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setSessionTags(sessionId: number, tagIds: number[]): Promise<void> {
    try {
      await db.delete(sessionTags).where(eq(sessionTags.sessionId, sessionId));
      if (tagIds.length > 0) {
        await db
          .insert(sessionTags)
          .values(tagIds.map((tagId) => ({sessionId, tagId})));
        // Update usage counts
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Event tags
  async getTagsByEventId(eventId: number): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(eventTags)
        .innerJoin(tags, eq(eventTags.tagId, tags.id))
        .where(eq(eventTags.eventId, eventId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setEventTags(eventId: number, tagIds: number[]): Promise<void> {
    try {
      await db.delete(eventTags).where(eq(eventTags.eventId, eventId));
      if (tagIds.length > 0) {
        await db
          .insert(eventTags)
          .values(tagIds.map((tagId) => ({eventId, tagId})));
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Digital product tags
  async getTagsByDigitalProductId(productId: number): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(digitalProductTags)
        .innerJoin(tags, eq(digitalProductTags.tagId, tags.id))
        .where(eq(digitalProductTags.productId, productId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setDigitalProductTags(
    productId: number,
    tagIds: number[],
  ): Promise<void> {
    try {
      await db
        .delete(digitalProductTags)
        .where(eq(digitalProductTags.productId, productId));
      if (tagIds.length > 0) {
        await db
          .insert(digitalProductTags)
          .values(tagIds.map((tagId) => ({productId, tagId})));
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Physical product tags
  async getTagsByPhysicalProductId(productId: number): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(physicalProductTags)
        .innerJoin(tags, eq(physicalProductTags.tagId, tags.id))
        .where(eq(physicalProductTags.productId, productId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setPhysicalProductTags(
    productId: number,
    tagIds: number[],
  ): Promise<void> {
    try {
      await db
        .delete(physicalProductTags)
        .where(eq(physicalProductTags.productId, productId));
      if (tagIds.length > 0) {
        await db
          .insert(physicalProductTags)
          .values(tagIds.map((tagId) => ({productId, tagId})));
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Blog post tags
  async getTagsByBlogPostId(postId: number): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(blogPostTags)
        .innerJoin(tags, eq(blogPostTags.tagId, tags.id))
        .where(eq(blogPostTags.postId, postId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setBlogPostTags(postId: number, tagIds: number[]): Promise<void> {
    try {
      await db.delete(blogPostTags).where(eq(blogPostTags.postId, postId));
      if (tagIds.length > 0) {
        await db
          .insert(blogPostTags)
          .values(tagIds.map((tagId) => ({postId, tagId})));
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Profile tags
  async getTagsByProfileId(profileId: string): Promise<Tag[]> {
    try {
      const result = await db
        .select({tag: tags})
        .from(profileTags)
        .innerJoin(tags, eq(profileTags.tagId, tags.id))
        .where(eq(profileTags.profileId, profileId));
      return result.map((r) => r.tag);
    } catch (error: any) {
      if (error?.code === "42P01") return []; // Table doesn't exist
      throw error;
    }
  }

  async setProfileTags(profileId: string, tagIds: number[]): Promise<void> {
    try {
      await db.delete(profileTags).where(eq(profileTags.profileId, profileId));
      if (tagIds.length > 0) {
        await db
          .insert(profileTags)
          .values(tagIds.map((tagId) => ({profileId, tagId})));
        await db
          .update(tags)
          .set({usageCount: sql`${tags.usageCount} + 1`})
          .where(inArray(tags.id, tagIds));
      }
    } catch (error: any) {
      if (error?.code === "42P01") return; // Table doesn't exist
      throw error;
    }
  }

  // Get consolidated tags from all entity types for a profile
  async getConsolidatedTagsByProfileId(profileId: string): Promise<{
    profile: Tag[];
    sessions: Tag[];
    events: Tag[];
    blogs: Tag[];
    digitalProducts: Tag[];
    physicalProducts: Tag[];
    all: Tag[];
  }> {
    const tagMap = new Map<number, Tag>();
    const result = {
      profile: [] as Tag[],
      sessions: [] as Tag[],
      events: [] as Tag[],
      blogs: [] as Tag[],
      digitalProducts: [] as Tag[],
      physicalProducts: [] as Tag[],
      all: [] as Tag[],
    };

    try {
      // Get profile-specific tags first
      const profileTagsList = await this.getTagsByProfileId(profileId);
      result.profile = profileTagsList;
      profileTagsList.forEach((tag) => tagMap.set(tag.id, tag));

      // Get tags from sessions
      const sessions = await this.getBookingSessionsByProfileId(profileId);
      for (const session of sessions) {
        const sessionTagsList = await this.getTagsBySessionId(session.id);
        result.sessions.push(...sessionTagsList);
        sessionTagsList.forEach((tag) => tagMap.set(tag.id, tag));
      }

      // Get tags from events
      const eventsList = await this.getEventsByProfileId(profileId);
      for (const event of eventsList) {
        const eventTagsList = await this.getTagsByEventId(event.id);
        result.events.push(...eventTagsList);
        eventTagsList.forEach((tag) => tagMap.set(tag.id, tag));
      }

      // Get tags from blog posts
      const blogPosts = await this.getAllBlogPostsByProfileId(profileId);
      for (const post of blogPosts) {
        const blogTagsList = await this.getTagsByBlogPostId(post.id);
        result.blogs.push(...blogTagsList);
        blogTagsList.forEach((tag) => tagMap.set(tag.id, tag));
      }

      // Get tags from digital products
      const digitalProductsList =
        await this.getDigitalProductsByProfileId(profileId);
      for (const product of digitalProductsList) {
        const productTagsList = await this.getTagsByDigitalProductId(
          product.id,
        );
        result.digitalProducts.push(...productTagsList);
        productTagsList.forEach((tag) => tagMap.set(tag.id, tag));
      }

      // Get tags from physical products
      const physicalProductsList =
        await this.getPhysicalProductsByProfileId(profileId);
      for (const product of physicalProductsList) {
        const productTagsList = await this.getTagsByPhysicalProductId(
          product.id,
        );
        result.physicalProducts.push(...productTagsList);
        productTagsList.forEach((tag) => tagMap.set(tag.id, tag));
      }

      // Collect all unique tags
      result.all = Array.from(tagMap.values());

      return result;
    } catch (error: any) {
      console.error("Error fetching consolidated tags:", error);
      return result;
    }
  }

  // Auto-sync profile tags from consolidated content tags
  async syncProfileTagsFromConsolidated(profileId: string): Promise<void> {
    try {
      const consolidated = await this.getConsolidatedTagsByProfileId(profileId);
      const tagIds = consolidated.all.map((tag) => tag.id);
      await this.setProfileTags(profileId, tagIds);
    } catch (error: any) {
      console.error("Error auto-syncing profile tags:", error);
      // Don't throw - this is a background sync operation
    }
  }

  // =================== GUEST PROFILE OPERATIONS ===================
  async getGuestProfileByEmail(
    email: string,
  ): Promise<GuestProfile | undefined> {
    const [guestProfile] = await db
      .select()
      .from(guestProfiles)
      .where(eq(guestProfiles.email, email.toLowerCase()));
    return guestProfile;
  }

  async getOrCreateGuestProfile(
    email: string,
    name: string,
    phone: string | null,
    originCoachId: string,
  ): Promise<GuestProfile> {
    const existingProfile = await this.getGuestProfileByEmail(email);
    if (existingProfile) {
      const needsUpdate =
        existingProfile.name !== name || existingProfile.phone !== phone;
      const needsAccessToken = !existingProfile.accessToken;
      if (needsUpdate || needsAccessToken) {
        const updates: Partial<InsertGuestProfile> = {};
        if (needsUpdate) {
          updates.name = name;
          updates.phone = phone;
        }
        if (needsAccessToken) {
          updates.accessToken = crypto.randomUUID();
        }
        return this.updateGuestProfile(existingProfile.id, updates);
      }
      return existingProfile;
    }
    // Always supply an accessToken on creation so downstream flows (event
    // registration → /complete-payment redirect, guest portal links, etc.)
    // never receive a null token. The schema declares defaultRandom() but
    // older DB instances may not have that default applied, so we generate
    // one in application code as a defensive measure.
    return this.createGuestProfile({
      email: email.toLowerCase(),
      name,
      phone,
      originCoachId,
      accessToken: crypto.randomUUID(),
    });
  }

  async getGuestProfileByMagicLinkToken(
    token: string,
  ): Promise<GuestProfile | undefined> {
    const [guestProfile] = await db
      .select()
      .from(guestProfiles)
      .where(eq(guestProfiles.magicLinkToken, token));
    return guestProfile;
  }

  async getGuestProfileByAccessToken(
    accessToken: string,
  ): Promise<GuestProfile | undefined> {
    console.log(
      `[Storage] Looking up guest profile by access token: "${accessToken}"`,
    );
    const [guestProfile] = await db
      .select()
      .from(guestProfiles)
      .where(eq(guestProfiles.accessToken, accessToken));
    console.log(
      `[Storage] Query result:`,
      guestProfile
        ? `Found guest #${guestProfile.id}, email: ${guestProfile.email}`
        : "Not found",
    );
    return guestProfile;
  }

  async getGuestProfileById(id: number): Promise<GuestProfile | undefined> {
    const [guestProfile] = await db
      .select()
      .from(guestProfiles)
      .where(eq(guestProfiles.id, id));
    return guestProfile;
  }

  async createGuestProfile(
    guestProfile: InsertGuestProfile,
  ): Promise<GuestProfile> {
    const [newGuestProfile] = await db
      .insert(guestProfiles)
      .values({
        ...guestProfile,
        email: guestProfile.email.toLowerCase(),
      })
      .returning();
    return newGuestProfile;
  }

  async updateGuestProfile(
    id: number,
    updates: Partial<InsertGuestProfile>,
  ): Promise<GuestProfile> {
    const [updatedGuestProfile] = await db
      .update(guestProfiles)
      .set({...updates, updatedAt: new Date()})
      .where(eq(guestProfiles.id, id))
      .returning();
    return updatedGuestProfile;
  }

  async getBookingsByGuestProfileId(
    guestProfileId: number,
  ): Promise<Booking[]> {
    return db
      .select()
      .from(bookings)
      .where(eq(bookings.guestProfileId, guestProfileId))
      .orderBy(desc(bookings.bookingDate));
  }

  async getEventRegistrationsByGuestProfileId(
    guestProfileId: number,
  ): Promise<EventRegistration[]> {
    return db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.guestProfileId, guestProfileId))
      .orderBy(desc(eventRegistrations.createdAt));
  }

  async getDigitalProductPurchasesByEmail(
    email: string,
  ): Promise<DigitalProductPurchase[]> {
    return db
      .select()
      .from(digitalProductPurchases)
      .where(eq(digitalProductPurchases.email, email.toLowerCase()))
      .orderBy(desc(digitalProductPurchases.createdAt));
  }

  async getDigitalProductPurchasesByGuestProfileId(
    guestProfileId: number,
  ): Promise<DigitalProductPurchase[]> {
    return db
      .select()
      .from(digitalProductPurchases)
      .where(eq(digitalProductPurchases.guestProfileId, guestProfileId))
      .orderBy(desc(digitalProductPurchases.createdAt));
  }

  // =================== BOOKING MESSAGE OPERATIONS ===================
  async getMessagesByBookingId(bookingId: number): Promise<BookingMessage[]> {
    return db
      .select()
      .from(bookingMessages)
      .where(eq(bookingMessages.bookingId, bookingId))
      .orderBy(bookingMessages.createdAt);
  }

  async createBookingMessage(
    message: InsertBookingMessage,
  ): Promise<BookingMessage> {
    const [newMessage] = await db
      .insert(bookingMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async markMessagesAsRead(
    bookingId: number,
    senderType: string,
  ): Promise<void> {
    // Mark messages as read for the opposite sender type (messages from guest read by coach, etc.)
    const readBySenderType = senderType === "coach" ? "guest" : "coach";
    await db
      .update(bookingMessages)
      .set({isRead: true})
      .where(
        and(
          eq(bookingMessages.bookingId, bookingId),
          eq(bookingMessages.senderType, readBySenderType),
        ),
      );
  }

  async getUnreadMessageCount(
    bookingId: number,
    senderType: string,
  ): Promise<number> {
    const unreadFromSenderType = senderType === "coach" ? "guest" : "coach";
    const result = await db
      .select({count: sql<number>`count(*)`})
      .from(bookingMessages)
      .where(
        and(
          eq(bookingMessages.bookingId, bookingId),
          eq(bookingMessages.senderType, unreadFromSenderType),
          eq(bookingMessages.isRead, false),
        ),
      );
    return Number(result[0]?.count || 0);
  }

  // =================== BOOKING EVENT OPERATIONS ===================
  async createBookingEvent(event: InsertBookingEvent): Promise<BookingEvent> {
    const [newEvent] = await db.insert(bookingEvents).values(event).returning();
    return newEvent;
  }

  async getBookingEventsByBookingId(
    bookingId: number,
  ): Promise<BookingEvent[]> {
    return db
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, bookingId))
      .orderBy(bookingEvents.createdAt);
  }

  async getBookingEventsForProfile(profileId: string): Promise<BookingEvent[]> {
    return db
      .select({
        id: bookingEvents.id,
        bookingId: bookingEvents.bookingId,
        eventType: bookingEvents.eventType,
        actorType: bookingEvents.actorType,
        message: bookingEvents.message,
        metadata: bookingEvents.metadata,
        createdAt: bookingEvents.createdAt,
      })
      .from(bookingEvents)
      .innerJoin(bookings, eq(bookingEvents.bookingId, bookings.id))
      .where(eq(bookings.profileId, profileId))
      .orderBy(desc(bookingEvents.createdAt));
  }
  // =================== COACH PAYMENT SETTINGS ===================
  async getCoachPaymentSettings(
    coachId: string,
  ): Promise<CoachPaymentSettings | undefined> {
    const [settings] = await db
      .select()
      .from(coachPaymentSettings)
      .where(eq(coachPaymentSettings.coachId, coachId));
    return settings;
  }

  async upsertCoachPaymentSettings(
    coachId: string,
    data: {defaultInstructions?: string | null; methods?: any[]},
  ): Promise<CoachPaymentSettings> {
    // Atomic upsert to avoid race conditions when two concurrent saves land
    // for the same coach (e.g. event form syncing settings while the user
    // also saves the payment settings tab). A naive check-then-insert flow
    // can throw "duplicate key" on coach_payment_settings_pkey under load.
    const [row] = await db
      .insert(coachPaymentSettings)
      .values({
        coachId,
        defaultInstructions: data.defaultInstructions ?? null,
        methods: data.methods ?? [],
      })
      .onConflictDoUpdate({
        target: coachPaymentSettings.coachId,
        set: {
          ...(data.defaultInstructions !== undefined
            ? { defaultInstructions: data.defaultInstructions }
            : {}),
          ...(data.methods !== undefined ? { methods: data.methods } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // =================== BOOKING PAYMENT OPERATIONS ===================
  // Legacy rows may contain auto-generated method details from the old single-method flow in paymentInstruction.
  // New rows only use paymentInstruction for Path B freeform custom instructions.
  async updateBookingPaymentRequested(
    bookingId: number,
    methodsOffered: any[] | null,
    customInstruction: string | null,
  ): Promise<Booking> {
    const [updated] = await db
      .update(bookings)
      .set({
        paymentStatus: "requested",
        paymentMethodsOffered: methodsOffered,
        paymentInstruction: customInstruction,
        paymentMethodSelected: null,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    return updated;
  }

  async updateBookingProofUploaded(
    bookingId: number,
    proofUrl: string | null,
    referenceText: string | null,
    selectedMethod: string | null,
  ): Promise<Booking | null> {
    const updateData: any = {
      paymentStatus: "proof_uploaded",
      paymentProofUrl: proofUrl,
      paymentReferenceText: referenceText,
      paymentMarkedAt: new Date(),
      updatedAt: new Date(),
    };
    if (selectedMethod !== null) {
      updateData.paymentMethodSelected = selectedMethod;
    }
    const result = await db
      .update(bookings)
      .set(updateData)
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.paymentStatus, "requested"),
        ),
      )
      .returning();
    return result.length > 0 ? result[0] : null;
  }

  async updateBookingPaymentVerified(
    bookingId: number,
    meetingLink?: string | null,
    coachMessage?: string | null,
  ): Promise<Booking | null> {
    const updateData: any = {
      paymentStatus: "verified",
      status: "confirmed",
      paymentConfirmedAt: new Date(),
      updatedAt: new Date(),
    };
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink;
    if (coachMessage !== undefined) updateData.coachMessage = coachMessage;

    const result = await db
      .update(bookings)
      .set(updateData)
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.paymentStatus, "proof_uploaded"),
        ),
      )
      .returning();
    return result.length > 0 ? result[0] : null;
  }
  async updateBookingPaymentRejected(
    bookingId: number,
  ): Promise<Booking | null> {
    const result = await db
      .update(bookings)
      .set({
        paymentStatus: "requested",
        paymentProofUrl: null,
        paymentReferenceText: null,
        paymentMethodSelected: null,
        paymentMarkedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.paymentStatus, "proof_uploaded"),
        ),
      )
      .returning();
    return result.length > 0 ? result[0] : null;
  }

  // =================== COACH NOTIFICATION OPERATIONS ===================
  async createCoachNotification(
    notification: InsertCoachNotification,
  ): Promise<CoachNotification> {
    const [created] = await db
      .insert(coachNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getCoachNotifications(
    coachId: string,
    limit = 50,
  ): Promise<CoachNotification[]> {
    return db
      .select()
      .from(coachNotifications)
      .where(eq(coachNotifications.coachId, coachId))
      .orderBy(desc(coachNotifications.createdAt))
      .limit(limit);
  }

  async getUnreadCoachNotificationCount(coachId: string): Promise<number> {
    const result = await db
      .select({count: sql<number>`count(*)`})
      .from(coachNotifications)
      .where(
        and(
          eq(coachNotifications.coachId, coachId),
          eq(coachNotifications.isRead, false),
        ),
      );
    return Number(result[0]?.count ?? 0);
  }

  async markCoachNotificationRead(
    id: number,
    coachId: string,
  ): Promise<CoachNotification | null> {
    const [updated] = await db
      .update(coachNotifications)
      .set({isRead: true})
      .where(
        and(
          eq(coachNotifications.id, id),
          eq(coachNotifications.coachId, coachId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async markAllCoachNotificationsRead(coachId: string): Promise<void> {
    await db
      .update(coachNotifications)
      .set({isRead: true})
      .where(
        and(
          eq(coachNotifications.coachId, coachId),
          eq(coachNotifications.isRead, false),
        ),
      );
  }

  async markCoachNotificationsByType(coachId: string, types: string[]): Promise<void> {
    if (types.length === 0) return;
    await db
      .update(coachNotifications)
      .set({isRead: true})
      .where(
        and(
          eq(coachNotifications.coachId, coachId),
          eq(coachNotifications.isRead, false),
          inArray(coachNotifications.type, types),
        ),
      );
  }

  async markCoachNotificationByReference(
    coachId: string,
    reference: { bookingId?: number; registrationId?: number },
  ): Promise<void> {
    const { bookingId, registrationId } = reference;
    if (!bookingId && !registrationId) return;
    const jsonbFilter = bookingId
      ? sql`${coachNotifications.metadata} @> ${JSON.stringify({ bookingId })}::jsonb`
      : sql`${coachNotifications.metadata} @> ${JSON.stringify({ registrationId })}::jsonb`;
    await db
      .update(coachNotifications)
      .set({isRead: true})
      .where(
        and(
          eq(coachNotifications.coachId, coachId),
          eq(coachNotifications.isRead, false),
          jsonbFilter,
        ),
      );
  }

  async pruneOldCoachNotifications(coachId: string): Promise<void> {
    const RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS ?? 90);
    const MAX_ROWS = Number(process.env.NOTIFICATION_MAX_ROWS ?? 200);
    // Step 1: delete read notifications older than the retention window
    await db.execute(
      sql`DELETE FROM coach_notifications
          WHERE coach_id = ${coachId}
            AND is_read = true
            AND created_at < NOW() - (${RETENTION_DAYS} || ' days')::INTERVAL`,
    );
    // Step 2: if total rows for this coach still exceeds the cap, drop the oldest
    await db.execute(
      sql`DELETE FROM coach_notifications
          WHERE coach_id = ${coachId}
            AND id NOT IN (
              SELECT id FROM coach_notifications
              WHERE coach_id = ${coachId}
              ORDER BY created_at DESC
              LIMIT ${MAX_ROWS}
            )`,
    );
  }

  // =================== PUSH SUBSCRIPTION OPERATIONS ===================
  async upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const [result] = await db
      .insert(pushSubscriptions)
      .values(sub)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: sub.p256dh,
          auth: sub.auth,
          profileId: sub.profileId,
        },
      })
      .returning();
    return result;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getPushSubscriptionsByProfileId(profileId: string): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.profileId, profileId));
  }
}

export const storage = new DatabaseStorage();
