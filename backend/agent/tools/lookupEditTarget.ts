import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEditTarget } from "../linkTarget";
import { cadenceLabelFromPattern } from "../../events/recurrence";
import { formatInTimeZone } from "date-fns-tz";
import { IST } from "../dateUtils";

// Inactive/cancelled registrations don't pin an instance — same "active"
// definition storage.getActiveRegistrationCountsBySeriesId uses.
const DEAD_REG = new Set(["cancelled", "refunded"]);

function fmt(d: Date, tz: string): string {
  try {
    return formatInTimeZone(d, tz || IST, "EEE d MMM, h:mm a");
  } catch {
    return d.toISOString();
  }
}

/**
 * Read-only resolver for the CM "fix an event/session" flow. The CM pastes the
 * flyer link we sent them; this turns it back into the underlying record and
 * returns its current values plus — critically — which upcoming dates already
 * have signups, so the agent can show a Before→After and warn that booked
 * dates will be preserved (not moved) if the recurrence changes.
 *
 * Never writes. The agent calls updateEvent / updateSession only after the CM
 * confirms the diff.
 */
export const lookupEditTarget = tool({
  description:
    "Resolve a Riplect event/session link the CM pasted into the current values of that event or session, so you can show a Before→After summary before updating. Read-only — never changes anything. Call this when the CM wants to fix/update an existing event or session and has pasted its link.",
  inputSchema: z.object({
    link: z
      .string()
      .min(1)
      .describe(
        "The full Riplect link the CM pasted (e.g. https://riplect.com/asha/event/42). Pass the raw text — surrounding words and query strings are fine.",
      ),
  }),
  execute: async ({ link }) => {
    const target = parseEditTarget(link);
    if (!target) {
      return {
        found: false,
        reason: "BAD_LINK",
        error:
          "That doesn't look like a Riplect event or session link. Ask the CM to paste the exact link from the flyer (it looks like riplect.com/<name>/event/<number>).",
      };
    }

    const now = Date.now();

    if (target.kind === "event") {
      const event = await storage.getEventById(target.id);
      if (!event) {
        return {
          found: false,
          reason: "NOT_FOUND",
          error: `No active event found for that link (id ${target.id}). It may have been deleted.`,
        };
      }
      const profile = await storage.getProfileById(event.profileId);
      const tz = event.timezone || IST;

      const base = {
        found: true as const,
        kind: "event" as const,
        eventId: event.id,
        organizerName: profile?.displayName ?? null,
        username: profile?.username ?? null,
        current: {
          title: event.title,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt ? event.endAt.toISOString() : null,
          location: event.location,
          locationUrl: event.locationUrl,
          meetingLink: event.meetingLink,
          mode: event.mode,
          price: event.price,
          currency: event.currency,
          pricingType: event.pricingType,
          maxAttendees: event.maxAttendees,
          description: event.description,
          thumbnailDescription: event.thumbnailDescription,
          featuredImage: event.featuredImage,
          timezone: tz,
        },
      };

      if (!event.seriesId) {
        const regs = await storage.getEventRegistrationsByEventId(event.id);
        const activeRegs = regs.filter(
          (r) => !DEAD_REG.has(String(r.status)),
        ).length;
        return {
          ...base,
          seriesId: null,
          isRecurring: false,
          startDisplay: fmt(event.startAt, tz),
          registrationCount: activeRegs,
          // For a single event, changing the date when people are registered
          // is the thing to warn about.
          hasRegistrations: activeRegs > 0,
        };
      }

      const [series, instances, regCounts] = await Promise.all([
        storage.getEventSeriesById(event.seriesId),
        storage.getEventSeriesInstances(event.seriesId),
        storage.getActiveRegistrationCountsBySeriesId(event.seriesId),
      ]);

      const upcoming = instances.filter((i) => i.startAt.getTime() >= now);
      const upcomingRegistered = upcoming.filter(
        (i) => (regCounts.get(i.id) ?? 0) > 0,
      );

      return {
        ...base,
        seriesId: event.seriesId,
        isRecurring: true,
        cadence: series ? cadenceLabelFromPattern(series.pattern) : "Recurring",
        pattern: series?.pattern ?? null,
        defaultStartTime: series?.defaultStartTime ?? null,
        defaultDurationMins: series?.defaultDurationMins ?? null,
        totalUpcomingInstances: upcoming.length,
        nextDate: upcoming[0] ? fmt(upcoming[0].startAt, tz) : null,
        // The agent surfaces these in the confirmation: they keep their
        // original date/time if the pattern changes (preserve & warn).
        upcomingRegisteredCount: upcomingRegistered.length,
        upcomingRegisteredDates: upcomingRegistered.map((i) =>
          fmt(i.startAt, tz),
        ),
      };
    }

    // session
    const session = await storage.getBookingSessionById(target.id);
    if (!session) {
      return {
        found: false,
        reason: "NOT_FOUND",
        error: `No session found for that link (id ${target.id}). It may have been deleted.`,
      };
    }
    const profile = await storage.getProfileById(session.profileId);
    const bookings = await storage.getBookingsBySessionId(session.id);
    const images = (session.images ?? []) as Array<{ url: string }>;

    return {
      found: true as const,
      kind: "session" as const,
      sessionId: session.id,
      organizerName: profile?.displayName ?? null,
      username: profile?.username ?? null,
      current: {
        title: session.title,
        duration: session.duration,
        price: session.price,
        currency: session.currency,
        isFree: session.isFree,
        mode: session.isOnline && !session.isOffline ? "online" : "offline",
        locationUrl: session.locationUrl,
        description: session.description,
        thumbnailDescription: session.thumbnailDescription,
        featuredImage: images[0]?.url ?? null,
        timezone: session.timezone || IST,
      },
      bookingCount: bookings.length,
      hasBookings: bookings.length > 0,
    };
  },
});
