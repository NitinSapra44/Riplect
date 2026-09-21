import { tool } from "ai";
import { z } from "zod";
import { storage } from "../../storage";
import { parseEditTarget } from "../linkTarget";
import { IST } from "../dateUtils";
import type { InsertBookingSession } from "@shared/schema";

const PRICE_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * CM-only edit of an existing booking session. The CM pastes the session link
 * plus what to change; only changed fields are passed. Call ONLY after the CM
 * confirms the Before→After.
 *
 * Editing a session never moves any dates (slots come from the organizer's
 * availability, not the session row), so there's no destructive regeneration
 * here — existing bookings simply keep pointing at the same session.
 */
export const updateSession = tool({
  description:
    "Update an existing booking session the CM pasted a link for. Only pass the fields the CM wants to change. Call only after the CM confirms the change. If the session already has bookings, mention that changing duration/price affects future bookings only.",
  inputSchema: z.object({
    link: z
      .string()
      .min(1)
      .describe("The Riplect session link the CM pasted (raw text is fine)."),
    title: z.string().min(1).optional(),
    duration: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional()
      .describe("Session duration in minutes (1–1440)."),
    price: z.string().regex(PRICE_REGEX).optional(),
    currency: z.string().optional(),
    isFree: z.boolean().optional(),
    description: z.string().optional(),
    thumbnailDescription: z.string().optional(),
    mode: z.enum(["online", "offline"]).optional(),
    locationUrl: z.string().optional(),
    timezone: z.string().optional(),
    imageUrls: z
      .array(z.string())
      .optional()
      .describe(
        "Replacement images. First becomes featured. Omit to keep current images.",
      ),
    removeImages: z
      .boolean()
      .optional()
      .describe(
        "Set true when the CM asks to REMOVE the session's image entirely (no replacement). Ignored if imageUrls is also provided.",
      ),
  }),
  execute: async (input) => {
    const { link, imageUrls, removeImages, ...fields } = input;

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
        error: "That link is an event, not a session. Use updateEvent instead.",
      };
    }

    const session = await storage.getBookingSessionById(target.id);
    if (!session) {
      return {
        success: false,
        errorCode: "NOT_FOUND",
        error: `No session found for that link (id ${target.id}).`,
      };
    }
    const profile = await storage.getProfileById(session.profileId);

    const updates: Partial<InsertBookingSession> = {};
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.duration !== undefined) updates.duration = fields.duration;
    if (fields.currency !== undefined) updates.currency = fields.currency;
    if (fields.description !== undefined)
      updates.description = fields.description;
    if (fields.thumbnailDescription !== undefined)
      updates.thumbnailDescription = fields.thumbnailDescription;
    if (fields.locationUrl !== undefined)
      updates.locationUrl = fields.locationUrl;
    if (fields.timezone !== undefined) updates.timezone = fields.timezone;
    if (fields.isFree !== undefined) {
      updates.isFree = fields.isFree;
      if (fields.isFree) updates.price = "0";
    }
    if (fields.price !== undefined && !updates.isFree) {
      updates.price = fields.price;
    }
    if (fields.mode !== undefined) {
      updates.isOnline = fields.mode === "online";
      updates.isOffline = fields.mode === "offline";
    }
    if (imageUrls && imageUrls.length > 0) {
      updates.images = imageUrls.map((url) => ({ url, alt: "" }));
    } else if (removeImages) {
      updates.images = [];
    }

    const updated = await storage.updateBookingSession(session.id, updates);
    const images = (updated.images ?? []) as Array<{ url: string }>;

    return {
      success: true as const,
      updated: true as const,
      kind: "session" as const,
      sessionId: updated.id,
      sessionUrl: profile?.username
        ? `${process.env.APP_BASE_URL}/${profile.username}/session/${updated.id}`
        : null,
      title: updated.title,
      organizerName: profile?.displayName ?? null,
      thumbnailDescription: updated.thumbnailDescription ?? null,
      duration: updated.duration,
      price: updated.price,
      currency: updated.currency,
      isFree: updated.isFree,
      isOnline: updated.isOnline,
      isOffline: updated.isOffline,
      locationUrl: updated.locationUrl ?? null,
      timezone: updated.timezone ?? IST,
      featuredImage: images[0]?.url ?? null,
    };
  },
});
