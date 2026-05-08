import type { AIProvider } from "./types";
import { openaiProvider, openrouterProvider, xaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { replicateProvider } from "./replicate";

export const providerRegistry: Record<string, AIProvider> = {
  openai: openaiProvider,
  openrouter: openrouterProvider,
  xai: xaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  replicate: replicateProvider,
};

export function getProvider(slug: string): AIProvider | undefined {
  return providerRegistry[slug];
}

export type { AIProvider } from "./types";
export * from "./types";
