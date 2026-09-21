import {tool} from "ai";
import {z} from "zod";
import {sql} from "drizzle-orm";
import {storage} from "../../storage";
import {db} from "../../db";
import {supabase} from "../../supabaseAuth";
import {generateUniqueUsername} from "../../whatsapp/usernameGenerator";
import {findProfileByWhatsApp} from "../../whatsapp/profileLookup";
import {normalizePhoneE164, normalizePhoneDigits} from "../../whatsapp/phoneFormat";
import {getAppBaseUrl} from "../../email/utils";
import {mintBotMagicLinkToken} from "../../auth/botMagicLink";
import {BOT_DEFAULT_SEARCHABLE_LOCATION} from "./botLocationDefaults";

/**
 * Split a single "displayName" into first_name / last_name for
 * auth.users.user_metadata — Riplect's convention (see supabaseAuth.ts:68-69
 * and the email-signup path in routes.ts:384). Single-token names go in
 * first_name with an empty last_name; everything after the first whitespace
 * group becomes last_name.
 */
function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

/** Lookup an auth.users row by phone. Tries digits-only AND "+<digits>" since
 *  historic rows used the digits-only convention but newer ones include "+". */
async function findAuthUserByPhone(
  phoneE164: string,
): Promise<{ id: string; email: string | null } | null> {
  const digits = normalizePhoneDigits(phoneE164);
  if (!digits) return null;
  try {
    const rows = await db.execute<{ id: string; email: string | null }>(
      sql`SELECT id::text AS id, email FROM auth.users
          WHERE phone = ${digits} OR phone = ${"+" + digits}
          LIMIT 1`,
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error("[CreateProfile] auth user lookup by phone failed:", err);
    return null;
  }
}

/**
 * Check whether `email` is already owned by another Riplect identity (profile
 * mirror or raw auth.users row). Returns the owning userId when taken, or
 * null when free.
 *
 * Mirrors the dual-check pattern in identityLinking.swapEmailAndSetPassword
 * (profiles AND auth.users) so we catch in-flight signups whose profile row
 * hasn't been written yet.
 */
async function findEmailOwner(emailLower: string): Promise<string | null> {
  try {
    const profileRows = await db.execute<{ id: string }>(
      sql`SELECT id FROM profiles WHERE LOWER(email) = ${emailLower} LIMIT 1`,
    );
    if (profileRows[0]?.id) return profileRows[0].id;

    const authRows = await db.execute<{ id: string }>(
      sql`SELECT id::text AS id FROM auth.users
          WHERE LOWER(email) = ${emailLower} LIMIT 1`,
    );
    return authRows[0]?.id ?? null;
  } catch (err) {
    console.error("[CreateProfile] email collision check failed:", err);
    // Surface as "taken" on DB error — safer to fail the signup than to
    // silently double-allocate an email.
    return "__db_error__";
  }
}

export const createProfile = tool({
  description:
    "Create a new Riplect profile. Creates a Supabase auth user (phone + email, email unverified), inserts a profile row, and returns a Supabase magic link the bot will WhatsApp to the user so they can sign in to their dashboard.",
  inputSchema: z.object({
    phone: z
      .string()
      .describe(
        "Creator's phone number. Accepts E.164 (+919876543210), digits-only, " +
          "or 'whatsapp:+…' Twilio form — we normalise internally.",
      ),
    displayName: z.string().min(1).describe("Creator's full name"),
    title: z
      .string()
      .min(1)
      .describe("Professional title (e.g. 'Yoga Teacher', 'Sound Healer')"),
    email: z
      .string()
      .email()
      .describe(
        "Creator's real email address. Required — used to send a Supabase magic link the user will tap to access their dashboard. Stored unverified until the user explicitly confirms it on the dashboard.",
      ),
    sourceChannel: z
      .string()
      .default("whatsapp")
      .describe("Channel the creator was onboarded from"),
    profileImageUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Profile picture URL from the Available Images list in session context.",
      ),
  }),
  execute: async ({
    phone,
    displayName,
    title,
    email,
    sourceChannel,
    profileImageUrl,
  }) => {
    if (!supabase) {
      return {success: false, error: "Supabase not configured"};
    }

    const phoneE164 = normalizePhoneE164(phone);
    if (!phoneE164) {
      return {
        success: false,
        errorCode: "INVALID_PHONE",
        error: "Phone number doesn't look right — please share it in international format (e.g. +919876543210).",
      };
    }

    const emailNormalized = email.trim();
    const emailLower = emailNormalized.toLowerCase();

    // 1. Idempotency on phone: if a profile already exists for this phone,
    // a previous run succeeded — return it and tag the result so the caller
    // can use a "welcome back" copy instead of the fresh-signup welcome.
    const existingProfileId = await findProfileByWhatsApp(phoneE164);
    if (existingProfileId) {
      const existingProfile = await storage.getProfileById(existingProfileId);
      if (existingProfile) {
        const magicLink = await buildBotMagicLinkUrl(
          existingProfile.id,
          existingProfile.email ?? emailNormalized,
        );
        return {
          success: true,
          alreadyExisted: true,
          profileId: existingProfile.id,
          username: existingProfile.username,
          displayName: existingProfile.displayName,
          magicLink,
          // Echo the image the CM uploaded as the profile photo so the turn
          // log can mark it consumed — it must NOT be reused as an event flyer.
          profileImageUrl: profileImageUrl ?? null,
        };
      }
    }

    // 2. Pre-check email collision. EMAIL_TAKEN takes precedence over phone
    // recovery: we never want to silently bind a different user's email to
    // an orphan auth user.
    const emailOwner = await findEmailOwner(emailLower);
    if (emailOwner === "__db_error__") {
      return {
        success: false,
        errorCode: "DB_ERROR",
        error: "Couldn't verify whether that email is already in use. Please try again in a moment.",
      };
    }
    if (emailOwner) {
      // We may still allow it if the owner turns out to be the same orphan
      // auth.users row we're about to recover (same phone, no profile yet,
      // email already attached). That edge case is resolved below — for now,
      // record the candidate owner and let the phone-recovery branch decide.
    }

    const {firstName, lastName} = splitDisplayName(displayName);

    // 3. Create the auth user with phone + email. No `email_confirm` flag,
    // so email_confirmed_at stays NULL ("unverified at the Supabase level").
    // user_metadata.{first_name,last_name} matches the convention read by
    // server/supabaseAuth.ts.
    const {data: authData, error: createError} =
      await supabase.auth.admin.createUser({
        phone: phoneE164,
        email: emailNormalized,
        phone_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
        },
      });

    let userId: string;

    if (createError) {
      // Likely cause: phone OR email already exists in auth.users.
      const isAlreadyExists =
        createError.status === 422 ||
        /already|registered|exists/i.test(createError.message ?? "");

      if (!isAlreadyExists) {
        console.error(
          "[CreateProfile] auth.admin.createUser failed:",
          createError.message,
        );
        return {
          success: false,
          errorCode: "AUTH_CREATE_FAILED",
          error: createError.message,
        };
      }

      // Race / orphan recovery: look up the existing auth.users row by phone.
      const existingAuth = await findAuthUserByPhone(phoneE164);
      if (!existingAuth) {
        // No phone match — the "already exists" must be on email. Surface
        // the friendly EMAIL_TAKEN error so Sol re-asks.
        if (emailOwner) {
          return {
            success: false,
            errorCode: "EMAIL_TAKEN",
            error: "That email is already linked to another Riplect account. Try a different one?",
          };
        }
        return {
          success: false,
          errorCode: "AUTH_CREATE_FAILED",
          error: createError.message,
        };
      }

      // The orphan owns a different email than the one we want.
      if (existingAuth.email && existingAuth.email.toLowerCase() !== emailLower) {
        console.warn(
          `[CreateProfile] orphan auth user ${existingAuth.id} already has email=${existingAuth.email}; new signup tried ${emailLower}`,
        );
        return {
          success: false,
          errorCode: "PHONE_EMAIL_MISMATCH",
          error: "This phone is partially linked to a different email. Please contact support.",
        };
      }

      // If our pre-check flagged the email as owned but it turns out to be
      // owned by THIS same orphan row, we're fine. Anything else is a
      // genuine collision.
      if (emailOwner && emailOwner !== existingAuth.id) {
        return {
          success: false,
          errorCode: "EMAIL_TAKEN",
          error: "That email is already linked to another Riplect account. Try a different one?",
        };
      }

      // Attach email + metadata to the orphan if missing.
      if (!existingAuth.email) {
        const {error: updateError} = await supabase.auth.admin.updateUserById(
          existingAuth.id,
          {
            email: emailNormalized,
            user_metadata: {
              first_name: firstName,
              last_name: lastName,
              display_name: displayName,
            },
          },
        );
        if (updateError) {
          console.error(
            "[CreateProfile] updateUserById (orphan recovery) failed:",
            updateError.message,
          );
          return {
            success: false,
            errorCode: "AUTH_UPDATE_FAILED",
            error: updateError.message,
          };
        }
      }

      userId = existingAuth.id;
      console.log(
        `[CreateProfile] recovered orphan auth user ${userId} for phone ${phoneE164}`,
      );
    } else {
      // Happy path: fresh auth user with phone + email + display name metadata.
      if (emailOwner) {
        // Pre-check said taken, but createUser succeeded — shouldn't happen.
        // Surface as EMAIL_TAKEN to be safe and roll back the just-created user.
        console.error(
          `[CreateProfile] email pre-check said taken (owner=${emailOwner}) but createUser succeeded — unexpected state`,
        );
        if (authData?.user?.id) {
          await supabase.auth.admin.deleteUser(authData.user.id).catch((e) =>
            console.error("[CreateProfile] rollback deleteUser failed:", e),
          );
        }
        return {
          success: false,
          errorCode: "EMAIL_TAKEN",
          error: "That email is already linked to another Riplect account. Try a different one?",
        };
      }
      userId = authData.user.id;
    }

    // 4. Insert the profile row. email_verified_at intentionally NULL —
    // the magic-link tap will confirm at the Supabase level, but Riplect's
    // own "consciously claimed" verification happens later on the dashboard.
    const username = await generateUniqueUsername(displayName);
    try {
      await storage.createProfile({
        id: userId,
        username,
        displayName,
        firstName: firstName || null,
        lastName: lastName || null,
        email: emailNormalized,
        title,
        profileImageUrl,
        sourceChannel,
        onboardingCompleted: false,
        searchableLocation: BOT_DEFAULT_SEARCHABLE_LOCATION,
      });
    } catch (err: any) {
      console.error("[CreateProfile] storage.createProfile failed:", err);
      return {
        success: false,
        errorCode: "PROFILE_CREATE_FAILED",
        error:
          "Couldn't finish setting up the profile. Please try again in a moment.",
      };
    }

    // 5. Mint a routing token and return /m/<token> for the bot to WhatsApp.
    // The actual Supabase magic-link OTP is generated on the click handler
    // side so WhatsApp's preview crawler doesn't burn it before the user
    // taps.
    const magicLink = await buildBotMagicLinkUrl(userId, emailNormalized);
    if (!magicLink) {
      console.error(
        `[CreateProfile] routing-token mint failed for userId=${userId} email=${emailLower}`,
      );
    }

    return {
      success: true,
      alreadyExisted: false,
      profileId: userId,
      username,
      displayName,
      magicLink,
      // Echo the image saved as the profile photo so the turn log can mark it
      // consumed — it must NOT be reused as an event/session flyer.
      profileImageUrl: profileImageUrl ?? null,
    };
  },
});

/**
 * Mint a routing token for the (userId, email) pair and return the
 * Riplect-side URL the bot will WhatsApp to the user. The Supabase
 * magic-link OTP itself is generated lazily by GET /m/:token, so the
 * single-use OTP only exists once an actual click hits our server —
 * WhatsApp's link-preview crawler can't accidentally burn it.
 *
 * Returns null on any error so the caller can surface success without a
 * link rather than rolling back the just-created profile.
 */
async function buildBotMagicLinkUrl(
  authUserId: string,
  email: string,
): Promise<string | null> {
  try {
    const token = await mintBotMagicLinkToken(authUserId, email);
    const base = getAppBaseUrl().replace(/\/$/, "");
    return `${base}/m/${token}`;
  } catch (err: any) {
    console.error(
      "[CreateProfile] mintBotMagicLinkToken failed:",
      err?.message ?? err,
    );
    return null;
  }
}
