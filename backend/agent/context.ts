import type {ModelMessage} from "ai";
import {formatInTimeZone} from "date-fns-tz";
import {IST} from "./dateUtils";
import type {ConversationMessage} from "../whatsapp/types";

interface ImageData {
  url: string;
  mediaType: string;
}

type TextPart = {type: "text"; text: string};
type ImagePart = {type: "image"; image: URL; mediaType: string};

/** Claude-supported image formats. HEIC/HEIF and others are NOT supported. */
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
]);

function inferImageMediaType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "";
  }
}

/**
 * Returns true only if the URL has an extension Claude can decode.
 * Silently drops HEIC, HEIF, TIFF, BMP, and any unknown format so a
 * bad historical image never poisons the whole conversation.
 */
function isSupportedImageUrl(url: string): boolean {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}

/**
 * Convert WhatsApp conversation history into AI SDK message format.
 *
 * Re-attaches historical user-message images as ImageParts on every turn so
 * the model can still "see" a flyer after the profile-creation detour. Cost:
 * extra image tokens + Supabase fetches per turn — accepted because text-only
 * history led the model to forget what an uploaded URL was.
 */
export function buildAgentMessages(
  history: ConversationMessage[],
  currentMessage: string,
  images: ImageData[],
): ModelMessage[] {
  const messages: ModelMessage[] = history.map((msg) => {
    const imageItems = (msg.mediaItems ?? []).filter((m) => m.type === "image");

    if (msg.role === "user" && imageItems.length > 0) {
      const parts: Array<TextPart | ImagePart> = [];
      if (msg.content) parts.push({type: "text", text: msg.content});
      for (const item of imageItems) {
        parts.push({
          type: "image",
          image: new URL(item.url),
          mediaType: inferImageMediaType(item.url),
        });
      }
      return {role: "user", content: parts};
    }

    return {role: msg.role, content: msg.content};
  });

  if (images.length > 0) {
    const parts: Array<TextPart | ImagePart> = [];
    if (currentMessage) {
      parts.push({type: "text", text: currentMessage});
    }
    for (const img of images) {
      parts.push({
        type: "image",
        image: new URL(img.url),
        mediaType: img.mediaType,
      });
    }
    messages.push({role: "user", content: parts});
  } else {
    messages.push({role: "user", content: currentMessage});
  }

  // Sliding cache breakpoint: mark the last (current) message so Anthropic
  // caches the entire prefix (system + history + this turn). Next request's
  // prefix starts with the same content up through this message → cache hit
  // at 10% input cost. Anthropic auto-skips when the prefix is below the
  // ~1024-token Haiku minimum, so this is a no-op on tiny conversations.
  const last = messages[messages.length - 1];
  if (last) {
    last.providerOptions = {
      ...(last.providerOptions ?? {}),
      anthropic: {
        ...((last.providerOptions?.anthropic as Record<string, unknown>) ?? {}),
        cacheControl: {type: "ephemeral"},
      },
    };
  }

  return messages;
}

function nowString(): string {
  // Compute the current date AND time in Asia/Kolkata (default creator
  // timezone). formatInTimeZone takes the absolute instant from new Date()
  // and renders it in IST, so this is correct no matter what timezone the
  // host process runs in (prod is UTC) — using the host TZ could be off by
  // ~5.5h and yield the wrong date/time late at night IST.
  //
  // Include the weekday so the model can resolve "tomorrow" / "next Saturday"
  // without computing the day name itself, and the wall-clock time + an
  // explicit "IST" literal so it can ground time-relative phrasing like
  // "in 2 hours" or "this evening".
  return formatInTimeZone(new Date(), IST, "yyyy-MM-dd (EEEE) HH:mm 'IST'");
}

function appendAvailableMedia(
  lines: string[],
  imageUrls: string[],
  videoUrls: string[],
): void {
  if (imageUrls.length > 0) {
    lines.push(`\n## Available images`);
    lines.push(
      "Pass the exact URLs to the imageUrls parameter of createEvent, createSession, or createProfile. Do NOT fabricate URLs.",
    );
    imageUrls.forEach((url, i) => {
      lines.push(`[img ${i + 1}] ${url}`);
    });
  }

  if (videoUrls.length > 0) {
    lines.push(`\n## Available videos`);
    lines.push(
      "Pass the exact URLs to the videoUrls parameter of createEvent or createRecurringEvent — they will attach as gallery videos. Do NOT pass videos to imageUrls.",
    );
    videoUrls.forEach((url, i) => {
      lines.push(`[vid ${i + 1}] ${url}`);
    });
  }
}

/**
 * Session context for self-mode (creator chats with the bot from their own
 * WhatsApp). Includes the creator's profileId/phone and an availability flag
 * so the agent can skip asking when sessions are bookable already.
 */
export function buildSelfContext(opts: {
  profileId: string | null;
  isNewCreator: boolean;
  phoneNumber: string;
  uploadedImageUrls: string[];
  uploadedVideoUrls: string[];
  hasAvailability: boolean;
}): string {
  const lines: string[] = [`Current date & time (IST): ${nowString()}`];

  if (opts.profileId) {
    lines.push(`Creator's profileId: ${opts.profileId}`);
    lines.push(
      "This creator already has a Riplect profile. Use this profileId when creating events or sessions.",
    );
  } else if (opts.isNewCreator) {
    lines.push(`Creator's phone number: ${opts.phoneNumber}`);
    lines.push(
      "This is a new creator without a Riplect profile. You'll need to collect their name, professional title, and email address before creating anything. The email is required — we send them a magic sign-in link to their dashboard. Use the phone number above for createProfile — do NOT ask for the phone. Show the phone in the summary so they can correct it if needed.",
    );
  }

  lines.push(`Source channel: whatsapp`);
  lines.push(`Has availability set: ${opts.hasAvailability ? "yes" : "no"}`);

  appendAvailableMedia(lines, opts.uploadedImageUrls, opts.uploadedVideoUrls);
  return lines.join("\n");
}

/**
 * Session context for CM-mode (Riplect staff submitting events for organizers
 * they meet in WhatsApp groups). Deliberately omits any per-organizer state
 * (profileId, hasAvailability) — those are looked up dynamically via
 * lookupProfile, since the CM may switch organizers within a session.
 */
export function buildCmContext(opts: {
  uploadedImageUrls: string[];
  uploadedVideoUrls: string[];
}): string {
  const lines: string[] = [`Current date & time (IST): ${nowString()}`];

  lines.push(
    "You are in Community Manager mode. The sender is a Riplect staff member, NOT the creator. Always ask the CM for the organizer's phone number, then call lookupProfile before createProfile.",
  );
  lines.push(`Source channel: whatsapp_cm`);

  appendAvailableMedia(lines, opts.uploadedImageUrls, opts.uploadedVideoUrls);
  return lines.join("\n");
}
