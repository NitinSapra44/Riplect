import type {TwilioWebhookBody} from "../whatsapp/types";
import {conversationStore} from "../whatsapp/conversationStore";
import type {OutboundMessage} from "../whatsapp/routes";
import {createCmAgent} from "./cmAgent";
import {AGENT_MODEL_ID} from "./model";
import {buildCmContext} from "./context";
import {buildCmPostCreateMessages} from "./postCreateMessages";
import {
  loadTurnInputs,
  runAgentGeneration,
  collectToolResults,
  didCreateEventOrSession,
  didUpdateEventOrSession,
  didDeleteEventOrSession,
  didCancel,
  summarizeCmToolCalls,
} from "./messageHandlerShared";

/**
 * CM-mode message handler. Differences from self mode:
 *   - Never calls conversationStore.linkProfile (the CM is staff, not the
 *     creator — linking would pollute the CM's session record with whichever
 *     organizer they last onboarded).
 *   - Skips the per-creator hasAvailability flag in session context. The
 *     organizer is determined dynamically via lookupProfile, whose result
 *     includes hasAvailability for that specific organizer.
 *   - Uses a CM-tailored post-create flow (forwardable flyer, no welcome
 *     message addressed to the creator).
 *   - Surfaces createProfile's AUTH_USER_EXISTS in the CM's voice.
 */
export async function handleCmMessage(
  body: TwilioWebhookBody,
): Promise<OutboundMessage[]> {
  const phoneNumber = body.From;
  const t0 = Date.now();

  const inputs = await loadTurnInputs(body, "cm");
  if (!inputs) {
    return [
      {
        body: "Sorry, I'm having trouble loading our conversation. Please try again in a moment.",
      },
    ];
  }
  if (inputs.mediaLoadFailedNoText) {
    return [
      {
        body: "Couldn't load what you sent — please resend the flyer/image.",
      },
    ];
  }
  const {
    currentMediaItems,
    uploadedImageUrls,
    uploadedVideoUrls,
    agentMessages,
    rawUserMessage,
  } = inputs;

  const sessionContext = buildCmContext({
    uploadedImageUrls,
    uploadedVideoUrls,
  });

  const agent = createCmAgent(sessionContext);

  const beforeLLM = Date.now();
  const {result, latencyMs} = await runAgentGeneration(agent, agentMessages);

  let outbound: OutboundMessage[] = [];
  let createSucceeded = false;
  let updateSucceeded = false;
  let deleteSucceeded = false;
  let cancelRequested = false;
  let assistantHistoryText: string;

  if (!result) {
    outbound = [{body: "Sorry, something went wrong. Please try again."}];
    assistantHistoryText = outbound[0].body;
  } else {
    const orderedToolResults = collectToolResults(result);

    const profileResult = orderedToolResults.find(
      (r) => r.toolName === "createProfile" && r.output?.success,
    );
    // NOTE: deliberately NO conversationStore.linkProfile here. In CM mode the
    // sender (CM phone) is not the owner of the created profile; linking would
    // mis-attribute the CM's session row to the organizer's profile.

    createSucceeded = didCreateEventOrSession(orderedToolResults);
    updateSucceeded = didUpdateEventOrSession(orderedToolResults);
    deleteSucceeded = didDeleteEventOrSession(orderedToolResults);
    cancelRequested = didCancel(orderedToolResults);

    if (createSucceeded || updateSucceeded || deleteSucceeded || profileResult) {
      outbound = buildCmPostCreateMessages(orderedToolResults);
    }

    if (outbound.length === 0) {
      const replyText =
        result.text && result.text.trim().length > 0
          ? result.text
          : "Sorry, I couldn't process that. Could you try again?";
      outbound = [{body: replyText}];
    }

    assistantHistoryText = outbound.map((m) => m.body).join("\n\n");

    // Annotate stored history (NOT outbound — the user doesn't see this) with
    // a compact log of which lookup/profile/availability tools fired this
    // turn. Lets the next turn's LLM remember which organizer it just looked
    // up without re-asking the CM for the phone or re-calling lookupProfile.
    const toolSummary = summarizeCmToolCalls(orderedToolResults);
    if (toolSummary) {
      assistantHistoryText += `\n\n${toolSummary}`;
    }
  }

  const inputTokens = result?.totalUsage?.inputTokens ?? null;
  const outputTokens = result?.totalUsage?.outputTokens ?? null;

  const now = new Date().toISOString();
  await conversationStore
    .addTurn(
      phoneNumber,
      {
        role: "user",
        content: rawUserMessage || "[Media]",
        timestamp: now,
        mediaItems: currentMediaItems,
      },
      {role: "assistant", content: assistantHistoryText, timestamp: now},
      {model: AGENT_MODEL_ID, latencyMs, inputTokens, outputTokens},
    )
    .catch((err) => console.error("[Agent] Persist failed:", err));

  // Same context-clearing policy as self mode: after a successful event /
  // session create OR update OR delete OR an explicit cancelConversation, wipe
  // the Redis session so the next message starts clean. The CM moves on to the
  // next organizer; a follow-up edit/delete re-identifies the target by its
  // pasted link, so no carried state is needed.
  if (createSucceeded || updateSucceeded || deleteSucceeded || cancelRequested) {
    await conversationStore
      .clearConversation(phoneNumber)
      .catch((err) => console.error("[Agent] Clear context failed:", err));
  }

  const totalMs = Date.now() - t0;
  const setupMs = beforeLLM - t0;
  console.log(
    `[Perf] Total (excluding persist): ${totalMs}ms — setup: ${setupMs}ms, llm: ${latencyMs}ms`,
  );
  return outbound;
}
