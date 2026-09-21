import type { Express } from "express";
import { createServer, type Server } from "http";
import { Readable } from "stream";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { registerWhatsAppRoutes } from "./whatsapp/routes";
import { storage as dbStorage } from "./storage";
import { db } from "./db";
import { guestPortalLink, buildGoogleCalendarUrlForEvent, eventCompletePaymentLink } from "./email/links";
import { requireAuth, optionalAuth, getUserId, getUserEmail, supabase, isSupabaseConfigured } from "./supabaseAuth";
import { consumeRateLimit } from "./auth/rateLimit";
import { createAndSendPhoneOtp, verifyPhoneOtp } from "./auth/phoneVerification";
import {
  issueEmailCompletionToken,
  inspectEmailCompletionToken,
  consumeEmailCompletionToken,
} from "./auth/emailVerification";
import {
  attachVerifiedPhoneToCurrentUser,
  swapEmailAndSetPassword,
  swapEmailViaLinkedGoogleIdentity,
  confirmEmailForUser,
  validatePasswordPolicy,
  issuePasswordSession,
  maskEmail as maskEmailHint,
} from "./auth/identityLinking";
import { isGoogleManagedDomain } from "./auth/googleDomain";
import { maskPhone as maskPhoneHint, normalizeToE164 } from "./auth/phoneNumber";
import { OAuth2Client as GoogleOAuth2Client } from "google-auth-library";
import { registerWhatsappEmailVerificationRoutes } from "./auth/whatsappEmailVerification";
import { eq, and, or, desc, not, sql, notInArray } from "drizzle-orm";
import { 
  insertProfileSchema, 
  insertLocationSchema,
  insertDigitalProductSchema,
  insertPhysicalProductSchema,
  insertBlogPostSchema,
  insertEventSchema,
  insertBookingSessionSchema,
  insertBookingSlotSchema,
  insertEventRegistrationSchema,
  insertMentorAvailabilitySchema,
  insertBlockedDateSchema,
  searchProfilesSchema,
  insertTagSchema,
  deletedAccountMarkers,
  events,
  generatedSites,
  guestProfiles,
  bookings as bookingsTable,
  bookingSessions,
  digitalProductPurchases,
  digitalProducts,
  eventRegistrations,
  bookingEvents as bookingEventsTable,
  bookingMessages as bookingMessagesTable,
  type CoachNotification,
  type Event,
  type InsertEvent,
  type EventSeries,
  type InsertEventSeries,
  type EventWithExtras,
} from "@shared/schema";

/** Discriminated union type for all supported series recurrence patterns */
type SeriesPattern = EventSeries['pattern'];
// Canonical, timezone-correct recurrence engine (Asia/Kolkata via date-fns-tz).
// routes.ts previously carried its own host-local duplicate, which on the UTC
// prod server skipped weekdays / shifted times for WhatsApp-bot-created series
// every time the public lazy-extension path regenerated future instances.
import { generateInstanceDates, extractTimeStr, computeGenerationWindow } from "./events/recurrence";
import { z } from "zod";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { supabaseStorage } from "./supabaseStorage";
import Stripe from 'stripe';
import {
  sendContactMessageToCoach,
  sendVerificationEmail,
  sendEmailCompletionEmail,
  sendEmailConfirmationOnlyEmail,
  sendPasswordResetEmail,
  sendBookingPendingToClient,
  sendBookingRequestToCoach,
  sendBookingConfirmedToClient,
  sendPlatformContactEmail,
  sendCancellationToCoach,
  sendCancellationToClient,
  sendRescheduleToCoach,
  sendPaymentProofToCoach,
  sendPaymentVerifiedToClient,
  sendPaymentRejectedToClient,
  sendBookingMessageToGuest,
  sendBookingMessageToCoach,
  sendRescheduleDeclinedToClient,
  sendEventRegistrationConfirmationToGuest,
  sendEventRegistrationNotificationToCoach,
  sendEventMeetingLinkToRegistrant,
  sendEventCancellationToGuest,
  sendEventCancellationNotificationToCoach,
  sendEventPaymentSubmittedToGuest,
  sendEventPaymentWaivedToRegistrant,
  sendProductPurchaseRequestToCoach,
  sendProductPurchaseConfirmationToBuyer,
  sendEventPaymentVerifiedToRegistrant,
  sendEventPaymentRejectedToRegistrant,
  sendEventPaymentRequestedToRegistrant,
  sendEventPaymentProofToCoach,
  sendProductPurchaseConfirmedToBuyer,
  sendProductPaymentRejectedToBuyer,
  LocationInfo,
  LocationVisibility
} from "./emailService";

// Shared helper: re-exported from the email utils so every outbound URL
// (Supabase auth callbacks, password reset redirects, Stripe checkout return
// URLs, digital product download links, etc.) resolves through the same
// PUBLIC_APP_URL → APP_URL → REPLIT_DOMAINS (dev only) → localhost chain.
import { getAppBaseUrl } from './email/utils';
import { redeemBotMagicLinkToken } from './auth/botMagicLink';

// Initialize Web Push VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:notifications@riplect.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// Helper: send a Web Push notification to all subscriptions of a coach profile
async function sendPushToCoach(profileId: string, payload: { title: string; body: string; tag?: string }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subs = await dbStorage.getPushSubscriptionsByProfileId(profileId);
    const payloadStr = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        ).catch(async (err: any) => {
          // If subscription is gone (410 / 404), clean it up
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await dbStorage.deletePushSubscription(sub.endpoint).catch(() => {});
          }
          throw err;
        }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[WebPush] ${failed}/${subs.length} push notification(s) failed for profile ${profileId}`);
    }
  } catch (err) {
    console.error('[WebPush] sendPushToCoach error:', err);
  }
}

// Initialize Stripe if API key is available
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (modern phone photos commonly exceed 5MB)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure multer for product file uploads (PDF, video, images - larger size limit)
const productFileUpload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for product files (matches client video limit)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, video (mp4, webm, mov, avi), images (jpeg, png, webp, gif)'));
    }
  }
});

// Use requireAuth as the authentication middleware (imported from supabaseAuth.ts)
const isAuthenticated = requireAuth;

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const num = parseInt(value, 10);
  return num > 0 ? num : null;
}

function timeTo24h(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time;
  let hour = parseInt(match[1]);
  const min = match[2];
  const period = match[3].toUpperCase();
  if (period === 'AM' && hour === 12) hour = 0;
  else if (period === 'PM' && hour !== 12) hour += 12;
  return `${hour.toString().padStart(2, '0')}:${min}`;
}

function getHoursUntilBooking(bookingDate: Date, bookingTime: string, coachTimezone: string, now: Date): number {
  const dateStr = bookingDate.toISOString().split('T')[0];
  const time24 = timeTo24h(bookingTime);
  const [hour, minute] = time24.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);

  const bookingUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: coachTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(bookingUtcGuess);
  const p = (type: string) => parseInt(parts.find(x => x.type === type)?.value || '0');
  const offsetMs = Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'), p('second'))
    - bookingUtcGuess.getTime();
  const bookingUtc = new Date(bookingUtcGuess.getTime() - offsetMs);

  return (bookingUtc.getTime() - now.getTime()) / (1000 * 60 * 60);
}

// =================== SSE COACH NOTIFICATIONS ===================
// In-memory map: coachId -> list of active SSE response streams
const coachSseClients = new Map<string, Set<any>>();

function buildNotificationTitleAndBody(event: Record<string, any>): { title: string; body: string } {
  if (event.type === 'new_registration') {
    const title = event.requiresPayment
      ? 'New Event Registration — Payment Required'
      : 'New Event Registration';
    const body = event.requiresPayment
      ? `${event.clientName} registered for ${event.eventTitle}. Please confirm their payment.`
      : `${event.clientName} registered for ${event.eventTitle}.`;
    return { title, body };
  }
  if (event.type === 'new_booking') {
    return {
      title: 'New Booking Request',
      body: `${event.clientName} booked ${event.sessionTitle} on ${event.bookingDate} at ${event.bookingTime}`,
    };
  }
  if (event.type === 'payment_proof') {
    if (event.sessionTitle) {
      return {
        title: 'Payment Proof Received',
        body: `${event.clientName} submitted payment for ${event.sessionTitle}`,
      };
    }
    if (event.eventTitle) {
      return {
        title: 'Payment Proof Received',
        body: `${event.clientName} submitted payment for ${event.eventTitle}`,
      };
    }
    if (event.productTitle) {
      return {
        title: 'Payment Proof Received',
        body: `${event.clientName} submitted payment for ${event.productTitle}`,
      };
    }
    return { title: 'Payment Proof Received', body: `${event.clientName} submitted a payment proof.` };
  }
  if (event.type === 'cash_pending') {
    return {
      title: 'New RSVP — Cash at Door',
      body: `${event.clientName} registered for ${event.eventTitle} and will pay cash at the event.`,
    };
  }
  return { title: 'Notification', body: JSON.stringify(event) };
}

async function notifyCoach(coachId: string, event: Record<string, any>) {
  // Push real-time SSE to any active dashboard tabs
  const clients = coachSseClients.get(coachId);
  if (clients && clients.size > 0) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const dead: any[] = [];
    clients.forEach(res => {
      try {
        res.write(payload);
      } catch {
        dead.push(res);
      }
    });
    dead.forEach(res => clients.delete(res));
  }

  // Persist notification to the database (fire-and-forget, never throws)
  try {
    const { title, body } = buildNotificationTitleAndBody(event);
    await dbStorage.createCoachNotification({
      coachId,
      type: event.type as string,
      title,
      body,
      metadata: event,
      isRead: false,
    });
  } catch (err) {
    console.error('[notifyCoach] Failed to persist notification:', err);
  }
}
// ================================================================

/**
 * Minimal HTML page used when GET /m/:token can't fulfill a sign-in —
 * expired/invalid token or transient backend failure. Intentionally
 * plain so it renders fine when WhatsApp's preview crawler scrapes it
 * (it'll just produce a generic preview), but with a clear message for
 * the human if they do tap through.
 */
function renderLinkErrorPage(message: string): string {
  const safe = message.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string),
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in link – Riplect</title>
<meta property="og:title" content="Riplect sign-in">
<meta property="og:description" content="Tap to sign in to your Riplect dashboard.">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         display: flex; align-items: center; justify-content: center; min-height: 100vh;
         margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
  .card { max-width: 420px; background: white; padding: 32px; border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { color: #475569; line-height: 1.5; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign-in link unavailable</h1>
    <p>${safe}</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Atomic in-memory idempotency for the register-and-pay endpoint.
//
// Two-map approach:
//   ikCompleted — recently-finished requests (kept 5 min). Concurrent or late
//                 retries with the same key get the cached result.
//   ikInFlight  — currently-processing requests as Promises. A second request
//                 that arrives while the first is still awaiting a DB write
//                 will await the same Promise and receive the same result —
//                 preventing a race window where both could pass the duplicate
//                 check and create two registrations.
//
// Both maps key on `idempotencyKey` and are bound to a fingerprint
// (`urlEventId:lowerEmail`) so a key can't be accidentally replayed for a
// different event/guest.
// ---------------------------------------------------------------------------
type IKResult = { status: number; body: object };
const ikCompleted = new Map<string, { fp: string; res: IKResult; expiresAt: number }>();
const ikInFlight  = new Map<string, { fp: string; promise: Promise<IKResult>; resolve: (r: IKResult) => void }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of ikCompleted) if (e.expiresAt <= now) ikCompleted.delete(k);
}, 2 * 60 * 1000).unref();

export async function registerRoutes(app: Express): Promise<Server> {
  // WhatsApp bot webhook routes
  registerWhatsAppRoutes(app);

  // /whatsapp-verify flow (post-bot-signup email verification + finish).
  // Mounted before any catch-all auth routes; each handler re-reads
  // profile state and is safe to call concurrently.
  registerWhatsappEmailVerificationRoutes(app, isAuthenticated, getUserId);

  // Supabase config endpoint - provides public credentials for frontend
  app.get('/api/config/supabase', (req, res) => {
    res.json({
      url: process.env.SUPABASE_URL || null,
      anonKey: process.env.SUPABASE_ANON_KEY || null,
      // Public Google OAuth client ID used by Google Identity Services on the
      // frontend (e.g. the onboarding "Verify with Google" popup). This is the
      // same value the server validates ID-token audience against — see
      // POST /api/auth/email/complete-with-google. Safe to expose.
      googleOAuthClientId:
        process.env.GOOGLE_OAUTH_CLIENT_ID
        || process.env.VITE_GOOGLE_OAUTH_CLIENT_ID
        || process.env.GOOGLE_CLIENT_ID
        || null,
    });
  });

  // Server-side signup: create user via Supabase Admin and send verification email through Resend
  app.post('/api/auth/signup', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const PASSWORD_POLICY_MSG =
      'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.';
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: PASSWORD_POLICY_MSG });
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MSG });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Authentication not configured' });
    }

    try {
      // generateLink with type 'signup' creates the user AND produces a verification link in one step
      // IMPORTANT: `redirectTo` must be added to the Supabase dashboard "Redirect URLs" allowlist
      // (Authentication → URL Configuration → Redirect URLs) for email verification to work in
      // production. Without this, Supabase will reject the redirect and the user will not be
      // signed in after clicking their verification link.
      const redirectTo = `${getAppBaseUrl()}/auth/callback`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          data: { first_name: firstName || '', last_name: lastName || '' },
          redirectTo,
        },
      });

      if (linkError) {
        const friendlyMsg =
          linkError.message.toLowerCase().includes('did not match the expected pattern')
            ? 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.'
            : linkError.message;
        return res.status(400).json({ error: friendlyMsg });
      }

      if (!linkData?.properties?.action_link) {
        console.error('[signup] generateLink returned no action_link');
        // Clean up the just-created user so the person can retry
        if (linkData?.user?.id) {
          await supabase.auth.admin.deleteUser(linkData.user.id).catch((e) =>
            console.error('[signup] cleanup deleteUser failed:', e),
          );
        }
        return res.status(500).json({ error: 'Failed to generate verification link. Please try again.' });
      }

      try {
        await sendVerificationEmail(email, firstName || null, linkData.properties.action_link);
      } catch (emailErr: any) {
        console.error('[signup] sendVerificationEmail failed:', emailErr);
        // Clean up so the person can retry without hitting "user already exists"
        if (linkData.user?.id) {
          await supabase.auth.admin.deleteUser(linkData.user.id).catch((e) =>
            console.error('[signup] cleanup deleteUser failed:', e),
          );
        }
        return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[POST /api/auth/signup]', err);
      return res.status(500).json({ error: err.message || 'Signup failed' });
    }
  });

  // Resend verification email for users who didn't receive or lost the original
  app.post('/api/auth/resend-verification', async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Authentication not configured' });
    }

    try {
      // Attempt to generate a fresh magic link directly.
      // If the user doesn't exist, Supabase will return an error and we silently succeed
      // (anti-enumeration: never confirm whether an email is registered).
      // IMPORTANT: `redirectTo` must be in the Supabase dashboard "Redirect URLs" allowlist
      // (Authentication → URL Configuration → Redirect URLs) for this link to work in production.
      const redirectTo = `${getAppBaseUrl()}/auth/callback`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });

      if (linkError) {
        // User not found or other non-fatal Supabase error — return success silently
        console.log('[resend-verification] generateLink returned error (user may not exist):', linkError.message);
        return res.json({ success: true });
      }

      if (!linkData?.properties?.action_link) {
        console.error('[resend-verification] generateLink returned no action_link');
        return res.status(500).json({ error: 'Failed to generate verification link. Please try again.' });
      }

      const firstName = (linkData.user?.user_metadata?.first_name as string | undefined) || null;

      try {
        await sendVerificationEmail(email, firstName, linkData.properties.action_link);
      } catch (emailErr: any) {
        console.error('[resend-verification] sendVerificationEmail failed:', emailErr.message);
        return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[POST /api/auth/resend-verification]', err.message);
      return res.status(500).json({ error: err.message || 'Failed to resend verification email' });
    }
  });

  // WhatsApp bot sign-in indirection.
  //
  // The bot WhatsApps `${appBaseUrl}/m/<token>` to creators after signup.
  // We can't put a Supabase magic-link URL directly in the message because
  // WhatsApp's preview crawler GETs the URL server-side to build its OG
  // thumbnail — Supabase's verify endpoint consumes the single-use OTP on
  // that GET, leaving the user with `otp_expired` when they tap.
  //
  // The fix: each GET here mints a brand-new Supabase magic-link OTP and
  // 302s to it. WhatsApp's preview consumes OTP_A and dies; the user's
  // tap mints OTP_B and signs in. The routing token in the URL is
  // multi-use within its 7-day TTL — possession of the WhatsApp message
  // is what authorizes sign-in, matching the trust model of the old
  // /claim?phone=... flow.
  app.get('/m/:token', async (req, res) => {
    const token = req.params.token;
    if (!supabase) {
      return res.status(503).send(renderLinkErrorPage("Authentication isn't configured. Please try again later."));
    }

    const result = await redeemBotMagicLinkToken(token);
    if (!result.ok) {
      const msg = result.reason === 'expired'
        ? "This sign-in link has expired. Ask your bot for a fresh link."
        : "This sign-in link is invalid. Ask your bot for a fresh link.";
      return res.status(410).send(renderLinkErrorPage(msg));
    }

    try {
      // Bind the routing token to BOTH the auth user id and the exact
      // email it was minted against. This stops a stale token from
      // signing into the wrong account if the user later changes their
      // email — the token remains usable only for the (id, email) pair
      // that existed at mint time, and only as long as both still match
      // what's in auth.users right now.
      const userRows = await db.execute<{ id: string; email: string | null }>(sql`
        SELECT id::text AS id, email
        FROM auth.users
        WHERE id = ${result.authUserId}::uuid
        LIMIT 1
      `);
      const authUser = userRows[0];
      if (!authUser) {
        console.warn(`[GET /m/:token] auth user ${result.authUserId} not found (deleted?)`);
        return res.status(410).send(renderLinkErrorPage(
          "This sign-in link is no longer valid. Ask your bot for a fresh link.",
        ));
      }
      if ((authUser.email ?? "").toLowerCase() !== result.email.toLowerCase()) {
        console.warn(
          `[GET /m/:token] email mismatch for user ${result.authUserId}: token=${result.email} current=${authUser.email}`,
        );
        return res.status(410).send(renderLinkErrorPage(
          "This sign-in link is no longer valid because the account email has changed. Ask your bot for a fresh link.",
        ));
      }

      const redirectTo = `${getAppBaseUrl()}/auth/callback`;
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: result.email,
        options: { redirectTo },
      });
      if (error || !data?.properties?.action_link) {
        console.error('[GET /m/:token] generateLink failed:', error?.message);
        return res.status(502).send(renderLinkErrorPage("We couldn't generate a sign-in link right now. Please try again in a moment."));
      }
      // Cache-Control: prevent any intermediary (including WhatsApp's
      // preview crawler) from caching the verify URL — each request must
      // get a fresh OTP.
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, data.properties.action_link);
    } catch (err: any) {
      console.error('[GET /m/:token] threw:', err?.message ?? err);
      return res.status(500).send(renderLinkErrorPage("Something went wrong. Please try again in a moment."));
    }
  });

  // SSE endpoint for in-app coach notifications
  app.get('/api/notifications/stream', isAuthenticated, async (req: any, res) => {
    const coachId = getUserId(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!coachSseClients.has(coachId)) {
      coachSseClients.set(coachId, new Set());
    }
    coachSseClients.get(coachId)!.add(res);

    // Send a heartbeat every 25s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      const clients = coachSseClients.get(coachId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) coachSseClients.delete(coachId);
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  // GET /api/notifications — fetch coach's notification history (last 50)
  app.get('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const coachId = getUserId(req);
      const notifications = await dbStorage.getCoachNotifications(coachId, 50);
      res.json(notifications);
      // fire-and-forget: prune stale rows after responding so it never blocks the client
      dbStorage.pruneOldCoachNotifications(coachId).catch((err) =>
        console.error('[pruneOldCoachNotifications]', err),
      );
    } catch (err) {
      console.error('[GET /api/notifications]', err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // PATCH /api/notifications/mark-all-read — mark all notifications as read
  // IMPORTANT: this must be registered before /:id/read to avoid route collision
  app.patch('/api/notifications/mark-all-read', requireAuth, async (req: any, res) => {
    try {
      const coachId = getUserId(req);
      await dbStorage.markAllCoachNotificationsRead(coachId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/notifications/mark-all-read]', err);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  // PATCH /api/notifications/mark-by-type — mark all unread notifications of given types as read
  app.patch('/api/notifications/mark-by-type', requireAuth, async (req: any, res) => {
    try {
      const coachId = getUserId(req);
      const { types } = req.body;
      if (!Array.isArray(types) || types.length === 0) {
        return res.status(400).json({ error: 'types must be a non-empty array' });
      }
      await dbStorage.markCoachNotificationsByType(coachId, types);
      res.json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/notifications/mark-by-type]', err);
      res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
  });

  // PATCH /api/notifications/mark-by-reference — mark notifications matching bookingId or registrationId as read
  app.patch('/api/notifications/mark-by-reference', requireAuth, async (req: any, res) => {
    try {
      const coachId = getUserId(req);
      const { bookingId, registrationId } = req.body;
      if (!bookingId && !registrationId) {
        return res.status(400).json({ error: 'bookingId or registrationId is required' });
      }
      await dbStorage.markCoachNotificationByReference(coachId, {
        bookingId: bookingId ? Number(bookingId) : undefined,
        registrationId: registrationId ? Number(registrationId) : undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/notifications/mark-by-reference]', err);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  // PATCH /api/notifications/:id/read — mark a single notification as read
  app.patch('/api/notifications/:id/read', requireAuth, async (req: any, res) => {
    try {
      const coachId = getUserId(req);
      const id = parseInt(req.params.id, 10);
      if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid notification id' });
      const updated = await dbStorage.markCoachNotificationRead(id, coachId);
      if (!updated) return res.status(404).json({ error: 'Notification not found' });
      res.json(updated);
    } catch (err) {
      console.error('[PATCH /api/notifications/:id/read]', err);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  // Web Push: return the VAPID public key for clients to use when subscribing
  app.get('/api/push/vapid-key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ message: 'Push notifications not configured' });
    res.json({ publicKey: key });
  });

  // Web Push: save (or update) a push subscription for the authenticated coach
  app.post('/api/push/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      const profileId = getUserId(req);
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: 'Invalid subscription object' });
      }
      const sub = await dbStorage.upsertPushSubscription({
        profileId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      res.json({ success: true, id: sub.id });
    } catch (err) {
      console.error('[Push] subscribe error:', err);
      res.status(500).json({ message: 'Failed to save subscription' });
    }
  });

  // Web Push: remove a push subscription (e.g. when user revokes permission)
  app.post('/api/push/unsubscribe', isAuthenticated, async (req: any, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ message: 'Endpoint required' });
      await dbStorage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (err) {
      console.error('[Push] unsubscribe error:', err);
      res.status(500).json({ message: 'Failed to remove subscription' });
    }
  });

  // Username availability check endpoint
  app.get('/api/check-username', async (req, res) => {
    try {
      const username = req.query.username as string;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ available: false, message: 'Username is required' });
      }

      // Validate username format (lowercase alphanumeric only)
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanUsername.length < 3) {
        return res.json({ available: false, message: 'Username must be at least 3 characters' });
      }
      if (cleanUsername.length > 30) {
        return res.json({ available: false, message: 'Username must be 30 characters or less' });
      }

      const existingProfile = await dbStorage.getProfileByUsername(cleanUsername);

      if (existingProfile) {
        return res.json({ available: false, message: 'Username is already taken' });
      }

      return res.json({ available: true, message: 'Username is available' });
    } catch (error) {
      console.error('Error checking username:', error);
      return res.status(500).json({ available: false, message: 'Error checking username' });
    }
  });

  // IP Geolocation endpoint - returns city/region from user's IP
  app.get('/api/geolocation', async (req, res) => {
    // Prevent caching of geolocation responses
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
      // Try multiple sources to get the real client IP
      const forwardedFor = req.headers['x-forwarded-for'];
      const realIp = req.headers['x-real-ip'];
      const cfConnectingIp = req.headers['cf-connecting-ip'];

      // Priority: CF-Connecting-IP > X-Real-IP > first X-Forwarded-For > req.ip
      let clientIp = '';
      if (typeof cfConnectingIp === 'string') {
        clientIp = cfConnectingIp.trim();
      } else if (typeof realIp === 'string') {
        clientIp = realIp.trim();
      } else if (typeof forwardedFor === 'string') {
        clientIp = forwardedFor.split(',')[0].trim();
      } else {
        clientIp = req.ip || '';
      }

      // Handle IPv6-mapped IPv4 addresses (::ffff:x.x.x.x)
      if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
      }


      // Helper to check if IP is in private/reserved range
      const isPrivateOrReservedIp = (ip: string): boolean => {
        if (!ip) return true;

        // IPv6 loopback and link-local
        if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd')) {
          return true;
        }

        // IPv4 checks
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
          return true; // Invalid IPv4, treat as private
        }

        // 10.0.0.0/8 - Class A private
        if (parts[0] === 10) return true;

        // 172.16.0.0/12 - Class B private (172.16.0.0 - 172.31.255.255)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

        // 192.168.0.0/16 - Class C private
        if (parts[0] === 192 && parts[1] === 168) return true;

        // 127.0.0.0/8 - Loopback
        if (parts[0] === 127) return true;

        // 169.254.0.0/16 - Link-local
        if (parts[0] === 169 && parts[1] === 254) return true;

        return false;
      };

      if (isPrivateOrReservedIp(clientIp)) {
        return res.json({ location: null });
      }

      // Use ipapi.co free API over HTTPS with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        // Try ipapi.co first (HTTPS)
        let response = await fetch(
          `https://ipapi.co/${encodeURIComponent(clientIp)}/json/`,
          { signal: controller.signal }
        );

        let data = await response.json();

        if (!data.error && (data.city || data.region)) {
          const parts = [data.city, data.region].filter(Boolean);
          const location = parts.join(', ');
          return res.json({ location });
        }

        // If ipapi.co fails or is rate limited, fallback to ip-api.com
        if (data.error) {
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 5000);

          try {
            response = await fetch(
              `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,city,regionName`,
              { signal: fallbackController.signal }
            );
            data = await response.json();

            if (data.status === 'success' && (data.city || data.regionName)) {
              const parts = [data.city, data.regionName].filter(Boolean);
              const location = parts.join(', ');
              return res.json({ location });
            }
          } finally {
            clearTimeout(fallbackTimeoutId);
          }
        }
      } catch (fetchError: any) {
        if (fetchError.name !== 'AbortError') {
          console.error('Geolocation fetch error:', fetchError);
        }
      } finally {
        clearTimeout(timeoutId);
      }

      res.json({ location: null });
    } catch (error) {
      console.error('Error fetching geolocation:', error);
      res.json({ location: null });
    }
  });

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadDir));

  // Image upload endpoint using Supabase Storage
  app.post("/api/upload/image", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let fileBuffer = fs.readFileSync(req.file.path);
      let mimeType = req.file.mimetype;
      let originalName = req.file.originalname;

      // Server-side safety net: convert HEIC/HEIF to JPEG if it arrives here
      const heicMimes = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
      const heicExt = /\.(heic|heif)$/i.test(originalName);
      if (heicMimes.includes(mimeType) || heicExt) {
        try {
          const sharp = (await import('sharp')).default;
          fileBuffer = await sharp(fileBuffer).jpeg({ quality: 90 }).toBuffer();
          mimeType = 'image/jpeg';
          originalName = originalName.replace(/\.(heic|heif)$/i, '.jpg');
        } catch (convErr) {
          console.error('[upload/image] HEIC server conversion failed:', convErr);
          // Continue with original buffer — Supabase may still handle it or reject gracefully
        }
      }

      const publicUrl = await supabaseStorage.uploadPublicFile(
        fileBuffer,
        originalName,
        mimeType,
        req.body.folder || "uploads"
      );

      fs.unlinkSync(req.file.path);

      res.json({ url: publicUrl });
    } catch (error) {
      console.error("Error uploading image:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Video upload endpoint for event media
  const videoUpload = multer({
    storage: storage,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB limit for videos
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mov'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed (mp4, webm, mov, avi)'));
      }
    }
  });

  app.post("/api/upload/video", isAuthenticated, videoUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const publicUrl = await supabaseStorage.uploadPublicFile(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype,
        "event-videos"
      );

      fs.unlinkSync(req.file.path);

      res.json({ url: publicUrl });
    } catch (error) {
      console.error("Error uploading video:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload video" });
    }
  });

  // File upload endpoints

  // Blog image upload endpoint

  // General image upload endpoint

  // Auth routes - Supabase only
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Get profile if it exists (profile.id IS the Supabase auth.users UUID)
      const profile = await dbStorage.getProfileById(userId);

      // Return user info from Supabase token and profile if exists
      res.json({
        id: userId,
        email: req.supabaseUser.email,
        emailVerified: !!req.supabaseUser.email_confirmed_at,
        firstName: profile?.firstName || req.supabaseUser.firstName || null,
        lastName: profile?.lastName || req.supabaseUser.lastName || null,
        profileImageUrl: profile?.profileImageUrl || req.supabaseUser.profileImageUrl || null,
        username: profile?.username || null
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Logout endpoint - clears Supabase session on client side
  app.post('/api/auth/logout', (req, res) => {
    res.json({ message: "Logout successful" });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Authentication not configured' });
    }

    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${getAppBaseUrl()}/auth/reset-password`,
        },
      });

      if (linkError) {
        console.error('[reset-password] generateLink error:', linkError);
        return res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
      }

      if (!linkData?.properties?.action_link) {
        console.error('[reset-password] generateLink returned no action_link');
        return res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
      }

      const firstName = linkData.user?.user_metadata?.first_name || null;

      try {
        await sendPasswordResetEmail(email, firstName, linkData.properties.action_link);
      } catch (emailErr: any) {
        console.error('[reset-password] sendPasswordResetEmail failed:', emailErr);
        return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
      }

      return res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
    } catch (err: any) {
      console.error('[reset-password] unexpected error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  });

  // ============================================================
  // Auth unification (Task #150) — verification endpoints
  //
  // These endpoints attach a verified phone or email to the
  // *currently signed-in* auth.users row. They are the only
  // supported way to consolidate identities onto one account
  // and never silently merge — duplicate-detection conflicts
  // are returned with a `code` the UI can branch on.
  // ============================================================

  // POST /api/auth/phone/send-otp
  // Body: { phone: string, channel?: 'whatsapp' | 'sms' }
  // Auth: required (bearer token of the user the phone will attach to)
  app.post('/api/auth/phone/send-otp', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { phone, channel } = req.body ?? {};
      if (typeof phone !== 'string' || !phone.trim()) {
        return res.status(400).json({ error: 'Phone is required', code: 'INVALID_PHONE' });
      }
      const ch: 'whatsapp' | 'sms' = channel === 'whatsapp' ? 'whatsapp' : 'sms';

      // Per-user: 3 sends / 15 min. Per-phone: 5 sends / hour (anti-abuse).
      const perUser = consumeRateLimit(`phone-otp:user:${userId}`, 3, 15 * 60 * 1000);
      if (!perUser.allowed) {
        return res.status(429).json({
          error: `Too many requests. Try again in ${perUser.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: perUser.retryAfterSec,
        });
      }
      // Canonicalize the phone before keying the per-phone rate limit so
      // alternate formattings (spaces, dashes, missing/extra "+", local
      // notation) cannot be used to multiply the abuse budget for the
      // same number. We fall back to a sanitized raw form ONLY for
      // numbers that fail E.164 parsing — those are also rejected by
      // createAndSendPhoneOtp below, so the limiter still blocks abuse
      // through the same key.
      const phoneE164 = normalizeToE164(phone);
      const phoneKey = phoneE164 ?? phone.replace(/[\s()\-.]/g, '').trim();
      const perPhone = consumeRateLimit(`phone-otp:phone:${phoneKey}`, 5, 60 * 60 * 1000);
      if (!perPhone.allowed) {
        return res.status(429).json({
          error: `Too many requests for this phone. Try again in ${perPhone.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: perPhone.retryAfterSec,
        });
      }

      const result = await createAndSendPhoneOtp(userId, phone, ch);
      if (!result.ok) {
        const status = result.code === 'PHONE_TAKEN' ? 409 : result.code === 'INVALID_PHONE' ? 400 : 502;
        // Anonymized hint helps the UI guide the user to the right next
        // step (e.g. "use the existing account ending in •••67" without
        // leaking the other profile's full PII).
        const conflict = result.code === 'PHONE_TAKEN'
          ? { kind: 'phone' as const, masked: maskPhoneHint(phone.replace(/[^\d+]/g, '')) }
          : undefined;
        return res.status(status).json({ error: result.error, code: result.code, conflict });
      }
      return res.json({
        success: true,
        expiresAt: result.expiresAt.toISOString(),
        phoneE164: result.phoneE164,
        actualChannel: result.actualChannel,
        debugCode: result.debugCode,
      });
    } catch (err: any) {
      console.error('[POST /api/auth/phone/send-otp]', err);
      return res.status(500).json({ error: 'Failed to send OTP', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/phone/verify-otp
  // Body: { phone: string, code: string }
  // Auth: required. On success the phone is attached to the user.
  app.post('/api/auth/phone/verify-otp', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { phone, code } = req.body ?? {};
      if (typeof phone !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'Phone and code are required', code: 'BAD_REQUEST' });
      }

      const verifyLimit = consumeRateLimit(`phone-otp-verify:user:${userId}`, 10, 15 * 60 * 1000);
      if (!verifyLimit.allowed) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${verifyLimit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: verifyLimit.retryAfterSec,
        });
      }

      const verify = await verifyPhoneOtp(userId, phone, code);
      if (!verify.ok) {
        const status =
          verify.code === 'INVALID_PHONE' ? 400 :
          verify.code === 'WRONG_CODE' || verify.code === 'TOO_MANY_ATTEMPTS' ? 401 :
          410; // gone — expired/used/no-otp
        return res.status(status).json({ error: verify.error, code: verify.code });
      }

      const attach = await attachVerifiedPhoneToCurrentUser(userId, verify.phoneE164);
      if (!attach.ok) {
        const status =
          attach.code === 'PHONE_TAKEN' ? 409 :
          attach.code === 'INVALID_PHONE' ? 400 :
          attach.code === 'USER_NOT_FOUND' || attach.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ error: attach.error, code: attach.code, conflict: 'conflict' in attach ? attach.conflict : undefined });
      }

      return res.json({ success: true, phoneE164: attach.phoneE164 });
    } catch (err: any) {
      console.error('[POST /api/auth/phone/verify-otp]', err);
      return res.status(500).json({ error: 'Failed to verify OTP', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/email/start-completion
  // Body: { email: string }
  // Auth: required (the phone-first user finishing their account).
  // Decides whether the email's domain is Google-managed and either
  // returns `googleEligible: true` (UI offers the Google popup) or
  // sends a one-time signed link.
  app.post('/api/auth/email/start-completion', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { email } = req.body ?? {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address', code: 'INVALID_EMAIL' });
      }
      const normEmail = email.trim().toLowerCase();

      // Conflict pre-check — check BOTH profiles and auth.users so mid-onboarding
      // users (who have no profile row yet) still get a clean 409 rather than a
      // cryptic unique-constraint error later in swapEmailAndSetPassword.
      const dupProfile = await db.execute(sql`
        SELECT id FROM profiles
        WHERE LOWER(email) = ${normEmail} AND id <> ${userId}
        LIMIT 1
      `);
      if (dupProfile.length > 0) {
        return res.status(409).json({
          error: 'This email is already linked to another Riplect account.',
          code: 'EMAIL_TAKEN',
          conflict: { kind: 'email', masked: maskEmailHint(normEmail) },
        });
      }
      const dupAuth = await db.execute(sql`
        SELECT id FROM auth.users
        WHERE LOWER(email) = ${normEmail} AND id <> ${userId}::uuid
        LIMIT 1
      `);
      if (dupAuth.length > 0) {
        return res.status(409).json({
          error: 'This email is already linked to another Riplect account.',
          code: 'EMAIL_TAKEN',
          conflict: { kind: 'email', masked: maskEmailHint(normEmail) },
        });
      }

      const limit = consumeRateLimit(`email-start:user:${userId}`, 20, 60 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many requests. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }

      const googleEligible = await isGoogleManagedDomain(normEmail);
      if (googleEligible) {
        return res.json({ googleEligible: true, sentLink: false, email: normEmail });
      }

      // Non-Google email: the new flow asks the user to set their
      // password inline on the onboarding screen (see
      // /api/auth/email/set-password-inline). We no longer send a
      // link from this endpoint — instead we just confirm the email
      // is eligible (not taken, not Google-managed) so the client
      // can show the inline password form.
      return res.json({
        googleEligible: false,
        sentLink: false,
        inlineSetPassword: true,
        email: normEmail,
      });
    } catch (err: any) {
      console.error('[POST /api/auth/email/start-completion]', err);
      return res.status(500).json({ error: 'Failed to start email completion', code: 'INTERNAL' });
    }
  });

  // GET /api/auth/email/inspect-token?token=...
  // Public — reads (does NOT consume) the token so the verify-email page
  // can show the right form. Returns a structured error if invalid/expired.
  // Rate-limited per (token, ip) to make brute-force enumeration impractical.
  app.get('/api/auth/email/inspect-token', async (req, res) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : null;
      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || req.ip || 'unknown';
      const rlKey = token ? `email-inspect:tok:${token}:${ip}` : `email-inspect:ip:${ip}`;
      const limit = consumeRateLimit(rlKey, 30, 15 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many requests. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }
      const inspect = await inspectEmailCompletionToken(token);
      if (!inspect.ok) {
        const status = inspect.code === 'MISSING' ? 400 : 410;
        // For EXPIRED / USED tokens we forward the original email so the
        // client can offer in-place recovery (resend / "you're already
        // verified, sign in") without forcing the user to re-type it.
        const payload: Record<string, unknown> = { error: inspect.error, code: inspect.code };
        if (inspect.code === 'EXPIRED' || inspect.code === 'USED') {
          payload.email = inspect.email;
        }
        return res.status(status).json(payload);
      }
      return res.json({
        success: true,
        email: inspect.email,
        nextStep: inspect.nextStep,
      });
    } catch (err: any) {
      console.error('[GET /api/auth/email/inspect-token]', err);
      return res.status(500).json({ error: 'Failed to read token', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/email/complete-with-password
  // Body: { token: string, password: string }
  // No auth required — the token IS proof of email ownership AND it
  // identifies the user.
  //
  // Order of operations matters here:
  //   1. Rate-limit per token to deter brute-force.
  //   2. Inspect (NOT consume) the token so we can fail-fast on
  //      expired/used tokens without burning a fresh one.
  //   3. Validate password policy. If it fails the user gets to retry
  //      with a corrected password — the token is still valid.
  //   4. Consume the token (single-use, atomic at the DB layer).
  //   5. Swap email + set password + mark verified.
  //   6. Issue a fresh Supabase session so the client lands signed in.
  app.post('/api/auth/email/complete-with-password', async (req, res) => {
    try {
      const { token, password } = req.body ?? {};
      if (typeof token !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Token and password are required', code: 'BAD_REQUEST' });
      }

      // Anti-bruteforce throttle on the token (someone trying many passwords).
      const limit = consumeRateLimit(`email-complete:token:${token}`, 5, 15 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }

      // Step 2: inspect first — does NOT mark consumed_at.
      const inspect = await inspectEmailCompletionToken(token);
      if (!inspect.ok) {
        const status = inspect.code === 'MISSING' ? 400 : 410;
        return res.status(status).json({ error: inspect.error, code: inspect.code });
      }

      // Step 3: validate password BEFORE consuming the token, so a
      // policy-fail doesn't burn the token and force a re-issue.
      const pw = validatePasswordPolicy(password);
      if (!pw.ok) {
        return res.status(400).json({ error: pw.error, code: 'WEAK_PASSWORD' });
      }

      // Step 4: now atomically consume the token.
      const consumed = await consumeEmailCompletionToken(token);
      if (!consumed.ok) {
        const status = consumed.code === 'MISSING' ? 400 : 410;
        return res.status(status).json({ error: consumed.error, code: consumed.code });
      }

      // Step 5: swap.
      const swap = await swapEmailAndSetPassword(consumed.userId, consumed.email, password);
      if (!swap.ok) {
        const status =
          swap.code === 'EMAIL_TAKEN' ? 409 :
          swap.code === 'WEAK_PASSWORD' || swap.code === 'INVALID_EMAIL' ? 400 :
          swap.code === 'USER_NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ error: swap.error, code: swap.code, conflict: 'conflict' in swap ? swap.conflict : undefined });
      }

      // Step 6: issue a fresh session so the client lands signed in.
      // If session issuance fails (e.g. anon key missing) we still
      // return success — the swap committed and the user can sign in
      // manually with their new credentials.
      const session = await issuePasswordSession(swap.email, password);
      const sessionPayload = session.ok
        ? {
            access_token: session.session.access_token,
            refresh_token: session.session.refresh_token,
            expires_in: session.session.expires_in,
            expires_at: session.session.expires_at,
            token_type: session.session.token_type,
          }
        : null;
      if (!session.ok) {
        console.warn('[email/complete-with-password] swap ok but session issuance failed:', session.error);
      }

      return res.json({ success: true, email: swap.email, session: sessionPayload });
    } catch (err: any) {
      console.error('[POST /api/auth/email/complete-with-password]', err);
      return res.status(500).json({ error: 'Failed to complete email setup', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/email/set-password-inline
  // Body: { email: string, password: string }
  // Auth: required (the phone-first user finishing their account).
  //
  // The new onboarding flow asks the user to set their password
  // directly on the "Verify your contact details" screen instead of
  // bouncing through an email link first. This endpoint:
  //   1. Validates email + password.
  //   2. Atomically swaps the placeholder email + sets the password
  //      WITHOUT marking email_confirmed_at — the user has not yet
  //      proven they own the typed email.
  //   3. Issues a single-use confirm-email token and emails it so the
  //      user can flip email_confirmed_at later (required to log
  //      back in via email + password).
  //
  // The user's current Supabase session (issued from their phone OTP)
  // remains valid, so they can keep onboarding without re-auth.
  app.post('/api/auth/email/set-password-inline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address', code: 'INVALID_EMAIL' });
      }
      if (typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required', code: 'BAD_REQUEST' });
      }
      const normEmail = email.trim().toLowerCase();

      const pw = validatePasswordPolicy(password);
      if (!pw.ok) {
        return res.status(400).json({ error: pw.error, code: 'WEAK_PASSWORD' });
      }

      // Reject Google-managed domains here — those go through the
      // popup ID-token flow, never inline password.
      if (await isGoogleManagedDomain(normEmail)) {
        return res.status(400).json({
          error: 'This email is managed by Google. Please use Google sign-in instead.',
          code: 'GOOGLE_DOMAIN',
        });
      }

      const limit = consumeRateLimit(`email-set-password:user:${userId}`, 10, 60 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many requests. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }

      const swap = await swapEmailAndSetPassword(userId, normEmail, password, { confirmEmail: false });
      if (!swap.ok) {
        const status =
          swap.code === 'EMAIL_TAKEN' ? 409 :
          swap.code === 'WEAK_PASSWORD' || swap.code === 'INVALID_EMAIL' ? 400 :
          swap.code === 'USER_NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ error: swap.error, code: swap.code, conflict: 'conflict' in swap ? swap.conflict : undefined });
      }

      // Issue a confirm-email token and send the link. Failures here
      // are NOT fatal — the swap already succeeded, so we still
      // return success and let the user resend later if needed.
      let expiresAt: Date | null = null;
      let emailSent = false;
      try {
        const issued = await issueEmailCompletionToken(userId, normEmail, 'confirm-email');
        expiresAt = issued.expiresAt;
        const confirmUrl = `${getAppBaseUrl()}/verify-email-and-set-password?token=${encodeURIComponent(issued.token)}`;

        let firstName: string | null = null;
        try {
          const profile = await dbStorage.getProfileById(userId);
          firstName = profile?.firstName ?? null;
        } catch {
          /* ignore */
        }

        await sendEmailConfirmationOnlyEmail(normEmail, firstName, confirmUrl);
        emailSent = true;
      } catch (emailErr: any) {
        console.error('[email/set-password-inline] confirm email send failed:', emailErr?.message ?? emailErr);
      }

      return res.json({
        success: true,
        email: swap.email,
        emailConfirmationSent: emailSent,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      });
    } catch (err: any) {
      console.error('[POST /api/auth/email/set-password-inline]', err);
      return res.status(500).json({ error: 'Failed to set password', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/email/confirm-email
  // Body: { token: string }
  // No auth required — possessing the token is proof of email ownership.
  // Consumes a confirm-email token (issued by /set-password-inline)
  // and flips email_confirmed_at on the matching auth.users row.
  app.post('/api/auth/email/confirm-email', async (req, res) => {
    try {
      const { token } = req.body ?? {};
      if (typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ error: 'Token is required', code: 'BAD_REQUEST' });
      }

      const limit = consumeRateLimit(`email-confirm:token:${token}`, 5, 15 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }

      const inspect = await inspectEmailCompletionToken(token);
      if (!inspect.ok) {
        const status = inspect.code === 'MISSING' ? 400 : 410;
        return res.status(status).json({ error: inspect.error, code: inspect.code });
      }
      if (inspect.nextStep !== 'confirm-email') {
        return res.status(400).json({
          error: 'This link is for a different verification step.',
          code: 'WRONG_STEP',
        });
      }

      const consumed = await consumeEmailCompletionToken(token);
      if (!consumed.ok) {
        const status = consumed.code === 'MISSING' ? 400 : 410;
        return res.status(status).json({ error: consumed.error, code: consumed.code });
      }

      const result = await confirmEmailForUser(consumed.userId, consumed.email);
      if (!result.ok) {
        const status =
          result.code === 'USER_NOT_FOUND' ? 404 :
          result.code === 'EMAIL_MISMATCH' ? 409 : 500;
        return res.status(status).json({ error: result.error, code: result.code });
      }

      return res.json({ success: true, email: result.email });
    } catch (err: any) {
      console.error('[POST /api/auth/email/confirm-email]', err);
      return res.status(500).json({ error: 'Failed to confirm email', code: 'INTERNAL' });
    }
  });

  // POST /api/auth/email/complete-with-google
  // Body: { idToken: string, email: string }
  // Auth: required.
  //
  // The client completes Google Sign-In (popup or Supabase
  // `linkIdentity({ provider: 'google' })`) and forwards the resulting
  // Google ID token here. The server:
  //   1. Verifies the ID token cryptographically against Google's JWKs
  //      (don't trust client-provided email).
  //   2. Cross-checks against the email the user typed in onboarding.
  //   3. Confirms a matching Google identity is linked on the
  //      auth.users row so future Google logins resolve here.
  //   4. Swaps the placeholder email for the Google-verified one and
  //      marks email confirmed.
  app.post('/api/auth/email/complete-with-google', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { idToken, email } = req.body ?? {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address', code: 'INVALID_EMAIL' });
      }
      if (typeof idToken !== 'string' || !idToken.trim()) {
        return res.status(400).json({ error: 'Google ID token is required', code: 'MISSING_ID_TOKEN' });
      }

      const limit = consumeRateLimit(`email-complete-google:user:${userId}`, 5, 15 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
          code: 'RATE_LIMITED',
          retryAfterSec: limit.retryAfterSec,
        });
      }

      // (1) Verify the Google ID token. We require at least one
      // Google client ID to be configured so `audience` binding is
      // enforced — verifying without `audience` would let any
      // Google-signed token through (still requiring identity-link match
      // downstream, but defense-in-depth matters here). In dev/preview
      // we degrade to signature+issuer+expiry only, with a loud warning.
      const expectedAudiences = [
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.VITE_GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_CLIENT_ID,
      ].filter(Boolean) as string[];
      if (expectedAudiences.length === 0 && process.env.NODE_ENV === 'production') {
        console.error('[email/complete-with-google] No GOOGLE_OAUTH_CLIENT_ID configured — refusing to verify without audience binding.');
        return res.status(500).json({
          error: 'Google sign-in is not configured on this server. Please contact support.',
          code: 'NOT_CONFIGURED',
        });
      }
      if (expectedAudiences.length === 0) {
        console.warn('[email/complete-with-google] No Google client ID configured — verifying without audience binding (dev only).');
      }
      const oauthClient = new GoogleOAuth2Client();
      let payload: any;
      try {
        const ticket = await oauthClient.verifyIdToken({
          idToken,
          audience: expectedAudiences.length > 0 ? expectedAudiences : undefined,
        });
        payload = ticket.getPayload();
      } catch (verErr: any) {
        console.warn('[email/complete-with-google] id token verify failed:', verErr?.message ?? verErr);
        return res.status(401).json({ error: 'Could not verify Google sign-in. Please try again.', code: 'INVALID_ID_TOKEN' });
      }
      if (!payload?.email || !payload.sub) {
        return res.status(401).json({ error: 'Google did not return an email.', code: 'INVALID_ID_TOKEN' });
      }

      const extra = payload as Record<string, unknown>;
      const swap = await swapEmailViaLinkedGoogleIdentity(userId, email.trim().toLowerCase(), {
        email: String(payload.email),
        sub: String(payload.sub),
        emailVerified: payload.email_verified !== false,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        picture: typeof payload.picture === 'string' ? payload.picture : undefined,
        full_name: typeof extra.full_name === 'string' ? extra.full_name : undefined,
        avatar_url: typeof extra.avatar_url === 'string' ? extra.avatar_url : undefined,
      });
      if (!swap.ok) {
        const status =
          swap.code === 'EMAIL_TAKEN' ? 409 :
          swap.code === 'GOOGLE_IDENTITY_TAKEN' ? 409 :
          swap.code === 'GOOGLE_EMAIL_MISMATCH' ? 422 :
          swap.code === 'INVALID_EMAIL' ? 400 :
          swap.code === 'USER_NOT_FOUND' || swap.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
        return res.status(status).json({ error: swap.error, code: swap.code, conflict: 'conflict' in swap ? swap.conflict : undefined });
      }

      return res.json({ success: true, email: swap.email });
    } catch (err: any) {
      console.error('[POST /api/auth/email/complete-with-google]', err);
      return res.status(500).json({ error: 'Failed to complete email via Google', code: 'INTERNAL' });
    }
  });

  // Payment intent endpoint for session bookings
  app.post('/api/create-payment-intent', async (req, res) => {
    try {
      const { amount, bookingDetails } = req.body;

      if (!amount || !bookingDetails) {
        return res.status(400).json({
          success: false,
          message: "Amount and booking details are required"
        });
      }

      // Validate booking details
      if (!bookingDetails.sessionId || !bookingDetails.clientName || !bookingDetails.clientEmail) {
        return res.status(400).json({
          success: false,
          message: "Session ID, client name, and email are required"
        });
      }

      // Get session to retrieve its currency
      const session = await dbStorage.getBookingSessionById(parseInt(bookingDetails.sessionId));
      const sessionCurrency = session?.currency || 'USD';

      // TODO: When Stripe keys are available, create real payment intent here
      // For now, simulate a successful payment intent creation
      console.log(`Creating payment intent for ${sessionCurrency} ${amount} - Session ID: ${bookingDetails.sessionId}`);
      console.log(`Client: ${bookingDetails.clientName} (${bookingDetails.clientEmail})`);

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For demonstration: simulate successful payment (when Stripe is connected, this will be real)
      const mockPaymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      res.json({
        success: true,
        paymentIntentId: mockPaymentIntentId,
        clientSecret: `${mockPaymentIntentId}_secret_mock`,
        amount: amount,
        currency: sessionCurrency.toLowerCase(), // Stripe requires lowercase
        status: "succeeded", // This will be "requires_payment_method" when using real Stripe
        message: "Payment processed successfully"
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create payment intent"
      });
    }
  });

  // Featured creator profile route (using your actual profile)
  app.get('/api/demo-profile', async (req, res) => {
    try {
      // Get the actual user profile from database to feature as demo
      const actualProfile = await dbStorage.getProfileByUsername("Nur");
      if (actualProfile) {
        res.json(actualProfile);
        return;
      }

      // Fallback if profile not found
      const featuredProfile = {
        id: "00000000-0000-0000-0000-000000000000",
        username: "featured",
        displayName: "Featured Creator",
        title: "Platform Creator",
        bio: "Discover the features and capabilities of our creator platform through this featured profile.",
        profileImageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=400",
        socialLinks: {},
        customLinks: [],
        galleryImages: [
          {
            url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
            alt: "Meditation session in nature"
          },
          {
            url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
            alt: "Yoga practice at sunrise"
          },
          {
            url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
            alt: "Workshop with clients"
          }
        ],
        testimonials: [
          {
            clientName: "Maria Rodriguez",
            content: "Sarah transformed my approach to wellness. Her mindfulness techniques helped me manage stress and find balance in my hectic life. I can't recommend her enough!",
            rating: 5,
            clientTitle: "Marketing Manager"
          },
          {
            clientName: "David Chen",
            content: "The nutrition guidance Sarah provided was life-changing. I feel more energetic and healthier than I have in years. Her holistic approach really works.",
            rating: 5,
            clientTitle: "Software Engineer"
          },
          {
            clientName: "Emily Thompson",
            content: "Sarah's mindfulness workshops are incredible. She creates such a peaceful, welcoming environment where you can truly connect with yourself.",
            rating: 5,
            clientTitle: "Teacher"
          }
        ],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.json(featuredProfile);
    } catch (error) {
      console.error("Error fetching demo profile:", error);
      res.status(500).json({ message: "Failed to fetch demo profile" });
    }
  });

  // Featured creator profile data routes (using actual profile data)
  app.get('/api/demo-profile/products', async (req, res) => {
    try {
      // Get actual products from your profile
      const profile = await dbStorage.getProfileByUsername("Nur");
      if (profile) {
        const actualProducts = await dbStorage.getDigitalProductsByProfileId(profile.id);
        res.json(actualProducts);
        return;
      }

      // If no profile found, return empty array
      res.json([]);
    } catch (error) {
      console.error("Error fetching featured creator products:", error);
      res.status(500).json({ message: "Failed to fetch featured creator products" });
    }
  });

  app.get('/api/demo-profile/blog', async (req, res) => {
    try {
      // Get actual blog posts from your profile
      const profile = await dbStorage.getProfileByUsername("Nur");
      if (profile) {
        const actualBlogPosts = await dbStorage.getBlogPostsByProfileId(profile.id);
        res.json(actualBlogPosts);
        return;
      }

      // If no profile found, return empty array
      res.json([]);
    } catch (error) {
      console.error("Error fetching featured creator blog posts:", error);
      res.status(500).json({ message: "Failed to fetch featured creator blog posts" });
    }
  });

  app.get('/api/demo-profile/events', async (req, res) => {
    try {
      // Get actual events from your profile
      const profile = await dbStorage.getProfileByUsername("Nur");
      if (profile) {
        const actualEvents = await dbStorage.getPublicEventsByProfileId(profile.id);
        res.json(actualEvents);
        return;
      }

      // If no profile found, return empty array
      res.json([]);
    } catch (error) {
      console.error("Error fetching featured creator events:", error);
      res.status(500).json({ message: "Failed to fetch featured creator events" });
    }
  });

  app.get('/api/demo-profile/sessions', async (req, res) => {
    try {
      // Get actual booking sessions from your profile
      const profile = await dbStorage.getProfileByUsername("Nur");
      if (profile) {
        const actualSessions = await dbStorage.getBookingSessionsByProfileId(profile.id);
        res.json(actualSessions);
        return;
      }

      // If no profile found, return empty array
      res.json([]);
    } catch (error) {
      console.error("Error fetching featured creator sessions:", error);
      res.status(500).json({ message: "Failed to fetch featured creator sessions" });
    }
  });

  app.get('/api/demo-profile/physical-products', async (req, res) => {
    try {
      // Get actual physical products from your profile
      const profile = await dbStorage.getProfileByUsername("Nur");
      if (profile) {
        const actualPhysicalProducts = await dbStorage.getPhysicalProductsByProfileId(profile.id);
        res.json(actualPhysicalProducts);
        return;
      }

      // If no profile found, return empty array
      res.json([]);
    } catch (error) {
      console.error("Error fetching featured creator physical products:", error);
      res.status(500).json({ message: "Failed to fetch featured creator physical products" });
    }
  });

  // Expand short Google Maps URLs (maps.app.goo.gl) to full URLs
  app.post('/api/expand-maps-url', async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }

      // Check if it's a short URL that needs expansion
      if (!url.includes('maps.app.goo.gl') && !url.includes('goo.gl/maps')) {
        // Return the original URL if it's not a short URL
        return res.json({ expandedUrl: url });
      }

      // Follow redirects to get the full URL
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
      });

      // The final URL after redirects
      const expandedUrl = response.url;

      res.json({ expandedUrl });
    } catch (error) {
      console.error("Error expanding Maps URL:", error);
      res.status(500).json({ message: "Failed to expand URL" });
    }
  });

  // Location routes - CRUD for saved locations
  app.get('/api/locations', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const locations = await dbStorage.getLocationsByProfileId(userId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const location = await dbStorage.getLocationById(parseInt(req.params.id));
      if (!location || location.profileId !== userId) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ message: "Failed to fetch location" });
    }
  });

  app.post('/api/locations', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertLocationSchema.parse({
        ...req.body,
        profileId: userId,
      });

      const location = await dbStorage.createLocation(validatedData);
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid location data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.patch('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const location = await dbStorage.getLocationById(parseInt(req.params.id));
      if (!location || location.profileId !== userId) {
        return res.status(404).json({ message: "Location not found" });
      }

      const updatedLocation = await dbStorage.updateLocation(parseInt(req.params.id), req.body);
      res.json(updatedLocation);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.delete('/api/locations/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const location = await dbStorage.getLocationById(parseInt(req.params.id));
      if (!location || location.profileId !== userId) {
        return res.status(404).json({ message: "Location not found" });
      }

      await dbStorage.deleteLocation(parseInt(req.params.id));
      res.json({ message: "Location deleted successfully" });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  app.post('/api/locations/:id/set-default', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const location = await dbStorage.getLocationById(parseInt(req.params.id));
      if (!location || location.profileId !== userId) {
        return res.status(404).json({ message: "Location not found" });
      }

      await dbStorage.setDefaultLocation(userId, parseInt(req.params.id));
      res.json({ message: "Default location set successfully" });
    } catch (error) {
      console.error("Error setting default location:", error);
      res.status(500).json({ message: "Failed to set default location" });
    }
  });

  // Profile routes
  app.get('/api/profiles/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // If contactInfo has a locationId, fetch the full location data
      let responseProfile = { ...profile };
      if (profile.contactInfo && typeof profile.contactInfo === 'object') {
        const contactInfo = { ...(profile.contactInfo as any) };
        if (contactInfo.locationId) {
          try {
            const location = await dbStorage.getLocationById(contactInfo.locationId);
            if (location && location.profileId === profile.id) {
              // Merge the location data into contactInfo.location
              contactInfo.location = {
                address: location.address,
                city: location.city,
                state: location.state,
                zipCode: location.zipCode,
                country: location.country,
                latitude: location.latitude,
                longitude: location.longitude,
                googleMapsUrl: location.googleMapsUrl,
                placeId: location.placeId,
              };
            }
          } catch (locError) {
            console.error("Error fetching location for profile:", locError);
          }
        }
        responseProfile.contactInfo = contactInfo;
      }

      res.json(responseProfile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // =========================================================================
  // AI-generated landing-page website (PROTOTYPE)
  // =========================================================================

  // Generate (or regenerate) the authenticated creator's website.
  app.post('/api/dashboard/generate-site', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const styleHint =
        typeof req.body?.styleHint === "string" ? req.body.styleHint.slice(0, 400) : undefined;

      const { generateSiteHtml } = await import("./siteGenerator");
      const { html, model, inputTokens, outputTokens } = await generateSiteHtml(
        profile.username,
        styleHint,
      );

      const now = new Date();
      const [row] = await db
        .insert(generatedSites)
        .values({
          profileId: profile.id,
          html,
          model,
          styleHint,
          inputTokens,
          outputTokens,
          generatedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: generatedSites.profileId,
          set: { html, model, styleHint, inputTokens, outputTokens, generatedAt: now, updatedAt: now },
        })
        .returning();

      res.json({
        ok: true,
        username: profile.username,
        model,
        bytes: html.length,
        generatedAt: row?.generatedAt ?? now,
      });
    } catch (error: any) {
      console.error("[generate-site] failed:", error);
      res.status(500).json({ message: error?.message || "Failed to generate site" });
    }
  });

  // Metadata about the authenticated creator's generated site (for the studio UI).
  app.get('/api/dashboard/site', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const [row] = await db
        .select()
        .from(generatedSites)
        .where(eq(generatedSites.profileId, profile.id))
        .limit(1);

      if (!row) return res.json({ exists: false, username: profile.username });
      res.json({
        exists: true,
        username: profile.username,
        model: row.model,
        status: row.status,
        styleHint: row.styleHint,
        generatedAt: row.generatedAt,
        bytes: row.html.length,
      });
    } catch (error) {
      console.error("[dashboard/site] failed:", error);
      res.status(500).json({ message: "Failed to load site" });
    }
  });

  // Public: fetch a creator's generated site. JSON by default; ?format=html serves raw.
  app.get('/api/profiles/:username/site', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const [row] = await db
        .select()
        .from(generatedSites)
        .where(eq(generatedSites.profileId, profile.id))
        .limit(1);

      if (!row) return res.status(404).json({ message: "No generated site yet" });

      if (req.query.format === "html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(row.html);
      }
      res.json({ html: row.html, model: row.model, generatedAt: row.generatedAt });
    } catch (error) {
      console.error("[profiles/:username/site] failed:", error);
      res.status(500).json({ message: "Failed to fetch site" });
    }
  });

  // ===================================================================
  // AI Profile — Design Brief API (NEW, additive; docs/ai-profile-*).
  // Defaults ON. This does NOT change the public page on its own — a profile
  // only switches to the Brief-driven layout once the creator publishes, so the
  // site stays byte-for-byte unchanged until then. Set ENABLE_AI_PROFILE="false"
  // to hard-disable publish/generate (kill switch). This is the single source of
  // truth the client reads via the `enabled` field below.
  // ===================================================================
  const aiProfileEnabled = () => process.env.ENABLE_AI_PROFILE !== "false";

  // Lightweight per-profile rate limit for the (paid) model endpoints: one
  // in-flight generation at a time + a short cooldown between runs. In-memory is
  // sufficient — these are low-frequency, creator-initiated actions.
  const aiGenInFlight = new Set<string>();
  const aiGenLast = new Map<string, number>();
  const AI_GEN_COOLDOWN_MS = 8000;
  const aiGenGate = (profileId: string): { ok: true } | { ok: false; status: number; message: string } => {
    if (aiGenInFlight.has(profileId))
      return { ok: false, status: 429, message: "A design is already being generated. Please wait." };
    if (Date.now() - (aiGenLast.get(profileId) ?? 0) < AI_GEN_COOLDOWN_MS)
      return { ok: false, status: 429, message: "You're generating too fast — try again in a few seconds." };
    return { ok: true };
  };

  // Load (or seed) the creator's DRAFT brief. Seeds from the published brief if
  // one exists, otherwise from today's layout (briefFromProfile).
  app.get("/api/dashboard/brief", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const { getDraftRow, getPublishedRow, upsertDraft } = await import("./brief/store");
      const { assembleBundle } = await import("./brief/bundle");
      const { briefFromProfile } = await import("./brief/fromProfile");
      const { normalizeBrief } = await import("./brief/normalize");
      const { polishBrief } = await import("./brief/enhance");

      let draft = await getDraftRow(profile.id);
      const published = await getPublishedRow(profile.id);

      if (!draft) {
        const bundle = await assembleBundle(profile);
        let seed;
        if (published?.brief) {
          try {
            seed = normalizeBrief(published.brief, bundle);
          } catch {
            seed = polishBrief(briefFromProfile(bundle), bundle);
          }
        } else {
          // First-time seed: polish the deterministic layout so the editor opens
          // on something that already feels designed (section intros + rhythm).
          seed = polishBrief(briefFromProfile(bundle), bundle);
        }
        draft = await upsertDraft(profile.id, seed, published?.model ?? null);
      }

      res.json({
        brief: draft.brief,
        username: profile.username,
        displayName: profile.displayName,
        published: !!published,
        publishedBrief: published?.brief ?? null,
        enabled: aiProfileEnabled(),
        updatedAt: draft.updatedAt,
      });
    } catch (error: any) {
      console.error("[dashboard/brief GET] failed:", error);
      res.status(500).json({ message: "Failed to load brief" });
    }
  });

  // Save the draft (autosave). Always normalized through the safety gate.
  app.put("/api/dashboard/brief", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const { assembleBundle } = await import("./brief/bundle");
      const { normalizeBrief } = await import("./brief/normalize");
      const { upsertDraft } = await import("./brief/store");

      const bundle = await assembleBundle(profile);
      let brief;
      try {
        brief = normalizeBrief(req.body?.brief, bundle);
      } catch {
        return res.status(400).json({ message: "Invalid brief" });
      }
      const row = await upsertDraft(profile.id, brief);
      res.json({ brief: row.brief, updatedAt: row.updatedAt });
    } catch (error: any) {
      console.error("[dashboard/brief PUT] failed:", error);
      res.status(500).json({ message: "Failed to save brief" });
    }
  });

  // Publish: copy draft → published (gated).
  app.post("/api/dashboard/brief/publish", isAuthenticated, async (req: any, res) => {
    try {
      if (!aiProfileEnabled()) return res.status(403).json({ message: "AI Profile is not enabled" });
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const { assembleBundle } = await import("./brief/bundle");
      const { normalizeBrief } = await import("./brief/normalize");
      const { upsertDraft, publishDraft } = await import("./brief/store");

      // Optionally accept the latest in-flight draft from the client first.
      if (req.body?.brief) {
        const bundle = await assembleBundle(profile);
        try {
          const brief = normalizeBrief(req.body.brief, bundle);
          await upsertDraft(profile.id, brief);
        } catch {
          return res.status(400).json({ message: "Invalid brief" });
        }
      }
      const row = await publishDraft(profile.id);
      if (!row) return res.status(400).json({ message: "Nothing to publish" });
      res.json({ published: true, brief: row.brief, publishedAt: row.publishedAt });
    } catch (error: any) {
      console.error("[dashboard/brief publish] failed:", error);
      res.status(500).json({ message: "Failed to publish brief" });
    }
  });

  // Revert: discard the draft (next load reseeds from published/default).
  app.post("/api/dashboard/brief/revert", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const { deleteDraft } = await import("./brief/store");
      await deleteDraft(profile.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[dashboard/brief revert] failed:", error);
      res.status(500).json({ message: "Failed to revert brief" });
    }
  });

  // Unpublish: remove the published brief (public page reverts to today's layout).
  app.post("/api/dashboard/brief/unpublish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const { unpublish } = await import("./brief/store");
      await unpublish(profile.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[dashboard/brief unpublish] failed:", error);
      res.status(500).json({ message: "Failed to unpublish brief" });
    }
  });

  // Full AI generation (Opus). The wow moment. Writes the result to the draft.
  app.post("/api/dashboard/brief/generate", isAuthenticated, async (req: any, res) => {
    try {
      if (!aiProfileEnabled()) return res.status(403).json({ message: "AI Profile is not enabled" });
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const gate = aiGenGate(profile.id);
      if (!gate.ok) return res.status(gate.status).json({ message: gate.message });

      const { assembleBundle } = await import("./brief/bundle");
      const { generateBrief } = await import("./brief/generate");
      const { upsertDraft } = await import("./brief/store");

      aiGenInFlight.add(profile.id);
      try {
        const bundle = await assembleBundle(profile);
        const styleHint =
          typeof req.body?.styleHint === "string" ? req.body.styleHint.slice(0, 400) : undefined;
        const { brief, model, inputTokens, outputTokens } = await generateBrief(bundle, styleHint);
        const row = await upsertDraft(profile.id, brief, model);
        aiGenLast.set(profile.id, Date.now());
        res.json({ brief: row.brief, model, inputTokens, outputTokens });
      } finally {
        aiGenInFlight.delete(profile.id);
      }
    } catch (error: any) {
      console.error("[dashboard/brief generate] failed:", error);
      // A missing API key (AiNotConfiguredError) surfaces as a clear 503.
      res.status(error?.statusCode || 500).json({ message: error?.message || "Failed to generate brief" });
    }
  });

  // Scoped AI edit of one section (cheap/fast model).
  app.post("/api/dashboard/brief/section/:id/regenerate", isAuthenticated, async (req: any, res) => {
    try {
      if (!aiProfileEnabled()) return res.status(403).json({ message: "AI Profile is not enabled" });
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const { getDraftRow, upsertDraft } = await import("./brief/store");
      const { assembleBundle } = await import("./brief/bundle");
      const { editSection } = await import("./brief/generate");

      const gate = aiGenGate(profile.id);
      if (!gate.ok) return res.status(gate.status).json({ message: gate.message });

      const draft = await getDraftRow(profile.id);
      if (!draft) return res.status(400).json({ message: "No draft to edit" });
      const instruction = String(req.body?.instruction || "").slice(0, 400);
      if (!instruction) return res.status(400).json({ message: "Instruction required" });

      aiGenInFlight.add(profile.id);
      try {
        const bundle = await assembleBundle(profile);
        const { brief, model } = await editSection(bundle, draft.brief, req.params.id, instruction);
        const row = await upsertDraft(profile.id, brief, model);
        aiGenLast.set(profile.id, Date.now());
        res.json({ brief: row.brief, model });
      } finally {
        aiGenInFlight.delete(profile.id);
      }
    } catch (error: any) {
      console.error("[dashboard/brief section regenerate] failed:", error);
      res.status(error?.statusCode || 500).json({ message: error?.message || "Failed to edit section" });
    }
  });

  // Public: published brief only. 404 → renderer falls back to today's layout.
  app.get("/api/profiles/:username/brief", async (req, res) => {
    try {
      const profile = await dbStorage.getProfileByUsername(req.params.username);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      const { getPublishedRow } = await import("./brief/store");
      const row = await getPublishedRow(profile.id);
      if (!row) return res.status(404).json({ message: "No published brief" });
      res.json({ brief: row.brief, publishedAt: row.publishedAt });
    } catch (error) {
      console.error("[profiles/:username/brief] failed:", error);
      res.status(500).json({ message: "Failed to fetch brief" });
    }
  });

  app.get('/api/profiles/:username/products', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const products = await dbStorage.getDigitalProductsByProfileId(profile.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get('/api/profiles/:username/products/:productId', async (req, res) => {
    try {
      const { username, productId } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const products = await dbStorage.getDigitalProductsByProfileId(profile.id);
      const product = products.find(p => p.id === parseInt(productId));

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.get('/api/profiles/:username/physical-products', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const products = await dbStorage.getPhysicalProductsByProfileId(profile.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching physical products:", error);
      res.status(500).json({ message: "Failed to fetch physical products" });
    }
  });

  app.get('/api/profiles/:username/blog', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const posts = await dbStorage.getBlogPostsByProfileId(profile.id);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.get('/api/profiles/:username/events', async (req, res) => {
    try {
      const { username } = req.params;

      if (username === 'demo') {
        // Return demo events
        const demoEvents = [
          {
            id: 1,
            profileId: 'demo',
            title: "Mindfulness Meditation Workshop",
            description: "Learn practical mindfulness techniques to reduce stress and increase focus in your daily life.",
            startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
            location: "Peaceful Mind Wellness Center",
            mode: "offline",
            pricingType: "paid",
            price: "85.00",
            maxAttendees: 15,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 2,
            profileId: 'demo',
            title: "Stress Management Masterclass",
            description: "Comprehensive workshop on identifying stress triggers and developing healthy coping strategies.",
            startAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
            location: "Virtual Event (Zoom Link Provided)",
            mode: "online",
            pricingType: "paid",
            price: "125.00",
            maxAttendees: 20,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 3,
            profileId: 'demo',
            title: "Nutritional Wellness Seminar",
            description: "Discover how to fuel your body with the right foods for optimal energy and health.",
            startAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000).toISOString(),
            location: "Healthy Living Community Center",
            mode: "offline",
            pricingType: "paid",
            price: "65.00",
            maxAttendees: 25,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
        return res.json(demoEvents);
      }

      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      let events = await dbStorage.getPublicEventsByProfileId(profile.id);

      // Lazily extend any recurring series that may be approaching window expiry,
      // then re-fetch so newly generated instances are reflected in this response.
      const profileSeriesIds = Array.from(new Set(
        events.filter(e => e.seriesId != null).map(e => e.seriesId as number)
      ));
      if (profileSeriesIds.length > 0) {
        await Promise.all(profileSeriesIds.map(sid => extendSeriesIfNeeded(sid).catch(err => {
          console.error(`[extendSeries] profile events, series ${sid}:`, err);
        })));
        events = await dbStorage.getPublicEventsByProfileId(profile.id);
      }

      // Enhance events with location data
      const enhancedEvents = await Promise.all(events.map(async (event) => {
        if (event.locationId) {
          const location = await dbStorage.getLocationById(event.locationId);
          if (location) {
            return {
              ...event,
              locationAddress: location.address,
              locationCity: location.city,
              locationState: location.state,
              locationCountry: location.country,
              locationUrl: location.googleMapsUrl,
            };
          }
        }
        return event;
      }));

      res.json(enhancedEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Individual event endpoint
  app.get('/api/profiles/:username/events/:eventId', async (req, res) => {
    try {
      const { username, eventId } = req.params;

      if (username === 'demo') {
        // Return demo event by ID
        const demoEvents = [
          {
            id: 1,
            profileId: 'demo',
            title: "Mindfulness Meditation Workshop",
            description: "Learn practical mindfulness techniques to reduce stress and increase focus in your daily life.",
            startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
            location: "Peaceful Mind Wellness Center",
            mode: "offline",
            pricingType: "paid",
            price: "85.00",
            maxAttendees: 15,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 2,
            profileId: 'demo',
            title: "Stress Management Masterclass",
            description: "Comprehensive workshop on identifying stress triggers and developing healthy coping strategies.",
            startAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
            location: "Virtual Event (Zoom Link Provided)",
            mode: "online",
            pricingType: "paid",
            price: "125.00",
            maxAttendees: 20,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 3,
            profileId: 'demo',
            title: "Nutritional Wellness Seminar",
            description: "Discover how to fuel your body with the right foods for optimal energy and health.",
            startAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000).toISOString(),
            location: "Healthy Living Community Center",
            mode: "offline",
            pricingType: "paid",
            price: "65.00",
            maxAttendees: 25,
            featuredImage: "/api/placeholder/400/200",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        const event = demoEvents.find(e => e.id === parseInt(eventId));
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }
        return res.json(event);
      }

      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // ?asSeriesRoot=true explicitly requests resolution by series ID (deterministic routing)
      const resolveAsSeriesRoot = req.query.asSeriesRoot === 'true';

      let event = resolveAsSeriesRoot ? null : await dbStorage.getEventById(parseInt(eventId));
      let isSeriesRoot = false;

      if (resolveAsSeriesRoot || !event || event.profileId !== profile.id) {
        // Explicit series-root resolution path: look up the series by ID
        const series = await dbStorage.getEventSeriesById(parseInt(eventId));
        // Enforce ownership: series must belong to this profile
        if (series && series.profileId === profile.id) {
          await extendSeriesIfNeeded(series.id);
          const now = new Date();
          const allInstances = await dbStorage.getEventSeriesInstances(series.id);
          const upcoming = allInstances
            .filter(e => e.startAt && new Date(e.startAt) >= now && !e.isCancelled)
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime());
          const pastFallback = allInstances
            .filter(e => !e.isCancelled)
            .sort((a, b) => new Date(b.startAt!).getTime() - new Date(a.startAt!).getTime());
          const rep = upcoming[0] ?? pastFallback[0];
          if (rep) {
            event = rep;
            isSeriesRoot = true;
          }
        } else if (resolveAsSeriesRoot) {
          return res.status(404).json({ message: "Event series not found" });
        }
      }

      if (!event || event.profileId !== profile.id) {
        return res.status(404).json({ message: "Event not found" });
      }

      // For series events, load the series pattern + lazy extend + upcoming count
      let seriesPattern: SeriesPattern | null = null;
      let cadenceLabel: string | null = null;
      let upcomingCount: number | null = null;
      if (event.seriesId) {
        const series = await dbStorage.getEventSeriesById(event.seriesId);
        if (series) {
          seriesPattern = series.pattern;
          cadenceLabel = cadenceLabelFromPattern(seriesPattern);
          await extendSeriesIfNeeded(event.seriesId);
          const now = new Date();
          const allInstances = await dbStorage.getEventSeriesInstances(event.seriesId);
          upcomingCount = allInstances.filter(e => e.startAt && new Date(e.startAt) >= now && !e.isCancelled).length;
        }
      }

      // Merge per-instance overrides (title, description, location, meetingLink, etc.)
      // set via scope=this edits into the top-level fields before returning
      const eventOverrides = event.instanceOverrides as Record<string, unknown> | null;
      const overrideFields: Partial<Event> = {};
      if (eventOverrides && Object.keys(eventOverrides).length > 0) {
        const { startTime: _st, ...applyable } = eventOverrides;
        Object.assign(overrideFields, applyable);
      }

      // Enhance event with location data
      let enhancedEvent: EventWithExtras = { ...event, ...overrideFields, seriesPattern, cadenceLabel, upcomingCount, isRecurring: !!event.seriesId, isSeriesRoot };
      if (event.locationId) {
        const location = await dbStorage.getLocationById(event.locationId);
        if (location) {
          enhancedEvent = {
            ...enhancedEvent,
            locationAddress: location.address,
            locationCity: location.city,
            locationState: location.state,
            locationCountry: location.country,
            locationUrl: location.googleMapsUrl,
          };
        }
      }

      res.json(enhancedEvent);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  // Public: get upcoming instances for a recurring series
  app.get('/api/profiles/:username/events/:eventId/instances', async (req, res) => {
    try {
      const { username, eventId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string || '20'), 50);
      const offset = parseInt(req.query.offset as string || '0');
      // When asSeriesRoot=true, eventId is a series ID — resolve via series table first
      // to avoid event.id / event_series.id collision (both independent sequences)
      const resolveAsSeries = req.query.asSeriesRoot === 'true';

      const profile = await dbStorage.getProfileByUsername(username);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      let event: Awaited<ReturnType<typeof dbStorage.getEventById>> = undefined;
      let directSeriesId: number | null = null;

      if (resolveAsSeries) {
        // Series-root resolution: eventId is actually a series ID
        const series = await dbStorage.getEventSeriesById(parseInt(eventId));
        if (series && series.profileId === profile.id) {
          directSeriesId = series.id;
        } else {
          return res.status(404).json({ message: "Event series not found" });
        }
      } else {
        // Standard resolution: eventId is an event row ID
        event = await dbStorage.getEventById(parseInt(eventId));
        if (!event || event.profileId !== profile.id) {
          // Fallback: try treating eventId as a series ID for backward compatibility
          const series = await dbStorage.getEventSeriesById(parseInt(eventId));
          if (series && series.profileId === profile.id) {
            directSeriesId = series.id;
          } else {
            return res.status(404).json({ message: "Event not found" });
          }
        }
      }

      const seriesId = directSeriesId ?? event?.seriesId ?? null;
      if (!seriesId) {
        // Standalone event (no series) — return normalized shape matching the recurring path
        if (!event) return res.status(404).json({ message: "Event not found" });
        const regs = await dbStorage.getEventRegistrationsByEventId(event.id);
        const count = regs.filter(r => !['cancelled', 'refunded'].includes(r.status as string)).length;
        const enriched = { ...event, registrationCount: count, isFull: event.maxAttendees != null && count >= event.maxAttendees };
        return res.json({ instances: [enriched], upcomingCount: 1, total: 1 });
      }

      // Lazily extend indefinite series before fetching
      await extendSeriesIfNeeded(seriesId);

      const now = new Date();
      const instances = await dbStorage.getUpcomingInstancesWithCounts(seriesId, now, limit, offset);

      // Merge per-instance overrides (title, description, location, meetingLink, etc.)
      // set via scope=this edits into the top-level fields before returning
      const mergedInstances = instances.map(inst => {
        const overrides = inst.instanceOverrides as Record<string, unknown> | null;
        if (!overrides || Object.keys(overrides).length === 0) return inst;
        const { startTime: _st, ...applyable } = overrides;
        return { ...inst, ...applyable };
      });

      // Count upcoming instances for pagination metadata.
      // `getUpcomingInstancesWithCounts` includes cancelled future instances (shown greyed-out in UI).
      // `total` must use the same filter (future, including cancelled) so client pagination
      //   doesn't stop early when cancelled instances are present in the visible list.
      // `upcomingCount` is non-cancelled future count used for badge display.
      const allInstances = await dbStorage.getEventSeriesInstances(seriesId);
      // Mirror the filters from getUpcomingInstancesWithCounts: isActive=true, startAt>=now
      // (cancelled instances are intentionally kept — they appear greyed-out in the picker)
      const futureInstances = allInstances.filter(e => e.isActive && e.startAt && new Date(e.startAt) >= now);
      const upcomingCount = futureInstances.filter(e => !e.isCancelled).length;
      const totalFuture = futureInstances.length; // includes cancelled — matches paginated list

      res.json({ instances: mergedInstances, upcomingCount, total: totalFuture });
    } catch (error) {
      console.error("Error fetching series instances:", error);
      res.status(500).json({ message: "Failed to fetch instances" });
    }
  });

  app.get('/api/profiles/:username/sessions', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessions = await dbStorage.getBookingSessionsByProfileId(profile.id);

      // Enhance sessions with location data
      const enhancedSessions = await Promise.all(sessions.map(async (session) => {
        if ((session as any).locationId) {
          const location = await dbStorage.getLocationById((session as any).locationId);
          if (location) {
            return {
              ...session,
              locationName: location.name,
              locationAddress: location.address,
              locationCity: location.city,
              locationState: location.state,
              locationCountry: location.country,
              locationUrl: location.googleMapsUrl,
            };
          }
        }
        return session;
      }));

      res.json(enhancedSessions);
    } catch (error) {
      console.error("Error fetching booking sessions:", error);
      res.status(500).json({ message: "Failed to fetch booking sessions" });
    }
  });

  // Individual session endpoint
  app.get('/api/profiles/:username/sessions/:sessionId', async (req, res) => {
    try {
      const { username, sessionId } = req.params;

      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const session = await dbStorage.getBookingSessionById(parseInt(sessionId));

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Enhance session with location data
      let enhancedSession: any = session;
      if ((session as any).locationId) {
        const location = await dbStorage.getLocationById((session as any).locationId);
        if (location) {
          enhancedSession = {
            ...session,
            locationName: location.name,
            locationAddress: location.address,
            locationCity: location.city,
            locationState: location.state,
            locationCountry: location.country,
            locationUrl: location.googleMapsUrl,
          };
        }
      }

      res.json(enhancedSession);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Dashboard routes (protected)
  app.get('/api/dashboard/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      let profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        // Authenticated session but no profile row. Distinguish two cases:
        //   1. PROFILE_DELETED — an explicit `deleted_account_markers` row
        //      written before account deletion (matched by current auth
        //      uuid OR email, since re-signup mints a fresh uuid). The
        //      onboarding wizard surfaces a "your profile was removed"
        //      banner so the user understands why they're back here.
        //   2. PROFILE_MISSING — a brand-new signup (or a partial onboard
        //      that walked away mid-flow). No banner; treated as a normal
        //      first-time onboarding entry.
        const authEmail = getUserEmail(req);
        let wasDeleted = false;
        try {
          const [byId] = await db
            .select({ email: deletedAccountMarkers.email })
            .from(deletedAccountMarkers)
            .where(eq(deletedAccountMarkers.originalUserId, userId))
            .limit(1);
          if (byId) {
            wasDeleted = true;
          } else if (authEmail) {
            const [byEmail] = await db
              .select({ email: deletedAccountMarkers.email })
              .from(deletedAccountMarkers)
              .where(eq(deletedAccountMarkers.email, authEmail.toLowerCase()))
              .limit(1);
            if (byEmail) wasDeleted = true;
          }
        } catch (markerErr) {
          console.warn(`[dashboard/profile] deletion-marker lookup failed for ${userId}:`, markerErr);
        }

        if (wasDeleted) {
          console.warn(`[dashboard/profile] PROFILE_DELETED for authenticated user ${userId} (${authEmail ?? "no-email"})`);
          return res.status(404).json({
            code: "PROFILE_DELETED",
            message: "Your previous profile was removed. Set things up again to continue.",
          });
        }

        console.warn(`[dashboard/profile] PROFILE_MISSING for authenticated user ${userId}`);
        return res.status(404).json({
          code: "PROFILE_MISSING",
          message: "Profile not found",
        });
      }

      // Auto-sync email from Supabase auth if not set in profile
      if (!profile.email) {
        const authEmail = getUserEmail(req);
        if (authEmail) {
          console.log(`[Profile] Auto-syncing email for user ${userId}: ${authEmail}`);
          await dbStorage.updateProfile(userId, { email: authEmail });
          profile = { ...profile, email: authEmail };
        }
      }

      // If user's account is deactivated, reactivate it when they log in
      if (profile.isDeactivated) {
        console.log("Reactivating deactivated account for userId:", userId);
        await dbStorage.reactivateAccount(userId);
        // Refresh profile data after reactivation
        const reactivatedProfile = await dbStorage.getProfileById(userId);
        // Return with flag to show welcome back message on frontend
        return res.json({
          ...reactivatedProfile,
          wasReactivated: true,
          requiresWhatsappEmailVerification:
            (["whatsapp", "whatsapp_cm"].includes((reactivatedProfile?.sourceChannel ?? "").toLowerCase()))
            && (!reactivatedProfile?.emailVerifiedAt
                || reactivatedProfile?.onboardingCompleted === false),
        });
      }

      // Surface a derived flag so a single API hop tells the client
      // whether to send the user to /whatsapp-verify rather than the
      // standard onboarding wizard. Source of truth columns
      // (`sourceChannel`, `emailVerifiedAt`, `onboardingCompleted`)
      // are also returned for clients that want to compute their own.
      const requiresWhatsappEmailVerification =
        (["whatsapp", "whatsapp_cm"].includes((profile.sourceChannel ?? "").toLowerCase()))
        && (!profile.emailVerifiedAt || profile.onboardingCompleted === false);

      res.json({ ...profile, requiresWhatsappEmailVerification });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post('/api/dashboard/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Clean and validate social links (Legacy support, can be kept or ignored if we switch entirely to contactInfo)
      const socialLinks = req.body.socialLinks ? {
        instagram: req.body.socialLinks.instagram ? String(req.body.socialLinks.instagram) : undefined,
        youtube: req.body.socialLinks.youtube ? String(req.body.socialLinks.youtube) : undefined,
        whatsapp: req.body.socialLinks.whatsapp ? String(req.body.socialLinks.whatsapp) : undefined,
        linkedin: req.body.socialLinks.linkedin ? String(req.body.socialLinks.linkedin) : undefined,
        website: req.body.socialLinks.website ? String(req.body.socialLinks.website) : undefined,
      } : null;

      // Get existing profile to preserve data not included in this request
      const existingProfile = await dbStorage.getProfileById(userId);

      // Clean and validate custom links - PRESERVE existing if not provided in request
      // Treat both undefined and null as "not provided" to prevent accidental data loss
      // Only update if customLinks is explicitly provided as an array
      const customLinks = Array.isArray(req.body.customLinks)
        ? req.body.customLinks.map((link: any) => ({
          title: String(link.title || ''),
          url: String(link.url || ''),
          icon: String(link.icon || 'link')
        }))
        : (existingProfile?.customLinks || []);

      // Clean and validate home page links - PRESERVE existing if not provided in request
      // Treat both undefined and null as "not provided" to prevent accidental data loss
      // Only update if homePageLinks is explicitly provided as an array
      const homePageLinks = Array.isArray(req.body.homePageLinks)
        ? req.body.homePageLinks.map((link: any) => ({
          title: String(link.title || ''),
          type: String(link.type || 'other'),
          description: String(link.description || ''),
          imageUrl: link.imageUrl ? String(link.imageUrl) : null,
          url: String(link.url || '')
        }))
        : (existingProfile?.homePageLinks || []);

      // Get user email from Supabase auth to populate profile
      const userEmail = getUserEmail(req);

      // Create clean request body with proper social links and custom links
      // Note: id is the Supabase auth user UUID, used as the profile's primary key
      // For fields that are complex objects/arrays, preserve existing values if not provided
      const cleanBody = {
        id: userId, // Use Supabase auth UUID as profile ID
        displayName: req.body.displayName,
        // Preserve existing username if not provided (Profile Page tab doesn't send username, Profile Settings does)
        username: req.body.username || existingProfile?.username,
        title: req.body.title,
        profileImageUrl: req.body.profileImageUrl,
        socialLinks: socialLinks,
        customLinks: customLinks,
        homePageLinks: homePageLinks,
        // Preserve galleryImages if not provided in request (treat null as not provided)
        galleryImages: Array.isArray(req.body.galleryImages)
          ? req.body.galleryImages
          : existingProfile?.galleryImages,
        isActive: req.body.isActive,
        // Add new fields
        shortBio: req.body.shortBio,
        shortBioImageUrl: req.body.shortBioImageUrl,
        shortBioYoutubeUrl: req.body.shortBioYoutubeUrl,
        longBio: req.body.longBio,
        longBioImageUrl: req.body.longBioImageUrl,
        longBioYoutubeUrl: req.body.longBioYoutubeUrl,
        // Preserve contactInfo if not provided - merge with existing to avoid overwriting
        // Treat null/undefined as "not provided" to prevent accidental data loss
        contactInfo: (req.body.contactInfo && typeof req.body.contactInfo === 'object' && !Array.isArray(req.body.contactInfo))
          ? req.body.contactInfo
          : existingProfile?.contactInfo,
        email: userEmail, // Auto-populate email from Supabase auth
        searchableLocation: req.body.searchableLocation,
        searchTags: req.body.searchTags,
        onboardingCompleted: req.body.onboardingCompleted,
      };

      console.log("Clean body for validation:", JSON.stringify(cleanBody, null, 2));

      // Use insertProfileSchema but allow partial updates or ensure all fields are present
      // The schema validation might fail if we pass extra fields not in the schema, 
      // but insertProfileSchema is derived from the table which HAS these columns.

      const profileData = insertProfileSchema.parse(cleanBody) as any;

      if (existingProfile) {
        const updatedProfile = await dbStorage.updateProfile(existingProfile.id, profileData);
        res.json(updatedProfile);
      } else {
        const newProfile = await dbStorage.createProfile(profileData);
        // Clear any prior deletion breadcrumb for this email/uuid so the
        // "profile was removed" banner doesn't reappear after a successful
        // re-onboarding.
        try {
          const emailLower = (userEmail || "").toLowerCase();
          await db
            .delete(deletedAccountMarkers)
            .where(
              emailLower
                ? or(
                    eq(deletedAccountMarkers.email, emailLower),
                    eq(deletedAccountMarkers.originalUserId, userId),
                  )
                : eq(deletedAccountMarkers.originalUserId, userId),
            );
        } catch (markerErr) {
          console.warn(`[dashboard/profile POST] failed to clear deletion marker for ${userId}:`, markerErr);
        }
        res.json(newProfile);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      console.error("Error saving profile:", error);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  app.patch('/api/dashboard/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const existingProfile = await dbStorage.getProfileById(userId);

      if (!existingProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Allow partial updates - only update fields that are provided
      const updateData: any = {};

      if (req.body.timezone !== undefined) {
        updateData.timezone = req.body.timezone;
      }
      if (req.body.displayName !== undefined) {
        updateData.displayName = req.body.displayName;
      }
      if (req.body.title !== undefined) {
        updateData.title = req.body.title;
      }
      if (req.body.bio !== undefined) {
        updateData.bio = req.body.bio;
      }
      if (req.body.profileImageUrl !== undefined) {
        updateData.profileImageUrl = req.body.profileImageUrl;
      }
      if (req.body.socialLinks !== undefined) {
        updateData.socialLinks = req.body.socialLinks;
      }
      if (req.body.customLinks !== undefined) {
        updateData.customLinks = req.body.customLinks;
      }
      if (req.body.homePageLinks !== undefined) {
        updateData.homePageLinks = req.body.homePageLinks;
      }

      const updatedProfile = await dbStorage.updateProfile(existingProfile.id, updateData);
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Delete Account.
  // Auth user is deleted FIRST so the Supabase `handle_auth_user_deleted`
  // trigger cascades to `profiles` and all FK-chained child tables. The
  // Drizzle cleanup that follows is a defensive safety-net only.
  app.delete('/api/dashboard/delete-account', isAuthenticated, async (req: any, res) => {
    const userId = getUserId(req);
    try {
      if (!isSupabaseConfigured() || !supabase) {
        console.error("[delete-account] Supabase admin client unavailable — refusing to delete");
        return res.status(503).json({
          message: "Account deletion is temporarily unavailable. Please try again shortly or contact support.",
        });
      }

      // Write the deletion breadcrumb BEFORE removing the auth user. The
      // row has no FK and is never touched by the cascade, so the next
      // login (legacy orphan or fresh re-signup with the same email) can
      // be reliably identified as a previously-deleted account.
      const userEmail = (getUserEmail(req) || "").toLowerCase();
      if (userEmail) {
        try {
          await db
            .insert(deletedAccountMarkers)
            .values({ email: userEmail, originalUserId: userId })
            .onConflictDoUpdate({
              target: deletedAccountMarkers.email,
              set: { originalUserId: userId, deletedAt: new Date() },
            });
        } catch (markerErr) {
          console.warn(`[delete-account] failed to record deletion marker for ${userId}:`, markerErr);
        }
      } else {
        console.warn(`[delete-account] no email on session for ${userId}; skipping deletion marker`);
      }

      const { error: authError } = await supabase.auth.admin.deleteUser(userId);
      if (authError) {
        console.error(`[delete-account] auth.admin.deleteUser failed for ${userId}:`, authError);
        return res.status(500).json({
          message: `Failed to delete account: ${authError.message}. Nothing was removed — please try again or contact support.`,
        });
      }

      try {
        await dbStorage.deleteUserAccount(userId);
      } catch (cleanupError) {
        console.warn(`[delete-account] safety-net cleanup failed for ${userId} (auth user already deleted):`, cleanupError);
      }

      console.log(`[delete-account] success userId=${userId}`);
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete account.";
      console.error(`[delete-account] unexpected error for ${userId}:`, error);
      res.status(500).json({ message: `Failed to delete account: ${message}` });
    }
  });

  // Deactivate Account - Makes account dormant, not visible in public/search
  app.post('/api/dashboard/deactivate-account', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      console.log("Deactivate account request - userId:", userId);

      // Mark account as deactivated
      await dbStorage.deactivateAccount(userId);

      console.log("Account deactivated successfully for userId:", userId);

      res.json({ message: "Account deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating account:", error);
      res.status(500).json({ message: "Failed to deactivate account" });
    }
  });

  // Profile Settings Update (username, location, tags)
  app.post('/api/dashboard/profile-settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { username, searchableLocation, tagIds } = req.body;

      const existingProfile = await dbStorage.getProfileById(userId);

      if (!existingProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Check if username is being changed and if it's already taken
      if (username && username !== existingProfile.username) {
        const existingUsername = await dbStorage.getProfileByUsername(username);
        if (existingUsername && existingUsername.id !== existingProfile.id) {
          return res.status(400).json({ message: "Username is already taken" });
        }
      }

      const updatedProfile = await dbStorage.updateProfile(existingProfile.id, {
        username: username || existingProfile.username,
        searchableLocation: searchableLocation || null,
      });

      // Handle tags if provided using the centralized tag system
      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setProfileTags(existingProfile.id, tagIds);
      }

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating profile settings:", error);
      res.status(500).json({ message: "Failed to update profile settings" });
    }
  });

  // Contact Information Management
  app.post('/api/dashboard/contact', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { contactInfo } = req.body;

      console.log("Contact save request - userId:", userId);
      console.log("Contact save request - contactInfo:", JSON.stringify(contactInfo, null, 2));

      const existingProfile = await dbStorage.getProfileById(userId);

      if (!existingProfile) {
        console.log("Profile not found for userId:", userId);
        return res.status(404).json({ message: "Profile not found" });
      }

      console.log("Existing profile found:", existingProfile.id);

      // Update the profile with the new contact information
      const updatedProfile = await dbStorage.updateProfile(existingProfile.id, {
        contactInfo
      });

      console.log("Profile updated successfully:", updatedProfile.id);
      console.log("Updated contactInfo:", JSON.stringify(updatedProfile.contactInfo, null, 2));

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error saving contact information:", error);
      res.status(500).json({ message: "Failed to save contact information" });
    }
  });

  // Digital Products Management
  app.get('/api/dashboard/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const products = await dbStorage.getDigitalProductsByProfileId(profile.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching digital products:", error);
      res.status(500).json({ message: "Failed to fetch digital products" });
    }
  });

  app.post('/api/dashboard/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Extract tagIds before parsing product data
      const { tagIds, ...bodyWithoutTags } = req.body;

      const productData = insertDigitalProductSchema.parse({ ...bodyWithoutTags, profileId: profile.id });
      const newProduct = await dbStorage.createDigitalProduct(productData);

      // Handle tags if provided
      if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
        await dbStorage.setDigitalProductTags(newProduct.id, tagIds);
      }

      res.json(newProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch('/api/dashboard/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productId = parseInt(req.params.id);

      // Extract tagIds before parsing product data
      const { tagIds, ...bodyWithoutTags } = req.body;

      const updateData = insertDigitalProductSchema.partial().parse(bodyWithoutTags);
      const updatedProduct = await dbStorage.updateDigitalProduct(productId, updateData);

      // Handle tags if provided
      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setDigitalProductTags(productId, tagIds);
      }

      res.json(updatedProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete('/api/dashboard/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productId = parseInt(req.params.id);
      await dbStorage.deleteDigitalProduct(productId);
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Product File Upload - uploads file to Supabase private storage
  app.post('/api/dashboard/products/upload-file', isAuthenticated, productFileUpload.single('file'), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);

      // Get product title for clean filename (if provided)
      const productTitle = req.body.productTitle || null;

      // Upload to Supabase private storage (secure_products bucket)
      const storagePath = await supabaseStorage.uploadPrivateFile(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype,
        `products/${profile.id}`,
        productTitle
      );

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      // Determine product type based on mimetype
      let productType = 'pdf';
      if (req.file.mimetype.startsWith('video/')) {
        productType = 'video';
      } else if (req.file.mimetype.startsWith('image/')) {
        productType = 'image';
      }

      res.json({
        fileUrl: storagePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        productType,
      });
    } catch (error) {
      console.error("Error uploading product file:", error);
      // Clean up temp file if it exists
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Public endpoint to get product details
  app.get('/api/profiles/:username/products/:productId', async (req, res) => {
    try {
      const { username, productId } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || product.profileId !== profile.id || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Purchase a digital product (handles both free and paid)
  app.post('/api/products/:productId/purchase', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if user already purchased
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);
      if (existingPurchase) {
        return res.json({
          success: true,
          purchaseId: existingPurchase.id,
          message: "You already own this product"
        });
      }

      // For free products, create purchase directly
      if (product.isFree) {
        const buyerProfileId = req.user?.id || null;
        const purchase = await dbStorage.createProductPurchase({
          productId: parseInt(productId),
          buyerProfileId,
          email,
          amount: "0.00",
          status: "completed",
        });

        return res.json({
          success: true,
          purchaseId: purchase.id,
          message: "Product acquired successfully"
        });
      }

      // For paid products, return info for Stripe checkout
      // The frontend will handle the Stripe payment
      res.json({
        success: false,
        requiresPayment: true,
        price: product.price,
        productId: product.id,
        title: product.title,
      });
    } catch (error) {
      console.error("Error processing purchase:", error);
      res.status(500).json({ message: "Failed to process purchase" });
    }
  });

  // Record a completed payment for a product
  app.post('/api/products/:productId/confirm-payment', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { email, stripePaymentId, amount } = req.body;

      if (!email || !stripePaymentId) {
        return res.status(400).json({ message: "Email and payment ID are required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if already purchased
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);
      if (existingPurchase) {
        return res.json({
          success: true,
          purchaseId: existingPurchase.id
        });
      }

      const buyerProfileId = req.user?.id || null;
      const purchase = await dbStorage.createProductPurchase({
        productId: parseInt(productId),
        buyerProfileId,
        email,
        amount: amount || product.price,
        stripePaymentId,
        status: "completed",
      });

      res.json({
        success: true,
        purchaseId: purchase.id
      });
    } catch (error) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // Create Stripe checkout session for paid products
  app.post('/api/products/:productId/create-checkout', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get the profile for the product
      const profile = await dbStorage.getProfileById(product.profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Check if user already purchased
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);
      if (existingPurchase) {
        return res.json({
          message: "You already own this product",
          alreadyPurchased: true
        });
      }

      // For free products, create purchase directly
      if (product.isFree) {
        const buyerProfileId = req.user?.id || null;
        const purchase = await dbStorage.createProductPurchase({
          productId: parseInt(productId),
          buyerProfileId,
          email,
          amount: "0.00",
          status: "completed",
        });

        return res.json({
          message: "Product acquired successfully",
          purchaseId: purchase.id,
          isFree: true
        });
      }

      // Check if Stripe is configured
      if (!stripe) {
        return res.status(503).json({
          message: "Payment processing is not configured. Please contact the site administrator."
        });
      }

      // Create Stripe checkout session
      const baseUrl = getAppBaseUrl();

      // Use product's currency (default to USD), Stripe requires lowercase
      const checkoutCurrency = (product.currency || 'USD').toLowerCase();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: checkoutCurrency,
              product_data: {
                name: product.title,
                description: product.description || `Digital product by ${profile.displayName}`,
              },
              unit_amount: Math.round(parseFloat(product.price) * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/${profile.username}/product/${productId}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/${profile.username}/product/${productId}?canceled=true`,
        customer_email: email,
        metadata: {
          productId: productId.toString(),
          email: email,
          userId: req.user?.id || '',
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Stripe webhook endpoint to handle successful payments
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    let event;

    try {
      // If webhook secret is configured, verify signature
      if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } else {
        // For testing without webhook secret
        event = JSON.parse(req.body.toString());
      }
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const productId = session.metadata?.productId;
      const email = session.metadata?.email;
      const buyerProfileId = session.metadata?.userId || null;

      if (productId && email) {
        try {
          // Check if already purchased
          const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);
          if (!existingPurchase) {
            const product = await dbStorage.getDigitalProductById(parseInt(productId));

            if (product) {
              await dbStorage.createProductPurchase({
                productId: parseInt(productId),
                buyerProfileId: buyerProfileId || null,
                email,
                amount: product.price,
                stripePaymentId: session.payment_intent as string,
                status: "completed",
              });
              console.log(`Purchase recorded for product ${productId} by ${email}`);
            }
          }
        } catch (error) {
          console.error("Error recording purchase from webhook:", error);
        }
      }
    }

    res.json({ received: true });
  });

  // Verify Stripe checkout session and record purchase (fallback for webhook)
  app.get('/api/products/:productId/verify-purchase', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { session_id } = req.query;

      if (!stripe) {
        return res.status(503).json({ message: "Stripe not configured" });
      }

      if (!session_id) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      // Retrieve the session from Stripe
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ message: "Payment not completed" });
      }

      const email = session.metadata?.email || session.customer_email;
      const buyerProfileId = session.metadata?.userId || req.user?.id || null;

      if (!email) {
        return res.status(400).json({ message: "Email not found in session" });
      }

      // Check if already purchased
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);
      if (existingPurchase) {
        return res.json({
          success: true,
          purchaseId: existingPurchase.id,
          message: "Purchase already recorded"
        });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Record the purchase
      const purchase = await dbStorage.createProductPurchase({
        productId: parseInt(productId),
        buyerProfileId: buyerProfileId || null,
        email,
        amount: product.price,
        stripePaymentId: session.payment_intent as string,
        status: "completed",
      });

      res.json({
        success: true,
        purchaseId: purchase.id
      });
    } catch (error) {
      console.error("Error verifying purchase:", error);
      res.status(500).json({ message: "Failed to verify purchase" });
    }
  });

  // Free product claim endpoint
  app.post('/api/products/:productId/purchase-free', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { email } = req.body;

      // Get email from request body or user session
      const purchaseEmail = email || req.user?.email;

      if (!purchaseEmail) {
        return res.status(400).json({ message: "Email is required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Verify product is free
      if (!product.isFree && parseFloat(product.price) > 0) {
        return res.status(400).json({ message: "This product requires payment" });
      }

      // Check if already purchased
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), purchaseEmail);
      if (existingPurchase) {
        return res.json({
          success: true,
          purchaseId: existingPurchase.id,
          message: "You already own this product"
        });
      }

      // Create free purchase record
      const buyerProfileId = req.user?.id || null;
      const purchase = await dbStorage.createProductPurchase({
        productId: parseInt(productId),
        buyerProfileId,
        email: purchaseEmail,
        amount: "0.00",
        status: "completed",
      });

      res.json({
        success: true,
        purchaseId: purchase.id,
        message: "Product acquired successfully"
      });
    } catch (error) {
      console.error("Error processing free purchase:", error);
      res.status(500).json({ message: "Failed to process free purchase" });
    }
  });

  // Check if user has purchased a product
  app.get('/api/products/:productId/purchase-status', async (req: any, res) => {
    try {
      const { productId } = req.params;

      // Check user session first, then query param
      const email = req.user?.email || req.query.email;

      if (!email) {
        return res.json({ hasPurchased: false });
      }

      const purchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email as string);

      res.json({
        hasPurchased: !!purchase,
        purchaseId: purchase?.id
      });
    } catch (error) {
      console.error("Error checking purchase status:", error);
      res.status(500).json({ message: "Failed to check purchase status" });
    }
  });

  // Download product file (requires purchase verification) - proxied for iPhone/Safari compatibility
  app.get('/api/products/:productId/download', async (req: any, res) => {
    try {
      const { productId } = req.params;

      // Check user session first, then query param
      const email = req.user?.email || req.query.email;

      if (!email) {
        return res.status(401).json({ message: "Login required to download" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.fileUrl) {
        return res.status(404).json({ message: "Product file not available" });
      }

      // Verify purchase
      const purchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email as string);

      if (!purchase) {
        return res.status(403).json({ message: "You must purchase this product to download" });
      }

      await dbStorage.incrementProductDownloadCount(purchase.id);

      const baseName = product.fileUrl.split('/').pop() || '';
      const dotIndex = baseName.lastIndexOf('.');
      const fileExtension = dotIndex > 0 ? baseName.substring(dotIndex) : '';
      const safeTitle = (product.title || 'download').replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_') || 'download';
      const downloadFileName = `${safeTitle}${fileExtension}`;

      const signedUrl = await supabaseStorage.getSignedDownloadUrl(product.fileUrl, 300);

      const fileResponse = await fetch(signedUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file from storage: ${fileResponse.status}`);
      }

      const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      const contentLength = fileResponse.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const readableStream = Readable.fromWeb(fileResponse.body as any);
      readableStream.pipe(res);
    } catch (error) {
      console.error("Error downloading product:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download product" });
      }
    }
  });

  // In-memory store for short-lived free download tokens (auto-expire after 5 minutes)
  const freeDownloadTokens = new Map<string, { productId: number; email: string; expiresAt: number }>();

  // Free product download - register purchase, return short-lived download token
  app.post('/api/products/:productId/free-download', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { fullName, email } = req.body;

      if (!fullName || !email) {
        return res.status(400).json({ message: "Full name and email are required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Verify it's a free product
      if (!product.isFree) {
        return res.status(403).json({ message: "This product requires payment" });
      }

      if (!product.fileUrl) {
        return res.status(404).json({ message: "Product file not available" });
      }

      // Find or create guest profile for portal access
      const guestProfile = await dbStorage.getOrCreateGuestProfile(
        email,
        fullName,
        null,
        product.profileId
      );

      // Record the free download as a purchase (for tracking)
      const existingPurchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), email);

      let purchase = existingPurchase;
      if (!purchase) {
        purchase = await dbStorage.createProductPurchase({
          productId: parseInt(productId),
          guestProfileId: guestProfile.id,
          email: email,
          buyerName: fullName,
          amount: "0",
          currency: product.currency || "USD",
          status: "completed",
          stripePaymentId: `free_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
      } else if (!existingPurchase.guestProfileId) {
        // Link existing purchase to the guest profile if not already linked
        await db
          .update(digitalProductPurchases)
          .set({ guestProfileId: guestProfile.id, buyerName: existingPurchase.buyerName || fullName })
          .where(eq(digitalProductPurchases.id, existingPurchase.id));
      }

      const token = `fdl_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
      freeDownloadTokens.set(token, {
        productId: parseInt(productId),
        email: email,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      setTimeout(() => freeDownloadTokens.delete(token), 5 * 60 * 1000);

      res.json({ success: true, downloadToken: token, purchaseId: purchase.id, guestAccessToken: guestProfile.accessToken });
    } catch (error) {
      console.error("Error processing free download:", error);
      res.status(500).json({ message: "Failed to process free download" });
    }
  });

  // Proxy download for free products using short-lived token
  app.get('/api/products/:productId/free-download-file', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const token = req.query.token as string;

      if (!token) {
        return res.status(400).json({ message: "Download token is required" });
      }

      const tokenData = freeDownloadTokens.get(token);
      if (!tokenData || tokenData.expiresAt < Date.now() || tokenData.productId !== parseInt(productId)) {
        return res.status(403).json({ message: "Invalid or expired download link" });
      }

      freeDownloadTokens.delete(token);

      const product = await dbStorage.getDigitalProductById(parseInt(productId));

      if (!product || !product.isActive || !product.isFree || !product.fileUrl) {
        return res.status(404).json({ message: "Product not found" });
      }

      const purchase = await dbStorage.getProductPurchaseByEmail(parseInt(productId), tokenData.email);
      if (purchase) {
        await dbStorage.incrementProductDownloadCount(purchase.id);
      }

      const baseName = product.fileUrl.split('/').pop() || '';
      const dotIndex = baseName.lastIndexOf('.');
      const fileExtension = dotIndex > 0 ? baseName.substring(dotIndex) : '';
      const safeTitle = (product.title || 'download').replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_') || 'download';
      const downloadFileName = `${safeTitle}${fileExtension}`;

      const signedUrl = await supabaseStorage.getSignedDownloadUrl(product.fileUrl, 300);

      const fileResponse = await fetch(signedUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file from storage: ${fileResponse.status}`);
      }

      const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      const contentLength = fileResponse.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const readableStream = Readable.fromWeb(fileResponse.body as any);
      readableStream.pipe(res);
    } catch (error) {
      console.error("Error downloading free product file:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download product" });
      }
    }
  });

  // Manual Payment Purchase Request (public, no auth)
  app.post('/api/products/:productId/purchase-request', async (req: any, res) => {
    try {
      const { productId } = req.params;
      const { buyerName, buyerEmail, buyerPhone } = req.body;

      if (!buyerName || !buyerEmail) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      const product = await dbStorage.getDigitalProductById(parseInt(productId));
      if (!product || !product.isActive) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (!product.requiresPayment) {
        return res.status(400).json({ message: "This product does not use manual payment" });
      }

      // Get coach profile for notification email
      const coachProfile = await dbStorage.getProfileById(product.profileId);
      if (!coachProfile) {
        return res.status(404).json({ message: "Coach not found" });
      }

      // Find or create guest profile for portal access
      const guestProfile = await dbStorage.getOrCreateGuestProfile(
        buyerEmail,
        buyerName,
        buyerPhone || null,
        product.profileId
      );

      // Build paymentMethodsOffered — fall back to coach's global payment settings
      // (product-level payment_methods column does not yet exist; see Task #121)
      let paymentMethodsOffered: any[] | null = null;
      const productPaymentSettings = await dbStorage.getCoachPaymentSettings(product.profileId);
      if (productPaymentSettings?.methods && productPaymentSettings.methods.length > 0) {
        const enabled = (productPaymentSettings.methods as any[]).filter((m: any) => m.enabled);
        if (enabled.length > 0) paymentMethodsOffered = enabled;
      }

      const purchase = await dbStorage.createProductPurchase({
        productId: parseInt(productId),
        guestProfileId: guestProfile.id,
        email: buyerEmail,
        buyerName,
        buyerPhone: buyerPhone || null,
        amount: product.price || "0",
        currency: product.currency || "USD",
        status: "pending",
        paymentMethodsOffered: paymentMethodsOffered || undefined,
        paymentInstruction: product.paymentInstructions || undefined,
      });

      // Email coach
      const coachEmail = coachProfile.contactEmail || coachProfile.email;
      if (coachEmail) {
        await sendProductPurchaseRequestToCoach({
          coachEmail,
          coachName: coachProfile.displayName || coachProfile.username || "Coach",
          productTitle: product.title,
          buyerName,
          buyerEmail,
          buyerPhone,
          productId: product.id,
          purchaseId: purchase.id,
        });
      }

      // Email buyer with payment instructions
      await sendProductPurchaseConfirmationToBuyer({
        buyerEmail,
        buyerName,
        productTitle: product.title,
        coachName: coachProfile.displayName || coachProfile.username || "Coach",
        paymentInstructions: product.paymentInstructions || undefined,
        price: product.price || undefined,
        currency: product.currency || "USD",
      });

      res.json({ success: true, purchaseId: purchase.id, paymentInstructions: product.paymentInstructions, guestAccessToken: guestProfile.accessToken });
    } catch (error) {
      console.error("Error creating purchase request:", error);
      res.status(500).json({ message: "Failed to submit purchase request" });
    }
  });

  // Get all product purchases for dashboard (coach)
  app.get('/api/dashboard/products/purchases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const purchases = await dbStorage.getProductPurchasesByProfileId(profile.id);
      res.json(purchases);
    } catch (error) {
      console.error("Error fetching product purchases:", error);
      res.status(500).json({ message: "Failed to fetch purchases" });
    }
  });

  // Verify payment and send download link (coach action)
  app.post('/api/dashboard/products/purchases/:purchaseId/verify-payment', isAuthenticated, async (req: any, res) => {
    try {
      const { purchaseId } = req.params;
      const { message: coachMessage } = req.body;
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      // Fetch purchase + verify ownership
      const allPurchases = await dbStorage.getProductPurchasesByProfileId(profile.id);
      const purchase = allPurchases.find(p => p.id === parseInt(purchaseId));
      if (!purchase) return res.status(404).json({ message: "Purchase not found" });

      const product = await dbStorage.getDigitalProductById(purchase.productId);
      if (!product) {
        return res.status(400).json({ message: "Product not found" });
      }
      if (!product.fileUrl) {
        return res.status(400).json({ message: "Product file not available" });
      }

      // Generate a long-lived access token
      const accessToken = randomBytes(32).toString('hex');
      await dbStorage.verifyProductPurchase(parseInt(purchaseId), accessToken);
      await db.update(digitalProductPurchases).set({ paymentConfirmedAt: new Date() }).where(eq(digitalProductPurchases.id, parseInt(purchaseId)));

      // Build absolute base URL
      const host = getAppBaseUrl();

      // Generate download URL
      const downloadUrl = `${host}/api/products/download-by-token?token=${accessToken}`;

      // Construct guest portal URL (deep-link to Purchases tab)
      let guestPortalUrl: string | undefined;
      if (purchase.email) {
        const guestProfile = await dbStorage.getGuestProfileByEmail(purchase.email);
        if (guestProfile?.accessToken) {
          guestPortalUrl = guestPortalLink({ token: guestProfile.accessToken, purchaseId: purchase.id, tab: 'purchases' });
        }
      }

      const coachName = profile.displayName || profile.username || "Coach";

      // Email buyer: single combined confirmation + download link email
      if (purchase.email) {
        await sendProductPurchaseConfirmedToBuyer({
          buyerEmail: purchase.email,
          buyerName: purchase.buyerName || purchase.email,
          productTitle: purchase.productTitle,
          coachName,
          coachMessage: coachMessage || null,
          downloadUrl,
          guestPortalUrl: guestPortalUrl || null,
        });
      }

      res.json({ success: true, message: "Payment verified and download link sent" });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  // Reject purchase request (coach action)
  app.post('/api/dashboard/products/purchases/:purchaseId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { purchaseId } = req.params;
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const allPurchases = await dbStorage.getProductPurchasesByProfileId(profile.id);
      const purchase = allPurchases.find(p => p.id === parseInt(purchaseId));
      if (!purchase) return res.status(404).json({ message: "Purchase not found" });

      // Rejecting a payment proof returns status to 'pending' so guest can resubmit
      // This mirrors the session/event proof-rejection pattern
      await db.update(digitalProductPurchases).set({
        status: 'pending',
        paymentProofUrl: null,
        paymentReferenceText: null,
        paymentMethodSelected: null,
        paymentMarkedAt: null,
        paymentRejectionReason: req.body.reason || null,
      }).where(eq(digitalProductPurchases.id, parseInt(purchaseId)));

      // Send rejection email to buyer
      let guestPortalUrl: string | null = null;
      if (purchase.email) {
        const guestProfile = await dbStorage.getGuestProfileByEmail(purchase.email);
        if (guestProfile?.accessToken) {
          guestPortalUrl = guestPortalLink({ token: guestProfile.accessToken, purchaseId: purchase.id, tab: 'purchases' });
        }
      }
      await sendProductPaymentRejectedToBuyer({
        buyerEmail: purchase.email,
        buyerName: purchase.buyerName || purchase.email,
        coachName: profile.displayName || profile.username || 'Coach',
        productTitle: purchase.productTitle,
        reason: req.body.reason || null,
        guestPortalUrl,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting purchase proof:", error);
      res.status(500).json({ message: "Failed to reject purchase proof" });
    }
  });

  // Coach verify payment proof for event registration
  app.post('/api/dashboard/events/registrations/:registrationId/verify-payment', isAuthenticated, async (req: any, res) => {
    try {
      const { registrationId } = req.params;
      const { message: coachMessage } = req.body;
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const registration = await dbStorage.getEventRegistrationById(parseInt(registrationId));
      if (!registration || registration.profileId !== profile.id) {
        return res.status(404).json({ message: "Registration not found" });
      }

      if (registration.paymentStatus !== 'proof_uploaded' && registration.paymentStatus !== 'cash_pending') {
        return res.status(400).json({ message: "Registration is not pending payment verification" });
      }

      await db
        .update(eventRegistrations)
        .set({ paymentStatus: 'paid', paymentConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(eventRegistrations.id, parseInt(registrationId)));

      // Look up event details for the email
      const [eventRow] = await db.select().from(events).where(eq(events.id, registration.eventId)).limit(1);
      const eventDateStr = eventRow?.startAt ? new Date(eventRow.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

      // Look up guest portal URL (deep-linked to this registration)
      let guestPortalUrl: string | null = null;
      if (registration.clientEmail) {
        const guestProfile = await dbStorage.getGuestProfileByEmail(registration.clientEmail);
        if (guestProfile?.accessToken) {
          guestPortalUrl = guestPortalLink({ token: guestProfile.accessToken, registrationId: registration.id, tab: 'events' });
        }
      }

      const verifiedGoogleCalendarUrl = eventRow?.startAt
        ? buildGoogleCalendarUrlForEvent({
            title: eventRow.title,
            start: new Date(eventRow.startAt),
            end: eventRow.endAt ? new Date(eventRow.endAt) : null,
            description: `Confirmation Code: ${registration.confirmationCode || ''}`,
            location: eventRow.location || '',
          })
        : null;

      // Fire-and-forget: don't block the API response on email delivery.
      const verifiedIsOnline = eventRow?.mode === 'online' || eventRow?.mode === 'hybrid';
      const verifiedIsOffline = eventRow?.mode === 'offline' || eventRow?.mode === 'hybrid';
      sendEventPaymentVerifiedToRegistrant({
        registrantEmail: registration.clientEmail,
        registrantName: registration.clientName,
        coachName: profile.displayName || profile.username || 'Coach',
        eventTitle: eventRow?.title || 'Event',
        eventDate: eventDateStr,
        eventStartTime: extractTimeStr(eventRow?.startAt),
        eventEndTime: extractTimeStr(eventRow?.endAt),
        eventLocation: eventRow?.location || null,
        eventMeetingLink: eventRow?.meetingLink || null,
        isOnline: verifiedIsOnline,
        isOffline: verifiedIsOffline,
        confirmationCode: registration.confirmationCode || null,
        coachMessage: coachMessage || null,
        guestPortalUrl,
        googleCalendarUrl: verifiedGoogleCalendarUrl,
      }).catch((e) => console.error('[Verify Payment] email failed', e));

      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying event registration payment:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  // Coach reject payment proof for event registration
  app.post('/api/dashboard/events/registrations/:registrationId/reject-payment', isAuthenticated, async (req: any, res) => {
    try {
      const { registrationId } = req.params;
      const { reason } = req.body;
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const registration = await dbStorage.getEventRegistrationById(parseInt(registrationId));
      if (!registration || registration.profileId !== profile.id) {
        return res.status(404).json({ message: "Registration not found" });
      }

      if (registration.paymentStatus !== 'proof_uploaded' && registration.paymentStatus !== 'cash_pending') {
        return res.status(400).json({ message: "Registration is not pending payment verification" });
      }

      await db
        .update(eventRegistrations)
        .set({
          paymentStatus: 'pending',
          paymentProofUrl: null,
          paymentReferenceText: null,
          paymentMethodSelected: null,
          paymentMarkedAt: null,
          paymentRejectionReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(eventRegistrations.id, parseInt(registrationId)));

      // Look up event details for the email
      const [eventRow] = await db.select().from(events).where(eq(events.id, registration.eventId)).limit(1);
      const eventDateStr = eventRow?.startAt ? new Date(eventRow.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

      // Look up guest portal URL (deep-linked to this registration)
      let guestPortalUrl: string | null = null;
      if (registration.clientEmail) {
        const guestProfile = await dbStorage.getGuestProfileByEmail(registration.clientEmail);
        if (guestProfile?.accessToken) {
          guestPortalUrl = guestPortalLink({ token: guestProfile.accessToken, registrationId: registration.id, tab: 'events' });
        }
      }

      await sendEventPaymentRejectedToRegistrant({
        registrantEmail: registration.clientEmail,
        registrantName: registration.clientName,
        coachName: profile.displayName || profile.username || 'Coach',
        eventTitle: eventRow?.title || 'Event',
        eventDate: eventDateStr,
        reason: reason || null,
        guestPortalUrl,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting event registration payment:", error);
      res.status(500).json({ message: "Failed to reject payment" });
    }
  });

  // Download by access token (buyer uses this link)
  app.get('/api/products/download-by-token', async (req: any, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ message: "Token is required" });

      const purchase = await dbStorage.getProductPurchaseByAccessToken(token);
      if (!purchase || purchase.status !== "completed") {
        return res.status(403).json({ message: "Invalid or expired download link" });
      }

      const product = await dbStorage.getDigitalProductById(purchase.productId);
      if (!product || !product.fileUrl) {
        return res.status(404).json({ message: "Product file not found" });
      }

      await dbStorage.incrementProductDownloadCount(purchase.id);

      const baseName = product.fileUrl.split('/').pop() || '';
      const dotIndex = baseName.lastIndexOf('.');
      const fileExtension = dotIndex > 0 ? baseName.substring(dotIndex) : '';
      const safeTitle = (product.title || 'download').replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_') || 'download';
      const downloadFileName = `${safeTitle}${fileExtension}`;

      const signedUrl = await supabaseStorage.getSignedDownloadUrl(product.fileUrl, 3600);
      const fileResponse = await fetch(signedUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file: ${fileResponse.status}`);
      }

      const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      const contentLength = fileResponse.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const readableStream = Readable.fromWeb(fileResponse.body as any);
      readableStream.pipe(res);
    } catch (error) {
      console.error("Error downloading by token:", error);
      if (!res.headersSent) res.status(500).json({ message: "Failed to download" });
    }
  });

  // Events Management
  app.get('/api/dashboard/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const allEvents = await dbStorage.getEventsByProfileId(profile.id);
      // Show standalone events and first instance of each series
      const events = allEvents.filter((e: any) => !e.seriesId || e.sequenceNumber === 1);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });


  // Helper: human-readable cadence label from a pattern
  function cadenceLabelFromPattern(pattern: SeriesPattern | null): string {
    if (!pattern) return 'Recurring';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (pattern.type === 'weekly') {
      const dayNames = [...pattern.weekdays].sort((a, b) => a - b).map(d => DAYS[d]).join(' & ');
      if (pattern.intervalWeeks === 2) return `Every other ${dayNames}`;
      if (pattern.intervalWeeks > 2) return `Every ${pattern.intervalWeeks} weeks on ${dayNames}`;
      return `Every ${dayNames}`;
    }
    if (pattern.type === 'monthly_nth') {
      const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th'];
      return `${ORDINALS[pattern.nth] ?? 'Nth'} ${DAYS_LONG[pattern.weekday]} of each month`;
    }
    if (pattern.type === 'monthly_date') {
      const d = pattern.dayOfMonth;
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      return `${d}${suffix} of each month`;
    }
    if (pattern.type === 'custom') return 'Custom dates';
    return 'Recurring';
  }

  // Helper: lazily extend indefinite series if generatedUntil < today + 60 days
  async function extendSeriesIfNeeded(seriesId: number): Promise<boolean> {
    try {
      const series = await dbStorage.getEventSeriesById(seriesId);
      if (!series || !series.isActive) return false;
      const pattern: SeriesPattern = series.pattern;
      if (!pattern || pattern.type === 'custom') return false; // custom series don't auto-extend
      if ('endDate' in pattern && pattern.endDate) return false; // bounded series — no lazy extension
      const now = new Date();
      const threshold = new Date(now); threshold.setDate(threshold.getDate() + 60);
      const genUntil = series.generatedUntil ? new Date(series.generatedUntil) : now;
      if (genUntil > threshold) return false; // buffer is fine
      // Generate next 3 months from generatedUntil
      const extendFrom = new Date(genUntil); extendFrom.setDate(extendFrom.getDate() + 1);
      const extendUntil = new Date(now); extendUntil.setMonth(extendUntil.getMonth() + 6);
      const startTimeHHMM = series.defaultStartTime || null;
      const newDates = generateInstanceDates(pattern, extendFrom, extendUntil, startTimeHHMM);
      if (newDates.length === 0) return false;
      // Get existing instance count for sequence numbering
      const existing = await dbStorage.getEventSeriesInstances(seriesId);
      const baseSeq = existing.length;
      // Build instance data from first existing instance as template
      const template = existing[0];
      if (!template) return false;
      // Destructure out per-instance fields that must NOT propagate to new instances:
      // instanceOverrides (per-instance edits) and isCancelled must start fresh
      const { id: _id, createdAt: _c, updatedAt: _u, startAt: _s, endAt: _e, sequenceNumber: _sn, instanceOverrides: _io, isCancelled: _ic, ...baseData } = template;
      const durationMins = series.defaultDurationMins;
      const newInstances = newDates.map((date, idx) => ({
        ...baseData,
        instanceOverrides: null,
        startAt: date,
        endAt: durationMins ? new Date(date.getTime() + durationMins * 60000) : null,
        seriesId,
        sequenceNumber: baseSeq + idx + 1,
        isFeatured: false,
        isCancelled: false,
      }));
      await dbStorage.createRecurringEventInstances(newInstances);
      const lastDate = newDates[newDates.length - 1];
      await dbStorage.updateEventSeriesRecord(seriesId, { generatedUntil: lastDate });
      return true;
    } catch (e) {
      console.error('[extendSeriesIfNeeded] error:', e);
      return false;
    }
  }


  // Reject incoming timestamp strings that lack an explicit timezone marker
  // (no trailing `Z` and no `+HH:mm` / `-HH:mm` offset). Without this, naive
  // strings like `2026-04-27T10:00:00` get parsed in the server's local time
  // (UTC in production), shifting the saved instant by the creator's UTC offset.
  // We reject rather than silently anchoring so client bugs surface immediately
  // instead of producing wrong-looking events.
  function isTimestampTimezoneAware(value: unknown): boolean {
    if (value == null) return true;
    if (value instanceof Date) return true;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return true;
    return /Z$|[+-]\d{2}:?\d{2}$/.test(trimmed);
  }

  app.post('/api/dashboard/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const { tagIds, isRecurring, recurrenceDays, recurrenceDuration, recurringPattern, ...bodyWithoutTags } = req.body;

      // Reject naive (timezone-less) startAt/endAt strings — see isTimestampTimezoneAware.
      if (!isTimestampTimezoneAware(bodyWithoutTags.startAt) || !isTimestampTimezoneAware(bodyWithoutTags.endAt)) {
        return res.status(400).json({
          message: "startAt/endAt must be sent as ISO timestamps with a timezone (e.g. ending in 'Z' or with a '+HH:mm' offset)."
        });
      }

      const eventData: any = {
        ...bodyWithoutTags,
        profileId: profile.id,
        startAt: bodyWithoutTags.startAt ? new Date(bodyWithoutTags.startAt) : null,
        endAt: bodyWithoutTags.endAt ? new Date(bodyWithoutTags.endAt) : null,
        price: bodyWithoutTags.price ? parseFloat(bodyWithoutTags.price) : 0,
        maxAttendees: bodyWithoutTags.maxAttendees ? parseInt(bodyWithoutTags.maxAttendees) : null,
      };

      // Build the canonical pattern object from either new (recurringPattern) or legacy format
      let canonicalPattern: SeriesPattern | null = null;
      if (isRecurring) {
        if (recurringPattern && recurringPattern.type) {
          canonicalPattern = recurringPattern;
        } else if (recurrenceDays?.length > 0) {
          // Legacy format: translate to weekly pattern
          const startDateStr = eventData.startAt ? eventData.startAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          canonicalPattern = {
            type: 'weekly',
            weekdays: recurrenceDays,
            intervalWeeks: 1,
            startDate: startDateStr,
            endDate: null,
          };
        }
      }

      if (canonicalPattern && eventData.startAt) {
        const startTimeHHMM = extractTimeStr(eventData.startAt);
        const durationMins = eventData.endAt
          ? Math.round((eventData.endAt.getTime() - eventData.startAt.getTime()) / 60000)
          : null;

        // Compute generation window
        const genFrom = new Date(eventData.startAt); genFrom.setHours(0, 0, 0, 0);
        let genUntil: Date;
        if (canonicalPattern.type === 'custom') {
          genUntil = new Date(8640000000000000); // max — just use all custom dates
        } else if (canonicalPattern.endDate) {
          const patternEnd = new Date(canonicalPattern.endDate); patternEnd.setHours(23, 59, 59, 999);
          const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
          genUntil = patternEnd < sixMonths ? patternEnd : sixMonths;
        } else {
          genUntil = new Date(); genUntil.setMonth(genUntil.getMonth() + 6);
        }

        // Create series record
        const series = await dbStorage.createEventSeries({
          profileId: profile.id,
          pattern: canonicalPattern,
          defaultStartTime: startTimeHHMM,
          defaultDurationMins: durationMins,
          defaultMaxAttendees: eventData.maxAttendees || null,
          timezone: eventData.timezone || null,
          isActive: true,
        });

        const occurrenceDates = generateInstanceDates(canonicalPattern, genFrom, genUntil, startTimeHHMM);
        const { id: _id, createdAt: _c, updatedAt: _u, seriesId: _sid, sequenceNumber: _sn, ...baseData } = eventData;
        const instances = occurrenceDates.map((date, idx) => ({
          ...baseData,
          startAt: date,
          endAt: durationMins ? new Date(date.getTime() + durationMins * 60000) : null,
          seriesId: series.id,
          sequenceNumber: idx + 1,
          isFeatured: false,
          isCancelled: false,
        }));

        if (instances.length > 0) {
          const createdInstances = await dbStorage.createRecurringEventInstances(instances);
          const lastDate = occurrenceDates[occurrenceDates.length - 1];
          await dbStorage.updateEventSeriesRecord(series.id, { generatedUntil: lastDate });
          const firstInstance = createdInstances[0];
          if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
            await dbStorage.setEventTags(firstInstance.id, tagIds);
          }
          return res.json({ ...firstInstance, seriesPattern: canonicalPattern, cadenceLabel: cadenceLabelFromPattern(canonicalPattern) });
        }

        // No initial instances in the generation window (e.g. start date is far in the
        // future). Create a single placeholder instance linked to the series so the series
        // is never orphaned and the creator can still navigate to it.
        const { id: _pId, createdAt: _pC, updatedAt: _pU, seriesId: _pSid, sequenceNumber: _pSn, ...placeholderBase } = eventData;
        const [placeholder] = await dbStorage.createRecurringEventInstances([{
          ...placeholderBase,
          startAt: eventData.startAt,
          endAt: eventData.endAt,
          seriesId: series.id,
          sequenceNumber: 1,
          isFeatured: false,
          isCancelled: false,
        }]);
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          await dbStorage.setEventTags(placeholder.id, tagIds);
        }
        return res.json({ ...placeholder, seriesPattern: canonicalPattern, cadenceLabel: cadenceLabelFromPattern(canonicalPattern) });
      }

      const newEvent = await dbStorage.createEvent(eventData);

      if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
        await dbStorage.setEventTags(newEvent.id, tagIds);
      }

      res.json(newEvent);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Get a single event by id (authenticated, owner only)
  app.get('/api/dashboard/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.id);
      const event = await dbStorage.getEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      if (event.profileId !== profile.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      return res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  // Get instances of a recurring event series
  app.get('/api/dashboard/events/:id/instances', isAuthenticated, async (req: any, res) => {
    try {
      const eventId = parseInt(req.params.id);
      // :id is an event row ID — resolve to the series ID before querying instances
      const event = await dbStorage.getEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const seriesId = event.seriesId;
      if (!seriesId) {
        // Standalone event — return the event itself as the only "instance"
        return res.json([event]);
      }
      const instances = await dbStorage.getEventSeriesInstances(seriesId);
      res.json(instances);
    } catch (error) {
      console.error("Error fetching event instances:", error);
      res.status(500).json({ message: "Failed to fetch event instances" });
    }
  });

  app.patch('/api/dashboard/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.id);
      // Strip all UI-only / non-column fields before building the DB update payload
      const {
        tagIds,
        isRecurring: _isRecurring,
        recurringPattern: _recurringPattern,
        recurrenceDays: _recurrenceDays,
        recurrenceDuration: _recurrenceDuration,
        ...bodyWithoutTags
      } = req.body;

      // Reject naive (timezone-less) startAt/endAt strings — see isTimestampTimezoneAware.
      if (!isTimestampTimezoneAware(bodyWithoutTags.startAt) || !isTimestampTimezoneAware(bodyWithoutTags.endAt)) {
        return res.status(400).json({
          message: "startAt/endAt must be sent as ISO timestamps with a timezone (e.g. ending in 'Z' or with a '+HH:mm' offset)."
        });
      }

      const updateData: Partial<InsertEvent> = {
        ...bodyWithoutTags,
        startAt: bodyWithoutTags.startAt ? new Date(bodyWithoutTags.startAt) : undefined,
        endAt: bodyWithoutTags.endAt ? new Date(bodyWithoutTags.endAt) : undefined,
        price: bodyWithoutTags.price !== undefined ? String(parseFloat(bodyWithoutTags.price)) : undefined,
        maxAttendees: bodyWithoutTags.maxAttendees ? parseInt(bodyWithoutTags.maxAttendees) : undefined,
      };
      // Remove undefined keys so they don't overwrite existing values
      (Object.keys(updateData) as Array<keyof typeof updateData>).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });

      // Fetch event to determine if it belongs to a recurring series
      const eventToUpdate = await dbStorage.getEventById(eventId);
      if (!eventToUpdate) return res.status(404).json({ message: "Event not found" });

      const isSeriesEvent = !!eventToUpdate.seriesId;

      // Ownership check
      if (eventToUpdate.profileId !== profile.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check meeting link broadcast condition — broadcast whenever the meeting link is set or changed
      const prevMeetingLink = eventToUpdate.meetingLink;
      const newMeetingLink = updateData.meetingLink;
      const shouldBroadcastMeetingLink =
        newMeetingLink &&
        typeof newMeetingLink === 'string' &&
        newMeetingLink.trim().length > 0 &&
        newMeetingLink.trim() !== (prevMeetingLink || '').trim();

      if (isSeriesEvent) {
        const seriesId = eventToUpdate.seriesId!;
        const scope = (req.query.scope as string) || 'all';

        if (scope === 'this') {
          // Merge changes into instanceOverrides for just this instance
          const existing = (eventToUpdate.instanceOverrides as Record<string, unknown>) || {};
          const overrideFields: Record<string, unknown> = {};
          if (updateData.title !== undefined) overrideFields.title = updateData.title;
          if (updateData.description !== undefined) overrideFields.description = updateData.description;
          if (updateData.location !== undefined) overrideFields.location = updateData.location;
          if (updateData.locationId !== undefined) overrideFields.locationId = updateData.locationId;
          if (updateData.meetingLink !== undefined) overrideFields.meetingLink = updateData.meetingLink;
          if (updateData.maxAttendees !== undefined) overrideFields.maxAttendees = updateData.maxAttendees;
          // Persist per-instance time as startTime string in overrides
          if (updateData.startAt) overrideFields.startTime = extractTimeStr(updateData.startAt);
          if (bodyWithoutTags.cancellationReason) overrideFields.cancellationReason = bodyWithoutTags.cancellationReason;
          // Also update the actual event startAt/endAt for this instance
          const directUpdate: Partial<InsertEvent> & { instanceOverrides: Record<string, unknown> } = { instanceOverrides: { ...existing, ...overrideFields } };
          if (updateData.startAt) directUpdate.startAt = new Date(updateData.startAt);
          if (updateData.endAt) directUpdate.endAt = new Date(updateData.endAt);
          const updatedEvent = await dbStorage.updateEvent(eventId, directUpdate);
          return res.json(updatedEvent);
        } else if (scope === 'this_future') {
          // Delete this + future instances, regenerate from this date with new pattern/values
          const fromDate = eventToUpdate.startAt ? new Date(eventToUpdate.startAt) : new Date();
          fromDate.setHours(0, 0, 0, 0);
          // Snapshot affected registrants BEFORE deleting so we can notify them
          // asynchronously after the response is sent. Querying them here is
          // cheap (parallelized); emails are fired in the background.
          let pendingCancellationNotifications: Array<{ email: string; name: string; title: string; dateStr: string }> = [];
          try {
            const allInsts = await dbStorage.getEventSeriesInstances(seriesId);
            const affected = allInsts.filter(e => e.startAt && new Date(e.startAt) >= fromDate && !e.isCancelled);
            const regsPerInst = await Promise.all(
              affected.map(inst => dbStorage.getConfirmedRegistrationsByEventId(inst.id))
            );
            affected.forEach((inst, i) => {
              const dateStr = inst.startAt ? new Date(inst.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
              for (const reg of regsPerInst[i]) {
                if (reg.clientEmail) {
                  pendingCancellationNotifications.push({
                    email: reg.clientEmail,
                    name: reg.clientName || 'Guest',
                    title: inst.title || eventToUpdate.title || 'Event',
                    dateStr,
                  });
                }
              }
            });
          } catch (e) { console.error('[PATCH scope=this_future] Snapshot regs failed:', e); }
          await dbStorage.deleteEventSeriesFromDate(seriesId, fromDate);
          // Get series to rebuild
          const series = await dbStorage.getEventSeriesById(seriesId);
          if (series) {
            // Use the new pattern from the request if provided, fall back to existing series pattern
            const newPattern: SeriesPattern = (req.body.recurringPattern && req.body.recurringPattern.type)
              ? (req.body.recurringPattern as SeriesPattern)
              : series.pattern;
            const startTimeHHMM = updateData.startAt ? extractTimeStr(updateData.startAt) : series.defaultStartTime;
            const durationMins = updateData.endAt && updateData.startAt
              ? Math.round((new Date(updateData.endAt).getTime() - new Date(updateData.startAt).getTime()) / 60000)
              : series.defaultDurationMins;
            let genUntil: Date;
            if (newPattern.type === 'custom') genUntil = new Date(8640000000000000);
            else if ('endDate' in newPattern && newPattern.endDate) { genUntil = new Date(newPattern.endDate); genUntil.setHours(23, 59, 59, 999); }
            else { genUntil = new Date(); genUntil.setMonth(genUntil.getMonth() + 6); }
            const newDates = generateInstanceDates(newPattern, fromDate, genUntil, startTimeHHMM || null);
            const existing = await dbStorage.getEventSeriesInstances(seriesId);
            const baseSeq = existing.filter(e => e.startAt && new Date(e.startAt) < fromDate).length;
            const { id: _id, createdAt: _c, updatedAt: _u, startAt: _s, endAt: _e, sequenceNumber: _sn, instanceOverrides: _io, isCancelled: _ic, ...baseData } = eventToUpdate;
            const mergedBase = { ...baseData, ...updateData };
            const newInstances = newDates.map((date, idx) => ({
              ...mergedBase,
              startAt: date,
              endAt: durationMins ? new Date(date.getTime() + durationMins * 60000) : null,
              seriesId,
              sequenceNumber: baseSeq + idx + 1,
              isFeatured: false,
              isCancelled: false,
              instanceOverrides: null,
            }));
            if (newInstances.length > 0) await dbStorage.createRecurringEventInstances(newInstances);
            // Always persist series record updates including generatedUntil
            const seriesUpdate: Partial<InsertEventSeries> = {
              ...(req.body.recurringPattern && req.body.recurringPattern.type ? { pattern: newPattern } : {}),
              ...(startTimeHHMM ? { defaultStartTime: startTimeHHMM } : {}),
              ...(durationMins ? { defaultDurationMins: durationMins } : {}),
            };
            // Persist generatedUntil based on whether series is bounded or indefinite (6-month window)
            const lastGenDate = newDates.length > 0 ? newDates[newDates.length - 1] : null;
            if (lastGenDate && newPattern.type !== 'custom') seriesUpdate.generatedUntil = lastGenDate;
            if (Object.keys(seriesUpdate).length > 0) {
              await dbStorage.updateEventSeriesRecord(seriesId, seriesUpdate);
            }
          }
          const updatedEvent = await dbStorage.getEventById(eventId);
          res.json(updatedEvent || eventToUpdate);
          // Fire cancellation notifications in the background after responding
          if (pendingCancellationNotifications.length > 0) {
            setImmediate(async () => {
              for (const n of pendingCancellationNotifications) {
                try {
                  await sendEventCancellationToGuest(n.email, n.name, n.title, n.dateStr, true);
                } catch (e) {
                  console.error('[PATCH scope=this_future] Cancellation email failed:', e);
                }
              }
            });
          }
          return;
        } else {
          // scope=all — apply to all series instances and update series defaults
          // If recurringPattern changed, delete all future instances and regenerate with new pattern
          const newPattern: SeriesPattern | null = (req.body.recurringPattern && req.body.recurringPattern.type)
            ? (req.body.recurringPattern as SeriesPattern)
            : null;
          const startTimeHHMM = updateData.startAt ? extractTimeStr(updateData.startAt) : null;
          const durationMins = updateData.endAt && updateData.startAt
            ? Math.round((new Date(updateData.endAt).getTime() - new Date(updateData.startAt).getTime()) / 60000)
            : null;

          // Snapshot affected registrants for background notification (scope=all only used when pattern changes)
          let pendingAllCancellationNotifications: Array<{ email: string; name: string; title: string; dateStr: string }> = [];
          if (newPattern) {
            // Delete all future instances from today and regenerate
            const today = new Date(); today.setHours(0, 0, 0, 0);
            try {
              const allInsts = await dbStorage.getEventSeriesInstances(seriesId);
              const affected = allInsts.filter(e => e.startAt && new Date(e.startAt) >= today && !e.isCancelled);
              const regsPerInst = await Promise.all(
                affected.map(inst => dbStorage.getConfirmedRegistrationsByEventId(inst.id))
              );
              affected.forEach((inst, i) => {
                const dateStr = inst.startAt ? new Date(inst.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
                for (const reg of regsPerInst[i]) {
                  if (reg.clientEmail) {
                    pendingAllCancellationNotifications.push({
                      email: reg.clientEmail,
                      name: reg.clientName || 'Guest',
                      title: inst.title || eventToUpdate.title || 'Event',
                      dateStr,
                    });
                  }
                }
              });
            } catch (e) { console.error('[PATCH scope=all] Snapshot regs failed:', e); }
            await dbStorage.deleteEventSeriesFromDate(seriesId, today);
            const series = await dbStorage.getEventSeriesById(seriesId);
            const baseTime = startTimeHHMM || series?.defaultStartTime || null;
            const baseDuration = durationMins ?? series?.defaultDurationMins ?? null;
            let genUntil: Date;
            if (newPattern.type === 'custom') genUntil = new Date(8640000000000000);
            else if ('endDate' in newPattern && newPattern.endDate) { genUntil = new Date(newPattern.endDate); genUntil.setHours(23, 59, 59, 999); }
            else { genUntil = new Date(); genUntil.setMonth(genUntil.getMonth() + 6); }
            const newDates = generateInstanceDates(newPattern, today, genUntil, baseTime);
            const existing = await dbStorage.getEventSeriesInstances(seriesId);
            const baseSeq = existing.filter(e => e.startAt && new Date(e.startAt) < today).length;
            const { id: _id, createdAt: _c, updatedAt: _u, startAt: _s, endAt: _e, sequenceNumber: _sn, instanceOverrides: _io, isCancelled: _ic, ...baseData } = eventToUpdate;
            const mergedBase = { ...baseData, ...updateData };
            const newInstances = newDates.map((date, idx) => ({
              ...mergedBase,
              startAt: date,
              endAt: baseDuration ? new Date(date.getTime() + baseDuration * 60000) : null,
              seriesId,
              sequenceNumber: baseSeq + idx + 1,
              isFeatured: false,
              isCancelled: false,
              instanceOverrides: null,
            }));
            if (newInstances.length > 0) await dbStorage.createRecurringEventInstances(newInstances);
            // Update past instances with non-date fields (strip instance-specific date/seq fields)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { startAt: _allSa, endAt: _allEa, sequenceNumber: _allSn, ...seriesFieldUpdates } = updateData;
            await dbStorage.updateEventSeries(seriesId, seriesFieldUpdates);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { startAt: _allSa2, endAt: _allEa2, sequenceNumber: _allSn2, ...seriesFieldUpdates2 } = updateData;
            await dbStorage.updateEventSeries(seriesId, seriesFieldUpdates2);
          }

          // Always update series record defaults
          const seriesUpdates: Partial<InsertEventSeries> = {};
          if (newPattern) seriesUpdates.pattern = newPattern;
          if (startTimeHHMM) seriesUpdates.defaultStartTime = startTimeHHMM;
          if (durationMins) seriesUpdates.defaultDurationMins = durationMins;
          if (newPattern && newPattern.type !== 'custom') {
            // Persist generatedUntil so lazy-extension knows where we've generated up to
            const genDates = generateInstanceDates(newPattern, new Date(), (() => {
              const d = new Date(); d.setMonth(d.getMonth() + 6); return d;
            })(), null);
            if (genDates.length > 0) {
              seriesUpdates.generatedUntil = genDates[genDates.length - 1];
            }
          }
          if (Object.keys(seriesUpdates).length > 0) {
            await dbStorage.updateEventSeriesRecord(seriesId, seriesUpdates);
          }
          if (tagIds && Array.isArray(tagIds)) await dbStorage.setEventTags(eventId, tagIds);
          const updatedEvent = await dbStorage.getEventById(eventId);

          // Respond immediately — fan out emails after we've answered the user.
          res.json(updatedEvent);

          if (pendingAllCancellationNotifications.length > 0) {
            setImmediate(async () => {
              for (const n of pendingAllCancellationNotifications) {
                try {
                  await sendEventCancellationToGuest(n.email, n.name, n.title, n.dateStr, true);
                } catch (e) {
                  console.error('[PATCH scope=all] Cancellation email failed:', e);
                }
              }
            });
          }

          // Broadcast meeting link to confirmed registrants for all series instances (background)
          if (shouldBroadcastMeetingLink && updatedEvent) {
            const linkToSend = newMeetingLink as string;
            setImmediate(async () => {
              try {
                const allInstances = await dbStorage.getEventSeriesInstances(seriesId);
                const coachName = profile.displayName || profile.username || '';
                const confirmedPerInst = await Promise.all(
                  allInstances.map(inst => dbStorage.getConfirmedRegistrationsByEventId(inst.id))
                );
                for (let i = 0; i < allInstances.length; i++) {
                  const inst = allInstances[i];
                  const eventDate = inst.startAt ? new Date(inst.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
                  for (const reg of confirmedPerInst[i]) {
                    try {
                      await sendEventMeetingLinkToRegistrant(reg.clientEmail, reg.clientName, coachName, inst.title, eventDate, extractTimeStr(inst.startAt), linkToSend);
                    } catch (e) {
                      console.error('[Meeting Link Broadcast] Email failed:', e);
                    }
                  }
                }
              } catch (e) { console.error('[Meeting Link Broadcast] Failed:', e); }
            });
          }

          return;
        }
      } else {
        // Standalone event — update only this event
        const updatedEvent = await dbStorage.updateEvent(eventId, updateData);
        if (tagIds && Array.isArray(tagIds)) {
          await dbStorage.setEventTags(eventId, tagIds);
        }

        res.json(updatedEvent);

        // Broadcast meeting link to confirmed registrants in the background
        if (shouldBroadcastMeetingLink && updatedEvent) {
          const linkToSend = newMeetingLink as string;
          setImmediate(async () => {
            try {
              const confirmedRegs = await dbStorage.getConfirmedRegistrationsByEventId(eventId);
              const eventDate = updatedEvent.startAt ? new Date(updatedEvent.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
              const coachName = profile.displayName || profile.username || '';
              for (const reg of confirmedRegs) {
                try {
                  await sendEventMeetingLinkToRegistrant(reg.clientEmail, reg.clientName, coachName, updatedEvent.title, eventDate, extractTimeStr(updatedEvent.startAt), linkToSend);
                } catch (e) {
                  console.error('[Meeting Link Broadcast] Email failed:', e);
                }
              }
            } catch (e) { console.error('[Meeting Link Broadcast] Failed:', e); }
          });
        }

        return;
      }
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Convert a recurring-series instance into a standalone one-time event.
  // Cancels every other instance in the series (notifying registrants on each),
  // detaches the kept event (seriesId/sequenceNumber/instanceOverrides cleared),
  // applies the submitted form fields, and deletes the event_series row.
  app.post('/api/dashboard/events/:id/de-recur', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.id);
      const {
        tagIds,
        isRecurring: _isRecurring,
        recurringPattern: _recurringPattern,
        recurrenceDays: _recurrenceDays,
        recurrenceDuration: _recurrenceDuration,
        ...bodyWithoutTags
      } = req.body;

      if (!isTimestampTimezoneAware(bodyWithoutTags.startAt) || !isTimestampTimezoneAware(bodyWithoutTags.endAt)) {
        return res.status(400).json({
          message: "startAt/endAt must be sent as ISO timestamps with a timezone (e.g. ending in 'Z' or with a '+HH:mm' offset)."
        });
      }

      const eventToUpdate = await dbStorage.getEventById(eventId);
      if (!eventToUpdate) return res.status(404).json({ message: "Event not found" });
      if (eventToUpdate.profileId !== profile.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!eventToUpdate.seriesId) {
        return res.status(400).json({ message: "Event is not part of a recurring series" });
      }
      const seriesId = eventToUpdate.seriesId;

      const updateData: Partial<InsertEvent> = {
        ...bodyWithoutTags,
        startAt: bodyWithoutTags.startAt ? new Date(bodyWithoutTags.startAt) : undefined,
        endAt: bodyWithoutTags.endAt ? new Date(bodyWithoutTags.endAt) : undefined,
        price: bodyWithoutTags.price !== undefined ? String(parseFloat(bodyWithoutTags.price)) : undefined,
        maxAttendees: bodyWithoutTags.maxAttendees ? parseInt(bodyWithoutTags.maxAttendees) : undefined,
      };
      (Object.keys(updateData) as Array<keyof typeof updateData>).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });

      // Snapshot affected registrants on sibling instances BEFORE mutating so
      // we can fan out cancellation emails after responding to the client.
      let pendingCancellationNotifications: Array<{ email: string; name: string; title: string; dateStr: string }> = [];
      try {
        const allInstances = await dbStorage.getEventSeriesInstances(seriesId);
        const siblings = allInstances.filter(e => e.id !== eventId && !e.isCancelled);
        const regsPerInst = await Promise.all(
          siblings.map(inst => dbStorage.getConfirmedRegistrationsByEventId(inst.id))
        );
        siblings.forEach((inst, i) => {
          const dateStr = inst.startAt ? new Date(inst.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
          for (const reg of regsPerInst[i]) {
            if (reg.clientEmail) {
              pendingCancellationNotifications.push({
                email: reg.clientEmail,
                name: reg.clientName || 'Guest',
                title: inst.title || eventToUpdate.title || 'Event',
                dateStr,
              });
            }
          }
        });
      } catch (e) {
        console.error('[POST de-recur] Snapshot regs failed:', e);
      }

      const kept = await dbStorage.convertSeriesInstanceToStandalone(eventId, seriesId, updateData);

      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setEventTags(eventId, tagIds);
      }

      res.json(kept);

      if (pendingCancellationNotifications.length > 0) {
        setImmediate(async () => {
          for (const n of pendingCancellationNotifications) {
            try {
              await sendEventCancellationToGuest(n.email, n.name, n.title, n.dateStr, true);
            } catch (e) {
              console.error('[POST de-recur] Cancellation email failed:', e);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error de-recurring event:", error);
      res.status(500).json({ message: "Failed to convert event" });
    }
  });

  // Promote a standalone event into a recurring series.
  // The existing event becomes instance #1 (registrations stay on it).
  // A new event_series row is created and additional occurrences are generated
  // from the chosen pattern.
  app.post('/api/dashboard/events/:id/promote-to-series', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.id);
      const {
        tagIds,
        isRecurring: _isRecurring,
        recurringPattern,
        recurrenceDays: _recurrenceDays,
        recurrenceDuration: _recurrenceDuration,
        ...bodyWithoutTags
      } = req.body;

      if (!isTimestampTimezoneAware(bodyWithoutTags.startAt) || !isTimestampTimezoneAware(bodyWithoutTags.endAt)) {
        return res.status(400).json({
          message: "startAt/endAt must be sent as ISO timestamps with a timezone (e.g. ending in 'Z' or with a '+HH:mm' offset)."
        });
      }

      const eventToUpdate = await dbStorage.getEventById(eventId);
      if (!eventToUpdate) return res.status(404).json({ message: "Event not found" });
      if (eventToUpdate.profileId !== profile.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (eventToUpdate.seriesId) {
        return res.status(400).json({ message: "Event is already part of a recurring series" });
      }

      // Validate that a pattern was provided
      const canonicalPattern: SeriesPattern | null =
        recurringPattern && recurringPattern.type ? recurringPattern : null;
      if (!canonicalPattern) {
        return res.status(400).json({ message: "A recurrence pattern is required to promote to a series" });
      }

      const updateData: Partial<InsertEvent> = {
        ...bodyWithoutTags,
        startAt: bodyWithoutTags.startAt ? new Date(bodyWithoutTags.startAt) : undefined,
        endAt: bodyWithoutTags.endAt ? new Date(bodyWithoutTags.endAt) : undefined,
        price: bodyWithoutTags.price !== undefined ? String(parseFloat(bodyWithoutTags.price)) : undefined,
        maxAttendees: bodyWithoutTags.maxAttendees ? parseInt(bodyWithoutTags.maxAttendees) : undefined,
      };
      (Object.keys(updateData) as Array<keyof typeof updateData>).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
      });

      const anchorStartAt = updateData.startAt ?? (eventToUpdate.startAt ? new Date(eventToUpdate.startAt) : new Date());
      const anchorEndAt = updateData.endAt ?? (eventToUpdate.endAt ? new Date(eventToUpdate.endAt) : null);
      const startTimeHHMM = extractTimeStr(anchorStartAt);
      const durationMins = anchorEndAt
        ? Math.round((anchorEndAt.getTime() - anchorStartAt.getTime()) / 60000)
        : null;

      // Create the series record
      const series = await dbStorage.createEventSeries({
        profileId: profile.id,
        pattern: canonicalPattern,
        defaultStartTime: startTimeHHMM,
        defaultDurationMins: durationMins,
        defaultMaxAttendees: (updateData.maxAttendees as number | undefined) ?? eventToUpdate.maxAttendees ?? null,
        timezone: (updateData as any).timezone || eventToUpdate.timezone || null,
        isActive: true,
      });

      // Attach the existing event to the series as instance #1 and apply form updates
      await dbStorage.updateEvent(eventId, {
        ...updateData,
        seriesId: series.id,
        sequenceNumber: 1,
      });

      // Generate subsequent occurrences starting the day after the anchor date
      const { genFrom, genUntil } = computeGenerationWindow(canonicalPattern);
      // Use the anchor's calendar day as the absolute lower bound so the
      // original event is never duplicated in the generated set.
      const anchorDayStart = new Date(anchorStartAt); anchorDayStart.setHours(0, 0, 0, 0);
      const actualGenFrom = genFrom > anchorDayStart ? genFrom : anchorDayStart;

      const allOccurrences = generateInstanceDates(canonicalPattern, actualGenFrom, genUntil, startTimeHHMM);
      // Drop the first occurrence if it lands on the same calendar day as the
      // anchor so we don't create a duplicate alongside the original event.
      const anchorDateStr = anchorStartAt.toISOString().split('T')[0];
      const additionalDates = allOccurrences.filter(d => d.toISOString().split('T')[0] !== anchorDateStr);

      if (additionalDates.length > 0) {
        const { id: _id, createdAt: _c, updatedAt: _u, seriesId: _sid, sequenceNumber: _sn, ...baseData } = eventToUpdate as any;
        const newInstances = additionalDates.map((date, idx) => ({
          ...baseData,
          ...updateData,
          startAt: date,
          endAt: durationMins ? new Date(date.getTime() + durationMins * 60000) : null,
          seriesId: series.id,
          sequenceNumber: idx + 2, // anchor is #1
          isFeatured: false,
          isCancelled: false,
          isActive: true,
          instanceOverrides: null,
        }));
        await dbStorage.createRecurringEventInstances(newInstances);
        await dbStorage.updateEventSeriesRecord(series.id, { generatedUntil: additionalDates[additionalDates.length - 1] });
      }

      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setEventTags(eventId, tagIds);
      }

      const promoted = await dbStorage.getEventById(eventId);
      res.json({ ...promoted, seriesPattern: canonicalPattern, cadenceLabel: cadenceLabelFromPattern(canonicalPattern) });
    } catch (error) {
      console.error("Error promoting event to series:", error);
      res.status(500).json({ message: "Failed to promote event to recurring series" });
    }
  });

  app.delete('/api/dashboard/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.id);
      const scope = req.query.scope as string || 'this';

      // Ownership check before deleting
      const eventToDelete = await dbStorage.getEventById(eventId);
      if (!eventToDelete) return res.status(404).json({ message: "Event not found" });
      if (eventToDelete.profileId !== profile.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Helper: notify confirmed registrants of a cancelled event instance
      const notifyRegistrants = async (inst: Event) => {
        try {
          const regs = await dbStorage.getConfirmedRegistrationsByEventId(inst.id);
          const dateStr = inst.startAt ? new Date(inst.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
          for (const reg of regs) {
            if (reg.clientEmail) {
              await sendEventCancellationToGuest(reg.clientEmail, reg.clientName || 'Guest', inst.title || eventToDelete.title || 'Event', dateStr, true);
            }
          }
        } catch (e) { console.error('[Delete notify] Failed to notify registrants:', e); }
      };

      if (eventToDelete.seriesId) {
        if (scope === 'all') {
          // Notify all registrants across every series instance before deleting
          try {
            const allInstances = await dbStorage.getEventSeriesInstances(eventToDelete.seriesId);
            for (const inst of allInstances) {
              await notifyRegistrants(inst);
            }
          } catch (e) { console.error('[Delete scope=all] Notify failed:', e); }
          await dbStorage.deleteEventSeries(eventToDelete.seriesId);
        } else if (scope === 'this_future') {
          const fromDate = eventToDelete.startAt ? new Date(eventToDelete.startAt) : new Date();
          fromDate.setHours(0, 0, 0, 0);
          // Notify registrants for this + future instances before deleting
          try {
            const allInstances = await dbStorage.getEventSeriesInstances(eventToDelete.seriesId);
            const affected = allInstances.filter(inst => inst.startAt && new Date(inst.startAt) >= fromDate);
            for (const inst of affected) {
              await notifyRegistrants(inst);
            }
          } catch (e) { console.error('[Delete scope=this_future] Notify failed:', e); }
          await dbStorage.deleteEventSeriesFromDate(eventToDelete.seriesId, fromDate);
          // End the series at the day before fromDate so lazy extension doesn't recreate instances
          const endDateStr = new Date(fromDate.getTime() - 86400000).toISOString().split('T')[0];
          try {
            const series = await dbStorage.getEventSeriesById(eventToDelete.seriesId);
            if (series) {
              const pattern = { ...series.pattern, endDate: endDateStr } as SeriesPattern;
              await dbStorage.updateEventSeriesRecord(eventToDelete.seriesId, { pattern, isActive: false });
            }
          } catch (e) { console.error('[Delete scope=this_future] Failed to end series:', e); }
        } else {
          // scope=this — notify then cancel just this instance
          await notifyRegistrants(eventToDelete);
          await dbStorage.cancelEventInstance(eventId);
        }
      } else {
        await notifyRegistrants(eventToDelete);
        await dbStorage.deleteEvent(eventId);
      }
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // Event registration endpoints
  app.get('/api/dashboard/events/:eventId/registrations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const eventId = parseInt(req.params.eventId);
      const registrations = await dbStorage.getEventRegistrationsByEventId(eventId);

      // Calculate total amount paid
      const totalAmount = registrations
        .filter(reg => reg.paymentStatus === 'paid')
        .reduce((sum, reg) => sum + parseFloat(reg.totalAmount), 0);

      res.json({
        registrations,
        totalAmount,
        totalRegistrations: registrations.length
      });
    } catch (error) {
      console.error("Error fetching event registrations:", error);
      res.status(500).json({ message: "Failed to fetch event registrations" });
    }
  });

  // Download attendee list as CSV
  app.get('/api/dashboard/events/:eventId/attendees.csv', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const eventId = parseInt(req.params.eventId);
      // Use a direct query (no isActive filter) so coaches can export attendees
      // for past or deactivated events that still appear in their inbox.
      const [event] = await db.select().from(events).where(eq(events.id, eventId));
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.profileId !== profile.id) return res.status(403).json({ message: "Forbidden" });

      const registrations = await dbStorage.getEventRegistrationsByEventId(eventId);

      const tz = profile.timezone || "UTC";

      function formatInTz(date: Date | null | undefined): string {
        if (!date) return "";
        try {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(date).replace(",", "");
        } catch {
          return date.toISOString().slice(0, 16).replace("T", " ");
        }
      }

      function csvCell(value: string | null | undefined): string {
        const s = value == null ? "" : String(value);
        // Mitigate CSV formula injection: prefix cells that start with spreadsheet
        // formula triggers (=, +, -, @) with a single quote so spreadsheet apps
        // treat the value as literal text rather than a formula.
        const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
        if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
          return '"' + safe.replace(/"/g, '""') + '"';
        }
        return safe;
      }

      function paymentStatusLabel(ps: string): string {
        const map: Record<string, string> = {
          paid: "Paid",
          pending: "Pending",
          waived: "Waived",
          requested: "Requested",
          proof_uploaded: "Proof uploaded",
          verified: "Verified",
          cash_pending: "Cash at event (pending)",
        };
        return map[ps] || ps;
      }

      function paymentMethodLabel(method: string | null | undefined, ps: string): string {
        // Fall back to the status when no explicit method was recorded: a
        // "Cash at event" RSVP implies cash even if the method field is empty.
        if (!method) return ps === "cash_pending" ? "Cash" : "";
        const map: Record<string, string> = {
          upi: "UPI",
          cash: "Cash",
          bank_transfer: "Bank transfer",
          paypal: "PayPal",
          payment_link: "Payment link",
          wise: "Wise",
        };
        return (
          map[method] ||
          method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }

      const headers = [
        "Name", "Email", "Phone", "Confirmation code", "Status", "Payment status",
        "Payment method", "Amount", "Currency", "Payment reference",
        "Payment submitted at", "Payment confirmed at", "Payment proof URL",
        "Attendance", "Registered at", "Message"
      ];

      const rows = registrations.map(r => [
        csvCell(r.clientName),
        csvCell(r.clientEmail),
        csvCell(r.clientPhone),
        csvCell(r.confirmationCode),
        csvCell(r.status === "confirmed" ? "Confirmed" : "Cancelled"),
        csvCell(paymentStatusLabel(r.paymentStatus)),
        csvCell(paymentMethodLabel(r.paymentMethodSelected, r.paymentStatus)),
        csvCell(r.totalAmount),
        csvCell(event.currency.toUpperCase()),
        csvCell(r.paymentReferenceText),
        csvCell(formatInTz(r.paymentMarkedAt)),
        csvCell(formatInTz(r.paymentConfirmedAt)),
        csvCell(r.paymentProofUrl),
        csvCell(r.attendanceStatus === "attended" ? "Attended" : r.attendanceStatus === "no_show" ? "No-show" : ""),
        csvCell(formatInTz(r.createdAt)),
        csvCell(r.message),
      ].join(","));

      const csvContent = [headers.map(csvCell).join(","), ...rows].join("\r\n");

      const eventDate = event.startAt
        ? new Date(event.startAt).toISOString().slice(0, 10)
        : "unknown-date";
      const safeTitle = event.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, " ");
      const asciiFilename = `${safeTitle} - ${eventDate} - attendees.csv`;
      const encodedFilename = encodeURIComponent(`${event.title} - ${eventDate} - attendees.csv`);

      const UTF8_BOM = "\uFEFF";

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.send(UTF8_BOM + csvContent);
    } catch (error) {
      console.error("Error generating attendees CSV:", error);
      res.status(500).json({ message: "Failed to generate attendees CSV" });
    }
  });

  app.post('/api/events/:eventId/register', async (req, res) => {
    // Hoist idempotency tracking outside try/catch so finally can always see it.
    const urlEventId = parseInt(req.params.eventId);
    const { attendeeName, attendeeEmail, attendeePhone, specialRequests, instanceId, idempotencyKey } = req.body;
    let ikClaimed = false;
    let ikResolve: ((r: IKResult) => void) | null = null;
    const hasIK = typeof idempotencyKey === 'string' && idempotencyKey.length > 0;

    try {

      if (!attendeeName || !attendeeEmail) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      // --------------- Atomic idempotency check (synchronous, no await) -----
      if (hasIK) {
        const fp = `${urlEventId}:${(attendeeEmail as string).toLowerCase().trim()}`;
        const done = ikCompleted.get(idempotencyKey);
        if (done) {
          if (done.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          return res.status(done.res.status).json(done.res.body);
        }
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          if (flying.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          const result = await flying.promise;
          return res.status(result.status).json(result.body);
        }
        let resolve!: (r: IKResult) => void;
        const promise = new Promise<IKResult>(r => { resolve = r; });
        ikInFlight.set(idempotencyKey, { fp, promise, resolve });
        ikClaimed = true;
        ikResolve = resolve;
      }
      // -----------------------------------------------------------------------

      // Resolve the actual event to register for: prefer instanceId if provided
      let resolvedEventId = urlEventId;
      if (instanceId && Number.isInteger(Number(instanceId))) {
        const instId = Number(instanceId);
        // Validate the instance belongs to the same series as the parent event
        const [parentEvent] = await db.select().from(events).where(eq(events.id, urlEventId));
        if (!parentEvent) return res.status(404).json({ message: "Event not found" });
        const [instanceEvent] = await db.select().from(events).where(eq(events.id, instId));
        if (!instanceEvent) return res.status(404).json({ message: "Instance not found" });
        // Verify strict series relationship — both events must share the same seriesId.
        // We never compare against parentEvent.id (an event row ID, not a series ID).
        const sameSeries =
          instanceEvent.seriesId !== null &&
          instanceEvent.seriesId !== undefined &&
          parentEvent.seriesId !== null &&
          parentEvent.seriesId !== undefined &&
          instanceEvent.seriesId === parentEvent.seriesId;
        if (!sameSeries) return res.status(400).json({ message: "Instance does not belong to this event series" });
        resolvedEventId = instId;
      }

      const eventId = resolvedEventId;

      // Get event details to get profile and price info
      const [event] = await db.select().from(events).where(eq(events.id, eventId));

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Reject registrations for cancelled or inactive event instances
      if (event.isCancelled) {
        return res.status(410).json({ message: "This event has been cancelled" });
      }
      if (!event.isActive) {
        return res.status(410).json({ message: "This event is no longer available" });
      }

      // Check capacity if maxAttendees is set
      if (event.maxAttendees) {
        const confirmedCount = await dbStorage.getConfirmedRegistrationCountForEvent(eventId);
        if (confirmedCount >= event.maxAttendees) {
          return res.status(409).json({ message: "This event is fully booked" });
        }
      }

      // Check for duplicate registration (same email, same event, any non-cancelled status)
      const existingRegs = await dbStorage.getEventRegistrationsByEventId(eventId);
      const duplicate = existingRegs.find(r =>
        r.clientEmail.toLowerCase() === (attendeeEmail as string).toLowerCase().trim() &&
        r.status !== 'cancelled'
      );
      if (duplicate) {
        return res.status(409).json({ message: "You are already registered for this event", code: "ALREADY_REGISTERED" });
      }

      // Get coach profile info
      const coachProfile = await dbStorage.getProfileById(event.profileId);

      // Find or create guest profile using resolver (platform-wide by email)
      const guestProfile = await dbStorage.getOrCreateGuestProfile(
        attendeeEmail,
        attendeeName,
        attendeePhone || null,
        event.profileId
      );
      console.log(`[Event Registration] Using guest profile #${guestProfile.id} for ${attendeeEmail}`);

      // Generate confirmation code
      const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Derive whether this paid event needs the payment screen.
      //
      // We want the payment screen to appear for any event whose price > 0,
      // regardless of legacy `pricingType`/`requiresPayment` values.
      // Earlier this check required `pricingType === 'paid'` exactly, which
      // silently bypassed the payment screen for older events whose
      // `pricingType` was null/empty/legacy even when the price and methods
      // were set up correctly. The only events that should NOT get a payment
      // screen are explicitly free or donation-based events.
      const pricingTypeRaw = (event.pricingType || '').toString().trim().toLowerCase();
      const isExplicitlyFreeOrDonation =
        pricingTypeRaw === 'free' || pricingTypeRaw === 'donation';
      const priceNum = parseFloat(event.price || "0");
      const eventIsPaid = !isExplicitlyFreeOrDonation && priceNum > 0;
      let eventPaymentMethodsOffered: any[] | null = null;
      if (eventIsPaid) {
        const paymentSettings = await dbStorage.getCoachPaymentSettings(event.profileId);
        if (paymentSettings?.methods && paymentSettings.methods.length > 0) {
          eventPaymentMethodsOffered = paymentSettings.methods.filter((m: any) => m.enabled);
          if (eventPaymentMethodsOffered.length === 0) eventPaymentMethodsOffered = null;
        }
      }
      const paymentRequired = eventIsPaid && !!eventPaymentMethodsOffered;
      if (!paymentRequired && priceNum > 0) {
        // Make it easy to debug "why didn't the payment screen appear?" cases
        // from production logs. We log the event id, the resolved pricing
        // signals, and which gate failed.
        console.log(
          `[Event Registration] paymentRequired=false for paid-priced event #${eventId}: ` +
            `pricingType="${event.pricingType ?? 'null'}", requiresPayment=${event.requiresPayment}, ` +
            `price=${priceNum}, isExplicitlyFreeOrDonation=${isExplicitlyFreeOrDonation}, ` +
            `enabledMethodsCount=${eventPaymentMethodsOffered?.length ?? 0}`,
        );
      }

      const registrationData = {
        eventId,
        profileId: event.profileId,
        guestProfileId: guestProfile.id,
        clientName: attendeeName,
        clientEmail: attendeeEmail,
        clientPhone: attendeePhone || null,
        message: specialRequests || null,
        status: "confirmed" as const,
        paymentStatus: "pending" as const,
        totalAmount: event.price || "0",
        confirmationCode,
        paymentMethodsOffered: eventPaymentMethodsOffered || undefined,
        paymentInstruction: eventIsPaid ? (event.paymentInstructions || null) : null,
      };

      const newRegistration = await dbStorage.createEventRegistration(registrationData);

      // Respond immediately — emails are sent in the background so the user
      // sees the confirmation screen right away (was ~3.3 s, now <400 ms).
      const successBody = {
        success: true,
        registration: newRegistration,
        guestAccessToken: guestProfile.accessToken,
        paymentRequired,
        paymentMethodsOffered: eventPaymentMethodsOffered || [],
      };
      res.json(successBody);

      // Resolve idempotency slot — cache the success result and wake up any
      // concurrent waiters.
      if (hasIK && ikResolve) {
        const ikRes: IKResult = { status: 200, body: successBody };
        const fp = `${urlEventId}:${(attendeeEmail as string).toLowerCase().trim()}`;
        ikCompleted.set(idempotencyKey, { fp, res: ikRes, expiresAt: Date.now() + 5 * 60 * 1000 });
        ikClaimed = false;
        ikResolve(ikRes);
        ikInFlight.delete(idempotencyKey);
      }

      // --- Fire-and-forget background work ---

      // ------------------------------------------------------------------
      // Email send-or-defer pattern for the register→/complete-payment flow
      // ------------------------------------------------------------------
      // For paid events the guest is sent straight to /complete-payment after
      // submitting the registration form. If they act on that screen within
      // a few seconds (submit proof, choose cash, get waived), the action's
      // own dedicated email already covers the registration — sending an
      // additional "you're registered, payment required" email would create
      // a noisy duplicate.
      //
      // To avoid that, for paid events we defer the registration confirmation
      // (guest + coach) by ~90 seconds. When the timer fires we re-fetch the
      // registration: if its paymentStatus has advanced past 'pending' (e.g.
      // 'proof_uploaded', 'cash_pending', 'paid', 'waived', 'requested') OR
      // its status was cancelled, the follow-up email already covered it,
      // so we skip. For free / donation events there is nothing to act on,
      // so we send the confirmation immediately.
      const REGISTRATION_EMAIL_DEFER_MS = 90 * 1000;
      const sendRegistrationEmailsNow = !paymentRequired;

      // Guest confirmation email
      if (newRegistration.cancellationToken) {
        const coachName = coachProfile?.displayName || coachProfile?.username || '';
        const eventDate = event.startAt
          ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : '';
        const eventStartTime = extractTimeStr(event.startAt);
        const eventEndTime = extractTimeStr(event.endAt);
        const isOnline = event.mode === 'online' || event.mode === 'hybrid';
        const isOffline = event.mode === 'offline' || event.mode === 'hybrid';

        const googleCalendarUrl = event.startAt
          ? buildGoogleCalendarUrlForEvent({
              title: event.title,
              start: new Date(event.startAt),
              end: event.endAt ? new Date(event.endAt) : null,
              description: [
                `Confirmation Code: ${confirmationCode}`,
                isOnline && !event.meetingLink ? 'Meeting link will be sent before the event.' : '',
              ].filter(Boolean).join('\n'),
              location: (isOnline && event.meetingLink) ? event.meetingLink : (event.location || ''),
            })
          : undefined;

        // Build the /complete-payment deep-link the same way the in-app
        // success screen does (event-registration-modal.tsx). The email's
        // "payment required" copy and CTA must match what the guest sees in
        // the app — driven by `paymentRequired` (the canonical derivation
        // computed above), NOT the legacy `event.requiresPayment` field
        // which can be out of sync on older events.
        const completePaymentUrl =
          paymentRequired && guestProfile.accessToken
            ? eventCompletePaymentLink({
                guestAccessToken: guestProfile.accessToken,
                registrationId: newRegistration.id,
              })
            : null;

        // Always include the guest-portal link so the guest has a single
        // home base — paid guests who skip the /complete-payment screen
        // can still come back here to upload proof later.
        const guestPortalUrl = guestProfile.accessToken
          ? guestPortalLink({
              token: guestProfile.accessToken,
              registrationId: newRegistration.id,
              tab: 'events',
            })
          : null;

        // Map the canonical pricing derivation to the 3-way enum the email
        // template uses to differentiate donation copy from free/paid.
        const emailPricingType: 'free' | 'donation' | 'paid' = paymentRequired
          ? 'paid'
          : pricingTypeRaw === 'donation'
            ? 'donation'
            : 'free';

        const sendGuestConfirmation = () =>
          sendEventRegistrationConfirmationToGuest(
            attendeeEmail,
            attendeeName,
            coachName,
            event.title,
            eventDate,
            eventStartTime,
            eventEndTime,
            event.location || null,
            event.meetingLink || null,
            isOnline,
            isOffline,
            paymentRequired,
            eventIsPaid ? (event.paymentInstructions || null) : null,
            confirmationCode,
            newRegistration.cancellationToken!,
            event.currency || 'MYR',
            googleCalendarUrl,
            completePaymentUrl,
            emailPricingType,
            guestPortalUrl,
          ).catch((emailErr) => {
            console.error('[Event Registration] Failed to send guest confirmation email:', emailErr);
          });

        // For free/donation events, send immediately.
        // For paid events, no guest email is sent at registration time —
        // the first guest email goes out only after proof is submitted
        // (sendEventPaymentSubmittedToGuest) or payment is verified
        // (sendEventPaymentVerifiedToRegistrant).
        if (sendRegistrationEmailsNow) {
          sendGuestConfirmation();
        }
      }

      // Coach notification (SSE + email)
      if (coachProfile) {
        // Use the same `paymentRequired` derivation the guest experience
        // uses so the coach sees "payment pending" exactly when the guest
        // was sent to /complete-payment. Previously this read
        // event.requiresPayment, which could disagree with the actual flow
        // for legacy events.
        try {
          notifyCoach(event.profileId, {
            type: 'new_registration',
            registrationId: newRegistration.id,
            eventId: event.id,
            clientName: attendeeName,
            eventTitle: event.title,
            confirmationCode,
            requiresPayment: paymentRequired,
          });
        } catch {}

        if (coachProfile.email) {
          const eventDateStr = event.startAt
            ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            : '';
          const sendCoachNotification = () =>
            sendEventRegistrationNotificationToCoach(
              coachProfile.email!,
              coachProfile.displayName || coachProfile.username || '',
              attendeeName,
              attendeeEmail,
              attendeePhone || null,
              event.title,
              eventDateStr,
              paymentRequired,
              event.id,
              newRegistration.id,
              paymentRequired
                ? 'paid'
                : pricingTypeRaw === 'donation'
                  ? 'donation'
                  : 'free',
            ).catch((emailErr) => {
              console.error('[Event Registration] Failed to send coach notification email:', emailErr);
            });

          if (sendRegistrationEmailsNow) {
            sendCoachNotification();
          } else {
            // Defer — same dedupe logic as the guest email above. If the
            // attendee acts on /complete-payment within the window, the
            // coach already gets the dedicated proof/cash email and this
            // would otherwise be a duplicate.
            setTimeout(async () => {
              try {
                const fresh = await dbStorage.getEventRegistrationById(newRegistration.id);
                if (!fresh) return;
                if (fresh.status !== 'confirmed') return;
                if (fresh.paymentStatus !== 'pending') return;
                await sendCoachNotification();
              } catch (e) {
                console.error('[Event Registration] Deferred coach notification check failed:', e);
              }
            }, REGISTRATION_EMAIL_DEFER_MS);
          }
        }
      }
    } catch (error) {
      console.error("Error creating event registration:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to create registration" });
      }
    } finally {
      if (ikClaimed && hasIK) {
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          flying.resolve({ status: 500, body: { message: "Failed to create registration" } });
          ikInFlight.delete(idempotencyKey);
        }
        ikClaimed = false;
      }
    }
  });

  // Public: get event checkout context (event details + payment methods)
  // Used by the new paid-event registration flow before the registration is created
  app.get('/api/events/:eventId/checkout-context', async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      if (isNaN(eventId)) return res.status(400).json({ message: "Invalid event ID" });

      const event = await dbStorage.getEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.isCancelled) return res.status(410).json({ message: "This event has been cancelled" });
      if (!event.isActive) return res.status(410).json({ message: "This event is no longer available" });

      const pricingTypeRaw = (event.pricingType || '').toString().trim().toLowerCase();
      const isExplicitlyFreeOrDonation = pricingTypeRaw === 'free' || pricingTypeRaw === 'donation';
      const priceNum = parseFloat(event.price || "0");
      const eventIsPaid = !isExplicitlyFreeOrDonation && priceNum > 0;

      let paymentMethodsOffered: any[] | null = null;
      if (eventIsPaid) {
        const paymentSettings = await dbStorage.getCoachPaymentSettings(event.profileId);
        if (paymentSettings?.methods && paymentSettings.methods.length > 0) {
          const enabled = paymentSettings.methods.filter((m: any) => m.enabled !== false);
          if (enabled.length > 0) paymentMethodsOffered = enabled;
        }
      }

      res.json({
        event: {
          id: event.id,
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          location: event.location,
          price: event.price,
          currency: event.currency,
          pricingType: event.pricingType,
          paymentInstructions: event.paymentInstructions,
        },
        paymentMethodsOffered,
        paymentRequired: eventIsPaid && !!paymentMethodsOffered,
      });
    } catch (error) {
      console.error("Error fetching event checkout context:", error);
      res.status(500).json({ message: "Failed to fetch event checkout context" });
    }
  });

  // Public: upload payment proof without a guest token (new registration flow).
  // Requires the event to exist, be active, and be a paid event to limit abuse.
  app.post('/api/events/:eventId/upload-payment-proof', upload.single('file'), async (req: any, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      if (isNaN(eventId)) return res.status(400).json({ message: "Invalid event ID" });

      const event = await dbStorage.getEventById(eventId);
      if (!event) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.isCancelled || !event.isActive) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(410).json({ error: "Event is not available" });
      }
      const pricingTypeRaw = (event.pricingType || '').toString().trim().toLowerCase();
      const isExplicitlyFreeOrDonation = pricingTypeRaw === 'free' || pricingTypeRaw === 'donation';
      const priceNum = parseFloat(event.price || "0");
      if (isExplicitlyFreeOrDonation || priceNum <= 0) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Event does not require payment" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Only JPG, PNG and WebP images are accepted" });
      }
      if (req.file.size > 10 * 1024 * 1024) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "File must be under 10MB" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const publicUrl = await supabaseStorage.uploadPaymentProof(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype
      );
      fs.unlinkSync(req.file.path);
      res.json({ url: publicUrl });
    } catch (error) {
      console.error("Error uploading payment proof (new registration flow):", error);
      if ((req as any).file?.path && fs.existsSync((req as any).file.path)) {
        fs.unlinkSync((req as any).file.path);
      }
      res.status(500).json({ error: "Failed to upload payment proof" });
    }
  });

  // Public: combined register-and-pay for paid events
  // Creates the guest profile, event registration, and payment record atomically.
  // Emails are sent immediately — no 90-second deferral.
  app.post('/api/events/:eventId/register-and-pay', async (req, res) => {
    // Hoist idempotency tracking outside try/catch so catch and finally can
    // always see them regardless of where in the handler we exit.
    const urlEventId = parseInt(req.params.eventId);
    const {
      attendeeName, attendeeEmail, attendeePhone, specialRequests, instanceId,
      selectedMethod, proofUrl, referenceText, proofImageUrl, idempotencyKey,
    } = req.body;

    // Whether this request holds the in-flight slot in ikInFlight.
    // Set to true when we claim the slot; set back to false on the success
    // path (after caching the result), so finally does not double-release.
    let ikClaimed = false;
    let ikResolve: ((r: IKResult) => void) | null = null;
    const hasIK = typeof idempotencyKey === 'string' && idempotencyKey.length > 0;

    try {
      if (!attendeeName || !attendeeEmail) {
        return res.status(400).json({ message: "Name and email are required" });
      }
      if (!selectedMethod) {
        return res.status(400).json({ message: "Please select a payment method" });
      }

      // Defence-in-depth: non-cash submissions require at least one piece of
      // proof (transaction ID, uploaded screenshot URL, or pasted proof URL).
      // Validate BEFORE claiming the idempotency slot so a 400 here is never
      // cached — a retry with proof from the same idempotency key must succeed.
      if (selectedMethod !== 'cash') {
        const hasReference = typeof referenceText === 'string' && referenceText.trim().length > 0;
        const hasProofUrl = typeof proofUrl === 'string' && proofUrl.trim().length > 0;
        const hasProofImage = typeof proofImageUrl === 'string' && proofImageUrl.trim().length > 0;
        if (!hasReference && !hasProofUrl && !hasProofImage) {
          return res.status(400).json({
            message: "Please add at least one payment proof: a transaction ID, a screenshot, or a proof URL.",
            code: "PROOF_REQUIRED",
          });
        }
      }

      // --------------- Atomic idempotency check (synchronous, no await) -----
      // Node.js is single-threaded: the check-and-set below has no async gap,
      // so it is atomic — a second concurrent request will either find a
      // completed cache hit or an in-flight Promise and await it.
      if (hasIK) {
        const fp = `${urlEventId}:${(attendeeEmail as string).toLowerCase().trim()}`;
        // 1. Already finished — replay (do NOT enter normal handler path)
        const done = ikCompleted.get(idempotencyKey);
        if (done) {
          if (done.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          return res.status(done.res.status).json(done.res.body);
        }
        // 2. In-flight from a concurrent request — await its result and replay
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          if (flying.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          const result = await flying.promise;
          return res.status(result.status).json(result.body);
        }
        // 3. Neither — claim this slot synchronously before any further awaits.
        //    All exit paths (error returns, exceptions) release this slot via
        //    the finally block below.
        let resolve!: (r: IKResult) => void;
        const promise = new Promise<IKResult>(r => { resolve = r; });
        ikInFlight.set(idempotencyKey, { fp, promise, resolve });
        ikClaimed = true;
        ikResolve = resolve;
      }
      // -----------------------------------------------------------------------

      // Resolve event (same series-instance logic as /register)
      let resolvedEventId = urlEventId;
      if (instanceId && Number.isInteger(Number(instanceId))) {
        const instId = Number(instanceId);
        const [parentEvent] = await db.select().from(events).where(eq(events.id, urlEventId));
        if (!parentEvent) return res.status(404).json({ message: "Event not found" });
        const [instanceEvent] = await db.select().from(events).where(eq(events.id, instId));
        if (!instanceEvent) return res.status(404).json({ message: "Instance not found" });
        const sameSeries =
          instanceEvent.seriesId !== null &&
          instanceEvent.seriesId !== undefined &&
          parentEvent.seriesId !== null &&
          parentEvent.seriesId !== undefined &&
          instanceEvent.seriesId === parentEvent.seriesId;
        if (!sameSeries) return res.status(400).json({ message: "Instance does not belong to this event series" });
        resolvedEventId = instId;
      }

      const eventId = resolvedEventId;
      const [event] = await db.select().from(events).where(eq(events.id, eventId));
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.isCancelled) return res.status(410).json({ message: "This event has been cancelled" });
      if (!event.isActive) return res.status(410).json({ message: "This event is no longer available" });

      // Validate this is a paid event
      const pricingTypeRaw = (event.pricingType || '').toString().trim().toLowerCase();
      const isExplicitlyFreeOrDonation = pricingTypeRaw === 'free' || pricingTypeRaw === 'donation';
      const priceNum = parseFloat(event.price || "0");
      const eventIsPaid = !isExplicitlyFreeOrDonation && priceNum > 0;
      if (!eventIsPaid) {
        return res.status(400).json({ message: "This endpoint is only for paid events" });
      }

      // Get and validate payment methods
      const paymentSettings = await dbStorage.getCoachPaymentSettings(event.profileId);
      const enabledMethods = (paymentSettings?.methods || []).filter((m: any) => m.enabled !== false);
      if (enabledMethods.length === 0) {
        return res.status(400).json({ message: "This event has no payment methods configured" });
      }
      const isAllowed = enabledMethods.some((m: any) => m.type === selectedMethod);
      if (!isAllowed) {
        return res.status(400).json({ message: "Selected payment method is not available for this event" });
      }

      // Idempotent duplicate check — runs BEFORE the capacity check so that a retry
      // by the same guest on a now-full event still returns 200 rather than 409.
      // Catches any non-cancelled status (confirmed, proof_uploaded, cash_pending).
      const existingRegs = await dbStorage.getEventRegistrationsByEventId(eventId);
      const duplicate = existingRegs.find(
        r => r.clientEmail === attendeeEmail && r.status !== 'cancelled',
      );
      if (duplicate) {
        // Resolve the guest portal token — try by profileId first, fall back to email.
        let existingGuestToken: string | null = null;
        if (duplicate.guestProfileId) {
          try {
            const gp = await dbStorage.getGuestProfileById(duplicate.guestProfileId);
            existingGuestToken = gp?.accessToken || null;
          } catch {}
        }
        if (!existingGuestToken) {
          try {
            const gp = await dbStorage.getGuestProfileByEmail(attendeeEmail);
            existingGuestToken = gp?.accessToken || null;
          } catch {}
        }

        // If this retry provides proof data the original lacked, persist it and
        // return the updated record so the response reflects the new fields.
        const hasNewProof = proofImageUrl && !duplicate.paymentProofUrl;
        const hasNewRef   = referenceText  && !duplicate.paymentReferenceText;
        let registrationToReturn: typeof duplicate = duplicate;
        if (hasNewProof || hasNewRef) {
          const proofUpdates: Record<string, any> = {};
          if (hasNewProof) {
            proofUpdates.paymentProofUrl = proofImageUrl;
            proofUpdates.paymentStatus   = 'proof_uploaded';
          }
          if (hasNewRef) proofUpdates.paymentReferenceText = referenceText;
          try {
            registrationToReturn = await dbStorage.updateEventRegistration(duplicate.id, proofUpdates);
          } catch { /* fall back to original duplicate on update failure */ }
        }

        return res.json({ success: true, registration: registrationToReturn, guestAccessToken: existingGuestToken });
      }

      // Capacity check (runs only for genuinely new registrants)
      if (event.maxAttendees) {
        const confirmedCount = await dbStorage.getConfirmedRegistrationCountForEvent(eventId);
        if (confirmedCount >= event.maxAttendees) {
          return res.status(409).json({ code: "EVENT_FULL", message: "This event is fully booked" });
        }
      }

      // Duplicate check — block any non-cancelled registration for this email
      // (not just 'confirmed') so proof_uploaded / cash_pending entries are caught too.
      const existingRegsStrict = await dbStorage.getEventRegistrationsByEventId(eventId);
      const duplicateStrict = existingRegsStrict.find(
        r => r.clientEmail === attendeeEmail && r.status !== 'cancelled',
      );
      if (duplicateStrict) {
        // Try to return the guest's access token so the frontend can redirect to
        // the portal — the guest may have registered moments ago and simply retried.
        let existingGuestToken: string | null = null;
        if (duplicateStrict.guestProfileId) {
          try {
            const gp = await dbStorage.getGuestProfileById(duplicateStrict.guestProfileId);
            existingGuestToken = gp?.accessToken || null;
          } catch {}
        }
        if (!existingGuestToken) {
          // Fall back: look up by email
          try {
            const gp = await dbStorage.getGuestProfileByEmail(attendeeEmail);
            existingGuestToken = gp?.accessToken || null;
          } catch {}
        }
        return res.status(409).json({
          code: "ALREADY_REGISTERED",
          message: "You are already registered for this event",
          guestAccessToken: existingGuestToken,
        });
      }


      // Get coach profile
      const coachProfile = await dbStorage.getProfileById(event.profileId);

      // Find or create guest profile
      const guestProfile = await dbStorage.getOrCreateGuestProfile(
        attendeeEmail,
        attendeeName,
        attendeePhone || null,
        event.profileId
      );
      console.log(`[register-and-pay] Using guest profile #${guestProfile.id} for ${attendeeEmail}`);

      const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const isCash = selectedMethod === 'cash';
      const finalProofUrl = isCash ? null : (proofImageUrl || proofUrl || null);
      const paymentStatus = isCash ? 'cash_pending' as const : 'proof_uploaded' as const;

      const newRegistration = await dbStorage.createEventRegistration({
        eventId,
        profileId: event.profileId,
        guestProfileId: guestProfile.id,
        clientName: attendeeName,
        clientEmail: attendeeEmail,
        clientPhone: attendeePhone || null,
        message: specialRequests || null,
        status: "confirmed" as const,
        paymentStatus,
        totalAmount: event.price || "0",
        confirmationCode,
        paymentMethodsOffered: enabledMethods,
        paymentInstruction: event.paymentInstructions || null,
        paymentMethodSelected: selectedMethod,
        paymentProofUrl: finalProofUrl,
        paymentReferenceText: isCash ? null : (referenceText || null),
        paymentMarkedAt: new Date(),
      });

      const successBody = {
        success: true,
        registration: newRegistration,
        guestAccessToken: guestProfile.accessToken,
      };
      res.json(successBody);

      // Resolve idempotency slot — cache the success result and wake up any
      // concurrent waiters. Mark ikClaimed = false FIRST so the finally block
      // (which always runs) does not double-release the slot.
      if (hasIK && ikResolve) {
        const ikRes: IKResult = { status: 200, body: successBody };
        const fp = `${urlEventId}:${(attendeeEmail as string).toLowerCase().trim()}`;
        ikCompleted.set(idempotencyKey, { fp, res: ikRes, expiresAt: Date.now() + 5 * 60 * 1000 });
        ikClaimed = false; // mark resolved BEFORE calling resolve/delete
        ikResolve(ikRes);
        ikInFlight.delete(idempotencyKey);
      }

      // Fire-and-forget emails — sent immediately, no 90-second defer
      const eventDateStr = event.startAt
        ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      const coachName = coachProfile?.displayName || coachProfile?.username || 'Coach';
      const isOnline = event.mode === 'online' || event.mode === 'hybrid';
      const isOffline = event.mode === 'offline' || event.mode === 'hybrid';
      const guestPortalUrl = guestProfile.accessToken
        ? guestPortalLink({
            token: guestProfile.accessToken,
            registrationId: newRegistration.id,
            tab: 'events',
          })
        : null;

      sendEventPaymentSubmittedToGuest({
        registrantEmail: attendeeEmail,
        registrantName: attendeeName,
        coachName,
        eventTitle: event.title,
        eventDate: eventDateStr,
        eventStartTime: extractTimeStr(event.startAt),
        eventEndTime: extractTimeStr(event.endAt),
        isCash,
        amount: event.price || null,
        currency: event.currency || 'MYR',
        registrationId: newRegistration.id,
        cancellationToken: newRegistration.cancellationToken || '',
        guestPortalUrl,
      }).catch((emailErr: any) => {
        console.error('[register-and-pay] Failed to send payment email to guest:', emailErr);
      });

      try {
        notifyCoach(event.profileId, {
          type: isCash ? 'cash_pending' : 'payment_proof',
          registrationId: newRegistration.id,
          eventId: event.id,
          clientName: attendeeName,
          eventTitle: event.title,
          confirmationCode: newRegistration.confirmationCode,
        });
      } catch {}

      const coachEmail = coachProfile?.contactEmail || coachProfile?.email;
      if (coachEmail) {
        sendEventPaymentProofToCoach({
          coachEmail,
          coachName,
          registrantName: attendeeName,
          registrantEmail: attendeeEmail,
          eventTitle: event.title,
          eventDate: eventDateStr,
          eventId: event.id,
          registrationId: newRegistration.id,
          isCash,
        }).catch((emailErr: any) => {
          console.error('[register-and-pay] Failed to send payment notification to coach:', emailErr);
        });
      }
    } catch (error) {
      console.error("Error in register-and-pay:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to complete registration" });
      }
    } finally {
      // Release in-flight slot on ALL non-success exit paths (early 4xx returns,
      // thrown exceptions, etc.). ikClaimed is false after the success path so
      // this block is a no-op in that case.
      if (ikClaimed && hasIK) {
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          flying.resolve({ status: 500, body: { message: "Failed to complete registration" } });
          ikInFlight.delete(idempotencyKey);
        }
        ikClaimed = false;
      }
    }
  });

  // Public: guest self-cancellation via token
  app.post('/api/events/cancel-registration', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Cancellation token required" });

      const registration = await dbStorage.getEventRegistrationByCancellationToken(token);
      if (!registration) return res.status(404).json({ message: "Registration not found" });
      if (registration.status === 'cancelled') return res.status(400).json({ message: "Registration is already cancelled" });

      const event = await dbStorage.getEventById(registration.eventId);

      await dbStorage.updateEventRegistration(registration.id, { status: 'cancelled' });

      const guestName = registration.clientName;
      const guestEmail = registration.clientEmail;
      const eventTitle = event?.title || 'the event';
      const eventDate = event?.startAt
        ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';

      // Notify guest
      try {
        await sendEventCancellationToGuest(guestEmail, guestName, eventTitle, eventDate, false);
      } catch (e) { console.error('[Cancel Reg] guest email failed', e); }

      // Notify coach
      if (event) {
        const coachProfile = await dbStorage.getProfileById(event.profileId);

        // Real-time in-app notification via SSE
        try {
          notifyCoach(event.profileId, {
            type: 'registration_cancelled',
            registrationId: registration.id,
            eventId: event.id,
            clientName: guestName,
            eventTitle,
          });
        } catch (e) { console.error('[Cancel Reg] coach SSE notify failed', e); }

        // Web Push notification (works even when tab is closed)
        sendPushToCoach(event.profileId, {
          title: 'Event Registration Cancelled',
          body: `${guestName} cancelled their registration for ${eventTitle}.`,
          tag: `registration-cancelled-${registration.id}`,
        }).catch((e) => console.error('[Cancel Reg] coach push notify failed', e));

        if (coachProfile?.email) {
          try {
            await sendEventCancellationNotificationToCoach(
              coachProfile.email,
              coachProfile.displayName || coachProfile.username || '',
              guestName,
              guestEmail,
              eventTitle,
              eventDate,
              registration.eventId,
              registration.id,
            );
          } catch (e) { console.error('[Cancel Reg] coach email failed', e); }
        }
      }

      res.json({ success: true, message: "Registration cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling registration:", error);
      res.status(500).json({ message: "Failed to cancel registration" });
    }
  });

  // Public: get registration by cancellation token (to show info on cancellation page)
  app.get('/api/events/cancel-registration', async (req, res) => {
    try {
      const { token } = req.query as { token: string };
      if (!token) return res.status(400).json({ message: "Token required" });

      const registration = await dbStorage.getEventRegistrationByCancellationToken(token);
      if (!registration) return res.status(404).json({ message: "Registration not found" });

      const event = await dbStorage.getEventById(registration.eventId);

      res.json({
        registration: {
          id: registration.id,
          clientName: registration.clientName,
          clientEmail: registration.clientEmail,
          status: registration.status,
          confirmationCode: registration.confirmationCode,
        },
        event: event ? {
          title: event.title,
          startAt: event.startAt,
          location: event.location,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching registration for cancellation:", error);
      res.status(500).json({ message: "Failed to fetch registration" });
    }
  });

  // Canonical guest self-cancellation endpoint per API contract
  // POST /api/event-registrations/:id/cancel-by-token  (token in request body)
  app.post('/api/event-registrations/:id/cancel-by-token', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Cancellation token required" });

      const registration = await dbStorage.getEventRegistrationByCancellationToken(token);
      if (!registration) return res.status(404).json({ message: "Registration not found" });

      // Validate that the token belongs to the registration ID in the URL
      const regId = parseInt(req.params.id, 10);
      if (registration.id !== regId) return res.status(403).json({ message: "Token does not match this registration" });

      if (registration.status === 'cancelled') return res.status(400).json({ message: "Registration is already cancelled" });

      const event = await dbStorage.getEventById(registration.eventId);

      await dbStorage.updateEventRegistration(registration.id, { status: 'cancelled' });

      const guestName = registration.clientName;
      const guestEmail = registration.clientEmail;
      const eventTitle = event?.title || 'the event';
      const eventDate = event?.startAt
        ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';

      try {
        await sendEventCancellationToGuest(guestEmail, guestName, eventTitle, eventDate, false);
      } catch (e) { console.error('[Cancel Reg] guest email failed', e); }

      if (event) {
        const coachProfile = await dbStorage.getProfileById(event.profileId);

        // Real-time in-app notification via SSE
        try {
          notifyCoach(event.profileId, {
            type: 'registration_cancelled',
            registrationId: registration.id,
            eventId: event.id,
            clientName: guestName,
            eventTitle,
          });
        } catch (e) { console.error('[Cancel Reg] coach SSE notify failed', e); }

        // Web Push notification (works even when tab is closed)
        sendPushToCoach(event.profileId, {
          title: 'Event Registration Cancelled',
          body: `${guestName} cancelled their registration for ${eventTitle}.`,
          tag: `registration-cancelled-${registration.id}`,
        }).catch((e) => console.error('[Cancel Reg] coach push notify failed', e));

        if (coachProfile?.email) {
          try {
            await sendEventCancellationNotificationToCoach(
              coachProfile.email,
              coachProfile.displayName || coachProfile.username || 'Coach',
              guestName,
              guestEmail,
              eventTitle,
              eventDate,
              registration.eventId,
              registration.id,
            );
          } catch (e) { console.error('[Cancel Reg] coach email failed', e); }
        }
      }

      res.json({ message: "Registration cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling registration:", error);
      res.status(500).json({ message: "Failed to cancel registration" });
    }
  });

  // Dashboard: get all events (with embedded registrations) for the coach
  app.get('/api/dashboard/event-registrations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      // Single 2-query fetch: events + all their registrations (no N+1)
      const eventGroups = await dbStorage.getEventsWithRegistrationsForProfile(profile.id);

      res.json({ eventGroups });
    } catch (error) {
      console.error("Error fetching event registrations:", error);
      res.status(500).json({ message: "Failed to fetch event registrations" });
    }
  });

  // Dashboard: update a registration (cancel, mark-paid, mark-attended, mark-no-show)
  app.patch('/api/dashboard/event-registrations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const regId = parseInt(req.params.id);
      const registration = await dbStorage.getEventRegistrationById(regId);
      if (!registration) return res.status(404).json({ message: "Registration not found" });
      if (registration.profileId !== profile.id) return res.status(403).json({ message: "Unauthorized" });

      const { action } = req.body;

      // Fetch event for state-machine validation
      const event = await dbStorage.getEventById(registration.eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const isEventPast = event.startAt ? new Date(event.startAt) < new Date() : false;

      let updates: any = {};
      let sendCancelEmailToGuest = false;
      let sendPaymentRequestedEmailToRegistrant = false;
      let sendPaymentVerifiedEmailToRegistrant = false;
      let sendPaymentWaivedEmailToRegistrant = false;
      const previousPaymentStatus = registration.paymentStatus;

      if (action === 'cancel') {
        updates.status = 'cancelled';
        sendCancelEmailToGuest = true;
      } else if (action === 'request-payment') {
        // Coach explicitly requests payment from registrant
        if (!event.requiresPayment) {
          return res.status(400).json({ message: "This event does not require payment" });
        }
        updates.paymentStatus = 'requested';
        sendPaymentRequestedEmailToRegistrant = true;
      } else if (action === 'mark-paid') {
        // Only valid for paid events
        if (!event.requiresPayment) {
          return res.status(400).json({ message: "This event does not require payment" });
        }
        updates.paymentStatus = 'paid';
        // Notify the guest that payment was confirmed — but only on the
        // transition into 'paid'. The dedicated /verify-payment endpoint
        // already sends this email; this branch covers the dashboard quick
        // "Mark paid" action which previously skipped the guest email.
        if (previousPaymentStatus !== 'paid') {
          sendPaymentVerifiedEmailToRegistrant = true;
        }
      } else if (action === 'mark-attended') {
        // Only valid after event has passed
        if (!isEventPast) {
          return res.status(400).json({ message: "Attendance can only be marked after the event has ended" });
        }
        updates.attendanceStatus = 'attended';
      } else if (action === 'mark-no-show') {
        // Only valid after event has passed
        if (!isEventPast) {
          return res.status(400).json({ message: "No-show can only be marked after the event has ended" });
        }
        updates.attendanceStatus = 'no_show';
      } else if (action === 'mark-payment-waived') {
        if (!event.requiresPayment) {
          return res.status(400).json({ message: "This event does not require payment" });
        }
        updates.paymentStatus = 'waived';
        // Tell the guest their spot is confirmed — only on the transition.
        if (previousPaymentStatus !== 'waived') {
          sendPaymentWaivedEmailToRegistrant = true;
        }
      } else {
        return res.status(400).json({ message: "Invalid action" });
      }

      const updated = await dbStorage.updateEventRegistration(regId, updates);

      // Respond to the client immediately. All email sends below are
      // fire-and-forget so the API never blocks on Resend latency.
      res.json({ registration: updated });

      const eventTitle = event.title || 'the event';
      const eventDate = event.startAt
        ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      const eventStartTime = extractTimeStr(event.startAt);
      const coachDisplayName = profile.displayName || profile.username || 'Coach';
      const googleCalendarUrl = event.startAt
        ? buildGoogleCalendarUrlForEvent({
            title: event.title,
            start: new Date(event.startAt),
            end: event.endAt ? new Date(event.endAt) : null,
            description: `Confirmation Code: ${registration.confirmationCode || ''}`,
            location: event.location || '',
          })
        : null;

      // Resolve the guest portal URL once, lazily, only if any email needs it.
      const needsPortalUrl =
        sendPaymentRequestedEmailToRegistrant ||
        sendPaymentVerifiedEmailToRegistrant ||
        sendPaymentWaivedEmailToRegistrant;
      const portalUrlPromise: Promise<string | null> = needsPortalUrl
        ? dbStorage
            .getGuestProfileByEmail(registration.clientEmail)
            .then((gp) =>
              gp?.accessToken
                ? guestPortalLink({ token: gp.accessToken, registrationId: registration.id, tab: 'events' })
                : null,
            )
            .catch((e) => {
              console.error('[Dashboard Event Reg] portal lookup failed', e);
              return null;
            })
        : Promise.resolve(null);

      if (sendCancelEmailToGuest) {
        sendEventCancellationToGuest(
          registration.clientEmail,
          registration.clientName,
          eventTitle,
          eventDate,
          true,
        ).catch((e) => console.error('[Dashboard Cancel Reg] email failed', e));
      }

      if (sendPaymentRequestedEmailToRegistrant) {
        portalUrlPromise.then((guestPortalUrl) =>
          sendEventPaymentRequestedToRegistrant({
            registrantEmail: registration.clientEmail,
            registrantName: registration.clientName,
            coachName: coachDisplayName,
            eventTitle,
            eventDate,
            eventStartTime,
            paymentInstructions: event.paymentInstructions || null,
            guestPortalUrl,
          }).catch((e) => console.error('[Dashboard Event Reg] payment request email failed', e)),
        );
      }

      if (sendPaymentVerifiedEmailToRegistrant) {
        const isOnline = event.mode === 'online' || event.mode === 'hybrid';
        const isOffline = event.mode === 'offline' || event.mode === 'hybrid';
        portalUrlPromise.then((guestPortalUrl) =>
          sendEventPaymentVerifiedToRegistrant({
            registrantEmail: registration.clientEmail,
            registrantName: registration.clientName,
            coachName: coachDisplayName,
            eventTitle,
            eventDate,
            eventStartTime,
            eventEndTime: extractTimeStr(event.endAt),
            eventLocation: event.location || null,
            eventMeetingLink: event.meetingLink || null,
            isOnline,
            isOffline,
            confirmationCode: registration.confirmationCode || null,
            coachMessage: null,
            guestPortalUrl,
            googleCalendarUrl,
          }).catch((e) => console.error('[Dashboard Event Reg] payment verified email failed', e)),
        );
      }

      if (sendPaymentWaivedEmailToRegistrant) {
        portalUrlPromise.then((guestPortalUrl) =>
          sendEventPaymentWaivedToRegistrant({
            registrantEmail: registration.clientEmail,
            registrantName: registration.clientName,
            coachName: coachDisplayName,
            eventTitle,
            eventDate,
            eventStartTime,
            guestPortalUrl,
            googleCalendarUrl,
          }).catch((e) => console.error('[Dashboard Event Reg] payment waived email failed', e)),
        );
      }
      return;
    } catch (error) {
      console.error("Error updating registration:", error);
      res.status(500).json({ message: "Failed to update registration" });
    }
  });

  app.post('/api/dashboard/physical-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productData = insertPhysicalProductSchema.parse({ ...req.body, profileId: profile.id }) as any;
      const newProduct = await dbStorage.createPhysicalProduct(productData);
      res.json(newProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid physical product data", errors: error.errors });
      }
      console.error("Error creating physical product:", error);
      res.status(500).json({ message: "Failed to create physical product" });
    }
  });

  app.get('/api/dashboard/physical-products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const products = await dbStorage.getPhysicalProductsByProfileId(profile.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching physical products:", error);
      res.status(500).json({ message: "Failed to fetch physical products" });
    }
  });

  app.patch('/api/dashboard/physical-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productId = parseInt(req.params.id);
      const updateData = insertPhysicalProductSchema.partial().parse(req.body) as any;
      const updatedProduct = await dbStorage.updatePhysicalProduct(productId, updateData);
      res.json(updatedProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error updating physical product:", error);
      res.status(500).json({ message: "Failed to update physical product" });
    }
  });

  app.delete('/api/dashboard/physical-products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productId = parseInt(req.params.id);
      await dbStorage.deletePhysicalProduct(productId);
      res.json({ message: "Physical product deleted successfully" });
    } catch (error) {
      console.error("Error deleting physical product:", error);
      res.status(500).json({ message: "Failed to delete physical product" });
    }
  });

  // Blog management endpoints
  app.get('/api/dashboard/blog', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const blogPosts = await dbStorage.getAllBlogPostsByProfileId(profile.id);
      res.json(blogPosts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.post('/api/dashboard/blog', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Extract tagIds before parsing blog post data
      const { tagIds, ...bodyWithoutTags } = req.body;

      const postData = insertBlogPostSchema.parse({ ...bodyWithoutTags, profileId: profile.id });
      const newPost = await dbStorage.createBlogPost(postData);

      // Handle tags if provided
      if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
        await dbStorage.setBlogPostTags(newPost.id, tagIds);
      }

      res.json(newPost);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid blog post data", errors: error.errors });
      }
      console.error("Error creating blog post:", error);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  app.patch('/api/dashboard/blog/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const postId = parseInt(req.params.id);

      // Extract tagIds before parsing blog post data
      const { tagIds, ...bodyWithoutTags } = req.body;

      const updateData = insertBlogPostSchema.partial().parse(bodyWithoutTags);
      const updatedPost = await dbStorage.updateBlogPost(postId, updateData);

      // Handle tags if provided
      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setBlogPostTags(postId, tagIds);
      }

      res.json(updatedPost);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid blog post data", errors: error.errors });
      }
      console.error("Error updating blog post:", error);
      res.status(500).json({ message: "Failed to update blog post" });
    }
  });

  app.delete('/api/dashboard/blog/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const postId = parseInt(req.params.id);
      await dbStorage.deleteBlogPost(postId);
      res.json({ message: "Blog post deleted successfully" });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  });

  // Search routes
  app.get('/api/search/profiles', async (req, res) => {
    try {
      const searchParams = searchProfilesSchema.parse({
        query: req.query.q,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });

      const profiles = await dbStorage.searchProfiles(
        searchParams.query,
        searchParams.limit,
        searchParams.offset
      );

      res.json(profiles);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid search parameters", errors: error.errors });
      }
      console.error("Error searching profiles:", error);
      res.status(500).json({ message: "Failed to search profiles" });
    }
  });

  // Homepage discovery endpoints - fetch all public content with profile info
  // Note: profile.searchTags is auto-synced with consolidated tags from all content types
  // (sessions, events, blogs, digital products, physical products) via server-side triggers
  app.get('/api/discover/coaches', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      // Get all active profiles - the query now searches by name, title, location, and tags
      const profiles = await dbStorage.searchProfiles(query, limit, 0);

      // Return profiles with essential info for coach cards
      // searchTags contains all consolidated tags from sessions, events, blogs, and products
      // (automatically synced via the consolidated tags system)
      const coaches = profiles.map((profile: any) => ({
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        title: profile.title,
        shortBio: profile.shortBio || profile.bio,
        profileImageUrl: profile.profileImageUrl,
        searchableLocation: profile.searchableLocation,
        searchTags: profile.searchTags,
      }));

      res.json(coaches);
    } catch (error) {
      console.error("Error fetching coaches:", error);
      res.status(500).json({ message: "Failed to fetch coaches" });
    }
  });

  app.get('/api/discover/sessions', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      // Get all active sessions with their profile info
      const allSessions = await dbStorage.getAllPublicSessions(query, limit);

      res.json(allSessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get('/api/discover/events', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      // Get all active events with their profile info
      const allEvents = await dbStorage.getAllPublicEvents(query, limit);

      // Lazily extend any recurring series approaching window expiry.
      // Only re-fetch if at least one series actually generated new instances;
      // in the common case (buffer still valid) we skip the second round-trip.
      const discoverySeriesIds = Array.from(new Set(
        allEvents.filter(e => e.seriesId != null).map(e => e.seriesId as number)
      ));
      if (discoverySeriesIds.length > 0) {
        const extendResults = await Promise.all(
          discoverySeriesIds.map(sid => extendSeriesIfNeeded(sid).catch(err => {
            console.error(`[extendSeries] discovery events, series ${sid}:`, err);
            return false;
          }))
        );
        if (extendResults.some(Boolean)) {
          const freshEvents = await dbStorage.getAllPublicEvents(query, limit);
          return res.json(freshEvents);
        }
      }

      res.json(allEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Get event dates for calendar highlighting
  app.get('/api/discover/event-dates', async (req, res) => {
    try {
      const eventDates = await dbStorage.getEventDates();
      res.json(eventDates);
    } catch (error) {
      console.error("Error fetching event dates:", error);
      res.status(500).json({ message: "Failed to fetch event dates" });
    }
  });

  // Get available locations for coaches filtering
  app.get('/api/discover/locations/coaches', async (req, res) => {
    try {
      const locations = await dbStorage.getCoachLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching coach locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  // Get available locations for sessions filtering
  app.get('/api/discover/locations/sessions', async (req, res) => {
    try {
      const locations = await dbStorage.getSessionLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching session locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  // Get available locations for events filtering
  app.get('/api/discover/locations/events', async (req, res) => {
    try {
      const locations = await dbStorage.getEventLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching event locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  // Contact form endpoint (general platform contact) - sends to riplek2025@gmail.com
  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, phone, subject, message } = req.body;

      // Validate required fields
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      console.log('Contact form submission:', {
        name,
        email,
        phone,
        subject,
        message,
        timestamp: new Date().toISOString()
      });

      // Send email to platform email (riplek2025@gmail.com)
      try {
        await sendPlatformContactEmail(
          name,
          email,
          phone || null,
          subject,
          message
        );
        console.log('Platform contact email sent successfully');
      } catch (emailError) {
        console.error("Error sending platform contact email:", emailError);
        return res.status(502).json({ message: "Failed to send message. Please try again later." });
      }

      res.json({ message: "Thank you for your message. We'll get back to you soon!" });
    } catch (error) {
      console.error("Error handling contact form:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Profile-specific contact form - sends email to coach
  app.post('/api/profiles/:profileId/contact', async (req, res) => {
    try {
      const { profileId } = req.params;
      const { name, email, phone, subject, message } = req.body;

      // Validate required fields
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: "Please fill in all required fields" });
      }

      // Get the coach's profile to get their email
      const profile = await dbStorage.getProfileById(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      if (!profile.email) {
        return res.status(400).json({ message: "This coach has not set up their contact email" });
      }

      // Send email to the coach
      try {
        await sendContactMessageToCoach(
          profile.email,
          profile.displayName,
          name,
          email,
          phone || null,
          subject,
          message
        );
      } catch (emailError) {
        console.error("Error sending contact email:", emailError);
        // Don't fail the request if email fails, just log it
      }

      console.log('Profile contact form submission:', {
        profileId,
        coachEmail: profile.email,
        senderName: name,
        senderEmail: email,
        subject,
        timestamp: new Date().toISOString()
      });

      res.json({ message: "Your message has been sent! The coach will get back to you soon." });
    } catch (error) {
      console.error("Error handling profile contact form:", error);
      res.status(500).json({ message: "Failed to send message. Please try again." });
    }
  });

  // Create booking - status is now "pending" until coach confirms
  app.post('/api/bookings', async (req, res) => {
    // Hoist idempotency tracking outside try/catch so finally can always see it.
    const { sessionId, profileId, clientName, clientEmail, clientPhone, message, customQuestionAnswer, bookingDate, bookingTime, totalAmount, sessionMode, idempotencyKey } = req.body;
    let ikClaimed = false;
    let ikResolve: ((r: IKResult) => void) | null = null;
    const hasIK = typeof idempotencyKey === 'string' && idempotencyKey.length > 0;

    try {

      if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
        return res.status(400).json({ message: "Client name is required" });
      }
      if (clientName.trim().length > 200) {
        return res.status(400).json({ message: "Client name is too long" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!clientEmail || !emailRegex.test(clientEmail)) {
        return res.status(400).json({ message: "A valid email address is required" });
      }
      if (!sessionId || !profileId) {
        return res.status(400).json({ message: "Session and profile are required" });
      }
      if (!bookingDate || !bookingTime) {
        return res.status(400).json({ message: "Booking date and time are required" });
      }

      const session = await dbStorage.getBookingSessionById(sessionId);
      if (!session || session.profileId !== profileId) {
        return res.status(400).json({ message: "Invalid session" });
      }

      const serverTotalAmount = session.price || '0';
      if (String(totalAmount) !== String(serverTotalAmount)) {
        return res.status(400).json({ message: "Price mismatch. Please refresh and try again." });
      }

      const parsedBookingDate = new Date(bookingDate);
      if (isNaN(parsedBookingDate.getTime())) {
        return res.status(400).json({ message: "Invalid booking date" });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedBookingDate < today) {
        return res.status(400).json({ message: "Booking date must be in the future" });
      }

      const bookingTime24 = timeTo24h(bookingTime);

      // --------------- Atomic idempotency check (synchronous, no await) -----
      if (hasIK) {
        const bookingDateStr0 = parsedBookingDate.toISOString().split('T')[0];
        const fp = `${sessionId}:${profileId}:${bookingDateStr0}:${bookingTime24}:${(clientEmail as string).toLowerCase().trim()}`;
        const done = ikCompleted.get(idempotencyKey);
        if (done) {
          if (done.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          return res.status(done.res.status).json(done.res.body);
        }
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          if (flying.fp !== fp) {
            return res.status(422).json({ message: "Idempotency key reused with different parameters" });
          }
          const result = await flying.promise;
          return res.status(result.status).json(result.body);
        }
        let resolve!: (r: IKResult) => void;
        const promise = new Promise<IKResult>(r => { resolve = r; });
        ikInFlight.set(idempotencyKey, { fp, promise, resolve });
        ikClaimed = true;
        ikResolve = resolve;
      }
      // -----------------------------------------------------------------------

      // Duplicate booking check — same email, same session, same date+time, non-cancelled
      {
        const bookingDateStr0 = parsedBookingDate.toISOString().split('T')[0];
        const existingForSlot = await db
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.sessionId, sessionId),
              eq(bookingsTable.clientEmail, clientEmail),
              notInArray(bookingsTable.status, ['cancelled', 'declined']),
              sql`${bookingsTable.bookingDate} >= ${bookingDateStr0}::date AND ${bookingsTable.bookingDate} < ${bookingDateStr0}::date + interval '1 day'`
            )
          );
        const dupBooking = existingForSlot.find(b => timeTo24h(b.bookingTime) === bookingTime24);
        if (dupBooking) {
          return res.status(409).json({ message: "You already have a booking for this session at that date and time.", code: "ALREADY_BOOKED" });
        }
      }

      // Validate sessionMode - must be 'online' or 'offline', default to 'online'
      const validSessionMode = sessionMode === 'offline' ? 'offline' : 'online';

      // Find or create guest profile using resolver (platform-wide by email)
      const guestProfile = await dbStorage.getOrCreateGuestProfile(
        clientEmail,
        clientName.trim(),
        clientPhone || null,
        profileId // originCoachId - who brought them to the platform
      );
      console.log(`[Booking] Using guest profile #${guestProfile.id} for ${clientEmail}`);

      const confirmationCode = randomBytes(6).toString('hex').toUpperCase();

      const bookingData = {
        sessionId,
        profileId,
        guestProfileId: guestProfile.id,
        clientName: clientName.trim(),
        clientEmail,
        clientPhone: clientPhone || null,
        message: message || null,
        customQuestionAnswer: customQuestionAnswer || null,
        bookingDate: parsedBookingDate,
        bookingTime: bookingTime24,
        totalAmount: serverTotalAmount,
        confirmationCode,
        status: "pending",
        paymentStatus: "pending",
        sessionMode: validSessionMode
      };

      const bookingDateStr = parsedBookingDate.toISOString().split('T')[0];

      const newBooking = await db.transaction(async (tx) => {
        // Check for conflicts across ALL sessions for this coach on the same date+time
        // so that a slot booked via Session A is also blocked for Session B.
        const existingBookings = await tx
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.profileId, bookingData.profileId),
              notInArray(bookingsTable.status, ['cancelled', 'declined']),
              sql`${bookingsTable.bookingDate} >= ${bookingDateStr}::date AND ${bookingsTable.bookingDate} < ${bookingDateStr}::date + interval '1 day'`
            )
          );

        const hasConflict = existingBookings.some(b => {
          const existingTime24 = timeTo24h(b.bookingTime);
          return existingTime24 === bookingTime24;
        });
        if (hasConflict) {
          throw new Error('SLOT_CONFLICT');
        }

        const [created] = await tx.insert(bookingsTable).values(bookingData).returning();

        await tx.insert(bookingEventsTable).values({
          bookingId: created.id,
          eventType: 'booking_created',
          actorType: 'guest',
          message: `Booking requested by ${clientName.trim()}`,
          metadata: { clientName: clientName.trim(), clientEmail, sessionMode: validSessionMode },
        });

        if (created.totalAmount === '0.00' || created.totalAmount === '0') {
          await tx.insert(bookingEventsTable).values({
            bookingId: created.id,
            eventType: 'payment_completed',
            actorType: 'system',
            message: 'Free session',
          });
        }

        if (session?.customQuestion && customQuestionAnswer) {
          await tx.insert(bookingMessagesTable).values({
            bookingId: created.id,
            senderType: 'guest',
            message: `Q: ${session.customQuestion}\nA: ${customQuestionAnswer}`,
          });
        }

        if (message && message.trim()) {
          await tx.insert(bookingMessagesTable).values({
            bookingId: created.id,
            senderType: 'guest',
            message: message.trim(),
          });
        }

        return created;
      });

      const profile = await dbStorage.getProfileById(profileId);

      // Get coach email - try profile first, then fall back to Supabase auth
      let coachEmail = profile?.email;
      if (!coachEmail && supabase) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(profileId);
          coachEmail = user?.email || null;
          console.log(`[Booking] Fetched coach email from Supabase auth: ${coachEmail}`);
        } catch (authError) {
          console.error(`[Booking] Error fetching coach email from Supabase auth:`, authError);
        }
      }

      const formattedDate = new Date(bookingDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Send booking pending email to client
      console.log(`[Booking] Booking #${newBooking.id} (session: ${sessionId}, code: ${confirmationCode}) - Sending pending email to client: ${clientEmail}`);
      try {
        await sendBookingPendingToClient(
          clientEmail,
          clientName,
          profile?.displayName || 'Your Coach',
          session?.title || 'Session',
          formattedDate,
          bookingTime,
          confirmationCode,
          guestProfile?.accessToken || null,
          newBooking.id
        );
        console.log(`[Booking] Booking #${newBooking.id} - Client pending email sent successfully`);
      } catch (emailError) {
        console.error(`[Booking] Booking #${newBooking.id} - Error sending pending email to client:`, emailError);
        try {
          await dbStorage.createBookingEvent({
            bookingId: newBooking.id,
            eventType: 'email_failed',
            actorType: 'system',
            message: 'Failed to send booking pending email to client',
            metadata: { emailType: 'booking_pending', recipient: clientEmail },
          });
        } catch { }
      }

      // Get location info for email if this is an offline session
      let locationInfo: LocationInfo | null = null;
      let locationVisibility: LocationVisibility | null = null;

      if (validSessionMode === 'offline' && session?.locationId) {
        const location = await dbStorage.getLocationById(session.locationId);
        if (location) {
          locationInfo = {
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            country: location.country,
            googleMapsUrl: location.googleMapsUrl
          };
          locationVisibility = {
            showLocationName: session.showLocationName ?? true,
            showStreetAddress: session.showStreetAddress ?? false,
            showMapLocation: session.showMapLocation ?? false
          };
        }
      }

      // Send booking request email to coach
      if (coachEmail) {
        console.log(`[Booking] Booking #${newBooking.id} - Sending request email to coach: ${coachEmail}`);
        try {
          await sendBookingRequestToCoach(
            coachEmail,
            profile?.displayName || null,
            clientName,
            clientEmail,
            clientPhone || null,
            session?.title || 'Session',
            formattedDate,
            bookingTime,
            confirmationCode,
            message || null,
            sessionId,
            validSessionMode,
            locationInfo,
            locationVisibility,
            newBooking.id
          );
          console.log(`[Booking] Booking #${newBooking.id} - Coach request email sent successfully`);
        } catch (emailError) {
          console.error(`[Booking] Booking #${newBooking.id} - Error sending request email to coach:`, emailError);
          try {
            await dbStorage.createBookingEvent({
              bookingId: newBooking.id,
              eventType: 'email_failed',
              actorType: 'system',
              message: 'Failed to send booking request email to coach',
              metadata: { emailType: 'booking_request', recipient: coachEmail },
            });
          } catch { }
        }
      } else {
        console.log(`[Booking] Booking #${newBooking.id} - No coach email found, skipping notification`);
      }

      // Push SSE notification to coach if they have an active dashboard tab open
      try {
        notifyCoach(profileId, {
          type: 'new_booking',
          bookingId: newBooking.id,
          clientName,
          sessionTitle: session?.title || 'Session',
          bookingDate: formattedDate,
          bookingTime: bookingTime24,
          confirmationCode,
        });
      } catch {}
      
      const successBody = {
        success: true,
        booking: newBooking,
        confirmationCode: newBooking.confirmationCode,
        guestAccessToken: guestProfile.accessToken
      };
      res.json(successBody);

      // Resolve idempotency slot — cache the success result and wake up any
      // concurrent waiters.
      if (hasIK && ikResolve) {
        const bookingDateStr0 = parsedBookingDate.toISOString().split('T')[0];
        const fp = `${sessionId}:${profileId}:${bookingDateStr0}:${bookingTime24}:${(clientEmail as string).toLowerCase().trim()}`;
        const ikRes: IKResult = { status: 200, body: successBody };
        ikCompleted.set(idempotencyKey, { fp, res: ikRes, expiresAt: Date.now() + 5 * 60 * 1000 });
        ikClaimed = false;
        ikResolve(ikRes);
        ikInFlight.delete(idempotencyKey);
      }
    } catch (error: any) {
      if (error?.message === 'SLOT_CONFLICT') {
        if (!res.headersSent) res.status(409).json({ message: "This time slot is already booked. Please choose a different time." });
        return;
      }
      console.error("Error creating booking:", error);
      if (!res.headersSent) res.status(500).json({ message: "Failed to create booking" });
    } finally {
      if (ikClaimed && hasIK) {
        const flying = ikInFlight.get(idempotencyKey);
        if (flying) {
          flying.resolve({ status: 500, body: { message: "Failed to create booking" } });
          ikInFlight.delete(idempotencyKey);
        }
        ikClaimed = false;
      }
    }
  });

  // Get booking by confirmation code
  app.get('/api/bookings/:confirmationCode', async (req, res) => {
    try {
      const { confirmationCode } = req.params;
      const booking = await dbStorage.getBookingByConfirmationCode(confirmationCode);

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      res.json(booking);
    } catch (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  // =================== GUEST PORTAL API ENDPOINTS ===================

  // Get guest dashboard by magic link token (with expiry validation)
  app.get('/api/guest/dashboard/:magicLinkToken', async (req, res) => {
    try {
      const { magicLinkToken } = req.params;
      console.log(`[GuestPortal] Looking up guest profile with magic link token`);
      const guestProfile = await dbStorage.getGuestProfileByMagicLinkToken(magicLinkToken);

      if (!guestProfile) {
        return res.status(404).json({ message: "Invalid magic link" });
      }

      // Check if magic link has expired
      if (guestProfile.magicLinkExpiresAt && new Date(guestProfile.magicLinkExpiresAt) < new Date()) {
        return res.status(401).json({ message: "Magic link has expired. Please request a new one." });
      }

      // Fetch all activities in parallel
       // Purchases: prefer guestProfileId linkage; fall back to email for legacy records
       const [guestBookings, guestEventRegistrations, guestPurchasesByProfile, guestPurchasesByEmail] = await Promise.all([
         dbStorage.getBookingsByGuestProfileId(guestProfile.id),
         dbStorage.getEventRegistrationsByGuestProfileId(guestProfile.id),
         dbStorage.getDigitalProductPurchasesByGuestProfileId(guestProfile.id),
         dbStorage.getDigitalProductPurchasesByEmail(guestProfile.email)
       ]);
       const profilePurchaseIds = new Set(guestPurchasesByProfile.map((p) => p.id));
       const guestPurchases = [
         ...guestPurchasesByProfile,
         ...guestPurchasesByEmail.filter((p) => !profilePurchaseIds.has(p.id)),
       ];

      // Get origin coach profile info (if available)
      const originCoach = guestProfile.originCoachId
        ? await dbStorage.getProfileById(guestProfile.originCoachId)
        : null;

      // Enrich bookings with session and coach info
      const enrichedBookings = await Promise.all(guestBookings.map(async (booking) => {
        const [session, coach, unreadCount, bookingEvts] = await Promise.all([
          dbStorage.getBookingSessionById(booking.sessionId),
          dbStorage.getProfileById(booking.profileId),
          dbStorage.getUnreadMessageCount(booking.id, 'guest'),
          dbStorage.getBookingEventsByBookingId(booking.id)
        ]);
        const guestRescheduleUsed = bookingEvts.some(e => e.eventType === 'rescheduled_by_guest');
        const lastRejection = [...bookingEvts].reverse().find(e => e.eventType === 'payment_rejected');
        const paymentRejectionReason = lastRejection?.metadata && typeof lastRejection.metadata === 'object' && 'reason' in lastRejection.metadata
          ? (lastRejection.metadata as any).reason
          : lastRejection?.message || null;
        return {
          type: 'booking' as const,
          id: booking.id,
          date: booking.bookingDate,
          status: booking.status,
          title: session?.title || 'Session',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...booking, session, guestRescheduleUsed, paymentRejectionReason },
          unreadMessageCount: unreadCount
        };
      }));

      // Enrich event registrations with event and coach info
      const enrichedEvents = await Promise.all(guestEventRegistrations.map(async (registration) => {
        const [event, coach] = await Promise.all([
          dbStorage.getEventById(registration.eventId),
          dbStorage.getProfileById(registration.profileId)
        ]);
        return {
          type: 'event' as const,
          id: registration.id,
          date: event?.date || registration.createdAt,
          status: registration.status,
          title: event?.title || 'Event',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...registration, event }
        };
      }));

      // Enrich purchases with product and coach info
      const enrichedPurchases = await Promise.all(guestPurchases.map(async (purchase) => {
        const product = await dbStorage.getDigitalProductById(purchase.productId);
        const coach = product ? await dbStorage.getProfileById(product.profileId) : null;
        return {
          type: 'purchase' as const,
          id: purchase.id,
          date: purchase.createdAt,
          status: purchase.status,
          title: product?.title || 'Product',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...purchase, product }
        };
      }));

      // Combine and sort all activities by date (earliest first)
      const activityFeed = [...enrichedBookings, ...enrichedEvents, ...enrichedPurchases]
        .sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateA - dateB;
        });

      res.json({
        guestProfile: {
          id: guestProfile.id,
          email: guestProfile.email,
          name: guestProfile.name,
          phone: guestProfile.phone,
          createdAt: guestProfile.createdAt
        },
        originCoach: originCoach ? {
          id: originCoach.id,
          displayName: originCoach.displayName,
          username: originCoach.username,
          profileImageUrl: originCoach.profileImageUrl,
          contactInfo: originCoach.contactInfo
        } : null,
        activityFeed,
        bookings: enrichedBookings,
        eventRegistrations: enrichedEvents,
        purchases: enrichedPurchases,
        stats: {
          totalBookings: guestBookings.length,
          totalEvents: guestEventRegistrations.length,
          totalPurchases: guestPurchases.length
        }
      });
    } catch (error) {
      console.error("Error fetching guest dashboard:", error);
      res.status(500).json({ message: "Failed to fetch guest dashboard" });
    }
  });

  // Get guest profile and unified activity feed by access token
  app.get('/api/guest/:accessToken', async (req, res) => {
    try {
      const { accessToken } = req.params;
      console.log(`[GuestPortal] Looking up guest profile by access token`);
      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      console.log(`[GuestPortal] Guest profile result:`, guestProfile ? `Found #${guestProfile.id}` : 'Not found');

      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      // Fetch all activities in parallel
       // Purchases: prefer guestProfileId linkage; fall back to email for legacy records
       const [guestBookings, guestEventRegistrations, guestPurchasesByProfile2, guestPurchasesByEmail2] = await Promise.all([
         dbStorage.getBookingsByGuestProfileId(guestProfile.id),
         dbStorage.getEventRegistrationsByGuestProfileId(guestProfile.id),
         dbStorage.getDigitalProductPurchasesByGuestProfileId(guestProfile.id),
         dbStorage.getDigitalProductPurchasesByEmail(guestProfile.email)
       ]);
       const profilePurchaseIds2 = new Set(guestPurchasesByProfile2.map((p) => p.id));
       const guestPurchases = [
         ...guestPurchasesByProfile2,
         ...guestPurchasesByEmail2.filter((p) => !profilePurchaseIds2.has(p.id)),
       ];

      // Get origin coach profile info (if available)
      const originCoach = guestProfile.originCoachId
        ? await dbStorage.getProfileById(guestProfile.originCoachId)
        : null;

      // Enrich bookings with session and coach info
      const enrichedBookings = await Promise.all(guestBookings.map(async (booking) => {
        const [session, coach, unreadCount, bookingEvts] = await Promise.all([
          dbStorage.getBookingSessionById(booking.sessionId),
          dbStorage.getProfileById(booking.profileId),
          dbStorage.getUnreadMessageCount(booking.id, 'guest'),
          dbStorage.getBookingEventsByBookingId(booking.id)
        ]);
        const guestRescheduleUsed = bookingEvts.some(e => e.eventType === 'rescheduled_by_guest');
        const lastRejection = [...bookingEvts].reverse().find(e => e.eventType === 'payment_rejected');
        const paymentRejectionReason = lastRejection?.metadata && typeof lastRejection.metadata === 'object' && 'reason' in lastRejection.metadata
          ? (lastRejection.metadata as any).reason
          : lastRejection?.message || null;
        return {
          type: 'booking' as const,
          id: booking.id,
          date: booking.bookingDate,
          status: booking.status,
          title: session?.title || 'Session',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...booking, session, guestRescheduleUsed, paymentRejectionReason },
          unreadMessageCount: unreadCount
        };
      }));

      // Enrich event registrations with event and coach info
      const enrichedEvents = await Promise.all(guestEventRegistrations.map(async (registration) => {
        const [event, coach] = await Promise.all([
          dbStorage.getEventById(registration.eventId),
          dbStorage.getProfileById(registration.profileId)
        ]);
        return {
          type: 'event' as const,
          id: registration.id,
          date: event?.date || registration.createdAt,
          status: registration.status,
          title: event?.title || 'Event',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...registration, event }
        };
      }));

      // Enrich purchases with product and coach info
      const enrichedPurchases = await Promise.all(guestPurchases.map(async (purchase) => {
        const product = await dbStorage.getDigitalProductById(purchase.productId);
        const coach = product ? await dbStorage.getProfileById(product.profileId) : null;
        return {
          type: 'purchase' as const,
          id: purchase.id,
          date: purchase.createdAt,
          status: purchase.status,
          title: product?.title || 'Product',
          coach: coach ? { id: coach.id, displayName: coach.displayName, username: coach.username, profileImageUrl: coach.profileImageUrl, timezone: coach.timezone } : null,
          data: { ...purchase, product }
        };
      }));

      // Combine and sort all activities by date (earliest first)
      const activityFeed = [...enrichedBookings, ...enrichedEvents, ...enrichedPurchases]
        .sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateA - dateB;
        });

      const safeGuestProfile = {
        id: guestProfile.id,
        email: guestProfile.email,
        name: guestProfile.name,
        phone: guestProfile.phone,
        originCoachId: guestProfile.originCoachId,
        createdAt: guestProfile.createdAt,
      };

      res.json({
        guestProfile: safeGuestProfile,
        originCoach: originCoach ? {
          id: originCoach.id,
          displayName: originCoach.displayName,
          username: originCoach.username,
          profileImageUrl: originCoach.profileImageUrl,
          contactInfo: originCoach.contactInfo
        } : null,
        activityFeed,
        bookings: enrichedBookings,
        eventRegistrations: enrichedEvents,
        purchases: enrichedPurchases,
        stats: {
          totalBookings: guestBookings.length,
          totalEvents: guestEventRegistrations.length,
          totalPurchases: guestPurchases.length
        }
      });
    } catch (error) {
      console.error("Error fetching guest portal data:", error);
      res.status(500).json({ message: "Failed to fetch guest data" });
    }
  });

  // Lightweight endpoint for the /complete-payment screen.
  // Returns just the single registration or purchase + the related event/product
  // so the page can render in well under 1s instead of waiting for the full
  // guest portal activity feed (bookings, events, purchases, stats, origin coach).
  app.get('/api/guest/:accessToken/payment-context', async (req, res) => {
    try {
      const { accessToken } = req.params;
      const type = String(req.query.type || '');
      const idStr = String(req.query.id || '');
      const id = parseInt(idStr, 10);

      if ((type !== 'registration' && type !== 'purchase') || !id || isNaN(id)) {
        return res.status(400).json({ message: 'Invalid type or id' });
      }

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: 'Guest profile not found' });
      }

      const safeGuestProfile = {
        id: guestProfile.id,
        email: guestProfile.email,
        name: guestProfile.name,
      };

      if (type === 'registration') {
        const registration = await dbStorage.getEventRegistrationById(id);
        if (!registration || registration.guestProfileId !== guestProfile.id) {
          return res.status(404).json({ message: 'Registration not found' });
        }
        const event = await dbStorage.getEventById(registration.eventId);
        return res.json({
          guestProfile: safeGuestProfile,
          registration: { ...registration, event: event || null },
        });
      }

      // type === 'purchase'
      const purchase = await dbStorage.getProductPurchaseById(id);
      if (!purchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }
      const isOwnedByProfile = purchase.guestProfileId === guestProfile.id;
      const isOwnedByEmail =
        !purchase.guestProfileId &&
        purchase.email &&
        guestProfile.email &&
        purchase.email.toLowerCase() === guestProfile.email.toLowerCase();
      if (!isOwnedByProfile && !isOwnedByEmail) {
        return res.status(404).json({ message: 'Purchase not found' });
      }
      const product = await dbStorage.getDigitalProductById(purchase.productId);
      return res.json({
        guestProfile: safeGuestProfile,
        purchase: { ...purchase, product: product || null },
      });
    } catch (error) {
      console.error('Error fetching guest payment context:', error);
      res.status(500).json({ message: 'Failed to fetch payment context' });
    }
  });

  // Client cancels booking
  app.post('/api/guest/:accessToken/bookings/:bookingId/cancel', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.status === 'cancelled') {
        return res.status(400).json({ message: "Booking is already cancelled" });
      }

      // Check 24-hour restriction for guest cancellations using coach's timezone
      const coachProfileForTz = await dbStorage.getProfileById(booking.profileId);
      const coachTz = coachProfileForTz?.timezone || 'UTC';
      const now = new Date();
      const hoursUntilBooking = getHoursUntilBooking(booking.bookingDate, booking.bookingTime, coachTz, now);

      if (hoursUntilBooking < 24) {
        return res.status(400).json({
          message: "Cancellations must be made at least 24 hours before the session",
          code: "TOO_CLOSE_TO_SESSION"
        });
      }

      const updatedBooking = await dbStorage.updateBookingConditional(booking.id, {
        status: 'cancelled',
        cancelledBy: 'client',
        cancellationReason: reason.trim(),
        cancelledAt: new Date()
      }, booking.status);

      if (!updatedBooking) {
        return res.status(409).json({ message: "Booking was already modified by another action. Please refresh and try again." });
      }

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'cancelled_by_guest',
          actorType: 'guest',
          message: reason.trim(),
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'guest',
          message: `Session cancelled by ${booking.clientName}: ${reason.trim()}`,
        });
      } catch (msgError) {
        console.error("Error creating cancellation message (non-fatal):", msgError);
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);
      const coachProfile = await dbStorage.getProfileById(booking.profileId);

      // Get coach email
      let coachEmail = coachProfile?.email;
      if (!coachEmail && supabase) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(booking.profileId);
          coachEmail = user?.email || null;
        } catch (authError) {
          console.error("Error fetching coach email:", authError);
        }
      }

      // Send cancellation email to coach
      if (coachEmail) {
        const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        await sendCancellationToCoach(
          coachEmail,
          coachProfile?.displayName || 'Coach',
          booking.clientName,
          booking.clientEmail,
          session?.title || 'Session',
          formattedDate,
          booking.bookingTime,
          reason.trim(),
          booking.sessionId,
          booking.id
        );
      }

      // Web Push notification (works even when tab is closed)
      sendPushToCoach(booking.profileId, {
        title: 'Session Booking Cancelled',
        body: `${booking.clientName} cancelled their booking for ${session?.title || 'a session'}.`,
        tag: `booking-cancelled-${booking.id}`,
      }).catch((e) => console.error('[Cancel Booking] coach push notify failed', e));

      res.json({ success: true, booking: updatedBooking });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // Client reschedules booking
  app.post('/api/guest/:accessToken/bookings/:bookingId/reschedule', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;
      const { newDate, newTime, message } = req.body;

      if (!newDate || !newTime) {
        return res.status(400).json({ message: "New date and time are required" });
      }

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (['cancelled', 'declined', 'completed'].includes(booking.status)) {
        return res.status(400).json({ message: `Cannot reschedule a ${booking.status} booking` });
      }

      const priorGuestReschedules = await dbStorage.getBookingEventsByBookingId(booking.id);
      const alreadyRescheduled = priorGuestReschedules.some(e => e.eventType === 'rescheduled_by_guest');
      if (alreadyRescheduled) {
        return res.status(400).json({ message: "You have already rescheduled this booking. Only one reschedule is allowed." });
      }

      // Check 24-hour restriction for guest reschedules using coach's timezone
      const coachProfileForTz = await dbStorage.getProfileById(booking.profileId);
      const coachTz = coachProfileForTz?.timezone || 'UTC';
      const now = new Date();
      const hoursUntilBooking = getHoursUntilBooking(booking.bookingDate, booking.bookingTime, coachTz, now);

      if (hoursUntilBooking < 24) {
        return res.status(400).json({
          message: "Reschedule requests must be made at least 24 hours before the session",
          code: "TOO_CLOSE_TO_SESSION"
        });
      }

      const originalDate = booking.bookingDate;

      const newTime24 = timeTo24h(newTime);

      const parsedNewDate = new Date(newDate);
      const newDateStr = parsedNewDate.toISOString().split('T')[0];
      const existingBookings = await dbStorage.getBookingsBySessionId(booking.sessionId);
      const hasConflict = existingBookings.some(b => {
        if (b.id === booking.id) return false;
        if (b.status === 'cancelled' || b.status === 'declined') return false;
        const existingDateStr = new Date(b.bookingDate).toISOString().split('T')[0];
        const existingTime24 = timeTo24h(b.bookingTime);
        return existingDateStr === newDateStr && existingTime24 === newTime24;
      });
      if (hasConflict) {
        return res.status(409).json({ message: "This time slot is already booked. Please choose a different time." });
      }

      const rescheduleUpdates: any = {
        bookingDate: parsedNewDate,
        bookingTime: newTime24,
        rescheduledFrom: originalDate,
        rescheduledFromTime: booking.bookingTime,
        rescheduledBy: 'client',
        status: 'pending',
      };
      const updatedBooking = await dbStorage.updateBookingConditional(booking.id, rescheduleUpdates, booking.status);

      if (!updatedBooking) {
        return res.status(409).json({ message: "Booking was already modified by another action. Please refresh and try again." });
      }

      await dbStorage.createBookingEvent({
        bookingId: booking.id,
        eventType: 'rescheduled_by_guest',
        actorType: 'guest',
        message: message || 'Guest requested a new time',
        metadata: { oldDate: originalDate, oldTime: booking.bookingTime, newDate, newTime },
      });

      try {
        const oldFormatted = new Date(originalDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        let rescheduleMsg = `Reschedule requested: from ${oldFormatted} at ${booking.bookingTime} to ${new Date(newDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${newTime}`;
        if (message && message.trim()) {
          rescheduleMsg += `\n${message.trim()}`;
        }
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'guest',
          message: rescheduleMsg,
        });
      } catch (msgError) {
        console.error("Error creating reschedule message (non-fatal):", msgError);
      }

      // Get session and coach details for notification email
      const session = await dbStorage.getBookingSessionById(booking.sessionId);
      const coachProfile = await dbStorage.getProfileById(booking.profileId);

      // Get coach email
      let coachEmail = coachProfile?.email;
      if (!coachEmail && supabase) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(booking.profileId);
          coachEmail = user?.email || null;
        } catch (authError) {
          console.error("Error fetching coach email:", authError);
        }
      }

      // Send reschedule notification email to coach
      if (coachEmail) {
        const oldFormattedDate = new Date(originalDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const newFormattedDate = new Date(newDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        await sendRescheduleToCoach(
          coachEmail,
          coachProfile?.displayName || 'Coach',
          booking.clientName,
          booking.clientEmail,
          session?.title || 'Session',
          oldFormattedDate,
          booking.bookingTime,
          newFormattedDate,
          newTime,
          message || null,
          booking.sessionId,
          booking.id
        );
      }

      res.json({ success: true, booking: updatedBooking });
    } catch (error) {
      console.error("Error rescheduling booking:", error);
      res.status(500).json({ message: "Failed to reschedule booking" });
    }
  });

  // Get messages for a booking (guest access)
  app.get('/api/guest/:accessToken/bookings/:bookingId/messages', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const messages = await dbStorage.getMessagesByBookingId(booking.id);

      // Mark coach messages as read
      await dbStorage.markMessagesAsRead(booking.id, 'guest');

      res.json(messages);
    } catch (error) {
      console.error("Error fetching booking messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send message for a booking (guest access)
  app.post('/api/guest/:accessToken/bookings/:bookingId/messages', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;
      const { message } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const newMessage = await dbStorage.createBookingMessage({
        bookingId: booking.id,
        senderType: 'guest',
        message: message.trim()
      });

      try {
        const profile = await dbStorage.getProfileById(booking.profileId);
        const session = booking.sessionId ? await dbStorage.getBookingSessionById(booking.sessionId) : null;
        let coachEmail = profile?.email || null;
        if (!coachEmail) {
          try {
            const { data: { user } } = await supabase.auth.admin.getUserById(booking.profileId);
            coachEmail = user?.email || null;
          } catch (e) {
            console.error("Error looking up coach email from Supabase (non-fatal):", e);
          }
        }
        if (coachEmail) {
          const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });
          await sendBookingMessageToCoach(
            coachEmail,
            profile?.displayName || null,
            booking.clientName,
            booking.clientEmail,
            session?.title || 'Session',
            formattedDate,
            booking.bookingTime,
            message.trim(),
            booking.id
          );
        }
      } catch (emailError) {
        console.error("Error sending message notification email to coach (non-fatal):", emailError);
      }

      res.json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // =================== COACH BOOKING MANAGEMENT ENDPOINTS ===================

  // Coach cancels booking
  app.post('/api/dashboard/bookings/:bookingId/cancel', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.profileId !== userId) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.status === 'cancelled') {
        return res.status(400).json({ message: "Booking is already cancelled" });
      }

      const updatedBooking = await dbStorage.updateBookingConditional(booking.id, {
        status: 'cancelled',
        cancelledBy: 'coach',
        cancellationReason: reason.trim(),
        cancelledAt: new Date()
      }, booking.status);

      if (!updatedBooking) {
        return res.status(409).json({ message: "Booking was already modified by another action. Please refresh and try again." });
      }

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'cancelled_by_coach',
          actorType: 'coach',
          message: reason.trim(),
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'coach',
          message: `Session cancelled by coach: ${reason.trim()}`,
        });
      } catch (msgError) {
        console.error("Error creating cancellation message (non-fatal):", msgError);
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);
      const coachProfile = await dbStorage.getProfileById(userId);

      let guestProfile = null;
      if (booking.guestProfileId) {
        guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
      }

      // Send cancellation email to client with "Contact Coach" button
      const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      await sendCancellationToClient(
        booking.clientEmail,
        booking.clientName,
        coachProfile?.displayName || 'Your Coach',
        coachProfile?.username || '',
        session?.title || 'Session',
        formattedDate,
        booking.bookingTime,
        reason.trim(),
        coachProfile?.contactInfo || null,
        guestProfile?.accessToken || null,
        booking.id
      );

      res.json({ success: true, booking: updatedBooking });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // Coach gets messages for a booking
  app.get('/api/dashboard/bookings/:bookingId/messages', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.profileId !== userId) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const messages = await dbStorage.getMessagesByBookingId(booking.id);

      // Mark guest messages as read
      await dbStorage.markMessagesAsRead(booking.id, 'coach');

      res.json(messages);
    } catch (error) {
      console.error("Error fetching booking messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Coach sends message for a booking
  app.post('/api/dashboard/bookings/:bookingId/messages', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;
      const { message } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.profileId !== userId) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const newMessage = await dbStorage.createBookingMessage({
        bookingId: booking.id,
        senderType: 'coach',
        message: message.trim()
      });

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'message_sent',
          actorType: 'coach',
          message: 'Coach sent a message',
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        const profile = await dbStorage.getProfileById(userId);
        const session = booking.sessionId ? await dbStorage.getBookingSessionById(booking.sessionId) : null;
        let guestAccessToken: string | null = null;
        if (booking.guestProfileId) {
          const guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
          guestAccessToken = guestProfile?.accessToken || null;
        }
        const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        await sendBookingMessageToGuest(
          booking.clientEmail,
          booking.clientName,
          profile?.displayName || 'Your Coach',
          session?.title || 'Session',
          formattedDate,
          booking.bookingTime,
          message.trim(),
          guestAccessToken,
          booking.id
        );
      } catch (emailError) {
        console.error("Error sending message notification email to guest (non-fatal):", emailError);
      }

      res.json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Session management endpoints
  app.get('/api/dashboard/sessions', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessions = await dbStorage.getBookingSessionsByProfileId(profile.id);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post('/api/dashboard/sessions', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Check if this is the first session for this profile
      const existingSessions = await dbStorage.getBookingSessionsByProfileId(profile.id);
      const isFirstSession = existingSessions.length === 0;

      const sessionData = {
        profileId: profile.id,
        title: req.body.title,
        description: req.body.description,
        thumbnailDescription: req.body.thumbnailDescription,
        testimonials: req.body.testimonials,
        duration: parseInt(req.body.duration),
        price: parseFloat(req.body.price).toString(),
        currency: req.body.currency || 'USD',
        isFree: req.body.isFree || false,
        images: req.body.images || [],
        customQuestion: req.body.customQuestion || null,
        isActive: true,
        isFeatured: isFirstSession, // Automatically feature the first session
        // Location fields
        isOnline: req.body.isOnline ?? true,
        isOffline: req.body.isOffline ?? false,
        locationId: req.body.locationId || null,
        locationUrl: req.body.locationUrl || null,
        showExactLocation: req.body.showExactLocation ?? true,
        featuredImageFocalX: req.body.featuredImageFocalX != null ? parseFloat(req.body.featuredImageFocalX) : null,
        featuredImageFocalY: req.body.featuredImageFocalY != null ? parseFloat(req.body.featuredImageFocalY) : null,
      };

      const newSession = await dbStorage.createBookingSession(sessionData);

      // Handle tags if provided
      if (req.body.tagIds && Array.isArray(req.body.tagIds) && req.body.tagIds.length > 0) {
        await dbStorage.setSessionTags(newSession.id, req.body.tagIds);
      }

      res.json(newSession);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.patch('/api/dashboard/sessions/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);

      // Extract tagIds before parsing with schema
      const { tagIds, ...bodyWithoutTags } = req.body;

      const updateData = insertBookingSessionSchema.partial().parse(bodyWithoutTags) as any;
      // Explicitly normalize focal point values to match CREATE route handling
      if (req.body.featuredImageFocalX != null) updateData.featuredImageFocalX = parseFloat(req.body.featuredImageFocalX);
      if (req.body.featuredImageFocalY != null) updateData.featuredImageFocalY = parseFloat(req.body.featuredImageFocalY);
      const updatedSession = await dbStorage.updateBookingSession(sessionId, updateData);

      // Handle tags if provided
      if (tagIds && Array.isArray(tagIds)) {
        await dbStorage.setSessionTags(sessionId, tagIds);
      }

      res.json(updatedSession);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid session data", errors: error.errors });
      }
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  app.delete('/api/dashboard/sessions/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);
      const session = await dbStorage.getBookingSessionById(sessionId);

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const wasFeatured = session.isFeatured;
      await dbStorage.deleteBookingSession(sessionId);

      // If we deleted the featured session, promote another one
      if (wasFeatured) {
        const remainingSessions = await dbStorage.getBookingSessionsByProfileId(profile.id);
        if (remainingSessions.length > 0) {
          await dbStorage.updateBookingSession(remainingSessions[0].id, { isFeatured: true });
        }
      }

      res.json({ message: "Session deleted successfully" });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  // Toggle featured status of a session
  app.post('/api/dashboard/sessions/:id/feature', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);
      const session = await dbStorage.getBookingSessionById(sessionId);

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Unfeatured ALL OTHER sessions for this profile first to ensure only one is featured
      const allSessions = await dbStorage.getBookingSessionsByProfileId(profile.id);
      for (const s of allSessions) {
        if (s.id !== sessionId && s.isFeatured) {
          await dbStorage.updateBookingSession(s.id, { isFeatured: false });
        }
      }

      // Feature this session (unconditionally)
      const updatedSession = await dbStorage.updateBookingSession(sessionId, { isFeatured: true });
      res.json(updatedSession);
    } catch (error) {
      console.error("Error featuring session:", error);
      res.status(500).json({ message: "Failed to feature session" });
    }
  });

  // Toggle featured status of an event
  app.post('/api/dashboard/events/:id/feature', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const eventId = parseInt(req.params.id);
      const event = await dbStorage.getEventById(eventId);

      if (!event || event.profileId !== profile.id) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Unfeature ALL OTHER events for this profile first to ensure only one is featured
      const allEvents = await dbStorage.getEventsByProfileId(profile.id);
      for (const e of allEvents) {
        if (e.id !== eventId && e.isFeatured) {
          await dbStorage.updateEvent(e.id, { isFeatured: false });
        }
      }

      // Feature this event (unconditionally)
      const updatedEvent = await dbStorage.updateEvent(eventId, { isFeatured: true });
      res.json(updatedEvent);
    } catch (error) {
      console.error("Error featuring event:", error);
      res.status(500).json({ message: "Failed to feature event" });
    }
  });

  // Toggle featured status of a blog post
  app.post('/api/dashboard/blogs/:id/feature', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const blogId = parseInt(req.params.id);
      const blog = await dbStorage.getBlogPostById(blogId);

      if (!blog || blog.profileId !== profile.id) {
        return res.status(404).json({ message: "Blog post not found" });
      }

      // Unfeature ALL OTHER blog posts for this profile first to ensure only one is featured
      const allBlogs = await dbStorage.getBlogPostsByProfileId(profile.id);
      for (const b of allBlogs) {
        if (b.id !== blogId && b.isFeatured) {
          await dbStorage.updateBlogPost(b.id, { isFeatured: false });
        }
      }

      // Feature this blog post (unconditionally)
      const updatedBlog = await dbStorage.updateBlogPost(blogId, { isFeatured: true });
      res.json(updatedBlog);
    } catch (error) {
      console.error("Error featuring blog post:", error);
      res.status(500).json({ message: "Failed to feature blog post" });
    }
  });

  // Toggle featured status of a digital product
  app.post('/api/dashboard/products/:id/feature', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const productId = parseInt(req.params.id);
      const product = await dbStorage.getDigitalProductById(productId);

      if (!product || product.profileId !== profile.id) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Unfeature ALL OTHER products for this profile first to ensure only one is featured
      const allProducts = await dbStorage.getDigitalProductsByProfileId(profile.id);
      for (const p of allProducts) {
        if (p.id !== productId && p.isFeatured) {
          await dbStorage.updateDigitalProduct(p.id, { isFeatured: false });
        }
      }

      // Feature this product (unconditionally)
      const updatedProduct = await dbStorage.updateDigitalProduct(productId, { isFeatured: true });
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error featuring product:", error);
      res.status(500).json({ message: "Failed to feature product" });
    }
  });

  // Add image to session
  app.post('/api/dashboard/sessions/:id/images', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);
      const session = await dbStorage.getBookingSessionById(sessionId);

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const { imageURL, altText } = req.body;

      if (!imageURL) {
        return res.status(400).json({ error: "imageURL is required" });
      }

      // Image URL is already a Supabase public URL from the upload endpoint
      // Add image to session's images array
      const currentImages = session.images || [];
      const newImage = {
        url: imageURL,
        alt: altText || ""
      };

      const updatedImages = [...currentImages, newImage];

      // Update the session with new images
      const updatedSession = await dbStorage.updateBookingSession(sessionId, {
        images: updatedImages
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error adding image to session:", error);
      res.status(500).json({ message: "Failed to add image to session" });
    }
  });

  // Delete image from session
  app.delete('/api/dashboard/sessions/:id/images/:imageIndex', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);
      const imageIndex = parseInt(req.params.imageIndex);

      const session = await dbStorage.getBookingSessionById(sessionId);

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const currentImages = session.images || [];

      if (imageIndex < 0 || imageIndex >= currentImages.length) {
        return res.status(400).json({ message: "Invalid image index" });
      }

      // Remove the image at the specified index
      const updatedImages = currentImages.filter((_, index) => index !== imageIndex);

      // Update the session
      const updatedSession = await dbStorage.updateBookingSession(sessionId, {
        images: updatedImages
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error deleting image from session:", error);
      res.status(500).json({ message: "Failed to delete image from session" });
    }
  });

  // Reorder session images
  app.patch('/api/dashboard/sessions/:id/images/reorder', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const sessionId = parseInt(req.params.id);
      const { images } = req.body;

      if (!Array.isArray(images)) {
        return res.status(400).json({ message: "Images must be an array" });
      }

      const session = await dbStorage.getBookingSessionById(sessionId);

      if (!session || session.profileId !== profile.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Update the session with reordered images
      const updatedSession = await dbStorage.updateBookingSession(sessionId, {
        images: images
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error reordering session images:", error);
      res.status(500).json({ message: "Failed to reorder images" });
    }
  });

  // Get all bookings for a profile (dashboard endpoint)
  app.get('/api/dashboard/bookings', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const bookings = await dbStorage.getBookingsByProfileId(profile.id);

      const coachTimezone = profile.timezone || "Asia/Kolkata";

      const bookingsWithSessions = await Promise.all(
        bookings.map(async (booking) => {
          const session = await dbStorage.getBookingSessionById(booking.sessionId);
          return {
            ...booking,
            session,
            coachTimezone,
          };
        })
      );

      res.json(bookingsWithSessions);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Update booking status (dashboard endpoint) - for marking complete or simple status changes
  app.patch('/api/dashboard/bookings/:id/status', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = getUserId(req);

      // Verify the booking belongs to the user's profile
      const booking = await dbStorage.getBookingById(parseInt(id));
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const profile = await dbStorage.getProfileById(userId);
      if (!profile || booking.profileId !== profile.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (!['pending', 'confirmed', 'completed', 'cancelled', 'declined'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedBooking = await dbStorage.updateBookingStatus(parseInt(id), status);

      const eventTypeMap: Record<string, string> = {
        completed: 'session_completed',
        confirmed: 'confirmed_by_coach',
        cancelled: 'cancelled_by_coach',
        declined: 'declined_by_coach',
      };
      if (eventTypeMap[status]) {
        try {
          await dbStorage.createBookingEvent({
            bookingId: booking.id,
            eventType: eventTypeMap[status],
            actorType: 'coach',
            message: `Status changed to ${status}`,
          });
        } catch (eventError) {
          console.error("Error creating booking event (non-fatal):", eventError);
        }
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // =================== COACH PAYMENT SETTINGS ENDPOINTS ===================

  app.get('/api/dashboard/payment-settings', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const settings = await dbStorage.getCoachPaymentSettings(userId);
      res.json(settings || { coachId: userId, defaultInstructions: null, methods: [] });
    } catch (error) {
      console.error("Error fetching payment settings:", error);
      res.status(500).json({ message: "Failed to fetch payment settings" });
    }
  });

  const paymentMethodSchema = z.object({
    type: z.enum(['upi', 'paypal', 'bank_transfer', 'payment_link', 'wise', 'cash']),
    enabled: z.boolean(),
    order: z.number().int().min(0),
    instructions: z.string().max(1000).optional(),
    upi_id: z.string().max(200).optional(),
    qr_code_url: z.string().url().max(2000).optional().or(z.literal('')),
    display_name: z.string().max(200).optional(),
    url: z.string().url().max(2000).optional().or(z.literal('')),
    email: z.string().email().max(200).optional().or(z.literal('')),
    paypal_link: z.string().url().max(2000).optional().or(z.literal('')),
    account_holder: z.string().max(200).optional(),
    bank_name: z.string().max(200).optional(),
    account_number: z.string().max(100).optional(),
    ifsc: z.string().max(50).optional(),
  });

  const paymentSettingsBodySchema = z.object({
    defaultInstructions: z.string().max(2000).nullable().optional(),
    methods: z.array(paymentMethodSchema).max(20).optional(),
  });

  app.put('/api/dashboard/payment-settings', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = paymentSettingsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payment settings data", errors: parsed.error.flatten().fieldErrors });
      }
      const { defaultInstructions, methods } = parsed.data;
      const settings = await dbStorage.upsertCoachPaymentSettings(userId, {
        defaultInstructions: defaultInstructions ?? null,
        methods: methods ?? [],
      });
      res.json(settings);
    } catch (error) {
      console.error("Error saving payment settings:", error);
      res.status(500).json({ message: "Failed to save payment settings" });
    }
  });

  // Confirm booking (dashboard endpoint) - coach confirms with message and meeting link
  // Supports two flows:
  //   1. Direct confirm: status -> confirmed (no payment requested)
  //   2. Payment request: status stays pending, payment_status -> requested
  app.post('/api/dashboard/bookings/:id/confirm', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { message, meetingLink, requestPayment, customPaymentInstruction } = req.body;
      const userId = getUserId(req);

      const booking = await dbStorage.getBookingById(parseInt(id));
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const profile = await dbStorage.getProfileById(userId);
      if (!profile || booking.profileId !== profile.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (booking.status !== 'pending') {
        return res.status(400).json({ message: "Booking is not in pending status" });
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);

      let guestAccessToken: string | null = null;
      if (booking.guestProfileId) {
        const guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
        guestAccessToken = guestProfile?.accessToken || null;
      }

      let locationInfo: LocationInfo | null = null;
      const bookingSessionMode = booking.sessionMode || 'online';
      if (bookingSessionMode === 'offline' && session?.locationId) {
        const location = await dbStorage.getLocationById(session.locationId);
        if (location) {
          locationInfo = {
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            country: location.country,
            googleMapsUrl: location.googleMapsUrl
          };
        }
      }

      const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      if (requestPayment) {
        const paymentSettings = await dbStorage.getCoachPaymentSettings(userId);
        const enabledMethods = (paymentSettings?.methods as any[] || []).filter((m: any) => m.enabled);

        let methodsOffered: any[] | null = null;
        let customInstruction: string | null = customPaymentInstruction || null;

        if (enabledMethods.length > 0) {
          methodsOffered = enabledMethods;
        }

        await dbStorage.updateBookingPaymentRequested(
          parseInt(id),
          methodsOffered,
          customInstruction
        );

        const updatedBooking = await dbStorage.updateBookingWithConfirmation(parseInt(id), {
          status: 'confirmed',
          coachMessage: message || null,
          meetingLink: null,
        });

        try {
          await dbStorage.createBookingEvent({
            bookingId: booking.id,
            eventType: 'confirmed_by_coach',
            actorType: 'coach',
            message: message || 'Booking confirmed with payment request',
          });
          await dbStorage.createBookingEvent({
            bookingId: booking.id,
            eventType: 'payment_requested',
            actorType: 'coach',
            message: 'Payment requested',
            metadata: methodsOffered
              ? { methodTypes: methodsOffered.map((m: any) => m.type) }
              : { customInstruction },
          });
        } catch (eventError) {
          console.error("Error creating booking events (non-fatal):", eventError);
        }

        const formatMethodDetails = (method: any): string => {
          switch (method.type) {
            case 'upi':
              return `UPI: ${method.upi_id || ''}${method.display_name ? ` (${method.display_name})` : ''}`;
            case 'payment_link':
              return `Payment Link: ${method.url || ''}`;
            case 'paypal':
              return `PayPal: ${method.paypal_link || method.email || ''}`;
            case 'wise':
              return `Wise: ${method.email || ''}`;
            case 'bank_transfer':
              return `Bank Transfer: ${method.bank_name || ''}, Account: ${method.account_number || ''}, IFSC: ${method.ifsc || ''}${method.account_holder ? `, Name: ${method.account_holder}` : ''}`;
            case 'cash':
              return 'Cash payment';
            default:
              return method.type;
          }
        };

        try {
          let paymentMessage = 'Booking confirmed. Payment requested.\n\n';
          if (methodsOffered && methodsOffered.length > 0) {
            paymentMessage += 'Available payment methods:\n';
            methodsOffered.forEach((m: any) => {
              paymentMessage += `\n• ${formatMethodDetails(m)}`;
              if (m.instructions) {
                paymentMessage += `\n  Instructions: ${m.instructions}`;
              }
            });
          }
          if (customInstruction) {
            paymentMessage += `\n\nInstructions: ${customInstruction}`;
          }

          await dbStorage.createBookingMessage({
            bookingId: booking.id,
            senderType: 'coach',
            message: paymentMessage,
          });
          if (message && message.trim()) {
            await dbStorage.createBookingMessage({
              bookingId: booking.id,
              senderType: 'coach',
              message: message.trim(),
            });
          }
        } catch (msgError) {
          console.error("Error creating payment request messages (non-fatal):", msgError);
        }

        console.log(`[Booking] Booking #${id} - Confirmed with payment request, sending merged confirmation+payment email to client: ${booking.clientEmail}`);
        try {
          await sendBookingConfirmedToClient(
            booking.clientEmail,
            booking.clientName,
            profile.displayName || 'Your Coach',
            session?.title || 'Session',
            formattedDate,
            booking.bookingTime,
            booking.confirmationCode,
            message || null,
            null,
            bookingSessionMode,
            locationInfo,
            guestAccessToken,
            null,
            methodsOffered,
            customInstruction,
            booking.id
          );
        } catch (emailError) {
          console.error(`[Booking] Booking #${id} - Error sending confirmation+payment email:`, emailError);
        }

        return res.json(updatedBooking);
      }

      const updatedBooking = await dbStorage.updateBookingWithConfirmation(parseInt(id), {
        status: 'confirmed',
        coachMessage: message || null,
        meetingLink: meetingLink || null,
      });

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'confirmed_by_coach',
          actorType: 'coach',
          message: message || 'Booking confirmed',
          metadata: meetingLink ? { meetingLink } : undefined,
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        if (message && message.trim()) {
          await dbStorage.createBookingMessage({
            bookingId: booking.id,
            senderType: 'coach',
            message: message.trim(),
          });
        }
        if (meetingLink) {
          await dbStorage.createBookingMessage({
            bookingId: booking.id,
            senderType: 'coach',
            message: `Meeting link: ${meetingLink}`,
          });
        }
      } catch (msgError) {
        console.error("Error creating confirmation messages (non-fatal):", msgError);
      }

      console.log(`[Booking] Booking #${id} (session: ${booking.sessionId}, code: ${booking.confirmationCode}) - Sending confirmation email to client: ${booking.clientEmail}`);
      try {
        await sendBookingConfirmedToClient(
          booking.clientEmail,
          booking.clientName,
          profile.displayName || 'Your Coach',
          session?.title || 'Session',
          formattedDate,
          booking.bookingTime,
          booking.confirmationCode,
          message || null,
          meetingLink || null,
          bookingSessionMode,
          locationInfo,
          guestAccessToken,
          null,
          null,
          null,
          booking.id
        );
        console.log(`[Booking] Booking #${id} - Confirmation email sent successfully`);
      } catch (emailError) {
        console.error(`[Booking] Booking #${id} - Error sending confirmation email:`, emailError);
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({ message: "Failed to confirm booking" });
    }
  });

  // Guest upload payment proof image
  app.post('/api/guest/:accessToken/upload-payment-proof', upload.single('file'), async (req: any, res) => {
    try {
      const { accessToken } = req.params;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Guest profile not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const publicUrl = await supabaseStorage.uploadPaymentProof(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype
      );

      fs.unlinkSync(req.file.path);

      res.json({ url: publicUrl });
    } catch (error) {
      console.error("Error uploading payment proof:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload payment proof" });
    }
  });

  // Guest mark-paid: submit payment confirmation (all proof fields are optional)
  app.post('/api/guest/:accessToken/bookings/:bookingId/mark-paid', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;
      const { proofUrl, referenceText, selectedMethod, proofImageUrl } = req.body;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.paymentStatus !== 'requested') {
        return res.status(400).json({ message: "Payment has not been requested for this booking" });
      }

      const offeredMethods = booking.paymentMethodsOffered as any[] | null;
      if (offeredMethods && offeredMethods.length > 0) {
        if (!selectedMethod) {
          return res.status(400).json({ message: "Please select a payment method" });
        }
        const validTypes = offeredMethods.map((m: any) => m.type);
        if (!validTypes.includes(selectedMethod)) {
          return res.status(400).json({ message: "Invalid payment method selected" });
        }
      }

      const finalProofUrl = proofImageUrl || proofUrl || null;

      const updatedBooking = await dbStorage.updateBookingProofUploaded(
        parseInt(bookingId),
        finalProofUrl,
        referenceText || null,
        selectedMethod || null
      );

      if (!updatedBooking) {
        return res.status(409).json({ message: "Payment status has changed. Please refresh and try again." });
      }

      const methodLabel = selectedMethod ? selectedMethod.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null;

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'payment_proof_uploaded',
          actorType: 'guest',
          message: methodLabel ? `Payment proof submitted via ${methodLabel}` : 'Payment proof submitted',
          metadata: { proofUrl: finalProofUrl, referenceText, selectedMethod: selectedMethod || null },
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        const parts: string[] = [];
        if (methodLabel) parts.push(`Payment proof submitted via ${methodLabel}`);
        else parts.push('Payment proof submitted');
        if (referenceText) parts.push(`Reference: ${referenceText}`);
        if (proofImageUrl) parts.push('📷 Payment screenshot attached');
        else if (proofUrl) parts.push(`Proof: ${proofUrl}`);
        const messageText = parts.join('\n');
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'guest',
          message: messageText,
        });
      } catch (msgError) {
        console.error("Error creating payment proof message (non-fatal):", msgError);
      }

      const coachProfile = await dbStorage.getProfileById(booking.profileId);
      let coachEmail = coachProfile?.email;
      if (!coachEmail && supabase) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(booking.profileId);
          coachEmail = user?.email || null;
        } catch (authError) {
          console.error("[Booking] Error fetching coach email:", authError);
        }
      }

      if (coachEmail) {
        const session = await dbStorage.getBookingSessionById(booking.sessionId);
        const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        console.log(`[Booking] Booking #${bookingId} - Payment proof submitted, notifying coach: ${coachEmail}`);
        try {
          await sendPaymentProofToCoach(
            coachEmail,
            coachProfile?.displayName || null,
            booking.clientName,
            booking.clientEmail,
            session?.title || 'Session',
            formattedDate,
            booking.bookingTime,
            booking.confirmationCode,
            selectedMethod || booking.paymentMethodSelected || 'unknown',
            referenceText || null,
            finalProofUrl || null,
            booking.sessionId,
            booking.id
          );
        } catch (emailError) {
          console.error(`[Booking] Booking #${bookingId} - Error sending proof notification:`, emailError);
        }

        // Push SSE notification to coach if they are on the dashboard
        try {
          const session = await dbStorage.getBookingSessionById(booking.sessionId);
          notifyCoach(booking.profileId, {
            type: 'payment_proof',
            bookingId: booking.id,
            clientName: booking.clientName,
            sessionTitle: session?.title || 'Session',
            bookingDate: new Date(booking.bookingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            bookingTime: booking.bookingTime,
            confirmationCode: booking.confirmationCode,
          });
        } catch {}
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error marking payment as paid:", error);
      res.status(500).json({ message: "Failed to submit payment proof" });
    }
  });

  // Guest mark-paid for event registration
  app.post('/api/guest/:accessToken/registrations/:registrationId/mark-paid', async (req, res) => {
    try {
      const { accessToken, registrationId } = req.params;
      const { proofUrl, referenceText, selectedMethod, proofImageUrl } = req.body;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const registration = await dbStorage.getEventRegistrationById(parseInt(registrationId));
      if (!registration || registration.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Registration not found" });
      }

      if (registration.paymentStatus !== 'requested' && registration.paymentStatus !== 'pending') {
        return res.status(400).json({ message: "Payment proof cannot be submitted for this registration" });
      }

      const offeredMethods = registration.paymentMethodsOffered as any[] | null;
      if (offeredMethods && offeredMethods.length > 0) {
        if (!selectedMethod) {
          return res.status(400).json({ message: "Please select a payment method" });
        }
        const isAllowed = offeredMethods.some(
          (m: any) => m && m.type === selectedMethod && m.enabled !== false,
        );
        if (!isAllowed) {
          return res
            .status(400)
            .json({ message: "Selected payment method is not available for this registration" });
        }
      }

      // Defence-in-depth: non-cash submissions require at least one piece of
      // proof so a client bypassing the form can't mark themselves as paid.
      if (selectedMethod !== 'cash') {
        const hasReference = typeof referenceText === 'string' && referenceText.trim().length > 0;
        const hasProofUrl = typeof proofUrl === 'string' && proofUrl.trim().length > 0;
        const hasProofImage = typeof proofImageUrl === 'string' && proofImageUrl.trim().length > 0;
        if (!hasReference && !hasProofUrl && !hasProofImage) {
          return res.status(400).json({
            message: "Please add at least one payment proof: a transaction ID, a screenshot, or a proof URL.",
            code: "PROOF_REQUIRED",
          });
        }
      }

      const isCash = selectedMethod === 'cash';
      const finalProofUrl = isCash ? null : (proofImageUrl || proofUrl || null);

      const updated = await db
        .update(eventRegistrations)
        .set({
          paymentStatus: isCash ? 'cash_pending' : 'proof_uploaded',
          paymentProofUrl: finalProofUrl,
          paymentReferenceText: isCash ? null : (referenceText || null),
          paymentMethodSelected: selectedMethod || null,
          paymentMarkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(eventRegistrations.id, parseInt(registrationId)))
        .returning();

      if (!updated[0]) {
        return res.status(500).json({ message: "Failed to update registration" });
      }

      const coachProfile = await dbStorage.getProfileById(registration.profileId);
      const coachEmail = coachProfile?.contactEmail || coachProfile?.email;

      const eventRow = await dbStorage.getEventById(registration.eventId);
      const eventTitle = eventRow?.title || 'Event Registration';

      // Respond immediately — notifications are sent in the background
      res.json(updated[0]);

      const eventDateStr = eventRow?.startAt
        ? new Date(eventRow.startAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      const coachName = coachProfile?.displayName || coachProfile?.username || 'Coach';
      const isOnline = eventRow?.mode === 'online' || eventRow?.mode === 'hybrid';
      const isOffline = eventRow?.mode === 'offline' || eventRow?.mode === 'hybrid';
      const guestPortalUrl = guestProfile.accessToken
        ? guestPortalLink({
            token: guestProfile.accessToken,
            registrationId: registration.id,
            tab: 'events',
          })
        : null;

      // Confirm the submission to the guest so they don't wonder whether
      // their proof landed (or — for cash — that the registration is
      // locked in pending in-person payment).
      sendEventPaymentSubmittedToGuest({
        registrantEmail: registration.clientEmail,
        registrantName: registration.clientName,
        coachName,
        eventTitle: eventRow?.title || 'Event',
        eventDate: eventDateStr,
        eventStartTime: extractTimeStr(eventRow?.startAt),
        eventEndTime: extractTimeStr(eventRow?.endAt),
        isCash,
        amount: registration.totalAmount || eventRow?.price || null,
        currency: eventRow?.currency || 'MYR',
        registrationId: registration.id,
        cancellationToken: registration.cancellationToken || '',
        guestPortalUrl,
      }).catch((emailErr) => {
        console.error('[Event Registration] Failed to send payment submission email to guest:', emailErr);
      });

      if (coachEmail) {
        try {
          notifyCoach(registration.profileId, {
            type: isCash ? 'cash_pending' : 'payment_proof',
            registrationId: registration.id,
            eventId: registration.eventId,
            clientName: registration.clientName,
            eventTitle,
            confirmationCode: registration.confirmationCode,
          });
        } catch {}

        sendEventPaymentProofToCoach({
          coachEmail,
          coachName,
          registrantName: registration.clientName,
          registrantEmail: registration.clientEmail,
          eventTitle: eventRow?.title || 'Event',
          eventDate: eventDateStr,
          eventId: registration.eventId,
          registrationId: registration.id,
          isCash,
        }).catch((emailErr) => {
          console.error('[Event Registration] Failed to send payment notification email to coach:', emailErr);
        });
      }
    } catch (error) {
      console.error("Error submitting event registration payment proof:", error);
      res.status(500).json({ message: "Failed to submit payment proof" });
    }
  });

  // Guest mark-paid for product purchase
  app.post('/api/guest/:accessToken/purchases/:purchaseId/mark-paid', async (req, res) => {
    try {
      const { accessToken, purchaseId } = req.params;
      const { proofUrl, referenceText, selectedMethod, proofImageUrl } = req.body;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const purchase = await dbStorage.getProductPurchaseById(parseInt(purchaseId));
      if (!purchase || purchase.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Purchase not found" });
      }

      if (purchase.status !== 'pending') {
        return res.status(400).json({ message: "Payment proof cannot be submitted for this purchase" });
      }

      const offeredMethods = purchase.paymentMethodsOffered as any[] | null;
      if (offeredMethods && offeredMethods.length > 0 && !selectedMethod) {
        return res.status(400).json({ message: "Please select a payment method" });
      }

      // Defence-in-depth: non-cash submissions require at least one piece of
      // proof so a client bypassing the form can't mark themselves as paid.
      if (selectedMethod !== 'cash') {
        const hasReference = typeof referenceText === 'string' && referenceText.trim().length > 0;
        const hasProofUrl = typeof proofUrl === 'string' && proofUrl.trim().length > 0;
        const hasProofImage = typeof proofImageUrl === 'string' && proofImageUrl.trim().length > 0;
        if (!hasReference && !hasProofUrl && !hasProofImage) {
          return res.status(400).json({
            message: "Please add at least one payment proof: a transaction ID, a screenshot, or a proof URL.",
            code: "PROOF_REQUIRED",
          });
        }
      }

      const finalProofUrl = proofImageUrl || proofUrl || null;

      const updated = await db
        .update(digitalProductPurchases)
        .set({
          status: 'proof_uploaded',
          paymentProofUrl: finalProofUrl,
          paymentReferenceText: referenceText || null,
          paymentMethodSelected: selectedMethod || null,
          paymentMarkedAt: new Date(),
        })
        .where(eq(digitalProductPurchases.id, parseInt(purchaseId)))
        .returning();

      if (!updated[0]) {
        return res.status(500).json({ message: "Failed to update purchase" });
      }

      const product = await dbStorage.getDigitalProductById(purchase.productId);
      const coachProfile = product ? await dbStorage.getProfileById(product.profileId) : null;
      if (coachProfile) {
        try {
          notifyCoach(coachProfile.id, {
            type: 'payment_proof',
            purchaseId: purchase.id,
            clientName: purchase.buyerName || purchase.email,
            productTitle: purchase.productTitle,
          });
        } catch {}
      }

      res.json(updated[0]);
    } catch (error) {
      console.error("Error submitting product purchase payment proof:", error);
      res.status(500).json({ message: "Failed to submit payment proof" });
    }
  });

  // Coach verify-payment: verify proof and confirm booking
  app.post('/api/dashboard/bookings/:id/verify-payment', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { meetingLink, message } = req.body;
      const userId = getUserId(req);

      const booking = await dbStorage.getBookingById(parseInt(id));
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const profile = await dbStorage.getProfileById(userId);
      if (!profile || booking.profileId !== profile.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (booking.paymentStatus !== 'proof_uploaded') {
        return res.status(400).json({ message: "No payment proof to verify" });
      }

      const updatedBooking = await dbStorage.updateBookingPaymentVerified(
        parseInt(id),
        meetingLink || null,
        message || null
      );

      if (!updatedBooking) {
        return res.status(409).json({ message: "Payment status has changed. Please refresh and try again." });
      }

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'payment_verified',
          actorType: 'coach',
          message: 'Payment verified, booking confirmed',
          metadata: meetingLink ? { meetingLink } : undefined,
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'coach',
          message: `Payment verified. Your booking is confirmed!${meetingLink ? `\nMeeting link: ${meetingLink}` : ''}${message ? `\n${message}` : ''}`,
        });
      } catch (msgError) {
        console.error("Error creating payment verified message (non-fatal):", msgError);
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);

      let guestAccessToken: string | null = null;
      if (booking.guestProfileId) {
        const guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
        guestAccessToken = guestProfile?.accessToken || null;
      }

      let locationInfo: LocationInfo | null = null;
      const bookingSessionMode = booking.sessionMode || 'online';
      if (bookingSessionMode === 'offline' && session?.locationId) {
        const location = await dbStorage.getLocationById(session.locationId);
        if (location) {
          locationInfo = {
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            country: location.country,
            googleMapsUrl: location.googleMapsUrl
          };
        }
      }

      const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      console.log(`[Booking] Booking #${id} - Payment verified, sending confirmation email to: ${booking.clientEmail}`);
      try {
        const locationText = locationInfo ? [locationInfo.name, locationInfo.address, locationInfo.city, locationInfo.state, locationInfo.country].filter(Boolean).join(', ') : null;
        await sendPaymentVerifiedToClient(
          booking.clientEmail,
          booking.clientName,
          profile.displayName || 'Your Coach',
          session?.title || 'Session',
          formattedDate,
          booking.bookingTime,
          booking.confirmationCode,
          meetingLink || null,
          message || null,
          guestAccessToken,
          session?.duration || 60,
          locationText,
          booking.id
        );
        console.log(`[Booking] Booking #${id} - Payment verified confirmation email sent`);
      } catch (emailError) {
        console.error(`[Booking] Booking #${id} - Error sending verified email:`, emailError);
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  app.post('/api/dashboard/bookings/:id/reject-payment', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = getUserId(req);

      const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
      if (!trimmedReason || trimmedReason.length < 1) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      if (trimmedReason.length > 2000) {
        return res.status(400).json({ message: "Rejection reason is too long (max 2000 characters)" });
      }

      const booking = await dbStorage.getBookingById(parseInt(id));
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const profile = await dbStorage.getProfileById(userId);
      if (!profile || booking.profileId !== profile.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (booking.paymentStatus !== 'proof_uploaded') {
        return res.status(400).json({ message: "No payment proof to reject" });
      }

      const updatedBooking = await dbStorage.updateBookingPaymentRejected(parseInt(id));

      if (!updatedBooking) {
        return res.status(409).json({ message: "Payment status has changed. Please refresh and try again." });
      }

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: 'payment_rejected',
          actorType: 'coach',
          message: trimmedReason,
          metadata: { reason: trimmedReason },
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'coach',
          message: `Payment proof was not accepted. Reason: ${trimmedReason}. Please resubmit your payment proof.`,
        });
      } catch (msgError) {
        console.error("Error creating payment rejected message (non-fatal):", msgError);
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);

      let guestAccessToken: string | null = null;
      if (booking.guestProfileId) {
        const guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
        guestAccessToken = guestProfile?.accessToken || null;
      }

      const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      console.log(`[Booking] Booking #${id} - Payment rejected, sending rejection email to: ${booking.clientEmail}`);
      try {
        await sendPaymentRejectedToClient(
          booking.clientEmail,
          booking.clientName,
          profile.displayName || 'Your Coach',
          session?.title || 'Session',
          formattedDate,
          booking.bookingTime,
          booking.confirmationCode,
          trimmedReason,
          guestAccessToken,
          booking.id
        );
        console.log(`[Booking] Booking #${id} - Payment rejection email sent`);
      } catch (emailError) {
        console.error(`[Booking] Booking #${id} - Error sending rejection email:`, emailError);
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error rejecting payment:", error);
      res.status(500).json({ message: "Failed to reject payment" });
    }
  });

  // Decline booking (dashboard endpoint) - coach declines with reason
  app.post('/api/dashboard/bookings/:id/decline', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = getUserId(req);

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Decline reason is required" });
      }

      const booking = await dbStorage.getBookingById(parseInt(id));
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const profile = await dbStorage.getProfileById(userId);
      if (!profile || booking.profileId !== profile.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (booking.status !== 'pending') {
        return res.status(400).json({ message: "Only pending bookings can be declined" });
      }

      const isRescheduleDecline = booking.rescheduledBy === 'client' && booking.rescheduledFrom && booking.rescheduledFromTime;

      let updatedBooking;
      if (isRescheduleDecline) {
        // Coach is declining a guest's reschedule request — restore the original booking
        updatedBooking = await dbStorage.updateBookingConditional(parseInt(id), {
          bookingDate: booking.rescheduledFrom!,
          bookingTime: booking.rescheduledFromTime!,
          status: 'confirmed',
          rescheduledFrom: null,
          rescheduledFromTime: null,
          rescheduledBy: null,
        }, 'pending');
      } else {
        // Normal decline of a new booking request
        updatedBooking = await dbStorage.updateBookingConditional(parseInt(id), {
          status: 'declined',
          cancellationReason: reason.trim(),
          cancelledBy: 'coach',
          cancelledAt: new Date()
        }, 'pending');
      }

      if (!updatedBooking) {
        return res.status(409).json({ message: "Booking status has changed. Please refresh and try again." });
      }

      try {
        await dbStorage.createBookingEvent({
          bookingId: booking.id,
          eventType: isRescheduleDecline ? 'declined_reschedule_by_coach' : 'declined_by_coach',
          actorType: 'coach',
          message: reason.trim(),
        });
      } catch (eventError) {
        console.error("Error creating booking event (non-fatal):", eventError);
      }

      try {
        await dbStorage.createBookingMessage({
          bookingId: booking.id,
          senderType: 'coach',
          message: isRescheduleDecline
            ? `Reschedule request declined — your original booking remains confirmed. Message from coach: ${reason.trim()}`
            : `Booking declined: ${reason.trim()}`,
        });
      } catch (msgError) {
        console.error("Error creating decline message (non-fatal):", msgError);
      }

      const session = await dbStorage.getBookingSessionById(booking.sessionId);
      const coachProfile = await dbStorage.getProfileById(userId);

      let guestProfile = null;
      if (booking.guestProfileId) {
        guestProfile = await dbStorage.getGuestProfileById(booking.guestProfileId);
      }

      if (isRescheduleDecline) {
        // Notify client that their reschedule was declined and original booking is restored
        const originalFormattedDate = new Date(booking.rescheduledFrom!).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        try {
          await sendRescheduleDeclinedToClient(
            booking.clientEmail,
            booking.clientName,
            coachProfile?.displayName || 'Your Coach',
            coachProfile?.username || '',
            session?.title || 'Session',
            originalFormattedDate,
            booking.rescheduledFromTime!,
            reason.trim(),
            guestProfile?.accessToken || null,
            booking.id
          );
          await dbStorage.createBookingEvent({
            bookingId: booking.id,
            eventType: 'email_sent',
            actorType: 'system',
            message: 'Reschedule declined notification sent to guest',
            metadata: { emailType: 'reschedule_declined', recipient: booking.clientEmail },
          });
        } catch (emailError) {
          console.error(`[Booking] Error sending reschedule declined email:`, emailError);
        }
      } else {
        // Notify client that their booking was declined
        const formattedDate = new Date(booking.bookingDate).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        try {
          await sendCancellationToClient(
            booking.clientEmail,
            booking.clientName,
            coachProfile?.displayName || 'Your Coach',
            coachProfile?.username || '',
            session?.title || 'Session',
            formattedDate,
            booking.bookingTime,
            reason.trim(),
            coachProfile?.contactInfo || null,
            guestProfile?.accessToken || null,
            booking.id
          );
          await dbStorage.createBookingEvent({
            bookingId: booking.id,
            eventType: 'email_sent',
            actorType: 'system',
            message: 'Decline notification sent to guest',
            metadata: { emailType: 'decline_notification', recipient: booking.clientEmail },
          });
        } catch (emailError) {
          console.error(`[Booking] Error sending decline email:`, emailError);
        }
      }

      res.json({ success: true, booking: updatedBooking });
    } catch (error) {
      console.error("Error declining booking:", error);
      res.status(500).json({ message: "Failed to decline booking" });
    }
  });

  // Get booking events timeline (dashboard endpoint)
  app.get('/api/dashboard/bookings/:bookingId/events', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.profileId !== userId) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const events = await dbStorage.getBookingEventsByBookingId(booking.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching booking events:", error);
      res.status(500).json({ message: "Failed to fetch booking events" });
    }
  });

  // Get booking events timeline (guest endpoint)
  app.get('/api/guest/:accessToken/bookings/:bookingId/events', async (req, res) => {
    try {
      const { accessToken, bookingId } = req.params;

      const guestProfile = await dbStorage.getGuestProfileByAccessToken(accessToken);
      if (!guestProfile) {
        return res.status(404).json({ message: "Guest profile not found" });
      }

      const booking = await dbStorage.getBookingById(parseInt(bookingId));
      if (!booking || booking.guestProfileId !== guestProfile.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const events = await dbStorage.getBookingEventsByBookingId(booking.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching booking events:", error);
      res.status(500).json({ message: "Failed to fetch booking events" });
    }
  });


  // =================== MENTOR AVAILABILITY ENDPOINTS ===================

  // Get mentor availability for a profile
  app.get('/api/dashboard/availability', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const availability = await dbStorage.getMentorAvailabilityByProfileId(profile.id);
      res.json(availability);
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // Create mentor availability
  app.post('/api/dashboard/availability', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const availabilityData = insertMentorAvailabilitySchema.parse({
        ...req.body,
        profileId: profile.id,
      });

      // Check for overlapping slots on the same day
      const existingSlots = await dbStorage.getMentorAvailabilityByProfileId(profile.id);
      const sameDay = existingSlots.filter(s => s.dayOfWeek === availabilityData.dayOfWeek);
      const hasOverlap = sameDay.some(s =>
        availabilityData.startTime < s.endTime && s.startTime < availabilityData.endTime
      );
      if (hasOverlap) {
        return res.status(409).json({ message: "AVAILABILITY_OVERLAP" });
      }

      const newAvailability = await dbStorage.createMentorAvailability(availabilityData);
      res.json(newAvailability);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid availability data", errors: error.errors });
      }
      console.error("Error creating availability:", error);
      res.status(500).json({ message: "Failed to create availability" });
    }
  });

  // Update mentor availability
  app.patch('/api/dashboard/availability/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const availabilityId = parseInt(req.params.id);

      // Verify ownership - get ALL availability records (including inactive) for this profile
      const existingAvailabilities = await dbStorage.getAllMentorAvailabilityByProfileId(profile.id);
      const existingAvailability = existingAvailabilities.find(a => a.id === availabilityId);

      if (!existingAvailability) {
        return res.status(404).json({ message: "Availability not found or access denied" });
      }

      // Parse and strip immutable fields to prevent mass assignment
      const updateData = insertMentorAvailabilitySchema.partial().parse(req.body);
      // Remove profileId and other immutable fields
      const { profileId: _, ...safeUpdateData } = updateData;

      // Check for overlapping slots on the same day (excluding the slot being edited)
      const dayOfWeek = safeUpdateData.dayOfWeek ?? existingAvailability.dayOfWeek;
      const startTime = safeUpdateData.startTime ?? existingAvailability.startTime;
      const endTime = safeUpdateData.endTime ?? existingAvailability.endTime;
      const activeSlots = await dbStorage.getMentorAvailabilityByProfileId(profile.id);
      const sameDay = activeSlots.filter(s => s.dayOfWeek === dayOfWeek && s.id !== availabilityId);
      const hasOverlap = sameDay.some(s => startTime < s.endTime && s.startTime < endTime);
      if (hasOverlap) {
        return res.status(409).json({ message: "AVAILABILITY_OVERLAP" });
      }

      const updatedAvailability = await dbStorage.updateMentorAvailability(availabilityId, safeUpdateData);
      res.json(updatedAvailability);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid availability data", errors: error.errors });
      }
      console.error("Error updating availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // Delete mentor availability
  app.delete('/api/dashboard/availability/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const availabilityId = parseInt(req.params.id);

      // Verify ownership - get ALL availability records (including inactive) for this profile
      const existingAvailabilities = await dbStorage.getAllMentorAvailabilityByProfileId(profile.id);
      const existingAvailability = existingAvailabilities.find(a => a.id === availabilityId);

      if (!existingAvailability) {
        return res.status(404).json({ message: "Availability not found or access denied" });
      }

      await dbStorage.deleteMentorAvailability(availabilityId);
      res.json({ message: "Availability deleted successfully" });
    } catch (error) {
      console.error("Error deleting availability:", error);
      res.status(500).json({ message: "Failed to delete availability" });
    }
  });

  // =================== BLOCKED DATES ENDPOINTS ===================

  // Get blocked dates for a profile
  app.get('/api/dashboard/blocked-dates', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const blockedDates = await dbStorage.getBlockedDatesByProfileId(profile.id);
      res.json(blockedDates);
    } catch (error) {
      console.error("Error fetching blocked dates:", error);
      res.status(500).json({ message: "Failed to fetch blocked dates" });
    }
  });

  // Create blocked date
  app.post('/api/dashboard/blocked-dates', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Convert ISO string to Date object if needed
      const blockedDate = typeof req.body.blockedDate === 'string'
        ? new Date(req.body.blockedDate)
        : req.body.blockedDate;

      const blockedDateData = insertBlockedDateSchema.parse({
        ...req.body,
        blockedDate,
        profileId: profile.id,
      });

      const newBlockedDate = await dbStorage.createBlockedDate(blockedDateData);
      res.json(newBlockedDate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid blocked date data", errors: error.errors });
      }
      console.error("Error creating blocked date:", error);
      res.status(500).json({ message: "Failed to create blocked date" });
    }
  });

  // Delete blocked date
  app.delete('/api/dashboard/blocked-dates/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const blockedDateId = parseInt(req.params.id);

      // Verify ownership - get the blocked date record first
      const existingBlockedDates = await dbStorage.getBlockedDatesByProfileId(profile.id);
      const existingBlockedDate = existingBlockedDates.find(b => b.id === blockedDateId);

      if (!existingBlockedDate) {
        return res.status(404).json({ message: "Blocked date not found or access denied" });
      }

      await dbStorage.deleteBlockedDate(blockedDateId);
      res.json({ message: "Blocked date deleted successfully" });
    } catch (error) {
      console.error("Error deleting blocked date:", error);
      res.status(500).json({ message: "Failed to delete blocked date" });
    }
  });

  // Get availability and blocked dates for a public profile (for booking calendar)
  app.get('/api/profiles/:username/availability', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await dbStorage.getProfileByUsername(username);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const [availability, blockedDates] = await Promise.all([
        dbStorage.getMentorAvailabilityByProfileId(profile.id),
        dbStorage.getBlockedDatesByProfileId(profile.id)
      ]);

      res.json({
        availability,
        blockedDates,
        timezone: profile.timezone || "Asia/Kolkata"
      });
    } catch (error) {
      console.error("Error fetching profile availability:", error);
      res.status(500).json({ message: "Failed to fetch profile availability" });
    }
  });

  // Bio and testimonials endpoint
  app.post('/api/dashboard/bio', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const {
        shortBio,
        shortBioImageUrl,
        shortBioYoutubeUrl,
        longBio,
        longBioImageUrl,
        longBioYoutubeUrl,
        testimonials
      } = req.body;

      // Update profile with bio, media, and testimonials
      const updatedProfile = await dbStorage.updateProfile(profile.id, {
        shortBio,
        shortBioImageUrl,
        shortBioYoutubeUrl,
        longBio,
        longBioImageUrl,
        longBioYoutubeUrl,
        testimonials
      });

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating bio and testimonials:", error);
      res.status(500).json({ message: "Failed to update bio and testimonials" });
    }
  });

  // =================== WALLET & EARNINGS ENDPOINTS ===================

  // Get earnings summary (calculated from real payment data, no Stripe)
  app.get('/api/dashboard/wallet/summary', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const profileId = profile.id;

      // Get or create wallet summary
      let walletSummary = await dbStorage.getWalletSummaryByProfileId(profile.id);

      if (!walletSummary) {
        // Create default wallet summary if it doesn't exist
        walletSummary = await dbStorage.createWalletSummary({
          profileId: profile.id,
          totalEarnings: "0.00",
          availableBalance: "0.00",
          pendingBalance: "0.00",
          totalPayouts: "0.00",
          productSales: 0,
          eventRegistrations: 0,
          sessionBookings: 0,
          lastPayoutDate: null
        });
      }

      // 1. Session bookings: paymentStatus='verified' AND status='completed'
      const bookingRows = await db
        .select({
          currency: bookingSessions.currency,
          total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(bookingsTable)
        .innerJoin(bookingSessions, eq(bookingsTable.sessionId, bookingSessions.id))
        .where(and(
          eq(bookingsTable.profileId, profileId),
          eq(bookingsTable.paymentStatus, 'verified'),
          eq(bookingsTable.status, 'completed')
        ))
        .groupBy(bookingSessions.currency);

      // 2. Digital product purchases: status='completed', joined with products for profileId
      const productRows = await db
        .select({
          currency: digitalProductPurchases.currency,
          total: sql<string>`COALESCE(SUM(${digitalProductPurchases.amount}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(digitalProductPurchases)
        .innerJoin(digitalProducts, eq(digitalProductPurchases.productId, digitalProducts.id))
        .where(and(
          eq(digitalProducts.profileId, profileId),
          eq(digitalProductPurchases.status, 'completed')
        ))
        .groupBy(digitalProductPurchases.currency);

      // 3. Event registrations: paymentStatus='confirmed' OR status='confirmed'
      const eventRegRows = await db
        .select({
          currency: events.currency,
          total: sql<string>`COALESCE(SUM(${eventRegistrations.totalAmount}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(eventRegistrations)
        .innerJoin(events, eq(eventRegistrations.eventId, events.id))
        .where(and(
          eq(eventRegistrations.profileId, profileId),
          or(
            eq(eventRegistrations.paymentStatus, 'confirmed'),
            eq(eventRegistrations.status, 'confirmed')
          )
        ))
        .groupBy(events.currency);

      // Merge currency totals across all 3 sources
      const currencyMap = new Map<string, number>();
      for (const row of [...bookingRows, ...productRows, ...eventRegRows]) {
        const cur = (row.currency || 'USD').toUpperCase();
        currencyMap.set(cur, (currencyMap.get(cur) || 0) + parseFloat(row.total || '0'));
      }
      const currencyTotals = Array.from(currencyMap.entries())
        .map(([currency, total]) => ({ currency, total: total.toFixed(2) }))
        .filter(({ total }) => parseFloat(total) > 0)
        .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

      const sessionBookings = bookingRows.reduce((s, r) => s + parseInt(r.count || '0', 10), 0);
      const productSales = productRows.reduce((s, r) => s + parseInt(r.count || '0', 10), 0);
      const eventRegistrationsCount = eventRegRows.reduce((s, r) => s + parseInt(r.count || '0', 10), 0);

      res.json({ currencyTotals, productSales, eventRegistrations: eventRegistrationsCount, sessionBookings });
    } catch (error) {
      console.error("Error fetching earnings summary:", error);
      res.status(500).json({ message: "Failed to fetch earnings summary" });
    }
  });

  // Get unified transaction history from bookings, product purchases, and event registrations
  app.get('/api/dashboard/wallet/transactions', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const profileId = profile.id;

      // Bookings with any payment action (exclude pure pending)
      const bookingTxns = await db
        .select({
          id: bookingsTable.id,
          type: sql<string>`'booking'`,
          label: bookingSessions.title,
          customerName: bookingsTable.clientName,
          customerEmail: bookingsTable.clientEmail,
          amount: bookingsTable.totalAmount,
          currency: bookingSessions.currency,
          status: bookingsTable.paymentStatus,
          createdAt: bookingsTable.createdAt,
        })
        .from(bookingsTable)
        .innerJoin(bookingSessions, eq(bookingsTable.sessionId, bookingSessions.id))
        .where(and(
          eq(bookingsTable.profileId, profileId),
          not(eq(bookingsTable.paymentStatus, 'pending'))
        ))
        .orderBy(desc(bookingsTable.createdAt))
        .limit(20);

      // Digital product purchases (exclude pure pending)
      const productTxns = await db
        .select({
          id: digitalProductPurchases.id,
          type: sql<string>`'product'`,
          label: digitalProducts.title,
          customerName: sql<string | null>`NULL`,
          customerEmail: digitalProductPurchases.email,
          amount: digitalProductPurchases.amount,
          currency: digitalProductPurchases.currency,
          status: digitalProductPurchases.status,
          createdAt: digitalProductPurchases.createdAt,
        })
        .from(digitalProductPurchases)
        .innerJoin(digitalProducts, eq(digitalProductPurchases.productId, digitalProducts.id))
        .where(and(
          eq(digitalProducts.profileId, profileId),
          not(eq(digitalProductPurchases.status, 'pending'))
        ))
        .orderBy(desc(digitalProductPurchases.createdAt))
        .limit(20);

      // Event registrations — include where paymentStatus='confirmed' OR status='confirmed'
      // (exclude pure pending on both fields); show whichever confirmation signal is present
      const eventTxns = await db
        .select({
          id: eventRegistrations.id,
          type: sql<string>`'event'`,
          label: events.title,
          customerName: eventRegistrations.clientName,
          customerEmail: eventRegistrations.clientEmail,
          amount: eventRegistrations.totalAmount,
          currency: events.currency,
          // Surface 'confirmed' if either field shows it, otherwise show paymentStatus
          status: sql<string>`CASE
            WHEN ${eventRegistrations.paymentStatus} = 'confirmed' OR ${eventRegistrations.status} = 'confirmed'
            THEN 'confirmed'
            ELSE COALESCE(${eventRegistrations.paymentStatus}, ${eventRegistrations.status})
          END`,
          createdAt: eventRegistrations.createdAt,
        })
        .from(eventRegistrations)
        .innerJoin(events, eq(eventRegistrations.eventId, events.id))
        .where(and(
          eq(eventRegistrations.profileId, profileId),
          or(
            not(eq(eventRegistrations.paymentStatus, 'pending')),
            not(eq(eventRegistrations.status, 'pending'))
          )
        ))
        .orderBy(desc(eventRegistrations.createdAt))
        .limit(20);

      const allTxns = [...bookingTxns, ...productTxns, ...eventTxns]
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 20);

      res.json(allTxns);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Get Stripe Connect account info
  app.get('/api/dashboard/wallet/stripe-account', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const stripeAccount = await dbStorage.getStripeConnectAccountByProfileId(profile.id);

      if (!stripeAccount) {
        return res.json(null);
      }

      res.json(stripeAccount);
    } catch (error) {
      console.error("Error fetching Stripe account:", error);
      res.status(500).json({ message: "Failed to fetch Stripe account" });
    }
  });

  // Connect Stripe account (placeholder implementation)
  app.post('/api/dashboard/wallet/connect-account', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // This is a placeholder - in production, you would:
      // 1. Create a Stripe Connect account
      // 2. Generate an account link URL
      // 3. Save the account info to the database

      // For now, we'll simulate creating an account
      const existingAccount = await dbStorage.getStripeConnectAccountByProfileId(profile.id);

      if (!existingAccount) {
        await dbStorage.createStripeConnectAccount({
          profileId: profile.id,
          stripeAccountId: `acct_demo_${Date.now()}`,
          accountStatus: "pending",
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {
            currently_due: ["business_type", "business_profile.url", "tos_acceptance.date"],
            eventually_due: [],
            past_due: [],
            pending_verification: []
          }
        });
      }

      // Return a demo URL for account setup
      res.json({
        accountLinkUrl: `https://connect.stripe.com/setup/demo?profile=${profile.id}`,
        message: "Account link created successfully"
      });
    } catch (error) {
      console.error("Error connecting Stripe account:", error);
      res.status(500).json({ message: "Failed to connect Stripe account" });
    }
  });

  // Request payout
  app.post('/api/dashboard/wallet/request-payout', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await dbStorage.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const walletSummary = await dbStorage.getWalletSummaryByProfileId(profile.id);
      const stripeAccount = await dbStorage.getStripeConnectAccountByProfileId(profile.id);

      if (!walletSummary) {
        return res.status(400).json({ message: "Wallet not found" });
      }

      if (!stripeAccount || !stripeAccount.payoutsEnabled) {
        return res.status(400).json({ message: "Bank account not connected or not enabled for payouts" });
      }

      const availableBalance = parseFloat(walletSummary.availableBalance);
      if (availableBalance <= 0) {
        return res.status(400).json({ message: "No available balance to payout" });
      }

      // Create a payout transaction record
      await dbStorage.createTransaction({
        profileId: profile.id,
        type: "payout",
        sourceType: "payout",
        sourceId: null,
        amount: walletSummary.availableBalance,
        currency: "USD",
        status: "pending",
        customerEmail: null,
        customerName: null,
        description: `Payout of $${walletSummary.availableBalance} to bank account`
      });

      // Update wallet summary
      await dbStorage.updateWalletSummary(profile.id, {
        availableBalance: "0.00",
        totalPayouts: (parseFloat(walletSummary.totalPayouts) + availableBalance).toFixed(2),
        lastPayoutDate: new Date()
      });

      res.json({
        message: "Payout requested successfully",
        amount: walletSummary.availableBalance
      });
    } catch (error) {
      console.error("Error requesting payout:", error);
      res.status(500).json({ message: "Failed to request payout" });
    }
  });

  // =================== TAG MANAGEMENT API ===================

  // Get all tags (public)
  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await dbStorage.getAllTags();
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  // Get popular tags (public)
  app.get('/api/tags/popular', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const tags = await dbStorage.getPopularTags(limit);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching popular tags:", error);
      res.status(500).json({ message: "Failed to fetch popular tags" });
    }
  });

  // Search tags (for autocomplete - public)
  app.get('/api/tags/search', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 20;
      if (!query) {
        const popularTags = await dbStorage.getPopularTags(limit);
        return res.json(popularTags);
      }
      const tags = await dbStorage.searchTags(query, limit);
      res.json(tags);
    } catch (error) {
      console.error("Error searching tags:", error);
      res.status(500).json({ message: "Failed to search tags" });
    }
  });

  // Tag suggestions (for filtering and autocomplete - public)
  app.get('/api/tags/suggestions', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 20;
      if (!query) {
        const popularTags = await dbStorage.getPopularTags(limit);
        return res.json(popularTags);
      }
      const tags = await dbStorage.searchTags(query, limit);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tag suggestions:", error);
      res.status(500).json({ message: "Failed to fetch tag suggestions" });
    }
  });

  // Get tag by id (public)
  app.get('/api/tags/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tag = await dbStorage.getTagById(id);
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Error fetching tag:", error);
      res.status(500).json({ message: "Failed to fetch tag" });
    }
  });

  // Create a new tag (authenticated)
  app.post('/api/tags', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, category } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Tag name is required" });
      }

      // Check if tag already exists
      const existingTag = await dbStorage.getTagByName(name.trim());
      if (existingTag) {
        return res.json(existingTag); // Return existing tag instead of error
      }

      // Check if user's profile exists (may not exist during onboarding)
      const profile = await dbStorage.getProfileById(userId);
      const createdBy = profile ? userId : null;

      const newTag = await dbStorage.createTag({
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        category: category || null,
        createdBy,
        isApproved: true
      });
      res.status(201).json(newTag);
    } catch (error) {
      console.error("Error creating tag:", error);
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  // Bulk create or get tags (authenticated) - for tag input component
  app.post('/api/tags/bulk', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { names } = req.body;

      if (!Array.isArray(names)) {
        return res.status(400).json({ message: "Names array is required" });
      }

      // Check if user's profile exists (may not exist during onboarding)
      const profile = await dbStorage.getProfileById(userId);
      const createdBy = profile ? userId : null;

      const resultTags = [];
      for (const name of names) {
        if (typeof name !== 'string' || name.trim().length === 0) continue;

        let tag = await dbStorage.getTagByName(name.trim());
        if (!tag) {
          tag = await dbStorage.createTag({
            name: name.trim(),
            slug: name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            createdBy,
            isApproved: true
          });
        }
        resultTags.push(tag);
      }
      res.json(resultTags);
    } catch (error) {
      console.error("Error bulk creating tags:", error);
      res.status(500).json({ message: "Failed to create tags" });
    }
  });

  // Get booked time slots for a session on a given date (public, for blocking in booking UI)
  // date (YYYY-MM-DD) is optional; omitting returns all future booked slots
  app.get('/api/sessions/:id/booked-slots', async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (isNaN(sessionId) || sessionId <= 0) {
        return res.status(400).json({ message: "Invalid session id" });
      }

      const dateParam = req.query.date as string | undefined;
      if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return res.status(400).json({ message: "date must be YYYY-MM-DD format" });
      }

      // Look up the session to get the coach's profileId so we can block slots
      // across ALL of the coach's sessions, not just this one.
      const session = await dbStorage.getBookingSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const slots = await dbStorage.getBookedSlotsForProfile(session.profileId, dateParam);

      // Normalize bookingTime to 24h format for frontend slot comparison
      const normalised = slots.map(s => ({
        bookingDate: s.bookingDate,
        bookingTime: timeTo24h(s.bookingTime),
      }));

      res.json(normalised);
    } catch (error) {
      console.error("Error fetching booked slots:", error);
      res.status(500).json({ message: "Failed to fetch booked slots" });
    }
  });

  // Get tags for a session (public)
  app.get('/api/sessions/:id/tags', async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const tags = await dbStorage.getTagsBySessionId(sessionId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching session tags:", error);
      res.status(500).json({ message: "Failed to fetch session tags" });
    }
  });

  // Set tags for a session (authenticated)
  app.post('/api/sessions/:id/tags', isAuthenticated, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      // Verify ownership
      const session = await dbStorage.getBookingSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const userId = getUserId(req);
      if (session.profileId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this session" });
      }

      await dbStorage.setSessionTags(sessionId, tagIds);

      // Auto-sync profile tags after content tag update
      dbStorage.syncProfileTagsFromConsolidated(userId).catch(() => { });

      const updatedTags = await dbStorage.getTagsBySessionId(sessionId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting session tags:", error);
      res.status(500).json({ message: "Failed to set session tags" });
    }
  });

  // Get tags for an event (public)
  app.get('/api/events/:id/tags', async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const tags = await dbStorage.getTagsByEventId(eventId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching event tags:", error);
      res.status(500).json({ message: "Failed to fetch event tags" });
    }
  });

  // Set tags for an event (authenticated)
  app.post('/api/events/:id/tags', isAuthenticated, async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      // Verify ownership
      const event = await dbStorage.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const userId = getUserId(req);
      if (event.profileId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this event" });
      }

      await dbStorage.setEventTags(eventId, tagIds);

      // Auto-sync profile tags after content tag update
      dbStorage.syncProfileTagsFromConsolidated(userId).catch(() => { });

      const updatedTags = await dbStorage.getTagsByEventId(eventId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting event tags:", error);
      res.status(500).json({ message: "Failed to set event tags" });
    }
  });

  // Get tags for a digital product (public)
  app.get('/api/digital-products/:id/tags', async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const tags = await dbStorage.getTagsByDigitalProductId(productId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching digital product tags:", error);
      res.status(500).json({ message: "Failed to fetch product tags" });
    }
  });

  // Set tags for a digital product (authenticated)
  app.post('/api/digital-products/:id/tags', isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      const userId = getUserId(req);
      const product = await dbStorage.getDigitalProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.profileId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this product" });
      }

      await dbStorage.setDigitalProductTags(productId, tagIds);

      // Auto-sync profile tags after content tag update
      dbStorage.syncProfileTagsFromConsolidated(userId).catch(() => { });

      const updatedTags = await dbStorage.getTagsByDigitalProductId(productId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting digital product tags:", error);
      res.status(500).json({ message: "Failed to set product tags" });
    }
  });

  // Get tags for a physical product (public)
  app.get('/api/physical-products/:id/tags', async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const tags = await dbStorage.getTagsByPhysicalProductId(productId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching physical product tags:", error);
      res.status(500).json({ message: "Failed to fetch product tags" });
    }
  });

  // Set tags for a physical product (authenticated)
  app.post('/api/physical-products/:id/tags', isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      const userId = getUserId(req);
      // Note: getPhysicalProductById doesn't exist in storage, need to add or work around
      const products = await dbStorage.getPhysicalProductsByProfileId(userId);
      const product = products.find(p => p.id === productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found or not authorized" });
      }

      await dbStorage.setPhysicalProductTags(productId, tagIds);

      // Auto-sync profile tags after content tag update
      dbStorage.syncProfileTagsFromConsolidated(userId).catch(() => { });

      const updatedTags = await dbStorage.getTagsByPhysicalProductId(productId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting physical product tags:", error);
      res.status(500).json({ message: "Failed to set product tags" });
    }
  });

  // Get tags for a blog post (public)
  app.get('/api/blog/:id/tags', async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const tags = await dbStorage.getTagsByBlogPostId(postId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching blog tags:", error);
      res.status(500).json({ message: "Failed to fetch blog tags" });
    }
  });

  // Set tags for a blog post (authenticated)
  app.post('/api/blog/:id/tags', isAuthenticated, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      const userId = getUserId(req);
      const posts = await dbStorage.getAllBlogPostsByProfileId(userId);
      const post = posts.find(p => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found or not authorized" });
      }

      await dbStorage.setBlogPostTags(postId, tagIds);

      // Auto-sync profile tags after content tag update
      dbStorage.syncProfileTagsFromConsolidated(userId).catch(() => { });

      const updatedTags = await dbStorage.getTagsByBlogPostId(postId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting blog tags:", error);
      res.status(500).json({ message: "Failed to set blog tags" });
    }
  });

  // Get tags for a profile (public)
  app.get('/api/profiles/:id/tags', async (req, res) => {
    try {
      const profileId = req.params.id;
      const tags = await dbStorage.getTagsByProfileId(profileId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching profile tags:", error);
      res.status(500).json({ message: "Failed to fetch profile tags" });
    }
  });

  // Set tags for current user's profile (authenticated)
  app.post('/api/dashboard/profile/tags', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { tagIds } = req.body;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ message: "tagIds array is required" });
      }

      await dbStorage.setProfileTags(userId, tagIds);
      const updatedTags = await dbStorage.getTagsByProfileId(userId);
      res.json(updatedTags);
    } catch (error) {
      console.error("Error setting profile tags:", error);
      res.status(500).json({ message: "Failed to set profile tags" });
    }
  });

  // Get current user's profile tags (authenticated)
  app.get('/api/dashboard/profile/tags', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const tags = await dbStorage.getTagsByProfileId(userId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching profile tags:", error);
      res.status(500).json({ message: "Failed to fetch profile tags" });
    }
  });

  // Get consolidated tags from all entity types for current user (authenticated)
  app.get('/api/dashboard/profile/consolidated-tags', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const consolidatedTags = await dbStorage.getConsolidatedTagsByProfileId(userId);
      res.json(consolidatedTags);
    } catch (error) {
      console.error("Error fetching consolidated tags:", error);
      res.status(500).json({ message: "Failed to fetch consolidated tags" });
    }
  });

  // Sync consolidated tags to profile tags (makes all content tags become profile search tags)
  app.post('/api/dashboard/profile/sync-consolidated-tags', isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const consolidatedTags = await dbStorage.getConsolidatedTagsByProfileId(userId);

      // Get all unique tag IDs from consolidated tags
      const tagIds = consolidatedTags.all.map(tag => tag.id);

      // Set these as the profile tags (this replaces existing profile tags)
      await dbStorage.setProfileTags(userId, tagIds);

      // Return the updated profile tags
      const updatedProfileTags = await dbStorage.getTagsByProfileId(userId);
      res.json({
        message: "Profile tags synced successfully",
        profileTags: updatedProfileTags,
        totalSynced: tagIds.length
      });
    } catch (error) {
      console.error("Error syncing consolidated tags:", error);
      res.status(500).json({ message: "Failed to sync consolidated tags" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
