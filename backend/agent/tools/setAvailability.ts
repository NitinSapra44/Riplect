import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const slotSchema = z.object({
  dayOfWeek: z
    .number()
    .min(0)
    .max(6)
    .describe("Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)"),
  startTime: z
    .string()
    .regex(HHMM)
    .describe("Window start time in 24h HH:MM format (e.g. '09:00')"),
  endTime: z
    .string()
    .regex(HHMM)
    .describe("Window end time in 24h HH:MM format (e.g. '17:00'). Must be after startTime."),
});

export const setAvailability = tool({
  description:
    "Set the creator's weekly booking availability. Accepts multiple time windows per day (e.g. Mon 09:00-12:00 AND Mon 14:00-17:00). " +
    "If the creator already has any availability set, this tool returns alreadySet=true plus the existing slots — it does NOT modify anything. " +
    "Show the existing slots to the user and tell them to update via their dashboard if they want to change them. Required before sessions are bookable.",
  inputSchema: z.object({
    profileId: z.string().describe("The creator's profile ID"),
    slots: z
      .array(slotSchema)
      .min(1)
      .describe(
        "Array of weekly recurring availability windows. Multiple windows on the same day are allowed.",
      ),
  }),
  execute: async ({ profileId, slots }) => {
    const profile = await storage.getProfileById(profileId);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const existing = await storage.getAllMentorAvailabilityByProfileId(profileId);
    if (existing.length > 0) {
      // Surface the existing slots instead of silently no-op'ing — so the
      // agent can tell the user what's already configured rather than acting
      // as if the new hours were added.
      const existingSlots = existing.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      }));
      return {
        success: true,
        alreadySet: true,
        existingSlots,
        message:
          "Availability is already configured. The NEW slots you passed were NOT added. " +
          "Show existingSlots to the user and ask them to update via their dashboard at riplect.com if they want to change it.",
      };
    }

    for (const s of slots) {
      if (s.startTime >= s.endTime) {
        return {
          success: false,
          error: `Invalid window for day ${s.dayOfWeek}: startTime ${s.startTime} must be before endTime ${s.endTime}.`,
        };
      }
    }

    const created = await Promise.all(
      slots.map((s) =>
        storage.createMentorAvailability({
          profileId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: true,
        }),
      ),
    );

    return {
      success: true,
      alreadySet: false,
      slotCount: created.length,
    };
  },
});
