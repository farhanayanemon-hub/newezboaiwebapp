export type ChatRole = "system" | "user" | "assistant";

/**
 * Multimodal content parts (OpenAI-style). When `content` is a string,
 * providers should pass it through unchanged. When it's an array, providers
 * that support vision should forward the parts; non-vision providers should
 * fall back to concatenating the text parts only.
 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatChunk {
  delta: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatStreamResult {
  fullText: string;
  usage: ChatUsage;
}

export interface TestResult {
  ok: boolean;
  error?: string;
  latencyMs: number;
}

export interface ProviderModel {
  id: string;
  contextWindow?: number;
  capabilities?: string[];
  pricingInputPerMillion?: number;
  pricingOutputPerMillion?: number;
}

export interface AIProvider {
  slug: string;
  testConnection(apiKey: string): Promise<TestResult>;
  listModels(apiKey: string): Promise<ProviderModel[]>;
  streamChat(args: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    onChunk: (c: ChatChunk) => void;
    signal?: AbortSignal;
  }): Promise<ChatStreamResult>;
}

/** Helper: flatten multimodal content to a plain string for non-vision providers. */
export function contentToString(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p.type === "text" ? p.text : `[image:${p.image_url.url.slice(0, 60)}…]`))
    .join("\n");
}
