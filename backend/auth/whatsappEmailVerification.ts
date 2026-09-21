/**
 * Routes for the `/whatsapp-verify` page — the dedicated post-signup
 * flow for users created by the WhatsApp bot
 * (`source_channel='whatsapp'`, `email_verified_at IS NULL`,
 * `onboarding_completed = false`).
 *
 * Endpoints (all mounted under `/api/auth/whatsapp-verify/*`):
 *   GET  /status           → branch-decision payload for the page
 *   POST /send-otp         → email a 6-digit code to the user's email
 *   POST /check-otp        → verify the 6-digit code, flip email_verified_at
 *   POST /set-password     → set Supabase password + complete onboarding
 *   POST /complete-google  → swap to Google identity + complete onboarding
 *
 * Every handler re-reads profile state and short-circuits if the user
 * has already advanced — safe across concurrent tabs/devices and safe
 * against stale clients trying to repeat steps.
 */
import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage as dbStorage } from "../storage";
import { consumeRateLimit } from "./rateLimit";
import { createAndSendEmailOtp, verifyEmailOtp } from "./emailOtpVerification";
import { validatePasswordPolicy } from "./identityLinking";
import { createClient } from "@supabase/supabase-js";

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

function isGmailEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return GMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase().trim());
}

interface ProfileGuardRow {
  id: string;
  email: string | null;
  display_name: string | null;
  source_channel: string | null;
  email_verified_at: string | Date | null;
  onboarding_completed: boolean | null;
}

/** Read the columns we need without round-tripping through the
 *  full storage interface (faster + a single SQL hop). */
async function loadProfile(userId: string): Promise<ProfileGuardRow | null> {
  const rows = await db.execute(sql`
    SELECT id, email, display_name, source_channel,
           email_verified_at, onboarding_completed
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `);
  if (rows.length === 0) return null;
  return rows[0] as unknown as ProfileGuardRow;
}

function isWhatsappSource(p: ProfileGuardRow): boolean {
  const ch = (p.source_channel ?? "").toLowerCase();
  return ch === "whatsapp" || ch === "whatsapp_cm";
}

function isFlowComplete(p: ProfileGuardRow): boolean {
  return p.onboarding_completed === true && p.email_verified_at !== null;
}

export function registerWhatsappEmailVerificationRoutes(
  app: Express,
  isAuthenticated: any,
  getUserId: (req: any) => string,
): void {
  // ── GET /api/auth/whatsapp-verify/status ──────────────────────────
  // Returns the branch-decision payload the client uses to render
  // the right UI without an extra round-trip.
  app.get(
    "/api/auth/whatsapp-verify/status",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = getUserId(req);
        const profile = await loadProfile(userId);
        if (!profile) {
          return res.status(404).json({
            error: "Profile not found.",
            code: "PROFILE_MISSING",
          });
        }
        if (!isWhatsappSource(profile)) {
          return res.status(403).json({
            error: "This flow is only for accounts created via WhatsApp.",
            code: "WRONG_SOURCE",
          });
        }
        if (!profile.email) {
          return res.status(409).json({
            error: "No email on file. Please contact support.",
            code: "NO_EMAIL",
          });
        }

        // Detect a pre-linked Google identity so the page can skip the
        // Google-popup step (rare, but possible if the user signed in
        // with Google from `/auth` first).
        const googleRows = await db.execute(sql`
          SELECT user_id FROM auth.identities
          WHERE provider = 'google' AND user_id = ${userId}::uuid
          LIMIT 1
        `);

        return res.json({
          email: profile.email,
          isGmailDomain: isGmailEmail(profile.email),
          alreadyHasGoogleIdentity: googleRows.length > 0,
          emailVerified: profile.email_verified_at !== null,
          onboardingCompleted: profile.onboarding_completed === true,
          done: isFlowComplete(profile),
        });
      } catch (err: any) {
        console.error("[whatsapp-verify/status]", err);
        return res
          .status(500)
          .json({ error: "Failed to load status.", code: "INTERNAL" });
      }
    },
  );

  // ── POST /api/auth/whatsapp-verify/send-otp ───────────────────────
  // Issues a fresh 6-digit code to the email on file. Idempotent:
  // the OTP helper invalidates older outstanding codes so the latest
  // is the only one that works.
  app.post(
    "/api/auth/whatsapp-verify/send-otp",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = getUserId(req);
        const profile = await loadProfile(userId);
        if (!profile || !isWhatsappSource(profile) || !profile.email) {
          return res
            .status(403)
            .json({ error: "This flow is not available for your account.", code: "WRONG_SOURCE" });
        }
        if (isFlowComplete(profile)) {
          return res.json({ alreadyDone: true });
        }
        // Step-idempotent: email is already verified (e.g. user reloaded
        // mid-flow after the OTP step), so there's no point re-sending a
        // code. Tell the client they can skip ahead to the password step.
        if (profile.email_verified_at !== null) {
          return res.json({
            sent: false,
            alreadyVerified: true,
            requiresPassword: !isGmailEmail(profile.email),
          });
        }

        const limit = consumeRateLimit(
          `wa-verify-send:user:${userId}`,
          5,
          15 * 60 * 1000,
        );
        if (!limit.allowed) {
          return res.status(429).json({
            error: `Too many code requests. Try again in ${limit.retryAfterSec}s.`,
            code: "RATE_LIMITED",
            retryAfterSec: limit.retryAfterSec,
          });
        }

        const result = await createAndSendEmailOtp(
          userId,
          profile.email,
          profile.display_name ?? null,
        );
        if (!result.ok) {
          const status = result.code === "INVALID_EMAIL" ? 400 : 500;
          return res
            .status(status)
            .json({ error: result.error, code: result.code });
        }
        return res.json({
          sent: true,
          expiresAt: result.expiresAt.toISOString(),
          ...(result.debugCode ? { debugCode: result.debugCode } : {}),
        });
      } catch (err: any) {
        console.error("[whatsapp-verify/send-otp]", err);
        return res
          .status(500)
          .json({ error: "Failed to send code.", code: "INTERNAL" });
      }
    },
  );

  // ── POST /api/auth/whatsapp-verify/check-otp ──────────────────────
  // Verifies the user's 6-digit code and flips
  // `profiles.email_verified_at` on success. Does NOT complete
  // onboarding by itself — for non-Gmail users the password step
  // still needs to run; for Gmail users the Google-link step does.
  app.post(
    "/api/auth/whatsapp-verify/check-otp",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = getUserId(req);
        const { code } = req.body ?? {};
        if (typeof code !== "string" || !code.trim()) {
          return res
            .status(400)
            .json({ error: "Code is required.", code: "BAD_REQUEST" });
        }

        const profile = await loadProfile(userId);
        if (!profile || !isWhatsappSource(profile) || !profile.email) {
          return res
            .status(403)
            .json({ error: "This flow is not available.", code: "WRONG_SOURCE" });
        }
        if (isFlowComplete(profile)) {
          return res.json({ verified: true, alreadyDone: true });
        }
        // Step-idempotent: if the email was already verified on a prior
        // call (the password step just hasn't completed yet), short-circuit
        // success rather than asking verifyEmailOtp to consume a code that
        // may have already been used. The client treats this identically
        // to a fresh successful verification and proceeds to the password
        // step (or to Gmail link, depending on email domain).
        if (profile.email_verified_at !== null) {
          return res.json({
            verified: true,
            alreadyVerified: true,
            requiresPassword: !isGmailEmail(profile.email),
          });
        }

        // Per-user rate-limit on attempts (in addition to the per-row
        // attempt counter inside verifyEmailOtp).
        const limit = consumeRateLimit(
          `wa-verify-check:user:${userId}`,
          15,
          15 * 60 * 1000,
        );
        if (!limit.allowed) {
          return res.status(429).json({
            error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
            code: "RATE_LIMITED",
            retryAfterSec: limit.retryAfterSec,
          });
        }

        const result = await verifyEmailOtp(userId, profile.email, code);
        if (!result.ok) {
          const status =
            result.code === "WRONG_CODE" ? 400 :
            result.code === "EXPIRED" || result.code === "USED" ? 410 :
            result.code === "TOO_MANY_ATTEMPTS" ? 429 :
            result.code === "NO_OTP" ? 404 : 400;
          return res.status(status).json({ error: result.error, code: result.code });
        }

        // Flip email_verified_at AND mirror onto auth.users so future
        // `email + password` sign-ins (after the /set-password step)
        // succeed without requiring a separate confirmation click.
        await db.execute(sql`
          UPDATE profiles
          SET email_verified_at = COALESCE(email_verified_at, now()),
              updated_at = now()
          WHERE id = ${userId}
        `);
        await db.execute(sql`
          UPDATE auth.users
          SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
              updated_at = now()
          WHERE id = ${userId}::uuid
        `);

        const requiresPassword = !isGmailEmail(profile.email);
        return res.json({
          verified: true,
          requiresPassword,
        });
      } catch (err: any) {
        console.error("[whatsapp-verify/check-otp]", err);
        return res
          .status(500)
          .json({ error: "Failed to verify code.", code: "INTERNAL" });
      }
    },
  );

  // ── POST /api/auth/whatsapp-verify/set-password ───────────────────
  // Final step for non-Gmail users. Requires email already verified.
  // Sets the Supabase password via the admin SDK and flips
  // onboarding_completed.
  app.post(
    "/api/auth/whatsapp-verify/set-password",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = getUserId(req);
        const { password } = req.body ?? {};
        if (typeof password !== "string") {
          return res
            .status(400)
            .json({ error: "Password is required.", code: "BAD_REQUEST" });
        }
        const pw = validatePasswordPolicy(password);
        if (!pw.ok) {
          return res
            .status(400)
            .json({ error: pw.error, code: "WEAK_PASSWORD" });
        }

        const profile = await loadProfile(userId);
        if (!profile || !isWhatsappSource(profile) || !profile.email) {
          return res
            .status(403)
            .json({ error: "This flow is not available.", code: "WRONG_SOURCE" });
        }
        if (isFlowComplete(profile)) {
          return res.json({ alreadyDone: true });
        }
        if (!profile.email_verified_at) {
          return res.status(400).json({
            error: "Verify your email first.",
            code: "EMAIL_NOT_VERIFIED",
          });
        }

        const limit = consumeRateLimit(
          `wa-verify-setpw:user:${userId}`,
          10,
          60 * 60 * 1000,
        );
        if (!limit.allowed) {
          return res.status(429).json({
            error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
            code: "RATE_LIMITED",
            retryAfterSec: limit.retryAfterSec,
          });
        }

        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return res.status(500).json({
            error: "Auth not configured.",
            code: "NOT_CONFIGURED",
          });
        }
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: updateErr } = await admin.auth.admin.updateUserById(
          userId,
          { password },
        );
        if (updateErr) {
          console.error(
            "[whatsapp-verify/set-password] admin.updateUserById failed:",
            updateErr.message,
          );
          return res.status(500).json({
            error: "Could not save your password. Please try again.",
            code: "PW_UPDATE_FAILED",
          });
        }

        // Sync the email-provider identity row so future
        // signInWithPassword({ email, password }) resolves cleanly.
        await db.execute(sql`
          INSERT INTO auth.identities
            (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            ${userId},
            ${userId}::uuid,
            jsonb_build_object('sub', ${userId}::text, 'email', ${profile.email}::text, 'email_verified', true, 'phone_verified', true),
            'email',
            now(), now(), now()
          )
          ON CONFLICT (provider_id, provider) DO UPDATE SET
            identity_data = COALESCE(auth.identities.identity_data, '{}'::jsonb)
              || jsonb_build_object('email', ${profile.email}::text, 'email_verified', true),
            updated_at = now()
        `);

        await db.execute(sql`
          UPDATE profiles
          SET onboarding_completed = true, updated_at = now()
          WHERE id = ${userId}
        `);

        return res.json({ success: true });
      } catch (err: any) {
        console.error("[whatsapp-verify/set-password]", err);
        return res
          .status(500)
          .json({ error: "Failed to set password.", code: "INTERNAL" });
      }
    },
  );

  // ── POST /api/auth/whatsapp-verify/complete-google ────────────────
  // Final step for Gmail users. No request body needed — the caller's
  // JWT is the only credential required.
  //
  // Why no idToken: Supabase's `provider_id_token` (the Google ID token)
  // is only available in the transient `onAuthStateChange` SIGNED_IN
  // event callback. It is NOT persisted on the session object returned
  // by `getSession()`, so by the time the client calls this endpoint
  // after the OAuth redirect the token is already gone.
  //
  // Instead we read the Google identity that Supabase already linked and
  // verified during the OAuth redirect from `auth.identities`. Supabase
  // is the trust anchor here — a valid JWT proves Supabase authenticated
  // the user; the linked identity row tells us which Google account they
  // used and what email Google reported for it.
  app.post(
    "/api/auth/whatsapp-verify/complete-google",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = getUserId(req);

        const profile = await loadProfile(userId);
        if (!profile || !isWhatsappSource(profile) || !profile.email) {
          return res
            .status(403)
            .json({ error: "This flow is not available.", code: "WRONG_SOURCE" });
        }
        if (isFlowComplete(profile)) {
          return res.json({ alreadyDone: true });
        }

        const limit = consumeRateLimit(
          `wa-verify-google:user:${userId}`,
          5,
          15 * 60 * 1000,
        );
        if (!limit.allowed) {
          return res.status(429).json({
            error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`,
            code: "RATE_LIMITED",
            retryAfterSec: limit.retryAfterSec,
          });
        }

        // Read the Google identity that Supabase linked during the
        // OAuth redirect. If it's not there the user hasn't completed
        // Google sign-in yet (e.g. they called this endpoint without
        // going through the OAuth flow first).
        const googleRows = await db.execute<{
          provider_id: string;
          identity_data: Record<string, any>;
        }>(sql`
          SELECT provider_id, identity_data
          FROM auth.identities
          WHERE user_id = ${userId}::uuid AND provider = 'google'
          ORDER BY created_at DESC
          LIMIT 1
        `);

        const googleIdentity = googleRows[0];
        if (!googleIdentity) {
          return res.status(422).json({
            error:
              "No Google sign-in found on your account. Please tap 'Continue with Google' again.",
            code: "NO_GOOGLE_IDENTITY",
          });
        }

        const googleEmail = String(
          googleIdentity.identity_data?.email ?? "",
        ).toLowerCase();
        const profileEmailLower = profile.email.toLowerCase();

        if (!googleEmail) {
          return res.status(422).json({
            error: "Google did not return an email. Please try again.",
            code: "INVALID_GOOGLE_IDENTITY",
          });
        }

        if (googleEmail !== profileEmailLower) {
          console.warn(
            `[whatsapp-verify/complete-google] email mismatch: google=${googleEmail} profile=${profileEmailLower} userId=${userId}`,
          );
          return res.status(422).json({
            error:
              "You signed in with a different Google account than the email on your Riplect account. " +
              "Pick the matching Google account, or use the email-code option instead.",
            code: "GOOGLE_EMAIL_MISMATCH",
          });
        }

        // Mark our verification gate and complete onboarding.
        // Also mirror onto auth.users so future `signInWithPassword`
        // (after password is set via the OTP path) resolves correctly.
        await db.execute(sql`
          UPDATE profiles
          SET email_verified_at = COALESCE(email_verified_at, now()),
              onboarding_completed = true,
              updated_at = now()
          WHERE id = ${userId}
        `);
        await db.execute(sql`
          UPDATE auth.users
          SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
              updated_at = now()
          WHERE id = ${userId}::uuid
        `);

        return res.json({ success: true });
      } catch (err: any) {
        console.error("[whatsapp-verify/complete-google]", err);
        return res
          .status(500)
          .json({ error: "Failed to complete Google sign-in.", code: "INTERNAL" });
      }
    },
  );
}
