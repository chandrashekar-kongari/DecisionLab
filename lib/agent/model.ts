import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function requireOpenRouterKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }
  return apiKey;
}

export function getLanguageModel() {
  const openrouter = createOpenRouter({ apiKey: requireOpenRouterKey() });
  return openrouter.chat(process.env.OPENROUTER_MODEL || DEFAULT_MODEL);
}
