import { streamUrl } from "@/lib/api";

export interface StreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamHandlers {
  onChunk?: (delta: string) => void;
  onDone?: (info: {
    provider?: string;
    model?: string;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
  }) => void;
  onError?: (message: string) => void;
}

export interface StreamOptions {
  messages: StreamMessage[];
  modelOverride?: string;
  taskType?: string;
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
  let fullText = "";

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
          | { type: "chunk"; content: string }
          | {
              type: "done";
              provider?: string;
              model?: string;
              latencyMs?: number;
              usage?: { inputTokens?: number; outputTokens?: number };
            }
          | { type: "error"; message: string };

        if (data.type === "chunk") {
          fullText += data.content;
          handlers.onChunk?.(data.content);
        } else if (data.type === "done") {
          handlers.onDone?.({
            provider: data.provider,
            model: data.model,
            latencyMs: data.latencyMs,
            inputTokens: data.usage?.inputTokens,
            outputTokens: data.usage?.outputTokens,
          });
        } else if (data.type === "error") {
          handlers.onError?.(data.message);
        }
      } catch {
        // skip malformed event
      }
    }
  }

  if (!fullText && !buffer) {
    // stream ended w/o sending a chunk; ensure error handler fires once
  }
}
