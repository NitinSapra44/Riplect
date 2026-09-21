import type {TwilioWebhookBody} from "../whatsapp/types";
import {conversationStore} from "../whatsapp/conversationStore";
import type {OutboundMessage} from "../whatsapp/routes";
import {createRiplectAgent} from "./riplectAgent";
import {AGENT_MODEL_ID} from "./model";
import {buildSelfContext} from "./context";
import {buildPostCreateMessages} from "./postCreateMessages";
import {
  loadTurnInputs,
  runAgentGeneration,
  collectToolResults,
  didCreateEventOrSession,
  didCancel,
} from "./messageHandlerShared";

export async function handleSelfMessage(
  body: TwilioWebhookBody,
): Promise<OutboundMessage[]> {
  const phoneNumber = body.From;
  const t0 = Date.now();

  const inputs = await loadTurnInputs(body, "self");
  if (!inputs) {
    return [
      {
        body: "Sorry, I'm having trouble loading our conversation. Please try again in a moment.",
      },
    ];
  }
  if (inputs.mediaLoadFailedNoText) {
    // Don't ship an empty user message to Anthropic — short-circuit with a
    // friendly resend prompt. Doesn't touch conversation history so the next
    // (successful) media upload picks up where it should.
    return [
      {
        body: "Hmm, I couldn't load what you sent. Could you resend the photo or video? 🙏",
      },
    ];
  }
  const {
    conversation,
    currentMediaItems,
    uploadedImageUrls,
    uploadedVideoUrls,
    agentMessages,
    rawUserMessage,
  } = inputs;

  const cleanPhone = phoneNumber.replace("whatsapp:", "").trim();

  const sessionContext = buildSelfContext({
    profileId: conversation.profileId,
    isNewCreator: conversation.isNewCreator,
    phoneNumber: cleanPhone,
    uploadedImageUrls,
    uploadedVideoUrls,
    hasAvailability: conversation.hasAvailability,
  });

  const agent = createRiplectAgent(sessionContext);

  const beforeLLM = Date.now();
  const {result, latencyMs} = await runAgentGeneration(agent, agentMessages);

  let outbound: OutboundMessage[] = [];
  let createSucceeded = false;
  let cancelRequested = false;
  let assistantHistoryText: string;

  if (!result) {
    outbound = [{body: "Sorry, something went wrong. Please try again."}];
    assistantHistoryText = outbound[0].body;
  } else {
    const orderedToolResults = collectToolResults(result);

    // If createProfile succeeded mid-flow, link it to the session so future
    // turns see the new profileId in context.
    const profileResult = orderedToolResults.find(
      (r) => r.toolName === "createProfile" && r.output?.success,
    );
    if (
      profileResult &&
      conversation.profileId !== profileResult.output.profileId
    ) {
      await conversationStore.linkProfile(
        phoneNumber,
        profileResult.output.profileId,
      );
      conversation.profileId = profileResult.output.profileId;
      conversation.isNewCreator = false;
    }

    // setAvailability flips the cached flag so subsequent turns skip the
    // availability prompt without a DB roundtrip. Counts both success and
    // alreadySet — alreadySet means our cache was wrong and the org actually
    // has hours configured.
    const setAvailabilityHit = orderedToolResults.find(
      (r) =>
        r.toolName === "setAvailability" &&
        (r.output?.success || r.output?.alreadySet),
    );
    if (setAvailabilityHit && !conversation.hasAvailability) {
      await conversationStore
        .setHasAvailability(phoneNumber, true)
        .catch((err) =>
          console.error("[Agent] setHasAvailability cache update failed:", err),
        );
      conversation.hasAvailability = true;
    }

    createSucceeded = didCreateEventOrSession(orderedToolResults);
    cancelRequested = didCancel(orderedToolResults);

    if (createSucceeded || profileResult) {
      outbound = buildPostCreateMessages(orderedToolResults);
    }

    if (outbound.length === 0) {
      const replyText =
        result.text && result.text.trim().length > 0
          ? result.text
          : "Sorry, I couldn't process that. Could you try again?";
      outbound = [{body: replyText}];
    }

    assistantHistoryText = outbound.map((m) => m.body).join("\n\n");
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

  if (createSucceeded || cancelRequested) {
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
