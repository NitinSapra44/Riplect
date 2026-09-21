/**
 * Integration tests for the recurring-to-one-time (de-recur) conversion.
 *
 * Strategy
 * ─────────
 * We test at two layers:
 *
 * 1. Route-handler integration (supertest) — all external dependencies are
 *    mocked (storage, auth, email, db) but the actual Express handler from
 *    routes.ts is exercised end-to-end. Assertions cover:
 *      • HTTP response status / body
 *      • which storage methods were called and with what arguments
 *      • which cancellation emails were sent (and which were NOT sent)
 *
 * 2. Storage-layer unit test — mocks the raw Drizzle db object and asserts
 *    the exact SQL mutations issued by convertSeriesInstanceToStandalone.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

// ─── Shared mock state (hoisted so vi.mock factories can access it) ────────
const $s = vi.hoisted(() => ({
  // ── in-memory dataset ─────────────────────────────────────────
  profile: {
    id: "coach-uuid",
    username: "testcoach",
    displayName: "Test Coach",
  } as Record<string, unknown>,

  eventsById: {
    1: {
      id: 1, profileId: "coach-uuid", seriesId: 10, sequenceNumber: 1,
      instanceOverrides: null, isCancelled: false, isActive: true,
      title: "Yoga – S1", startAt: new Date("2026-06-01T10:00:00Z"), endAt: new Date("2026-06-01T11:00:00Z"),
    },
    2: {
      id: 2, profileId: "coach-uuid", seriesId: 10, sequenceNumber: 2,
      instanceOverrides: null, isCancelled: false, isActive: true,
      title: "Yoga – S2", startAt: new Date("2026-06-08T10:00:00Z"), endAt: new Date("2026-06-08T11:00:00Z"),
    },
    3: {
      id: 3, profileId: "coach-uuid", seriesId: 10, sequenceNumber: 3,
      instanceOverrides: null, isCancelled: false, isActive: true,
      title: "Yoga – S3", startAt: new Date("2026-06-15T10:00:00Z"), endAt: new Date("2026-06-15T11:00:00Z"),
    },
  } as Record<number, Record<string, unknown>>,

  seriesInstances: [
    { id: 1, seriesId: 10, isCancelled: false, title: "Yoga – S1", startAt: new Date("2026-06-01T10:00:00Z") },
    { id: 2, seriesId: 10, isCancelled: false, title: "Yoga – S2", startAt: new Date("2026-06-08T10:00:00Z") },
    { id: 3, seriesId: 10, isCancelled: false, title: "Yoga – S3", startAt: new Date("2026-06-15T10:00:00Z") },
  ] as Array<Record<string, unknown>>,

  regsByEventId: {
    1: [{ id: 101, eventId: 1, status: "confirmed", clientEmail: "alice@example.com", clientName: "Alice" }],
    2: [
      { id: 102, eventId: 2, status: "confirmed", clientEmail: "bob@example.com", clientName: "Bob" },
      { id: 103, eventId: 2, status: "confirmed", clientEmail: "carol@example.com", clientName: "Carol" },
    ],
    3: [], // kept event — no registrants by default
  } as Record<number, Array<Record<string, unknown>>>,

  // ── call-capture for assertions ───────────────────────────────
  convertCalls: [] as Array<{ keepId: number; seriesId: number; updates: Record<string, unknown> }>,
  emailsSent: [] as Array<{ email: string; name: string }>,

  keptRow: {
    id: 3, profileId: "coach-uuid", seriesId: null, sequenceNumber: null,
    instanceOverrides: null, isCancelled: false, isActive: true,
    title: "Yoga – Standalone",
    startAt: "2026-06-15T10:00:00.000Z",
    endAt: "2026-06-15T11:00:00.000Z",
  } as Record<string, unknown>,

  // ── db-layer test state ───────────────────────────────────────
  dbUpdatePayloads: [] as Array<Record<string, unknown>>,
  dbDeleteCount: 0,
  dbKeptRow: {
    id: 2, seriesId: null, sequenceNumber: null, instanceOverrides: null,
    isCancelled: false, isActive: true,
  } as Record<string, unknown>,
}));

// ─── Mock: storage ─────────────────────────────────────────────────────────
vi.mock("../storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage")>();
  return {
    ...actual, // preserves DatabaseStorage class export
    storage: {
      getProfileById: vi.fn(async () => $s.profile),
      getEventById: vi.fn(async (id: number) => $s.eventsById[id]),
      getEventSeriesInstances: vi.fn(async () => $s.seriesInstances),
      getConfirmedRegistrationsByEventId: vi.fn(async (id: number) =>
        $s.regsByEventId[id] ?? []),
      convertSeriesInstanceToStandalone: vi.fn(
        async (keepId: number, seriesId: number, updates: Record<string, unknown>) => {
          $s.convertCalls.push({ keepId, seriesId, updates });
          return $s.keptRow;
        }),
      setEventTags: vi.fn(async () => {}),
      getActiveRegistrationCountsBySeriesId: vi.fn(async () => ({})),
    },
  };
});

// ─── Mock: auth ────────────────────────────────────────────────────────────
vi.mock("../supabaseAuth", () => ({
  requireAuth: vi.fn((req: any, _res: any, next: any) => {
    req.supabaseUser = { id: "coach-uuid", email: "coach@test.com" };
    next();
  }),
  optionalAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn((req: any) => req.supabaseUser?.id ?? "coach-uuid"),
  getUserEmail: vi.fn(() => "coach@test.com"),
  supabase: null,
  isSupabaseConfigured: vi.fn(() => false),
}));

// ─── Mock: email service ───────────────────────────────────────────────────
vi.mock("../emailService", () => ({
  sendEventCancellationToGuest: vi.fn(
    async (email: string, name: string) => {
      $s.emailsSent.push({ email, name });
    }),
  sendContactMessageToCoach: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendEmailCompletionEmail: vi.fn(),
  sendEmailConfirmationOnlyEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendBookingPendingToClient: vi.fn(),
  sendBookingRequestToCoach: vi.fn(),
  sendBookingConfirmedToClient: vi.fn(),
  sendPlatformContactEmail: vi.fn(),
  sendCancellationToCoach: vi.fn(),
  sendCancellationToClient: vi.fn(),
  sendRescheduleToCoach: vi.fn(),
  sendPaymentProofToCoach: vi.fn(),
  sendPaymentVerifiedToClient: vi.fn(),
  sendPaymentRejectedToClient: vi.fn(),
  sendBookingMessageToGuest: vi.fn(),
  sendBookingMessageToCoach: vi.fn(),
  sendRescheduleDeclinedToClient: vi.fn(),
  sendEventRegistrationConfirmationToGuest: vi.fn(),
  sendEventRegistrationNotificationToCoach: vi.fn(),
  sendEventMeetingLinkToRegistrant: vi.fn(),
  sendEventCancellationNotificationToCoach: vi.fn(),
  sendEventPaymentSubmittedToGuest: vi.fn(),
  sendEventPaymentWaivedToRegistrant: vi.fn(),
  sendProductPurchaseRequestToCoach: vi.fn(),
  sendProductPurchaseConfirmationToBuyer: vi.fn(),
  sendEventPaymentVerifiedToRegistrant: vi.fn(),
  sendEventPaymentRejectedToRegistrant: vi.fn(),
  sendEventPaymentRequestedToRegistrant: vi.fn(),
  sendEventPaymentProofToCoach: vi.fn(),
  sendProductPurchaseConfirmedToBuyer: vi.fn(),
  sendProductPaymentRejectedToBuyer: vi.fn(),
  LocationInfo: {},
  LocationVisibility: {},
}));

// ─── Mock: raw Drizzle db ──────────────────────────────────────────────────
vi.mock("../db", () => ({
  db: {
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((payload: Record<string, unknown>) => {
        $s.dbUpdatePayloads.push(payload);
        const isSecond = $s.dbUpdatePayloads.length === 2;
        return {
          where: vi.fn(isSecond
            ? () => ({ returning: vi.fn().mockResolvedValue([$s.dbKeptRow]) })
            : () => Promise.resolve(undefined)),
        };
      }),
    })),
    delete: vi.fn(() => {
      $s.dbDeleteCount++;
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([]),
        })),
        orderBy: vi.fn().mockResolvedValue([]),
        leftJoin: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

// ─── Mock: heavy side-effect modules ──────────────────────────────────────
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("../whatsapp/routes", () => ({
  registerWhatsAppRoutes: vi.fn(),
}));
vi.mock("../auth/whatsappEmailVerification", () => ({
  registerWhatsappEmailVerificationRoutes: vi.fn(),
}));
vi.mock("../auth/rateLimit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("../auth/phoneVerification", () => ({
  createAndSendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
}));
vi.mock("../auth/identityLinking", () => ({
  attachVerifiedPhoneToCurrentUser: vi.fn(),
  swapEmailAndSetPassword: vi.fn(),
  swapEmailViaLinkedGoogleIdentity: vi.fn(),
  confirmEmailForUser: vi.fn(),
  validatePasswordPolicy: vi.fn(),
  issuePasswordSession: vi.fn(),
  maskEmail: vi.fn((e: string) => e),
}));
vi.mock("../auth/emailVerification", () => ({
  issueEmailCompletionToken: vi.fn(),
  inspectEmailCompletionToken: vi.fn(),
  consumeEmailCompletionToken: vi.fn(),
}));
vi.mock("../supabaseStorage", () => ({
  supabaseStorage: {
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getSignedUrl: vi.fn(),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/img.jpg" } }),
  },
}));
vi.mock("../auth/botMagicLink", () => ({
  redeemBotMagicLinkToken: vi.fn(),
}));
vi.mock("../auth/googleDomain", () => ({
  isGoogleManagedDomain: vi.fn().mockResolvedValue(false),
}));
vi.mock("../email/links", () => ({
  guestPortalLink: vi.fn(() => "https://test.com"),
  coachBookingLink: vi.fn(() => "https://test.com"),
  coachContactLink: vi.fn(() => "https://test.com"),
  coachEventLink: vi.fn(() => "https://test.com"),
  coachProductLink: vi.fn(() => "https://test.com"),
  dashboardLink: vi.fn(() => "https://test.com"),
  eventCancelLink: vi.fn(() => "https://test.com"),
  buildGoogleCalendarUrl: vi.fn(() => "https://calendar.google.com"),
  buildGoogleCalendarUrlForEvent: vi.fn(() => "https://calendar.google.com"),
  eventCompletePaymentLink: vi.fn(() => "https://test.com"),
}));
vi.mock("../email/utils", () => ({
  getAppBaseUrl: vi.fn(() => "https://test.com"),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  })),
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn(),
  })),
}));

// ─── Imports (after all vi.mock calls) ────────────────────────────────────
import request from "supertest";
import express from "express";
import { registerRoutes } from "../routes";
import { DatabaseStorage } from "../storage";

// ─── Build the test Express app once ──────────────────────────────────────
let testApp: express.Express;

beforeAll(async () => {
  testApp = express();
  testApp.use(express.json());
  await registerRoutes(testApp);
});

// ─── Valid de-recur request body ───────────────────────────────────────────
const validBody = {
  title: "Yoga – Standalone",
  startAt: "2026-06-15T10:00:00Z",
  endAt: "2026-06-15T11:00:00Z",
  price: "0",
  location: "Studio",
};

// ─── Route-handler integration tests ──────────────────────────────────────
describe("POST /api/dashboard/events/:id/de-recur — route handler integration", () => {
  beforeEach(() => {
    $s.convertCalls.splice(0);
    $s.emailsSent.splice(0);
    // Restore default registrations (test might have mutated)
    $s.regsByEventId[3] = [];
    $s.eventsById[3] = {
      id: 3, profileId: "coach-uuid", seriesId: 10, sequenceNumber: 3,
      instanceOverrides: null, isCancelled: false, isActive: true,
      title: "Yoga – S3", startAt: new Date("2026-06-15T10:00:00Z"), endAt: new Date("2026-06-15T11:00:00Z"),
    };
  });

  afterEach(async () => {
    // Drain all pending setImmediate callbacks so email side-effects don't
    // bleed into the next test's $s.emailsSent array.
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    $s.emailsSent.splice(0);
  });

  // ── Happy path ────────────────────────────────────────────────────────

  it("returns 200 and the kept-event row", async () => {
    const res = await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(3);
    expect(res.body.seriesId).toBeNull();
    expect(res.body.sequenceNumber).toBeNull();
    expect(res.body.instanceOverrides).toBeNull();
  });

  it("calls convertSeriesInstanceToStandalone with the correct keepEventId and seriesId", async () => {
    await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    expect($s.convertCalls).toHaveLength(1);
    expect($s.convertCalls[0].keepId).toBe(3);
    expect($s.convertCalls[0].seriesId).toBe(10);
  });

  it("sends cancellation emails for every registrant on sibling instances", async () => {
    await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    // Let setImmediate fire so the email fanout runs
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    const emails = $s.emailsSent.map((n) => n.email);
    // Event 1 registrant
    expect(emails).toContain("alice@example.com");
    // Event 2 registrants
    expect(emails).toContain("bob@example.com");
    expect(emails).toContain("carol@example.com");
    expect($s.emailsSent).toHaveLength(3);
  });

  it("does NOT send a cancellation email for registrants on the kept event", async () => {
    // Give the kept event a registrant — it must never receive a cancel email
    $s.regsByEventId[3] = [
      { id: 999, eventId: 3, status: "confirmed", clientEmail: "kept@example.com", clientName: "Kept Guest" },
    ];

    await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    const emails = $s.emailsSent.map((n) => n.email);
    expect(emails).not.toContain("kept@example.com");
  });

  it("sends zero cancellation emails when no sibling has registrants", async () => {
    const orig1 = $s.regsByEventId[1];
    const orig2 = $s.regsByEventId[2];
    $s.regsByEventId[1] = [];
    $s.regsByEventId[2] = [];

    await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect($s.emailsSent).toHaveLength(0);

    $s.regsByEventId[1] = orig1;
    $s.regsByEventId[2] = orig2;
  });

  // ── Error / guard paths ───────────────────────────────────────────────

  it("returns 400 when the event is not part of a series (seriesId is null)", async () => {
    $s.eventsById[3] = { ...$s.eventsById[3], seriesId: null };

    const res = await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    expect(res.status).toBe(400);
    expect($s.convertCalls).toHaveLength(0);
  });

  it("returns 400 when startAt/endAt lack a timezone offset", async () => {
    const res = await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send({ ...validBody, startAt: "2026-06-15T10:00:00", endAt: "2026-06-15T11:00:00" });

    expect(res.status).toBe(400);
    expect($s.convertCalls).toHaveLength(0);
  });

  it("returns 403 when the event belongs to a different coach", async () => {
    $s.eventsById[3] = { ...$s.eventsById[3], profileId: "other-coach" };

    const res = await request(testApp)
      .post("/api/dashboard/events/3/de-recur")
      .send(validBody);

    expect(res.status).toBe(403);
    expect($s.convertCalls).toHaveLength(0);
  });

  it("returns 404 when the event does not exist", async () => {
    const res = await request(testApp)
      .post("/api/dashboard/events/9999/de-recur")
      .send(validBody);

    expect(res.status).toBe(404);
    expect($s.convertCalls).toHaveLength(0);
  });
});

// ─── Storage-layer unit tests ──────────────────────────────────────────────
describe("DatabaseStorage.convertSeriesInstanceToStandalone — db-level mutations", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
    $s.dbUpdatePayloads.splice(0);
    $s.dbDeleteCount = 0;
  });

  it("cancels sibling instances with isCancelled:true / isActive:false (1st update)", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, { title: "Standalone" });
    expect($s.dbUpdatePayloads[0]).toMatchObject({ isCancelled: true, isActive: false });
  });

  it("clears seriesId, sequenceNumber, instanceOverrides on the kept event (2nd update)", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, { title: "Standalone" });
    const second = $s.dbUpdatePayloads[1];
    expect(second).toMatchObject({
      seriesId: null,
      sequenceNumber: null,
      instanceOverrides: null,
      isCancelled: false,
      isActive: true,
    });
  });

  it("does not propagate series-only fields from the caller's updates object", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, {
      title: "Clean",
      seriesId: 99 as any,
      sequenceNumber: 7 as any,
    });
    const second = $s.dbUpdatePayloads[1];
    expect(second.seriesId).toBeNull();
    expect(second.sequenceNumber).toBeNull();
    expect(second.title).toBe("Clean");
  });

  it("nulls FK on siblings before the series row is deleted (3rd update)", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, {});
    expect($s.dbUpdatePayloads[2]).toMatchObject({ seriesId: null });
  });

  it("hard-deletes the event_series row (exactly one delete)", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, {});
    expect($s.dbDeleteCount).toBe(1);
  });

  it("issues exactly 3 updates and 1 delete in total", async () => {
    await storage.convertSeriesInstanceToStandalone(2, 10, {});
    expect($s.dbUpdatePayloads).toHaveLength(3);
    expect($s.dbDeleteCount).toBe(1);
  });

  it("returns the kept-event row from the db .returning() call", async () => {
    const result = await storage.convertSeriesInstanceToStandalone(2, 10, {});
    expect(result).toEqual($s.dbKeptRow);
    expect((result as any).seriesId).toBeNull();
    expect((result as any).sequenceNumber).toBeNull();
  });
});
