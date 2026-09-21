/**
 * E2E tests: notification click → Booking Inbox navigation
 *
 * These tests verify that when a coach clicks a notification in the bell
 * panel, the Booking Inbox sheet opens and lands on the correct tab:
 *  - "new_registration" notification  → Events tab
 *  - "new_booking"    notification    → Needs Action (Notification) tab
 *
 * All external API calls (Supabase auth, app REST endpoints) are mocked so
 * the tests run against the dev server without real credentials.
 *
 * IMPORTANT — Playwright routes are matched LIFO (last registered wins).
 * Catch-all routes must be registered FIRST so that specific routes added
 * afterwards take priority over them.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_PROJECT_REF = "psrccktleltdthwzdtfx";
const SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

/** Build a structurally-valid JWT with a far-future expiry.
 *  Supabase JS reads the base64url payload to check `exp` but does NOT
 *  verify the signature client-side, so an unsigned fake token works. */
function buildMockJwt(userId: string, email: string): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub: userId,
    email,
    role: "authenticated",
    aud: "authenticated",
    exp: 9_999_999_999,   // ~year 2286 — won't trigger a refresh
    iat: 1_000_000_000,
  });
  return `${header}.${payload}.mock_sig_for_e2e_tests`;
}

const MOCK_USER_ID = "mock-coach-id-e2e";
const MOCK_EMAIL = "coach-e2e@example.com";
const MOCK_ACCESS_TOKEN = buildMockJwt(MOCK_USER_ID, MOCK_EMAIL);

const MOCK_SUPABASE_USER = {
  id: MOCK_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: MOCK_EMAIL,
  email_confirmed_at: "2024-01-01T00:00:00.000Z",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Test Coach" },
};

const MOCK_SUPABASE_SESSION = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 9_999_999_999,
  refresh_token: "mock-refresh-token-e2e",
  user: MOCK_SUPABASE_USER,
};

const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  userId: MOCK_USER_ID,
  username: "testcoach",
  displayName: "Test Coach",
  email: MOCK_EMAIL,
  onboardingCompleted: true,
  requiresWhatsappEmailVerification: false,
  emailVerifiedAt: "2024-01-01T00:00:00.000Z",
  sourceChannel: "email",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/** A "new_registration" notification — should open the Events tab */
const EVENT_NOTIFICATION = {
  id: 1001,
  profileId: MOCK_USER_ID,
  type: "new_registration",
  title: "New event registration",
  body: "Alice Smith registered for your workshop",
  isRead: false,
  createdAt: new Date().toISOString(),
  metadata: { eventId: 5001, registrationId: 6001 },
};

/** A "new_booking" notification — should open the Needs-Action tab */
const BOOKING_NOTIFICATION = {
  id: 1002,
  profileId: MOCK_USER_ID,
  type: "new_booking",
  title: "New session booking",
  body: "Bob Johnson booked a coaching session",
  isRead: false,
  createdAt: new Date().toISOString(),
  metadata: { bookingId: 7001 },
};

// ---------------------------------------------------------------------------
// Route-mocking helpers
// ---------------------------------------------------------------------------

/**
 * Set up all network mocks needed to render the dashboard as an
 * authenticated coach without hitting real Supabase or app APIs.
 *
 * Registration order matters (Playwright LIFO — last registered wins):
 *  1. Broad catch-alls first (lowest priority)
 *  2. Specific routes last (highest priority)
 */
async function setupMocks(page: Page, notifications: object[]): Promise<void> {
  // ---- Step 0: inject the Supabase session into localStorage BEFORE any
  //              page scripts run, so getSession() finds it immediately. ----
  await page.addInitScript(
    ({ storageKey, sessionJson }: { storageKey: string; sessionJson: string }) => {
      localStorage.setItem(storageKey, sessionJson);
    },
    {
      storageKey: `sb-${SUPABASE_PROJECT_REF}-auth-token`,
      sessionJson: JSON.stringify(MOCK_SUPABASE_SESSION),
    }
  );

  // ---- Step 1: broad catch-alls (lowest priority — registered first) ----

  // Block any Supabase storage / realtime / other endpoints
  await page.route(`${SUPABASE_URL}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );

  // Catch-all for remaining app API calls (returns empty success)
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // ---- Step 2: specific app API routes (higher priority — registered after catch-alls) ----

  // SSE — return an empty stream so the notifications hook doesn't block
  await page.route("**/api/notifications/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: "",
    })
  );

  await page.route("**/api/dashboard/bookings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  await page.route("**/api/dashboard/event-registrations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ eventGroups: [], upcomingEventsCount: 0 }),
    })
  );

  await page.route("**/api/dashboard/product-purchases", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );

  await page.route("**/api/dashboard/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PROFILE),
    })
  );

  // Notifications list (GET only — let PATCH/mark-read fall through to catch-all)
  await page.route("**/api/notifications", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(notifications),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // Supabase config handed to the browser client
  await page.route("**/api/config/supabase", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: SUPABASE_URL, anonKey: "mock-anon-key-for-e2e" }),
    })
  );

  // ---- Step 3: Supabase auth endpoints (highest priority — registered last) ----

  const authSessionResponse = JSON.stringify({ ...MOCK_SUPABASE_SESSION });
  const userResponse = JSON.stringify(MOCK_SUPABASE_USER);

  await page.route(`${SUPABASE_URL}/auth/v1/session**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: authSessionResponse })
  );

  await page.route(`${SUPABASE_URL}/auth/v1/user**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: userResponse })
  );

  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: authSessionResponse })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Notification click → Booking Inbox navigation", () => {
  test(
    "clicking an event-registration notification opens the Booking Inbox on the Events tab",
    async ({ page }) => {
      await setupMocks(page, [EVENT_NOTIFICATION]);

      await page.goto("/dashboard");

      // Wait for the dashboard header to render (bell button indicates auth succeeded)
      const bell = page.getByTestId("button-notification-bell");
      await expect(bell).toBeVisible({ timeout: 20_000 });

      // Open notification panel popover
      await bell.click();
      await expect(page.getByTestId("notification-panel")).toBeVisible();

      // The event-registration notification should be listed and clickable
      const notifItem = page.getByTestId(`notification-item-${EVENT_NOTIFICATION.id}`);
      await expect(notifItem).toBeVisible();
      await expect(notifItem).toContainText("New event registration");

      // Click the notification — triggers navigation into Booking Inbox
      await notifItem.click();

      // The Booking Inbox sheet/panel must open
      await expect(page.getByTestId("booking-panel")).toBeVisible({ timeout: 8_000 });
      await expect(page.getByTestId("booking-inbox")).toBeVisible({ timeout: 8_000 });

      // Scope all inbox-tab assertions to the booking-inbox container to
      // avoid a strict-mode collision with the matching tab-testid in the
      // dashboard sidebar.
      const inbox = page.getByTestId("booking-inbox");

      // The "Events" tab inside the inbox must be the active one
      const eventsTab = inbox.getByTestId("tab-events");
      await expect(eventsTab).toBeVisible();
      // Active tab carries the coloured background class
      await expect(eventsTab).toHaveClass(/bg-\[#C96868\]/);
    }
  );

  test(
    "clicking a session-booking notification opens the Booking Inbox on the Needs Action tab",
    async ({ page }) => {
      await setupMocks(page, [BOOKING_NOTIFICATION]);

      await page.goto("/dashboard");

      const bell = page.getByTestId("button-notification-bell");
      await expect(bell).toBeVisible({ timeout: 20_000 });

      await bell.click();
      await expect(page.getByTestId("notification-panel")).toBeVisible();

      const notifItem = page.getByTestId(`notification-item-${BOOKING_NOTIFICATION.id}`);
      await expect(notifItem).toBeVisible();
      await expect(notifItem).toContainText("New session booking");

      await notifItem.click();

      // Panel opens — the booking ID (7001) is NOT in the mocked bookings
      // list, so BookingPanel falls back to showing BookingInbox on the
      // default "Needs Action" tab rather than navigating into a detail view.
      await expect(page.getByTestId("booking-panel")).toBeVisible({ timeout: 8_000 });

      const inbox = page.getByTestId("booking-inbox");
      await expect(inbox).toBeVisible({ timeout: 8_000 });

      // The "Notification" (needs_action) tab must be active.
      // Scope within the inbox to avoid a collision with sidebar tab-testids.
      const needsActionTab = inbox.getByTestId("tab-needs_action");
      await expect(needsActionTab).toBeVisible();
      await expect(needsActionTab).toHaveClass(/bg-\[#C96868\]/);
    }
  );
});
