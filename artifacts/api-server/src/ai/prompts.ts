import { db, memoriesTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const BASE_PROMPT =
  "You are EzboAI, a friendly, capable AI assistant. " +
  "Always respond in English, regardless of the language the user writes in. " +
  "Use Markdown when helpful. Be accurate, concise, and helpful.";

const MEMORY_INSTRUCTIONS =
  "\n\nYou can save long-term memories. When the user explicitly asks you to remember " +
  "something (e.g. \"remember my name is Rakib\"), " +
  "include a single line at the very end of your reply in this exact format:\n" +
  "[REMEMBER: key=value]\n" +
  "Use a short snake_case key (e.g. user_name, favorite_color, birthday). " +
  "Only emit this tag when the user actually requests to remember something. " +
  "Do not mention the tag itself in conversational text — just acknowledge naturally.";

const MEMORY_LIMIT = 50;

export type EzboTier = "standard" | "mini" | "pro";

export interface EzboTierConfig {
  id: EzboTier;
  label: string;
  taskType: "chat-fast" | "chat-smart";
  promptAddon: string;
}

export const EZBO_TIERS: Record<EzboTier, EzboTierConfig> = {
  standard: {
    id: "standard",
    label: "Ezbo 1.0",
    taskType: "chat-smart",
    promptAddon: "",
  },
  mini: {
    id: "mini",
    label: "Ezbo 1.0 Mini",
    taskType: "chat-fast",
    promptAddon:
      "\n\nResponse style: be concise. Prefer short, direct answers — usually 1-3 sentences. Skip preamble. Only expand when the user explicitly asks for detail.",
  },
  pro: {
    id: "pro",
    label: "Ezbo 1.0 Pro (Beta)",
    taskType: "chat-smart",
    promptAddon:
      "\n\nResponse style: take extra care. Reason step-by-step internally before answering. Provide thorough, well-structured responses with examples and clear sections (use Markdown headings or bullet lists when helpful). Prefer accuracy over speed.",
  },
};

export function parseEzboModelId(id: string | undefined): EzboTierConfig | null {
  if (!id || !id.startsWith("ezbo:")) return null;
  const tier = id.slice(5) as EzboTier;
  return EZBO_TIERS[tier] ?? null;
}

export async function buildSystemPrompt(): Promise<string> {
  let memories: { key: string; value: string }[] = [];
  try {
    memories = await db
      .select({ key: memoriesTable.key, value: memoriesTable.value })
      .from(memoriesTable)
      .orderBy(desc(memoriesTable.updatedAt))
      .limit(MEMORY_LIMIT);
  } catch {
    // memories table may not exist yet during initial setup
  }

  let prompt = BASE_PROMPT + MEMORY_INSTRUCTIONS;
  if (memories.length > 0) {
    const lines = memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
    prompt += `\n\nUser facts you should remember across conversations:\n${lines}`;
  }
  return prompt;
}

const MEMORY_TAG_RE = /\[REMEMBER:\s*([a-z0-9_]+)\s*=\s*([^\]]+?)\s*\]/gi;

export interface ExtractedMemory {
  key: string;
  value: string;
}

export function extractMemoriesFromReply(text: string): {
  cleaned: string;
  memories: ExtractedMemory[];
} {
  const memories: ExtractedMemory[] = [];
  const cleaned = text.replace(MEMORY_TAG_RE, (_, key: string, value: string) => {
    memories.push({ key: key.toLowerCase().trim(), value: value.trim() });
    return "";
  });
  return { cleaned: cleaned.trimEnd(), memories };
}
