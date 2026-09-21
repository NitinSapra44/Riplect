import type { Express, Request, Response } from "express";
import twilio from "twilio";
import { handleIncomingMessage } from "../agent/handleWhatsAppMessage";
import type { TwilioWebhookBody } from "./types";

// Lazily-initialized Twilio client (singleton)
let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return null;
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * APP_ENV controls deployment-specific behavior (strict Twilio validation,
 * loud startup failures). NODE_ENV is unreliable here because our dev/staging
 * deployments run with NODE_ENV=production. Valid values: "production",
 * "staging", "development". Missing = treated as development.
 */
function isStrictEnv(): boolean {
  return process.env.APP_ENV === "production";
}

/**
 * Validate Twilio request signature.
 * In strict env (APP_ENV=production), missing env vars cause a hard reject; in
 * non-strict they are skipped with a warning so local/dev work without secrets.
 */
function validateTwilioSignature(req: Request, res: Response, next: () => void) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;

  if (!authToken || !webhookUrl) {
    if (isStrictEnv()) {
      console.error("[WhatsApp] TWILIO_AUTH_TOKEN or TWILIO_WEBHOOK_URL missing in production — rejecting request");
      return res.status(500).send("Server misconfiguration");
    }
    console.warn("[WhatsApp] Twilio signature env vars missing — skipping validation (non-strict env)");
    return next();
  }

  const signature = req.headers["x-twilio-signature"] as string;
  const isValid = twilio.validateRequest(authToken, signature, webhookUrl, req.body);
  if (!isValid) {
    console.warn("[WhatsApp] Invalid Twilio signature");
    return res.status(403).send("Invalid signature");
  }

  next();
}

/**
 * WhatsApp has a ~1600 character limit per message.
 * Split long messages into chunks at paragraph boundaries.
 */
const WHATSAPP_CHAR_LIMIT = 1500; // leave margin for encoding

function splitMessage(message: string): string[] {
  if (message.length <= WHATSAPP_CHAR_LIMIT) return [message];

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > WHATSAPP_CHAR_LIMIT) {
    // Try to split at last double newline within limit
    let splitIdx = remaining.lastIndexOf("\n\n", WHATSAPP_CHAR_LIMIT);
    if (splitIdx <= 0) {
      // Fall back to single newline
      splitIdx = remaining.lastIndexOf("\n", WHATSAPP_CHAR_LIMIT);
    }
    if (splitIdx <= 0) {
      // Fall back to space
      splitIdx = remaining.lastIndexOf(" ", WHATSAPP_CHAR_LIMIT);
    }
    if (splitIdx <= 0) {
      // Hard cut
      splitIdx = WHATSAPP_CHAR_LIMIT;
    }
    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export type OutboundMessage = { body: string; mediaUrl?: string };

/**
 * Send one or more WhatsApp messages via Twilio REST API.
 * Each item can carry an optional mediaUrl (image flyer). Long text-only
 * messages are split into chunks; messages with media are sent as-is so the
 * caption stays attached to the image.
 */
async function sendWhatsAppReply(to: string, messages: OutboundMessage[]) {
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  const client = getTwilioClient();

  if (!client || !fromNumber) {
    console.error("[WhatsApp] Missing Twilio config (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM)");
    return;
  }

  const from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;

  for (const msg of messages) {
    if (msg.mediaUrl) {
      await client.messages.create({
        body: msg.body,
        from,
        to,
        mediaUrl: [msg.mediaUrl],
      });
      continue;
    }
    for (const chunk of splitMessage(msg.body)) {
      await client.messages.create({ body: chunk, from, to });
    }
  }
}

// In-memory LRU for MessageSid deduplication. Twilio rarely retries, but when it
// does we don't want to process the same message twice (double-creating events,
// etc.). Small LRU so memory stays bounded.
const MESSAGE_SID_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MESSAGE_SID_MAX = 1000;
const recentMessageSids = new Map<string, number>();

function seenMessageSid(sid: string): boolean {
  const now = Date.now();
  // Purge expired entries opportunistically
  recentMessageSids.forEach((ts, k) => {
    if (now - ts > MESSAGE_SID_TTL_MS) recentMessageSids.delete(k);
  });
  if (recentMessageSids.has(sid)) return true;

  recentMessageSids.set(sid, now);
  if (recentMessageSids.size > MESSAGE_SID_MAX) {
    const oldestKey = recentMessageSids.keys().next().value;
    if (oldestKey) recentMessageSids.delete(oldestKey);
  }
  return false;
}

function assertTwilioConfig() {
  const required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const msg = `[WhatsApp] Missing Twilio env vars: ${missing.join(", ")}`;
    if (isStrictEnv()) {
      throw new Error(msg);
    }
    console.warn(msg + " — WhatsApp replies will fail until configured");
  }
}

export function registerWhatsAppRoutes(app: Express) {
  assertTwilioConfig();

  app.post(
    "/api/whatsapp/webhook",
    validateTwilioSignature,
    async (req: Request, res: Response) => {
      const body = req.body as TwilioWebhookBody;

      console.log(`[WhatsApp] Message from ${body.From}: ${body.Body || "[media]"}`);

      // Respond immediately with empty 200 so Twilio doesn't retry
      res.status(200).type("text/xml").send("<Response></Response>");

      // Skip if we've already processed this MessageSid (Twilio retry protection)
      if (body.MessageSid && seenMessageSid(body.MessageSid)) {
        console.log(`[WhatsApp] Duplicate MessageSid ${body.MessageSid} — skipping`);
        return;
      }

      // Fire-and-forget: request the WhatsApp typing indicator. Sending it
      // also auto-marks the referenced inbound as read, so no separate
      // status:"read" call is needed. Endpoint:
      // POST messaging.twilio.com/v2/Indicators/Typing.json
      const client = getTwilioClient();
      if (client && body.MessageSid) {
        client.messaging.v2.typingIndicator
          .create({ messageId: body.MessageSid, channel: "whatsapp" })
          .catch((err: unknown) => {
            const e = err as { code?: number; message?: string };
            console.warn(
              `[WhatsApp] typing indicator failed for ${body.MessageSid}:`,
              e.code ?? "?",
              e.message ?? err,
            );
          });
      }

      // Process and reply asynchronously via REST API
      const requestStart = Date.now();
      try {
        const reply = await handleIncomingMessage(body);
        console.log(
          "[WhatsApp] Sending reply:",
          reply.map((m) => ({ body: m.body.slice(0, 80), media: !!m.mediaUrl })),
        );
        await sendWhatsAppReply(body.From, reply);
        console.log(`[WhatsApp] Total request time: ${Date.now() - requestStart}ms`);
      } catch (error) {
        console.error("[WhatsApp] Webhook error:", error);
        await sendWhatsAppReply(body.From, [
          { body: "Sorry, something went wrong. Please try again." },
        ]).catch((e) => console.error("[WhatsApp] Failed to send error reply:", e));
      }
    }
  );
}
