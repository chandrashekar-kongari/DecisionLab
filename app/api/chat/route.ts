import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { createAgentTools } from "@/lib/agent/tools";
import { requireOpenRouterKey, getLanguageModel } from "@/lib/agent/model";
import { saveConversation } from "@/lib/experiments/store";

export const maxDuration = 300;

function publicChatError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENROUTER_API_KEY is not set")) return message;
  if (/more credits|fewer max_tokens/i.test(message)) {
    return "OpenRouter refused the request because this key does not have enough credits for the selected model.";
  }
  const cleaned = message.replace(/https?:\/\/\S+/g, "").trim();
  return cleaned || "The request failed.";
}

function errorStream(message: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "error", errorText: message });
      },
    }),
  });
}

export async function POST(request: Request) {
  let body: { messages?: UIMessage[]; conversationId?: string };
  try {
    body = (await request.json()) as {
      messages?: UIMessage[];
      conversationId?: string;
    };
  } catch {
    return Response.json(
      { message: "Expected a JSON chat request." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.messages)) {
    return Response.json(
      { message: "Messages are required." },
      { status: 400 },
    );
  }

  try {
    requireOpenRouterKey();
  } catch (error) {
    return errorStream(
      error instanceof Error ? error.message : "OpenRouter is not configured.",
    );
  }

  const tools = createAgentTools();
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : null;
  const result = streamText({
    model: getLanguageModel(),
    system: AGENT_SYSTEM_PROMPT,
    messages: await convertToModelMessages(body.messages, { tools }),
    tools,
    stopWhen: stepCountIs(16),
    temperature: 0.2,
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: body.messages,
      onError: publicChatError,
      onFinish: async ({ messages }) => {
        if (conversationId) await saveConversation(conversationId, messages);
      },
    }),
  });
}
