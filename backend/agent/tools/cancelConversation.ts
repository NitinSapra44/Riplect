import { tool } from "ai";
import { z } from "zod";

/**
 * Explicit "the user wants to scrap this and start fresh" signal.
 *
 * The tool itself does nothing — it's a marker so the message handler can
 * detect the cancel intent and call conversationStore.clearConversation().
 * Keeping the side effect in the handler (not the tool) preserves the rule
 * that tools shouldn't mutate per-session state.
 */
export const cancelConversation = tool({
  description:
    "Call this when the user says 'cancel', 'start over', 'nevermind', " +
    "'scrap this', or otherwise asks to drop the current flow. After calling, " +
    "reply briefly (e.g. 'Okay, starting fresh ✨'). Do NOT call any creation " +
    "tools in the same turn — this is a hard stop.",
  inputSchema: z.object({
    reason: z
      .string()
      .optional()
      .describe("Optional one-line note about what was cancelled (for logs)."),
  }),
  execute: async ({ reason }) => {
    return { success: true, cancelled: true, reason: reason ?? null };
  },
});
