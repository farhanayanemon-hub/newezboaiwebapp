export const PROVIDER_SLUGS = [
  "openai",
  "openrouter",
  "anthropic",
  "xai",
  "replicate",
  "gemini",
] as const;

export type ProviderSlug = (typeof PROVIDER_SLUGS)[number];

export const PROVIDER_LABELS: Record<ProviderSlug, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  anthropic: "Anthropic Claude",
  xai: "xAI Grok",
  replicate: "Replicate",
  gemini: "Google Gemini",
};

export interface ProviderRow {
  id: number;
  provider: ProviderSlug | string;
  label: string;
  maskedKey: string;
  enabled: boolean;
  enabledModels: string[];
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
}

export interface ProvidersResponse {
  providers: ProviderRow[];
}

export interface ProviderModelRow {
  id: string;
  contextWindow?: number;
  capabilities?: string[];
}

export interface RoutingCandidate {
  provider: string;
  model: string;
}

export const TASK_TYPES = [
  "chat-fast",
  "chat-smart",
  "vision",
  "code",
  "image-gen",
  "audio-tts",
  "audio-stt",
  "embedding",
  "web-agent",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_LABELS: Record<TaskType, string> = {
  "chat-fast": "Fast Chat",
  "chat-smart": "Smart Chat",
  vision: "Vision",
  code: "Code",
  "image-gen": "Image Generation",
  "audio-tts": "Text-to-Speech",
  "audio-stt": "Speech-to-Text",
  embedding: "Embeddings",
  "web-agent": "Web Agent",
};

export const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  "chat-fast": "Default for quick replies and short conversations.",
  "chat-smart": "Default for complex reasoning and long answers.",
  vision: "Image understanding tasks.",
  code: "Code generation and debugging.",
  "image-gen": "Image generation.",
  "audio-tts": "Text-to-speech synthesis.",
  "audio-stt": "Speech-to-text transcription.",
  embedding: "Vector embeddings.",
  "web-agent": "Browser automation agent.",
};
