import { streamUrl } from "@/lib/api";

export interface StreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamSource {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

export interface StreamHandlers {
  onConversation?: (info: { conversationId: string; created: boolean }) => void;
  onChunk?: (delta: string) => void;
  onSources?: (sources: StreamSource[]) => void;
  onDone?: (info: {
    provider?: string;
    model?: string;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    savedMemories?: { key: string; value: string }[];
    sources?: StreamSource[];
  }) => void;
  onError?: (message: string) => void;
}

export interface StreamOptions {
  messages: StreamMessage[];
  modelOverride?: string;
  taskType?: string;
  conversationId?: string;
  attachmentIds?: string[];
  /** Per-browser opt-out for live web search. Defaults true if omitted. */
  useWebSearch?: boolean;
  signal?: AbortSignal;
}

export async function streamChat(opts: StreamOptions, handlers: StreamHandlers): Promise<void> {
  const res = await fetch(streamUrl("/chat/stream"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      messages: opts.messages,
      modelOverride: opts.modelOverride,
      taskType: opts.taskType,
      conversationId: opts.conversationId,
      attachmentIds: opts.attachmentIds,
      useWebSearch: opts.useWebSearch !== false,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    handlers.onError?.(`Server error: ${res.status} ${body || res.statusText}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const data = JSON.parse(json) as
          | { type: "conversation"; conversationId: string; created: boolean }
          | { type: "chunk"; content: string }
          | { type: "sources"; sources: StreamSource[] }
          | {
              type: "done";
              provider?: string;
              model?: string;
              latencyMs?: number;
              usage?: { inputTokens?: number; outputTokens?: number };
              savedMemories?: { key: string; value: string }[];
              sources?: StreamSource[];
            }
          | { type: "error"; message: string };

        if (data.type === "conversation") {
          handlers.onConversation?.({
            conversationId: data.conversationId,
            created: data.created,
          });
        } else if (data.type === "chunk") {
          handlers.onChunk?.(data.content);
        } else if (data.type === "sources") {
          handlers.onSources?.(data.sources);
        } else if (data.type === "done") {
          handlers.onDone?.({
            provider: data.provider,
            model: data.model,
            latencyMs: data.latencyMs,
            inputTokens: data.usage?.inputTokens,
            outputTokens: data.usage?.outputTokens,
            savedMemories: data.savedMemories,
            sources: data.sources,
          });
        } else if (data.type === "error") {
          handlers.onError?.(data.message);
        }
      } catch {
        // skip malformed event
      }
    }
  }
}
