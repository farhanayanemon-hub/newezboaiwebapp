import OpenAI, { toFile } from "openai";
import type {
  AIProvider,
  ProviderModel,
  TestResult,
  ChatStreamResult,
  SttResult,
  TtsResult,
} from "./types";

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
      // Pass multimodal content arrays through directly so vision-capable models
      // (e.g. gpt-4o, gpt-4o-mini) receive image_url parts unmodified.
      const stream = await c.chat.completions.create(
        {
          model,
          // OpenAI SDK type expects narrower content types per role; cast at the boundary.
          messages: messages.map((m) => ({ role: m.role, content: m.content })) as Parameters<
            typeof c.chat.completions.create
          >[0]["messages"],
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
    async transcribeAudio({ apiKey, model, audio, mimeType, filename, language, signal }): Promise<SttResult> {
      const c = client(apiKey, baseURL);
      // Whisper requires a File-like with a name + content type.
      const ext = (() => {
        const m = (mimeType ?? "").toLowerCase();
        if (m.includes("webm")) return "webm";
        if (m.includes("ogg")) return "ogg";
        if (m.includes("mp4") || m.includes("m4a")) return "m4a";
        if (m.includes("wav")) return "wav";
        if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
        return "webm";
      })();
      const file = await toFile(audio, filename ?? `audio.${ext}`, { type: mimeType });
      const res = await c.audio.transcriptions.create(
        {
          file,
          model,
          language: language && language !== "auto" ? language.split("-")[0] : undefined,
          response_format: "verbose_json",
        },
        { signal },
      );
      const r = res as unknown as { text: string; language?: string; duration?: number };
      return { transcript: r.text, language: r.language, durationSec: r.duration };
    },
    async synthesizeSpeech({ apiKey, model, text, voice, speed, signal }): Promise<TtsResult> {
      const c = client(apiKey, baseURL);
      const res = await c.audio.speech.create(
        {
          model,
          voice: (voice ?? "alloy") as
            | "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable"
            | "onyx" | "nova" | "sage" | "shimmer" | "verse",
          input: text,
          response_format: "mp3",
          speed: typeof speed === "number" ? Math.min(4.0, Math.max(0.25, speed)) : undefined,
        },
        { signal },
      );
      const ab = await res.arrayBuffer();
      return { audio: Buffer.from(ab), mimeType: "audio/mpeg" };
    },
  };
}

export const openaiProvider: AIProvider = makeOpenAICompatible("openai");
export const openrouterProvider: AIProvider = makeOpenAICompatible(
  "openrouter",
  "https://openrouter.ai/api/v1",
);
export const xaiProvider: AIProvider = makeOpenAICompatible("xai", "https://api.x.ai/v1");
