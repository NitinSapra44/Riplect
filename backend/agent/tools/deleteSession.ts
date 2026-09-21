import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEditTarget } from "../linkTarget";

/**
 * CM-only deletion of an existing booking session the CM pasted a link for.
 * Mirrors updateSession's identification discipline: the CM must paste the
 * Riplect link, and the agent calls this only after the CM explicitly confirms
 * (use lookupEditTarget first to show what's about to go).
 *
 * Delete is a soft delete (isActive=false) — recoverable in the DB — so we
 * don't block on or warn about existing bookings here; the agent's
 * confirmation step is the safeguard.
 */
export const deleteSession = tool({
  description:
    "Delete (take down) an existing booking session the CM pasted a link for. Call ONLY after the CM explicitly confirms the deletion. Use lookupEditTarget first to show what will be deleted.",
  inputSchema: z.object({
    link: z
      .string()
      .min(1)
      .describe("The Riplect session link the CM pasted (raw text is fine)."),
  }),
  execute: async ({ link }) => {
    const target = parseEditTarget(link);
    if (!target) {
      return {
        success: false,
        errorCode: "BAD_LINK",
        error:
          "That isn't a recognizable Riplect session link. Ask the CM to paste the exact link from the flyer.",
      };
    }
    if (target.kind === "event") {
      return {
        success: false,
        errorCode: "WRONG_KIND",
        error: "That link is an event, not a session. Use deleteEvent instead.",
      };
    }

    const session = await storage.getBookingSessionById(target.id);
    if (!session) {
      return {
        success: false,
        errorCode: "NOT_FOUND",
        error: `No session found for that link (id ${target.id}). It may have already been deleted.`,
      };
    }
    const profile = await storage.getProfileById(session.profileId);

    await storage.deleteBookingSession(session.id);

    return {
      success: true as const,
      deleted: true as const,
      kind: "session" as const,
      sessionId: session.id,
      title: session.title,
      organizerName: profile?.displayName ?? null,
    };
  },
});
