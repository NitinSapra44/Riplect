import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEventDate } from "../dateUtils";
import type { InsertEvent } from "@shared/schema";
import {
  generateInstanceDates,
  computeGenerationWindow,
  extractTimeStr,
  cadenceLabelFromPattern,
  type SeriesPattern,
} from "../../events/recurrence";
import {
  BOT_DEFAULT_CITY,
  BOT_DEFAULT_STATE,
  BOT_DEFAULT_COUNTRY,
} from "./botLocationDefaults";

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

const weeklyPattern = z.object({
  type: z.literal("weekly"),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .refine((w) => new Set(w).size === w.length, {
      message: "weekdays must be unique",
    })
    .describe("Days of the week (0=Sunday, 6=Saturday). At least one, no duplicates."),
  intervalWeeks: z
    .number()
    .int()
    .min(1)
    .max(52)
    .default(1)
    .describe("Repeat every N weeks (1=weekly, 2=biweekly)"),
  startDate: z.string().regex(YMD_REGEX).describe("Pattern start date YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(YMD_REGEX)
    .nullable()
    .default(null)
    .describe("Pattern end date YYYY-MM-DD or null for indefinite"),
});

const monthlyNthPattern = z.object({
  type: z.literal("monthly_nth"),
  nth: z.number().int().min(1).max(5).describe("Which occurrence (1=1st, 2=2nd, etc.)"),
  weekday: z.number().int().min(0).max(6).describe("Day of week (0=Sunday, 6=Saturday)"),
  startDate: z.string().regex(YMD_REGEX).describe("Pattern start date YYYY-MM-DD"),
  endDate: z.string().regex(YMD_REGEX).nullable().default(null),
});

const monthlyDatePattern = z.object({
  type: z.literal("monthly_date"),
  dayOfMonth: z.number().int().min(1).max(31).describe("Day of the month"),
  startDate: z.string().regex(YMD_REGEX).describe("Pattern start date YYYY-MM-DD"),
  endDate: z.string().regex(YMD_REGEX).nullable().default(null),
});

const customPattern = z.object({
  type: z.literal("custom"),
  dates: z
    .array(z.string().regex(YMD_REGEX))
    .min(1)
    .describe("List of specific dates YYYY-MM-DD. At least one."),
});

export const createRecurringEvent = tool({
  description: "Create a recurring event series with auto-generated instances. Use instead of createEvent when the event repeats (e.g. 'every Monday', 'every other Friday', 'on the 1st of each month').",
  inputSchema: z
    .object({
      profileId: z.string().describe("The creator's profile ID"),
      title: z.string().min(1).describe("Event name/title"),
      startAt: z
        .string()
        .regex(ISO_DATETIME_REGEX)
        .describe(
          "First event occurrence date+time in ISO 8601 (e.g. 2026-05-14T11:00:00). Must include time. Naive (no offset) is interpreted as Asia/Kolkata.",
        ),
      endAt: z
        .string()
        .regex(ISO_DATETIME_REGEX)
        .optional()
        .describe("First event end date+time in ISO 8601 format. Must be after startAt."),
      price: z
        .string()
        .regex(PRICE_REGEX)
        .describe(
          'Ticket price as plain decimal string, "0" for free. No symbols or commas.',
        ),
      location: z.string().min(1).describe("Venue name or address"),
      currency: z.string().default("INR"),
      description: z.string().optional(),
      thumbnailDescription: z.string().optional(),
      locationUrl: z.string().optional(),
      meetingLink: z.string().optional(),
      mode: z.enum(["online", "offline"]).default("offline"),
      pricingType: z.enum(["paid", "free", "donation"]).default("paid"),
      maxAttendees: z.number().int().positive().optional(),
      timezone: z.string().default("Asia/Kolkata"),
      sourceChannel: z.string().optional(),
      recurringPattern: z.discriminatedUnion("type", [
        weeklyPattern,
        monthlyNthPattern,
        monthlyDatePattern,
        customPattern,
      ]).describe("The recurrence pattern"),
      imageUrls: z.array(z.string()).default([]).describe("Image URLs from the Available Images list in session context. First URL becomes the featured image, rest become gallery items."),
      videoUrls: z.array(z.string()).default([]).describe("Video URLs from the Available Videos list in session context. Attached as gallery videos to every instance in the series."),
    })
    .refine((v) => !v.endAt || v.endAt > v.startAt, {
      message: "endAt must be strictly after startAt",
      path: ["endAt"],
    }),
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
    recurringPattern,
    imageUrls,
    videoUrls,
  }) => {
    const profile = await storage.getProfileById(profileId);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const startDate = parseEventDate(startAt);
    if (Number.isNaN(startDate.getTime())) {
      return {
        success: false,
        errorCode: "INVALID_START_AT",
        error: `Couldn't parse startAt='${startAt}'. Use ISO 8601 with a time (e.g. 2026-05-14T11:00:00).`,
      };
    }
    const PAST_GRACE_MS = 60_000;
    if (startDate.getTime() < Date.now() - PAST_GRACE_MS) {
      return {
        success: false,
        errorCode: "START_IN_PAST",
        error: `startAt is in the past (${startDate.toISOString()}). For a recurring event, startAt must be the next upcoming occurrence — pick a future date and try again.`,
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
    const startTimeHHMM = extractTimeStr(startDate);
    const durationMins = endDate
      ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
      : null;

    // Generation window — see computeGenerationWindow. The lower bound is
    // *today* (IST), NOT startAt's date: startAt only supplies the time-of-day
    // (startTimeHHMM above) and the not-in-past guard.
    const { genFrom, genUntil } = computeGenerationWindow(
      recurringPattern as SeriesPattern,
    );

    // Generate instance dates BEFORE creating the series, so a 0-instance
    // pattern can't leave an orphan series row.
    const occurrenceDates = generateInstanceDates(
      recurringPattern as SeriesPattern,
      genFrom,
      genUntil,
      startTimeHHMM,
    );

    if (occurrenceDates.length === 0) {
      // Most often: custom pattern with dates entirely in the past, or weekly
      // pattern whose endDate window contains no matching weekday. Refuse so
      // the agent re-asks the user for valid dates rather than committing a
      // misleading "recurring event with no instances".
      return {
        success: false,
        errorCode: "NO_INSTANCES",
        error:
          "Couldn't generate any future occurrences from that pattern. " +
          "If the dates are correct, this event has no upcoming sessions — " +
          "ask the user for new dates, or create a single event via createEvent instead.",
      };
    }

    // Create series record
    const series = await storage.createEventSeries({
      profileId,
      pattern: recurringPattern as SeriesPattern,
      defaultStartTime: startTimeHHMM,
      defaultDurationMins: durationMins,
      defaultMaxAttendees: maxAttendees ?? null,
      timezone,
      isActive: true,
    });

    const baseEventData: Omit<InsertEvent, "startAt" | "endAt" | "seriesId" | "sequenceNumber"> = {
      profileId,
      title,
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
      isFeatured: false,
      isCancelled: false,
    };

    const instances = occurrenceDates.map((date, idx) => ({
      ...baseEventData,
      startAt: date,
      endAt: durationMins ? new Date(date.getTime() + durationMins * 60000) : null,
      seriesId: series.id,
      sequenceNumber: idx + 1,
    }));


    const created = await storage.createRecurringEventInstances(instances);
    const lastDate = occurrenceDates[occurrenceDates.length - 1];
    await storage.updateEventSeriesRecord(series.id, { generatedUntil: lastDate });
    const first = created[0];

    // One shared locations row for the whole series — every instance points to
    // it, so editing the venue later moves all dates at once. The lazy series
    // extender in routes.ts (extendSeriesIfNeeded) clones the template
    // instance, which carries locationId forward to future-generated dates.
    const seriesLocation = await storage.createLocation({
      profileId,
      name: location,
      city: BOT_DEFAULT_CITY,
      state: BOT_DEFAULT_STATE,
      country: BOT_DEFAULT_COUNTRY,
      googleMapsUrl: locationUrl ?? null,
      isDefault: false,
    });
    await Promise.all(
      created.map((evt) =>
        storage.updateEvent(evt.id, { locationId: seriesLocation.id }),
      ),
    );

    // Attach images and videos to all instances if provided
    if (imageUrls.length > 0 || videoUrls.length > 0) {
      const galleryImages = imageUrls.slice(1).map((url) => ({ type: "image" as const, url }));
      const galleryVideos = videoUrls.map((url) => ({ type: "video" as const, url }));
      const mediaItemsPayload = [...galleryImages, ...galleryVideos];
      const mediaUpdate: Record<string, any> = {};
      if (imageUrls[0]) mediaUpdate.featuredImage = imageUrls[0];
      if (mediaItemsPayload.length > 0) mediaUpdate.mediaItems = mediaItemsPayload;
      await Promise.all(created.map((evt) => storage.updateEvent(evt.id, mediaUpdate)));
    }

    return {
      success: true,
      kind: "event" as const,
      eventId: first.id,
      eventUrl: `${process.env.APP_BASE_URL}/${profile.username}/event/${first.id}`,
      title: first.title,
      organizerName: profile.displayName,
      instanceCount: created.length,
      cadence: cadenceLabelFromPattern(recurringPattern as SeriesPattern),
      featuredImage: imageUrls[0] ?? null,
      thumbnailDescription: thumbnailDescription ?? null,
      startAt: first.startAt.toISOString(),
      endAt: first.endAt ? first.endAt.toISOString() : null,
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
