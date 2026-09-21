import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEditTarget } from "../linkTarget";
import { parseEventDate } from "../dateUtils";
import type { Event, InsertEvent } from "@shared/schema";
import {
  generateInstanceDates,
  computeGenerationWindow,
  extractTimeStr,
  cadenceLabelFromPattern,
  type SeriesPattern,
} from "../../events/recurrence";
import { formatInTimeZone } from "date-fns-tz";
import { IST } from "../dateUtils";

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

// Same shape as createRecurringEvent's pattern union (re-declared so the two
// tools stay independent modules; the engine in recurrence.ts is the shared
// single source of truth).
const recurringPatternSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("weekly"),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((w) => new Set(w).size === w.length, {
        message: "weekdays must be unique",
      }),
    intervalWeeks: z.number().int().min(1).max(52).default(1),
    startDate: z.string().regex(YMD_REGEX),
    endDate: z.string().regex(YMD_REGEX).nullable().default(null),
  }),
  z.object({
    type: z.literal("monthly_nth"),
    nth: z.number().int().min(1).max(5),
    weekday: z.number().int().min(0).max(6),
    startDate: z.string().regex(YMD_REGEX),
    endDate: z.string().regex(YMD_REGEX).nullable().default(null),
  }),
  z.object({
    type: z.literal("monthly_date"),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: z.string().regex(YMD_REGEX),
    endDate: z.string().regex(YMD_REGEX).nullable().default(null),
  }),
  z.object({
    type: z.literal("custom"),
    dates: z.array(z.string().regex(YMD_REGEX)).min(1),
  }),
]);

const PAST_GRACE_MS = 60_000;

function buildMediaUpdate(
  imageUrls: string[],
  videoUrls: string[],
): Record<string, any> | null {
  if (imageUrls.length === 0 && videoUrls.length === 0) return null;
  const galleryImages = imageUrls.slice(1).map((url) => ({
    type: "image" as const,
    url,
  }));
  const galleryVideos = videoUrls.map((url) => ({
    type: "video" as const,
    url,
  }));
  const items = [...galleryImages, ...galleryVideos];
  const out: Record<string, any> = {};
  if (imageUrls[0]) out.featuredImage = imageUrls[0];
  if (items.length > 0) out.mediaItems = items;
  return out;
}

function eventSummary(
  inst: Event,
  username: string | null,
  organizerName: string | null,
  cadence: string | null,
  extra: Record<string, any> = {},
) {
  return {
    success: true as const,
    updated: true as const,
    kind: "event" as const,
    eventId: inst.id,
    eventUrl: username
      ? `${process.env.APP_BASE_URL}/${username}/event/${inst.id}`
      : null,
    title: inst.title,
    organizerName,
    thumbnailDescription: inst.thumbnailDescription ?? null,
    startAt: inst.startAt.toISOString(),
    endAt: inst.endAt ? inst.endAt.toISOString() : null,
    location: inst.location,
    locationUrl: inst.locationUrl ?? null,
    meetingLink: inst.meetingLink ?? null,
    mode: inst.mode,
    price: inst.price,
    currency: inst.currency,
    pricingType: inst.pricingType,
    cadence,
    featuredImage: inst.featuredImage ?? null,
    timezone: inst.timezone ?? IST,
    ...extra,
  };
}

/**
 * CM-only edit of an existing event (single or recurring). The CM pastes the
 * flyer link plus what to change; only fields the CM actually changes are
 * passed. Call ONLY after the CM confirms the Before→After (mirrors the create
 * tools' confirmation discipline).
 *
 * Recurring semantics:
 *  - Scalar-only change (title/price/location/desc/image/…): fans out to every
 *    instance via storage.updateEventSeries.
 *  - Day/time/cadence change: regenerate future instances through the canonical
 *    recurrence engine. Past instances are untouched. Upcoming instances that
 *    already have signups are PRESERVED at their original date/time (and still
 *    pick up any scalar edits); only unregistered future instances are
 *    rebuilt. Generated dates that collide with a preserved date are skipped.
 */
export const updateEvent = tool({
  description:
    "Update an existing event the CM pasted a link for. For a recurring event this updates the whole series: scalar fields (title/price/location/description/image) fan out to every date; changing day/time/cadence regenerates future dates while preserving past dates and any upcoming dates that already have signups. Only pass the fields the CM wants to change. Call only after the CM confirms the change.",
  inputSchema: z.object({
    link: z
      .string()
      .min(1)
      .describe("The Riplect event link the CM pasted (raw text is fine)."),
    title: z.string().min(1).optional(),
    startAt: z
      .string()
      .regex(ISO_DATETIME_REGEX)
      .optional()
      .describe(
        "New first-occurrence date+time, ISO 8601 (e.g. 2026-06-01T18:00:00). Naive = Asia/Kolkata. For a series, the time-of-day here becomes the new series time.",
      ),
    endAt: z
      .string()
      .regex(ISO_DATETIME_REGEX)
      .optional()
      .describe("New end date+time. Must be after startAt."),
    price: z.string().regex(PRICE_REGEX).optional(),
    location: z.string().min(1).optional(),
    currency: z.string().optional(),
    description: z.string().optional(),
    thumbnailDescription: z.string().optional(),
    locationUrl: z.string().optional(),
    meetingLink: z.string().optional(),
    mode: z.enum(["online", "offline"]).optional(),
    pricingType: z.enum(["paid", "free", "donation"]).optional(),
    maxAttendees: z.number().int().positive().optional(),
    timezone: z.string().optional(),
    imageUrls: z
      .array(z.string())
      .optional()
      .describe(
        "Replacement images from Available images. First becomes featured, rest gallery. Omit to keep current images.",
      ),
    videoUrls: z.array(z.string()).optional(),
    removeImages: z
      .boolean()
      .optional()
      .describe(
        "Set true when the CM asks to REMOVE the event's image entirely (no replacement). Clears the featured image and image gallery; existing videos are kept. Ignored if imageUrls is also provided.",
      ),
    recurringPattern: recurringPatternSchema
      .optional()
      .describe(
        "Provide ONLY when changing how the series repeats (days/cadence). Omit to keep the current pattern.",
      ),
  }),
  execute: async (input) => {
    const { link, imageUrls, videoUrls, removeImages, recurringPattern, ...fields } =
      input;

    const target = parseEditTarget(link);
    if (!target) {
      return {
        success: false,
        errorCode: "BAD_LINK",
        error:
          "That isn't a recognizable Riplect event link. Ask the CM to paste the exact link from the flyer.",
      };
    }
    if (target.kind === "session") {
      return {
        success: false,
        errorCode: "WRONG_KIND",
        error:
          "That link is a session, not an event. Use updateSession instead.",
      };
    }

    const event = await storage.getEventById(target.id);
    if (!event) {
      return {
        success: false,
        errorCode: "NOT_FOUND",
        error: `No active event found for that link (id ${target.id}).`,
      };
    }
    const profile = await storage.getProfileById(event.profileId);
    const username = profile?.username ?? null;
    const organizerName = profile?.displayName ?? null;
    const tz = event.timezone || IST;

    // Build the scalar (non-timing) update map from only the provided fields.
    const scalar: Partial<InsertEvent> = {};
    if (fields.title !== undefined) scalar.title = fields.title;
    if (fields.location !== undefined) scalar.location = fields.location;
    if (fields.currency !== undefined) scalar.currency = fields.currency;
    if (fields.description !== undefined)
      scalar.description = fields.description;
    if (fields.thumbnailDescription !== undefined)
      scalar.thumbnailDescription = fields.thumbnailDescription;
    if (fields.locationUrl !== undefined)
      scalar.locationUrl = fields.locationUrl;
    if (fields.meetingLink !== undefined)
      scalar.meetingLink = fields.meetingLink;
    if (fields.mode !== undefined) scalar.mode = fields.mode;
    if (fields.maxAttendees !== undefined)
      scalar.maxAttendees = fields.maxAttendees;
    if (fields.timezone !== undefined) scalar.timezone = fields.timezone;
    if (fields.pricingType !== undefined)
      scalar.pricingType = fields.pricingType;
    if (fields.price !== undefined) scalar.price = fields.price;
    // free pricing forces price to 0 regardless of any price passed
    if (fields.pricingType === "free") scalar.price = "0";

    const media = buildMediaUpdate(imageUrls ?? [], videoUrls ?? []);
    if (media) {
      Object.assign(scalar, media);
    } else if (removeImages) {
      // Drop the featured image + any image gallery items; keep videos.
      const keptVideos = (event.mediaItems ?? []).filter(
        (m) => m.type === "video",
      );
      scalar.featuredImage = null;
      scalar.mediaItems = keptVideos.length > 0 ? keptVideos : null;
    }

    // Parse timing inputs (shared by single + series paths).
    let newStart: Date | null = null;
    let newEnd: Date | null = null;
    if (fields.startAt) {
      newStart = parseEventDate(fields.startAt);
      if (Number.isNaN(newStart.getTime())) {
        return {
          success: false,
          errorCode: "INVALID_START_AT",
          error: `Couldn't parse startAt='${fields.startAt}'.`,
        };
      }
    }
    if (fields.endAt) {
      newEnd = parseEventDate(fields.endAt);
      if (Number.isNaN(newEnd.getTime())) {
        return {
          success: false,
          errorCode: "INVALID_END_AT",
          error: `Couldn't parse endAt='${fields.endAt}'.`,
        };
      }
    }
    if (newStart && newEnd && newEnd <= newStart) {
      return {
        success: false,
        errorCode: "END_BEFORE_START",
        error: "endAt must be after startAt.",
      };
    }

    // ---- Single (non-recurring) event ----
    if (!event.seriesId) {
      const updates: Partial<InsertEvent> = { ...scalar };
      if (newStart) {
        updates.startAt = newStart;
        if (newEnd) {
          updates.endAt = newEnd;
        } else if (event.endAt) {
          // Preserve the original duration when only the start moves.
          const durMs = event.endAt.getTime() - event.startAt.getTime();
          updates.endAt = new Date(newStart.getTime() + durMs);
        }
      } else if (newEnd) {
        updates.endAt = newEnd;
      }
      const updated = await storage.updateEvent(event.id, updates);
      return eventSummary(updated, username, organizerName, null);
    }

    // ---- Recurring series ----
    const seriesId = event.seriesId;
    const [series, instances, regCounts] = await Promise.all([
      storage.getEventSeriesById(seriesId),
      storage.getEventSeriesInstances(seriesId),
      storage.getActiveRegistrationCountsBySeriesId(seriesId),
    ]);
    if (!series) {
      return {
        success: false,
        errorCode: "NOT_FOUND",
        error: "The recurring series for that event no longer exists.",
      };
    }

    const timeChanged =
      newStart != null &&
      extractTimeStr(newStart) !== (series.defaultStartTime ?? null);
    const newDurationMins =
      newStart && newEnd
        ? Math.round((newEnd.getTime() - newStart.getTime()) / 60000)
        : (series.defaultDurationMins ?? null);
    const durationChanged =
      newStart != null &&
      newEnd != null &&
      newDurationMins !== (series.defaultDurationMins ?? null);
    const isRegen =
      recurringPattern != null || timeChanged || durationChanged;

    // Scalar-only change → fan out to every instance in one shot. updateEventSeries
    // ignores startAt/seriesId/sequenceNumber, so dates are untouched.
    if (!isRegen) {
      if (Object.keys(scalar).length > 0) {
        await storage.updateEventSeries(seriesId, scalar);
      }
      const refreshed =
        (await storage.getEventById(event.id)) ?? { ...event, ...scalar };
      return eventSummary(
        refreshed as Event,
        username,
        organizerName,
        cadenceLabelFromPattern(series.pattern),
      );
    }

    // Pattern / time / duration change → regenerate future instances.
    const newPattern = (recurringPattern ?? series.pattern) as SeriesPattern;
    const newStartTime = newStart
      ? extractTimeStr(newStart)
      : (series.defaultStartTime ?? null);

    const { genFrom, genUntil } = computeGenerationWindow(newPattern);
    let occ = generateInstanceDates(
      newPattern,
      genFrom,
      genUntil,
      newStartTime,
    );

    const now = Date.now();
    const futureInstances = instances.filter(
      (i) => i.startAt.getTime() >= now - PAST_GRACE_MS,
    );
    const preserved = futureInstances.filter(
      (i) => (regCounts.get(i.id) ?? 0) > 0,
    );
    const regenerable = futureInstances.filter(
      (i) => (regCounts.get(i.id) ?? 0) === 0,
    );

    // Don't double-book a calendar day that a preserved (already-booked)
    // instance occupies — drop generated dates that land on a preserved date.
    const preservedDays = new Set(
      preserved.map((i) => formatInTimeZone(i.startAt, tz, "yyyy-MM-dd")),
    );
    occ = occ.filter(
      (d) =>
        d.getTime() >= now - PAST_GRACE_MS &&
        !preservedDays.has(formatInTimeZone(d, tz, "yyyy-MM-dd")),
    );

    // Generate-before-delete: if the new pattern yields nothing and there are
    // no preserved dates either, refuse rather than wipe the series.
    if (occ.length === 0 && preserved.length === 0) {
      return {
        success: false,
        errorCode: "NO_INSTANCES",
        error:
          "That change produces no upcoming dates. Double-check the pattern/dates with the CM — nothing was modified.",
      };
    }

    // Safe to mutate now.
    await storage.softDeleteEventsByIds(regenerable.map((i) => i.id));

    const maxSeq = instances.reduce(
      (m, i) => Math.max(m, i.sequenceNumber ?? 0),
      0,
    );

    // New instances copy the link's instance as the template, with the CM's
    // scalar edits applied on top. (Per-instance overrides on regenerated
    // dates are intentionally not carried over.)
    const baseData: InsertEvent = {
      profileId: event.profileId,
      title: event.title,
      description: event.description ?? null,
      thumbnailDescription: event.thumbnailDescription ?? null,
      location: event.location ?? "",
      locationUrl: event.locationUrl ?? null,
      meetingLink: event.meetingLink ?? null,
      mode: event.mode ?? "offline",
      price: event.price,
      currency: event.currency,
      pricingType: event.pricingType ?? "paid",
      maxAttendees: event.maxAttendees ?? null,
      timezone: event.timezone ?? tz,
      sourceChannel: event.sourceChannel ?? null,
      featuredImage: event.featuredImage ?? null,
      mediaItems: event.mediaItems ?? null,
      isFeatured: false,
      isCancelled: false,
      seriesId,
      startAt: event.startAt,
      ...scalar,
    } as InsertEvent;

    const newInstances: InsertEvent[] = occ.map((date, idx) => ({
      ...baseData,
      startAt: date,
      endAt: newDurationMins
        ? new Date(date.getTime() + newDurationMins * 60000)
        : null,
      seriesId,
      sequenceNumber: maxSeq + idx + 1,
    }));

    const created =
      newInstances.length > 0
        ? await storage.createRecurringEventInstances(newInstances)
        : [];

    // Fan scalar edits onto preserved + past instances too, so a combined
    // "move to Fridays AND rename" also renames the kept booked dates (without
    // moving them — updateEventSeries never touches startAt).
    if (Object.keys(scalar).length > 0) {
      await storage.updateEventSeries(seriesId, scalar);
    }

    const lastDate =
      occ.length > 0
        ? occ.reduce((a, b) => (a > b ? a : b))
        : (series.generatedUntil ?? genUntil);
    await storage.updateEventSeriesRecord(seriesId, {
      pattern: newPattern,
      defaultStartTime: newStartTime,
      defaultDurationMins: newDurationMins,
      generatedUntil: lastDate,
    });

    // Flyer should point at the soonest upcoming instance (preserved or new).
    const upcomingPool = [...preserved, ...created]
      .filter((i) => i.startAt.getTime() >= now - PAST_GRACE_MS)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const head = upcomingPool[0] ?? created[0] ?? event;

    const preservedDates = preserved
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((i) => formatInTimeZone(i.startAt, tz, "EEE d MMM, h:mm a"));

    return eventSummary(
      head as Event,
      username,
      organizerName,
      cadenceLabelFromPattern(newPattern),
      {
        instanceCount: created.length,
        preservedRegisteredDates: preservedDates,
      },
    );
  },
});
