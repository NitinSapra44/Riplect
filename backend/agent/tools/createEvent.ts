import {tool} from "ai";
import {z} from "zod";
import {storage} from "../../storage";
import {getAppBaseUrl} from "../../email/utils";
import {parseEventDate} from "../dateUtils";
import type {InsertEvent} from "@shared/schema";
import {
  BOT_DEFAULT_CITY,
  BOT_DEFAULT_STATE,
  BOT_DEFAULT_COUNTRY,
} from "./botLocationDefaults";

// Naive ISO datetime with optional offset/Z. Date-only ("2026-05-14") is
// rejected deliberately — parseEventDate would return Invalid Date.
const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;
const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

export const createEvent = tool({
  description: "Create a new event for a creator.",
  inputSchema: z
    .object({
      profileId: z.string().describe("The creator's profile ID"),
      title: z.string().min(1).describe("Event name/title"),
      startAt: z
        .string()
        .regex(ISO_DATETIME_REGEX)
        .describe(
          "Event start date+time in ISO 8601 (e.g. 2026-04-20T10:00:00). Must include time. Naive (no offset) is interpreted as Asia/Kolkata.",
        ),
      endAt: z
        .string()
        .regex(ISO_DATETIME_REGEX)
        .optional()
        .describe("Event end date+time in ISO 8601 format. Must be after startAt."),
      price: z
        .string()
        .regex(PRICE_REGEX)
        .describe(
          'Ticket price as plain decimal string, "0" for free. No symbols or commas — strip "₹"/"1,000" before calling.',
        ),
      location: z.string().min(1).describe("Venue name or address"),
      currency: z.string().default("INR").describe("ISO 4217 currency code"),
      description: z.string().optional().describe("Full event description"),
      thumbnailDescription: z
        .string()
        .optional()
        .describe("A 1-2 sentence summary of the event for listing cards"),
      locationUrl: z
        .string()
        .optional()
        .describe("URL for online events or map link"),
      meetingLink: z
        .string()
        .optional()
        .describe("Meeting link for online events"),
      mode: z
        .enum(["online", "offline"])
        .default("offline")
        .describe("Event mode: online or offline"),
      pricingType: z
        .enum(["paid", "free", "donation"])
        .default("paid")
        .describe("Pricing type"),
      maxAttendees: z.number().int().positive().optional().describe("Maximum attendee capacity"),
      timezone: z
        .string()
        .default("Asia/Kolkata")
        .describe("IANA timezone string"),
      sourceChannel: z
        .string()
        .optional()
        .describe("Channel the event was created from"),
      imageUrls: z
        .array(z.string())
        .default([])
        .describe(
          "Image URLs from the Available Images list in session context. First URL becomes the featured image, rest become gallery items.",
        ),
      videoUrls: z
        .array(z.string())
        .default([])
        .describe(
          "Video URLs from the Available Videos list in session context. Attached as gallery videos. Do NOT put image URLs here or video URLs in imageUrls.",
        ),
    })
    .refine(
      (v) => {
        if (!v.endAt) return true;
        // Compare wall-clock strings — safe because both sides went through
        // the same regex and naive ISO is treated as the same TZ on both sides.
        return v.endAt > v.startAt;
      },
      { message: "endAt must be strictly after startAt", path: ["endAt"] },
    ),
  execute: async ({
    profileId,
    title,
    startAt,
    endAt,
    price,
    location,
    currency,
    description,
    thumbnailDescription,
    locationUrl,
    meetingLink,
    mode,
    pricingType,
    maxAttendees,
    timezone,
    sourceChannel,
    imageUrls,
    videoUrls,
  }) => {
    const profile = await storage.getProfileById(profileId);
    if (!profile) {
      return {success: false, error: "Profile not found"};
    }

    const startDate = parseEventDate(startAt);
    if (Number.isNaN(startDate.getTime())) {
      return {
        success: false,
        errorCode: "INVALID_START_AT",
        error: `Couldn't parse startAt='${startAt}'. Use ISO 8601 with a time (e.g. 2026-05-14T11:00:00).`,
      };
    }
    // Reject obviously-past dates so the agent re-asks instead of saving a
    // useless event. Tiny grace window absorbs clock skew between the agent
    // and this server (LLM response can be a few seconds old).
    const PAST_GRACE_MS = 60_000;
    if (startDate.getTime() < Date.now() - PAST_GRACE_MS) {
      return {
        success: false,
        errorCode: "START_IN_PAST",
        error: `startAt is in the past (${startDate.toISOString()}). Ask for a future date/time and try again.`,
      };
    }
    const endDate = endAt ? parseEventDate(endAt) : null;
    if (endDate && Number.isNaN(endDate.getTime())) {
      return {
        success: false,
        errorCode: "INVALID_END_AT",
        error: `Couldn't parse endAt='${endAt}'. Use ISO 8601 with a time.`,
      };
    }

    const eventData: InsertEvent = {
      profileId,
      title,
      startAt: startDate,
      endAt: endDate,
      price: pricingType === "free" ? "0" : price,
      currency,
      description: description ?? null,
      thumbnailDescription: thumbnailDescription ?? null,
      location,
      locationUrl: locationUrl ?? null,
      meetingLink: meetingLink ?? null,
      mode,
      pricingType,
      maxAttendees: maxAttendees ?? null,
      timezone,
      sourceChannel: sourceChannel ?? null,
    };

    const event = await storage.createEvent(eventData);

    // Stamp a structured location row so the homepage city filter (which reads
    // events.locationId → locations.city/state/country) matches this event.
    // Per-event row, not shared — keeps later dashboard edits scoped to one event.
    const eventLocation = await storage.createLocation({
      profileId,
      name: location,
      city: BOT_DEFAULT_CITY,
      state: BOT_DEFAULT_STATE,
      country: BOT_DEFAULT_COUNTRY,
      googleMapsUrl: locationUrl ?? null,
      isDefault: false,
    });
    await storage.updateEvent(event.id, {locationId: eventLocation.id});

    // Attach images and videos if provided
    if (imageUrls.length > 0 || videoUrls.length > 0) {
      const galleryImages = imageUrls
        .slice(1)
        .map((url) => ({type: "image" as const, url}));
      const galleryVideos = videoUrls.map((url) => ({
        type: "video" as const,
        url,
      }));
      const mediaItemsPayload = [...galleryImages, ...galleryVideos];
      await storage.updateEvent(event.id, {
        featuredImage: imageUrls[0] ?? null,
        mediaItems:
          mediaItemsPayload.length > 0 ? mediaItemsPayload : undefined,
      });
    }

    const eventUrl = `${process.env.APP_BASE_URL}/${profile.username}/event/${event.id}`;
    const featuredImage = imageUrls[0] ?? null;

    return {
      success: true,
      kind: "event" as const,
      eventId: event.id,
      eventUrl,
      title: event.title,
      organizerName: profile.displayName,
      featuredImage,
      thumbnailDescription: thumbnailDescription ?? null,
      startAt: startDate.toISOString(),
      endAt: endDate ? endDate.toISOString() : null,
      location,
      locationUrl: locationUrl ?? null,
      meetingLink: meetingLink ?? null,
      mode,
      price: pricingType === "free" ? "0" : price,
      currency,
      pricingType,
      timezone,
    };
  },
});

