import Replicate from "replicate";
import type { AIProvider, ChatStreamResult, ProviderModel, TestResult } from "./types";
import { contentToString } from "./types";

const FALLBACK_MODELS: ProviderModel[] = [
  { id: "meta/meta-llama-3.1-405b-instruct", capabilities: ["chat"] },
  { id: "meta/meta-llama-3-70b-instruct", capabilities: ["chat"] },
  { id: "black-forest-labs/flux-schnell", capabilities: ["image-gen"] },
  { id: "black-forest-labs/flux-dev", capabilities: ["image-gen"] },
  { id: "openai/whisper", capabilities: ["audio-stt"] },
];

function client(apiKey: string): Replicate {
  return new Replicate({ auth: apiKey });
}

export const replicateProvider: AIProvider = {
  slug: "replicate",
  async testConnection(apiKey): Promise<TestResult> {
    const start = Date.now();
    try {
      const c = client(apiKey);
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
  async listModels(_apiKey): Promise<ProviderModel[]> {
    return FALLBACK_MODELS;
  },
  async streamChat({ apiKey, model, messages, onChunk }): Promise<ChatStreamResult> {
    const c = client(apiKey);
    const prompt = messages
      .map((m) => {
        const text = contentToString(m.content);
        if (m.role === "system") return `System: ${text}`;
        if (m.role === "user") return `User: ${text}`;
        return `Assistant: ${text}`;
      })
      .join("\n\n");

    let fullText = "";
    const stream = c.stream(model as `${string}/${string}`, {
      input: { prompt, max_tokens: 8192 },
    });

    for await (const event of stream) {
      if (event.event === "output") {
        const piece = String(event.data ?? "");
        if (piece) {
          fullText += piece;
          onChunk({ delta: piece });
        }
      }
    }

    return {
      fullText,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  },
};
