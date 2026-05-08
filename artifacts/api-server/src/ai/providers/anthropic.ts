import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatStreamResult, ProviderModel, TestResult } from "./types";

const FALLBACK_MODELS: ProviderModel[] = [
  { id: "claude-opus-4-20250514", contextWindow: 200000 },
  { id: "claude-sonnet-4-20250514", contextWindow: 200000 },
  { id: "claude-3-7-sonnet-20250219", contextWindow: 200000 },
  { id: "claude-3-5-sonnet-20241022", contextWindow: 200000 },
  { id: "claude-3-5-haiku-20241022", contextWindow: 200000 },
];

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export const anthropicProvider: AIProvider = {
  slug: "anthropic",
  async testConnection(apiKey): Promise<TestResult> {
    const start = Date.now();
    try {
      const c = client(apiKey);
      await c.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "ok" }],
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  },
  async listModels(apiKey): Promise<ProviderModel[]> {
    try {
      const c = client(apiKey);
      const res = await c.models.list();
      return res.data.map((m) => ({ id: m.id, contextWindow: 200000 }));
    } catch {
      return FALLBACK_MODELS;
    }
  },
  async streamChat({ apiKey, model, messages, onChunk, signal }): Promise<ChatStreamResult> {
    const c = client(apiKey);
    const sysParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const convo = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = await c.messages.stream(
      {
        model,
        max_tokens: 8192,
        system: sysParts.join("\n\n") || undefined,
        messages: convo,
      },
      { signal },
    );

    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = event.delta.text;
        fullText += delta;
        onChunk({ delta });
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      } else if (event.type === "message_start" && event.message.usage) {
        inputTokens = event.message.usage.input_tokens ?? 0;
      }
    }

    return { fullText, usage: { inputTokens, outputTokens } };
  },
};
