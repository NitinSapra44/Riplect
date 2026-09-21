import {tool} from "ai";
import {z} from "zod";
import {storage} from "../../storage";
import {getAppBaseUrl} from "../../email/utils";
import type {InsertBookingSession} from "@shared/schema";
import {
  BOT_DEFAULT_CITY,
  BOT_DEFAULT_STATE,
  BOT_DEFAULT_COUNTRY,
} from "./botLocationDefaults";

// Sessions don't have per-instance venues — they're just "this coach takes
// bookings in <city>". So we keep ONE city-level locations row per coach and
// reuse it across every session that coach has. Not marked isDefault so we
// don't clobber a different default the coach may have set via the dashboard.
async function getOrCreateCoachBotLocation(profileId: string) {
  const existing = await storage.getLocationsByProfileId(profileId);
  const match = existing.find((l) => l.city === BOT_DEFAULT_CITY);
  if (match) return match;
  return storage.createLocation({
    profileId,
    name: BOT_DEFAULT_CITY,
    city: BOT_DEFAULT_CITY,
    state: BOT_DEFAULT_STATE,
    country: BOT_DEFAULT_COUNTRY,
    isDefault: false,
  });
}

// Match the price contract for events: digits-only decimal, optional cents,
// no currency symbols, no thousand separators. The agent should pre-clean
// "₹500" / "1,000" into "500" / "1000" before calling.
const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

export const createSession = tool({
  description: "Create a new booking session (1-on-1 or group) for a creator.",
  inputSchema: z.object({
    profileId: z.string().describe("The creator's profile ID"),
    title: z.string().min(1).describe("Session name/title"),
    duration: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .describe("Session duration in minutes (1 – 1440)"),
    price: z
      .string()
      .regex(PRICE_REGEX)
      .describe(
        'Session price as plain decimal string, "0" for free. No symbols or commas.',
      ),
    currency: z.string().default("INR").describe("ISO 4217 currency code"),
    description: z.string().optional().describe("Full session description"),
    thumbnailDescription: z
      .string()
      .optional()
      .describe("A 1-2 sentence summary of the session for listing cards"),
    isFree: z.boolean().default(false).describe("true if the session is free"),
    mode: z
      .enum(["online", "offline"])
      .default("offline")
      .describe(
        "Session mode. 'online' for virtual sessions (Zoom/Meet etc.), 'offline' for in-person. Choose exactly one — they are mutually exclusive.",
      ),
    locationUrl: z.string().optional().describe("URL for online sessions"),
    availableDays: z
      .array(z.number().min(0).max(6))
      .default([0, 1, 2, 3, 4, 5, 6])
      .describe("Available days (0=Sunday, 6=Saturday)"),
    timezone: z
      .string()
      .default("Asia/Kolkata")
      .describe("IANA timezone string"),
    imageUrls: z
      .array(z.string())
      .default([])
      .describe(
        "Image URLs from the Available Images list in session context.",
      ),
  }),
  execute: async ({
    profileId,
    title,
    duration,
    price,
    currency,
    description,
    thumbnailDescription,
    isFree,
    mode,
    locationUrl,
    availableDays,
    timezone,
    imageUrls,
  }) => {
    const profile = await storage.getProfileById(profileId);
    if (!profile) {
      return {success: false, error: "Profile not found"};
    }

    // Hard gate: a session without availability slots is unbookable. The
    // agent prompt already requires setAvailability first when hasAvailability
    // is false, but if the LLM skips it (or setAvailability silently failed),
    // we'd otherwise create a session no one can book. Reject so the agent
    // surfaces the gap and re-prompts the user for hours.
    const slots = await storage.getAllMentorAvailabilityByProfileId(profileId);
    if (slots.length === 0) {
      return {
        success: false,
        errorCode: "NO_AVAILABILITY",
        error:
          "Profile has no bookable hours configured — sessions can't be booked without availability. " +
          "Ask the creator for their weekly hours and call setAvailability before retrying createSession.",
      };
    }

    const isOnline = mode === "online";
    const isOffline = mode === "offline";

    const sessionData: InsertBookingSession = {
      profileId,
      title,
      duration,
      price: isFree ? "0" : price,
      currency,
      description: description ?? null,
      thumbnailDescription: thumbnailDescription ?? null,
      isFree,
      isOffline,
      isOnline,
      locationUrl: locationUrl ?? null,
      availableDays,
      timezone,
    };

    const session = await storage.createBookingSession(sessionData);

    const coachLocation = await getOrCreateCoachBotLocation(profileId);
    await storage.updateBookingSession(session.id, {
      locationId: coachLocation.id,
    });

    // Attach images if provided
    if (imageUrls.length > 0) {
      const imagesPayload = imageUrls.map((url) => ({url, alt: ""}));
      await storage.updateBookingSession(session.id, {images: imagesPayload});
    }

    const sessionUrl = `${process.env.APP_BASE_URL}/${profile.username}/session/${session.id}`;
    const featuredImage = imageUrls[0] ?? null;

    return {
      success: true,
      kind: "session" as const,
      sessionId: session.id,
      sessionUrl,
      title: session.title,
      organizerName: profile.displayName,
      featuredImage,
      thumbnailDescription: thumbnailDescription ?? null,
      duration,
      price: isFree ? "0" : price,
      currency,
      isFree,
      isOnline,
      isOffline,
      locationUrl: locationUrl ?? null,
      timezone,
    };
  },
});
