import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { findProfileByWhatsApp } from "../../whatsapp/profileLookup";

async function buildHit(profile: {
  id: string;
  displayName: string;
  username: string;
  title: string | null;
}) {
  const slots = await storage.getAllMentorAvailabilityByProfileId(profile.id);
  return {
    found: true,
    profileId: profile.id,
    displayName: profile.displayName,
    username: profile.username,
    title: profile.title,
    hasAvailability: slots.length > 0,
  };
}

export const lookupProfile = tool({
  description:
    "Look up a creator's profile by phone number or username. Returns the profileId needed for creating events or sessions, plus hasAvailability (true if the creator already has bookable hours configured — skip the availability question for sessions when true).",
  inputSchema: z.object({
    phone: z
      .string()
      .optional()
      .describe("WhatsApp phone number in E.164 format (e.g. +919876543210)"),
    username: z.string().optional().describe("Riplect username"),
  }),
  execute: async ({ phone, username }) => {
    if (!phone && !username) {
      return { found: false, error: "Provide either phone or username" };
    }

    if (username) {
      const profile = await storage.getProfileByUsername(username);
      if (profile) return buildHit(profile);
    }

    if (phone) {
      const profileId = await findProfileByWhatsApp(phone);
      if (profileId) {
        const profile = await storage.getProfileById(profileId);
        if (profile) return buildHit(profile);
      }
    }

    return { found: false };
  },
});
