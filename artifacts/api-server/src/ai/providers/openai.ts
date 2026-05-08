import OpenAI from "openai";
import type { AIProvider, ProviderModel, TestResult, ChatStreamResult } from "./types";

function client(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({ apiKey, baseURL });
}

function makeOpenAICompatible(slug: string, baseURL?: string): AIProvider {
  return {
    slug,
    async testConnection(apiKey) {
      const start = Date.now();
      try {
        const c = client(apiKey, baseURL);
        await c.models.list();
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
      const c = client(apiKey, baseURL);
      const list = await c.models.list();
      return list.data.map((m) => ({ id: m.id }));
    },
    async streamChat({ apiKey, model, messages, onChunk, signal }): Promise<ChatStreamResult> {
      const c = client(apiKey, baseURL);
      const stream = await c.chat.completions.create(
        {
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );

      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullText += delta;
          onChunk({ delta });
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
      }

      return { fullText, usage: { inputTokens, outputTokens } };
    },
  };
}

export const openaiProvider: AIProvider = makeOpenAICompatible("openai");
export const openrouterProvider: AIProvider = makeOpenAICompatible(
  "openrouter",
  "https://openrouter.ai/api/v1",
);
export const xaiProvider: AIProvider = makeOpenAICompatible("xai", "https://api.x.ai/v1");
