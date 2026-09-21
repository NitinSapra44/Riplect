import {  createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.LLM_API_KEY,
});

export const AGENT_MODEL_ID = "claude-sonnet-4-6";
export const agentModel = anthropic(AGENT_MODEL_ID);
