"use client";

import { useEffect, useState } from "react";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  Tools,
  useAui,
} from "@assistant-ui/react";
import { useMessageError } from "@assistant-ui/core/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import type { TextMessagePartProps } from "@assistant-ui/core/react";
import { ArrowDown, ArrowUp, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import { agentToolkit } from "@/components/agent/toolkit";
import { Button } from "@/components/ui/button";
import { EXAMPLE_GOALS } from "@/lib/experiment";

const STORAGE_KEY = "decision-lab-conversation";
const config = AuiConfig({ tools: Tools({ toolkit: agentToolkit }) });

export function AgentWorkspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = window.localStorage.getItem(STORAGE_KEY) ?? crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    void fetch(`/api/conversations/${id}`)
      .then(async (response) => {
        if (!response.ok) return [];
        const body = (await response.json()) as { messages?: UIMessage[] };
        return body.messages ?? [];
      })
      .catch(() => [])
      .then((loaded) => {
        if (cancelled) return;
        setConversationId(id);
        setMessages(loaded);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startNew() {
    const id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    setConversationId(id);
    setMessages([]);
  }

  if (!ready || !conversationId) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Loading conversation…
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-end px-3">
        <Button variant="ghost" size="sm" onClick={startNew}>
          New chat
        </Button>
      </div>
      <AgentThread
        key={conversationId}
        conversationId={conversationId}
        initialMessages={messages}
      />
    </div>
  );
}

function AgentThread({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
}) {
  const runtime = useChatRuntime({
    messages: initialMessages,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ThreadPrimitive.Empty>
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pb-8">
              <h1 className="text-center text-2xl font-medium tracking-tight">
                What should we investigate?
              </h1>
              <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                Describe a business problem. The agent writes Python, runs it in
                CreateOS, and can save the experiment.
              </p>
              <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                {EXAMPLE_GOALS.map((prompt) => (
                  <ThreadPrimitive.Suggestion
                    key={prompt}
                    prompt={prompt}
                    send
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {prompt}
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.role === "user" ? <UserMessage /> : <AssistantMessage />
              }
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        <div className="relative shrink-0 bg-background px-4 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <ThreadPrimitive.ScrollToBottom className="absolute -top-9 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm disabled:hidden">
              <ArrowDown />
            </ThreadPrimitive.ScrollToBottom>
            <Composer />
          </div>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function Composer() {
  const aui = useAui();
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-3xl border border-border bg-card px-3 py-2 shadow-sm">
      <ComposerPrimitive.Input
        placeholder="Ask DecisionLab"
        submitMode="enter"
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <AuiIf condition={(state) => state.thread.isRunning}>
        <Button
          size="icon"
          variant="outline"
          className="rounded-full"
          aria-label="Stop"
          onClick={() => aui.thread.cancelRun()}
        >
          <Square />
        </Button>
      </AuiIf>
      <AuiIf condition={(state) => !state.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <Button size="icon" className="rounded-full" aria-label="Send">
            <ArrowUp />
          </Button>
        </ComposerPrimitive.Send>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] rounded-3xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full flex-col gap-3 text-sm">
      <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
      <RunError />
    </MessagePrimitive.Root>
  );
}

function AssistantMarkdown({ text }: TextMessagePartProps) {
  if (!text) return null;
  return (
    <div className="leading-6 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function RunError() {
  const error = useMessageError();
  if (error == null) return null;
  return <p className="text-sm text-destructive">{errorText(error)}</p>;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "The request failed.";
}
