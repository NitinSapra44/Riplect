import { randomUUID } from "crypto";
import { supabaseStorage } from "../supabaseStorage";

export interface MediaResult {
  publicUrl: string;
  mediaType: string;
  itemType: "image" | "video";
}

async function downloadAndUpload(
  mediaUrl: string,
  mediaContentType: string,
): Promise<MediaResult> {
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString("base64"),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Twilio media: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = mediaContentType.split("/")[1] || "jpg";
  const fileName = `${randomUUID()}.${extension}`;
  const itemType = mediaContentType.startsWith("video/") ? "video" : "image";

  const publicUrl = await supabaseStorage.uploadPublicFile(
    buffer,
    fileName,
    mediaContentType,
    "whatsapp-events"
  );

  return { publicUrl, mediaType: mediaContentType, itemType };
}

/**
 * Process multiple media items from a single Twilio message: download each
 * from Twilio (auth-required), upload to Supabase Storage, and return public
 * URLs. Anthropic fetches images directly from those URLs — we don't ship
 * base64 bytes to the model anymore.
 *
 * Uses allSettled so one failed download doesn't drop the rest.
 */
export async function handleMultipleTwilioMedia(
  items: Array<{ url: string; contentType: string }>
): Promise<MediaResult[]> {
  const settled = await Promise.allSettled(
    items.map((item) => downloadAndUpload(item.url, item.contentType))
  );
  const results: MediaResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results.push(s.value);
    } else {
      console.error("[Media] download/upload failed:", s.reason);
    }
  }
  return results;
}
