import type {TwilioWebhookBody} from "../whatsapp/types";
import type {OutboundMessage} from "../whatsapp/routes";
import {isCmNumber} from "../whatsapp/cmAuth";
import {
  acquireMessageLock,
  releaseMessageLock,
} from "../whatsapp/messageLock";
import {handleSelfMessage} from "./handleSelfMessage";
import {handleCmMessage} from "./handleCmMessage";

/**
 * How long an inbound will wait for the per-phone lock before giving up
 * and replying with the "still working" message. Generous — most turns
 * finish in under 30s, so 90s of patience covers normal congestion plus
 * the occasional slow LLM turn.
 */
const MAX_LOCK_WAIT_MS = 90_000;

/**
 * Entry point for inbound WhatsApp messages.
 *
 * Two responsibilities:
 *   1. Per-phone serialization via Redis lock — so two near-simultaneous
 *      messages from the same number queue up instead of racing each other
 *      through ensureConversation/addTurn (which would corrupt history,
 *      double-fire tool calls, and leave the archive table in an unhappy
 *      state).
 *   2. Routing to the self-mode handler (creator chatting from their own
 *      number) or the CM-mode handler (Riplect staff submitting on behalf
 *      of organizers). The two flows diverge enough — profile linking,
 *      post-create messaging, per-organizer availability lookup — that
 *      splitting them avoids littering both paths with conditionals.
 */
export async function handleIncomingMessage(
  body: TwilioWebhookBody,
): Promise<OutboundMessage[]> {
  const phone = body.From;

  const acquired = await acquireMessageLock(phone, MAX_LOCK_WAIT_MS);
  if (!acquired) {
    console.warn(`[Agent] Lock acquire timeout for ${phone}`);
    return [
      {
        body: "I'm still working on your previous message — give me a moment and try again.",
      },
    ];
  }

  try {
    return isCmNumber(phone)
      ? await handleCmMessage(body)
      : await handleSelfMessage(body);
  } finally {
    await releaseMessageLock(phone);
  }
}
