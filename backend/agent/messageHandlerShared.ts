import type {ModelMessage} from "ai";
import type {
  TwilioWebhookBody,
  ConversationMode,
  Conversation,
  ConversationMessage,
  WhatsappMediaItem,
} from "../whatsapp/types";
import {conversationStore} from "../whatsapp/conversationStore";
import {
  handleMultipleTwilioMedia,
  type MediaResult,
} from "../whatsapp/imageHandler";
import {buildAgentMessages} from "./context";
import {tryCatch} from "../utils/tryCatch";

export interface TurnInputs {
  conversation: Conversation;
  currentMessage: string;
  currentMediaItems: WhatsappMediaItem[];
  uploadedImageUrls: string[];
  uploadedVideoUrls: string[];
  agentMessages: ModelMessage[];
  /** Original user-typed body (without the video placeholder) — for persistence. */
  rawUserMessage: string;
  /**
   * Set when the user sent media this turn but every download failed AND no
   * text accompanied it — there's nothing to feed the agent. Handlers short-
   * circuit with a friendly "please resend" so we don't ship empty user
   * content to Anthropic (which 400s).
   */
  mediaLoadFailedNoText: boolean;
}

function extractMediaItems(body: TwilioWebhookBody) {
  const numMedia = parseInt(body.NumMedia || "0");
  const items: Array<{url: string; contentType: string}> = [];
  for (let i = 0; i < numMedia; i++) {
    const url = (body as any)[`MediaUrl${i}`] as string | undefined;
    const contentType = (body as any)[`MediaContentType${i}`] as
      | string
      | undefined;
    if (url && contentType) items.push({url, contentType});
  }
  return items;
}

/**
 * Resolve the WhatsApp conversation, download any media on this turn, and
 * assemble the message list for the agent. Returns null on a fatal
 * conversation-load failure (caller should respond with a generic error).
 */
export async function loadTurnInputs(
  body: TwilioWebhookBody,
  mode: ConversationMode,
): Promise<TurnInputs | null> {
  const phoneNumber = body.From;
  const t0 = Date.now();
  const mediaItems = extractMediaItems(body);

  const [conversationResult, mediaResult] = await Promise.all([
    tryCatch(conversationStore.ensureConversation(phoneNumber, mode)),
    mediaItems.length > 0
      ? tryCatch(handleMultipleTwilioMedia(mediaItems))
      : Promise.resolve({data: [] as MediaResult[], error: null}),
  ]);
  console.log(
    `[Perf] parallel setup (conversation+media): ${Date.now() - t0}ms`,
  );

  if (conversationResult.error || !conversationResult.data) {
    console.error(
      "[Agent] Conversation resolve failed:",
      conversationResult.error,
    );
    return null;
  }
  if (mediaResult.error) {
    console.error("[Agent] Media handling failed:", mediaResult.error);
  }

  const conversation = conversationResult.data;
  const mediaResults: MediaResult[] = mediaResult.data ?? [];

  const inboundMediaCount = mediaItems.length;
  const rawUserMessage = body.Body || "";
  const mediaLoadFailedNoText =
    inboundMediaCount > 0 && mediaResults.length === 0 && !rawUserMessage;
  // Pass image URLs (not base64) to the model — Anthropic fetches them itself,
  // saving the encode + larger TLS upload to Anthropic.
  const currentImages = mediaResults
    .filter((m) => m.itemType === "image")
    .map((m) => ({url: m.publicUrl, mediaType: m.mediaType}));

  // If the only thing the user sent this turn is a video (no caption, no
  // image), give the model a short placeholder so we don't send an empty user
  // message to the provider (some providers reject empty content).
  const hasOnlyVideoThisTurn =
    !rawUserMessage &&
    currentImages.length === 0 &&
    mediaResults.some((m) => m.itemType === "video");
  const currentMessage = hasOnlyVideoThisTurn
    ? "[The user sent a video. See ## Available videos in session context.]"
    : rawUserMessage;

  const agentMessages = buildAgentMessages(
    conversation.messageHistory,
    currentMessage,
    currentImages,
  );

  const currentMediaItems: WhatsappMediaItem[] = mediaResults.map((m) => ({
    url: m.publicUrl,
    type: m.itemType,
  }));

  // Split history items by stored type so past videos don't get surfaced under
  // Available images.
  const historyMediaItems: WhatsappMediaItem[] = conversation.messageHistory
    .filter((m: ConversationMessage) => m.mediaItems && m.mediaItems.length > 0)
    .flatMap((m: ConversationMessage) => m.mediaItems!);

  // URLs already spent as an organizer's profile photo (see
  // summarizeCmToolCalls). Dropping them here is the structural fix for the
  // "profile pic became the event's featured image" bug — once consumed, the
  // image stops being offered under "## Available images" for createEvent /
  // createSession. The prose marker still nudges the model the same turn.
  const consumedProfileImageUrls = new Set<string>();
  const consumedRe = /\[profilePhotoConsumed=([^\]]+)\]/g;
  for (const m of conversation.messageHistory) {
    if (m.role !== "assistant") continue;
    consumedRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = consumedRe.exec(m.content)) !== null) {
      consumedProfileImageUrls.add(match[1]);
    }
  }

  const uploadedImageUrls = historyMediaItems
    .concat(currentMediaItems)
    .filter((m) => m.type === "image")
    .map((m) => m.url)
    .filter((url) => !consumedProfileImageUrls.has(url));
  const uploadedVideoUrls = historyMediaItems
    .concat(currentMediaItems)
    .filter((m) => m.type === "video")
    .map((m) => m.url);

  return {
    conversation,
    currentMessage,
    currentMediaItems,
    uploadedImageUrls,
    uploadedVideoUrls,
    agentMessages,
    rawUserMessage,
    mediaLoadFailedNoText,
  };
}

/**
 * Run the agent with a hard timeout and log step/usage metrics. Always returns
 * a `latencyMs` so callers can record timing even on failure; `result` is null
 * when generation errored or timed out.
 */
export async function runAgentGeneration(
  agent: {generate: (args: any) => Promise<any>},
  messages: ModelMessage[],
): Promise<{result: any | null; latencyMs: number}> {
  const startTime = Date.now();
  // 90s — paired with messageLock.LOCK_TTL_SECONDS=180 so we keep a ~90s
  // margin between LLM timeout and lock expiry (media upload + persistence
  // + retries all fit inside the gap).
  const generationPromise = agent.generate({
    messages,
    abortSignal: AbortSignal.timeout(90_000),
  }) as Promise<any>;
  const {data: result, error: genError} = await tryCatch(generationPromise);
  const latencyMs = Date.now() - startTime;

  if (genError || !result) {
    console.error("[Agent] Generation error:", genError);
    return {result: null, latencyMs};
  }

  const cachedIn = result.totalUsage?.cachedInputTokens ?? 0;
  const inputT = result.totalUsage?.inputTokens ?? 0;
  console.log(
    `[Agent] LLM took ${latencyMs}ms (steps: ${result.steps.length}, in: ${inputT}, cached: ${cachedIn})`,
  );

  for (const step of result.steps) {
    for (const tc of (step.toolCalls ?? []) as Array<{
      toolName: string;
      input: any;
    }>) {
      console.log(
        `[Agent] Tool called: ${tc.toolName}`,
        JSON.stringify(tc.input),
      );
    }
  }

  return {result, latencyMs};
}

/**
 * Build a short stored-only annotation of which tools fired this turn. Appended
 * to the assistant message we persist (NOT sent to the user) so the next turn's
 * LLM context retains lookupProfile / createProfile / setAvailability outcomes
 * across turns. CM mode only — self mode keeps profileId in session context, so
 * it doesn't need this. Returns an empty string when nothing useful happened.
 */
export function summarizeCmToolCalls(
  toolResults: Array<{toolName: string; output: any}>,
): string {
  const lines: string[] = [];
  for (const r of toolResults) {
    const o = r.output;
    if (!o) continue;

    if (r.toolName === "lookupProfile") {
      if (o.found) {
        lines.push(
          `- lookupProfile → found: ${o.displayName} (profileId=${o.profileId}, hasAvailability=${o.hasAvailability})`,
        );
      } else {
        lines.push(`- lookupProfile → not found`);
      }
    } else if (r.toolName === "createProfile" && o.success) {
      lines.push(
        `- createProfile → created: ${o.displayName} (profileId=${o.profileId})`,
      );
      // Mark the uploaded profile photo as spent so it's never re-attached as
      // an event/session flyer on a later turn. The token is both human-
      // readable guidance for the model AND machine-parsed by loadTurnInputs
      // to drop the URL from "## Available images".
      if (o.profileImageUrl) {
        lines.push(
          `  (that image was used as ${o.displayName ?? "the organizer"}'s profile photo — do NOT pass it to createEvent/createSession) [profilePhotoConsumed=${o.profileImageUrl}]`,
        );
      }
    } else if (
      r.toolName === "setAvailability" &&
      (o.success || o.alreadySet)
    ) {
      lines.push(
        `- setAvailability → ${o.alreadySet ? "already set" : "configured"}`,
      );
    }
  }
  if (lines.length === 0) return "";
  return `[Internal tool log — for your reference next turn, not visible to the user]\n${lines.join("\n")}`;
}

/** Flatten ordered tool results across all generation steps. */
export function collectToolResults(result: any): Array<{
  toolName: string;
  output: any;
}> {
  return result.steps.flatMap((s: any) => s.toolResults ?? []);
}

/** Did this turn successfully create an event / recurring event / session? */
export function didCreateEventOrSession(
  toolResults: Array<{toolName: string; output: any}>,
): boolean {
  return toolResults.some(
    (r) =>
      (r.toolName === "createEvent" ||
        r.toolName === "createRecurringEvent" ||
        r.toolName === "createSession") &&
      r.output?.success,
  );
}

/** Did this turn successfully update an event / session (CM edit flow)? */
export function didUpdateEventOrSession(
  toolResults: Array<{toolName: string; output: any}>,
): boolean {
  return toolResults.some(
    (r) =>
      (r.toolName === "updateEvent" || r.toolName === "updateSession") &&
      r.output?.success,
  );
}

/** Did this turn successfully delete an event / session (CM delete flow)? */
export function didDeleteEventOrSession(
  toolResults: Array<{toolName: string; output: any}>,
): boolean {
  return toolResults.some(
    (r) =>
      (r.toolName === "deleteEvent" || r.toolName === "deleteSession") &&
      r.output?.success,
  );
}

/** Did the agent invoke cancelConversation this turn? */
export function didCancel(
  toolResults: Array<{toolName: string; output: any}>,
): boolean {
  return toolResults.some(
    (r) => r.toolName === "cancelConversation" && r.output?.success,
  );
}
