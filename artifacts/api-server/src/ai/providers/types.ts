export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
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
