import { db, providerKeysTable, routingRulesTable, providerUsageTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto";
import { getProvider } from "./providers";
import type { ChatChunk, ChatMessage, ChatStreamResult } from "./providers/types";
import type { TaskType, RoutingCandidate } from "@workspace/db";

interface ResolvedCandidate {
  provider: string;
  model: string;
  apiKey: string;
  keyId: number;
}

export class AIRouter {
  async getCandidatesForTask(taskType: TaskType, modelOverride?: string): Promise<ResolvedCandidate[]> {
    const allKeys = await db.select().from(providerKeysTable).where(eq(providerKeysTable.enabled, true));
    if (allKeys.length === 0) return [];

    const decryptedKeys = new Map<string, { id: number; key: string; enabledModels: string[] }[]>();
    for (const k of allKeys) {
      try {
        const list = decryptedKeys.get(k.provider) ?? [];
        list.push({ id: k.id, key: decrypt(k.encryptedKey), enabledModels: k.enabledModels ?? [] });
        decryptedKeys.set(k.provider, list);
      } catch {
        // skip undecryptable keys
      }
    }

    if (modelOverride) {
      const [provider, ...rest] = modelOverride.split(":");
      const model = rest.join(":");
      const keys = decryptedKeys.get(provider);
      if (provider && model && keys && keys.length > 0) {
        const k = keys[0];
        if (k.enabledModels.length > 0 && !k.enabledModels.includes(model)) {
          throw new Error("MODEL_NOT_ALLOWED");
        }
        return [{ provider, model, apiKey: k.key, keyId: k.id }];
      }
      throw new Error("MODEL_NOT_ALLOWED");
    }

    const ruleRow = await db
      .select()
      .from(routingRulesTable)
      .where(eq(routingRulesTable.taskType, taskType))
      .limit(1);

    const order: RoutingCandidate[] =
      ruleRow[0]?.providerOrder ?? defaultRoutingFor(taskType);

    const result: ResolvedCandidate[] = [];
    for (const cand of order) {
      const keys = decryptedKeys.get(cand.provider);
      if (!keys || keys.length === 0) continue;
      const k = keys[0];
      if (k.enabledModels.length > 0 && !k.enabledModels.includes(cand.model)) continue;
      result.push({ provider: cand.provider, model: cand.model, apiKey: k.key, keyId: k.id });
    }

    if (result.length === 0) {
      for (const [provider, keys] of decryptedKeys.entries()) {
        const k = keys[0];
        const fallbackModel = k.enabledModels[0] ?? defaultModelFor(provider);
        if (fallbackModel) {
          result.push({ provider, model: fallbackModel, apiKey: k.key, keyId: k.id });
        }
      }
    }

    return result;
  }

  async streamChat(args: {
    taskType: TaskType;
    messages: ChatMessage[];
    modelOverride?: string;
    onChunk: (c: ChatChunk) => void;
  }): Promise<{ result: ChatStreamResult; provider: string; model: string; latencyMs: number; attempts: { provider: string; model: string; error: string }[] }> {
    const candidates = await this.getCandidatesForTask(args.taskType, args.modelOverride);
    if (candidates.length === 0) {
      throw new Error("NO_PROVIDERS");
    }

    const attempts: { provider: string; model: string; error: string }[] = [];
    let emitted = false;
    const wrappedOnChunk = (c: ChatChunk) => {
      emitted = true;
      args.onChunk(c);
    };

    for (const cand of candidates) {
      const provider = getProvider(cand.provider);
      if (!provider) {
        attempts.push({ provider: cand.provider, model: cand.model, error: "Unknown provider" });
        continue;
      }
      const start = Date.now();
      try {
        const result = await provider.streamChat({
          apiKey: cand.apiKey,
          model: cand.model,
          messages: args.messages,
          onChunk: wrappedOnChunk,
        });
        const latencyMs = Date.now() - start;
        await db.insert(providerUsageTable).values({
          provider: cand.provider,
          model: cand.model,
          taskType: args.taskType,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs,
          costUsd: 0,
        }).catch(() => {});
        return { result, provider: cand.provider, model: cand.model, latencyMs, attempts };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const latencyMs = Date.now() - start;
        attempts.push({ provider: cand.provider, model: cand.model, error: msg });
        await db.insert(providerUsageTable).values({
          provider: cand.provider,
          model: cand.model,
          taskType: args.taskType,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          costUsd: 0,
          error: msg.slice(0, 500),
        }).catch(() => {});
        if (emitted) {
          throw new Error(`STREAM_FAILED_AFTER_PARTIAL: ${msg}`);
        }
      }
    }

    throw new Error(`ALL_PROVIDERS_FAILED: ${JSON.stringify(attempts)}`);
  }
}

export const router = new AIRouter();

function defaultModelFor(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-20241022";
    case "gemini":
      return "gemini-2.0-flash";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "xai":
      return "grok-2-latest";
    case "replicate":
      return "meta/meta-llama-3-70b-instruct";
  }
}

function defaultRoutingFor(taskType: TaskType): RoutingCandidate[] {
  switch (taskType) {
    case "chat-fast":
      return [
        { provider: "openai", model: "gpt-4o-mini" },
        { provider: "gemini", model: "gemini-2.0-flash" },
      ];
    case "chat-smart":
      return [
        { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
        { provider: "openai", model: "gpt-4o" },
        { provider: "gemini", model: "gemini-2.5-pro" },
      ];
    case "vision":
      return [
        { provider: "openai", model: "gpt-4o" },
        { provider: "gemini", model: "gemini-2.5-pro" },
      ];
    case "code":
      return [
        { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
        { provider: "openrouter", model: "deepseek/deepseek-chat" },
      ];
    case "image-gen":
      return [{ provider: "replicate", model: "black-forest-labs/flux-schnell" }];
    case "audio-tts":
      return [{ provider: "openai", model: "tts-1" }];
    case "audio-stt":
      return [{ provider: "openai", model: "whisper-1" }];
    case "embedding":
      return [{ provider: "openai", model: "text-embedding-3-small" }];
    case "web-agent":
      return [{ provider: "anthropic", model: "claude-3-5-sonnet-20241022" }];
  }
}
