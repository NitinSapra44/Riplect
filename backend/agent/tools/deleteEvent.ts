import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEditTarget } from "../linkTarget";
import { cadenceLabelFromPattern } from "../../events/recurrence";

/**
 * CM-only deletion of an existing event the CM pasted a link for. Mirrors
 * updateEvent's identification discipline: the CM must paste the Riplect link,
 * and the agent calls this only after the CM explicitly confirms (use
 * lookupEditTarget first to show what's about to go).
 *
 * Recurring semantics: deleting a recurring event removes the WHOLE series
 * (every instance + the series record) — same whole-series philosophy as
 * updateEvent. There is no per-instance delete via this tool.
 *
 * Delete is a soft delete (isActive=false) — recoverable in the DB — so we
 * don't block on or warn about active signups here; the agent's confirmation
 * step is the safeguard.
 */
export const deleteEvent = tool({
  description:
    "Delete (take down) an existing event the CM pasted a link for. For a recurring event this deletes the entire series — every upcoming date. Call ONLY after the CM explicitly confirms the deletion. Use lookupEditTarget first to show what will be deleted.",
  inputSchema: z.object({
    link: z
      .string()
      .min(1)
      .describe("The Riplect event link the CM pasted (raw text is fine)."),
  }),
  execute: async ({ link }) => {
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
          "That link is a session, not an event. Use deleteSession instead.",
      };
    }

    const event = await storage.getEventById(target.id);
    if (!event) {
      return {
        success: false,
        errorCode: "NOT_FOUND",
        error: `No active event found for that link (id ${target.id}). It may have already been deleted.`,
      };
    }
    const profile = await storage.getProfileById(event.profileId);
    const organizerName = profile?.displayName ?? null;

    if (!event.seriesId) {
      await storage.deleteEvent(event.id);
      return {
        success: true as const,
        deleted: true as const,
        kind: "event" as const,
        eventId: event.id,
        title: event.title,
        organizerName,
        wasRecurring: false as const,
      };
    }

    // Recurring → whole-series delete (every instance + the series record).
    const series = await storage.getEventSeriesById(event.seriesId);
    await storage.deleteEventSeries(event.seriesId);
    return {
      success: true as const,
      deleted: true as const,
      kind: "event" as const,
      eventId: event.id,
      seriesId: event.seriesId,
      title: event.title,
      organizerName,
      wasRecurring: true as const,
      cadence: series ? cadenceLabelFromPattern(series.pattern) : null,
    };
  },
});
