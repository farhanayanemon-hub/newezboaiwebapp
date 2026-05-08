import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ChatStreamResult, ProviderModel, TestResult } from "./types";

const FALLBACK_MODELS: ProviderModel[] = [
  { id: "gemini-2.5-pro", contextWindow: 2000000 },
  { id: "gemini-2.5-flash", contextWindow: 1000000 },
  { id: "gemini-2.0-flash", contextWindow: 1000000 },
  { id: "gemini-2.0-flash-lite", contextWindow: 1000000 },
];

function client(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export const geminiProvider: AIProvider = {
  slug: "gemini",
  async testConnection(apiKey): Promise<TestResult> {
    const start = Date.now();
    try {
      const ai = client(apiKey);
      await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: "ok",
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
  async listModels(_apiKey): Promise<ProviderModel[]> {
    return FALLBACK_MODELS;
  },
  async streamChat({ apiKey, model, messages, onChunk }): Promise<ChatStreamResult> {
    const ai = client(apiKey);
    const sysParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: sysParts.length
        ? { systemInstruction: sysParts.join("\n\n") }
        : undefined,
    });

    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk({ delta: text });
      }
      const usage = chunk.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? outputTokens;
      }
    }

    return { fullText, usage: { inputTokens, outputTokens } };
  },
};
