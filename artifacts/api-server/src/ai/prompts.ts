import { db, memoriesTable, ezboTierPromptsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

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
  description: string;
  taskType: "chat-fast" | "chat-smart";
  promptAddon: string;
}

/**
 * Hardcoded fallback used when the DB row is missing (fresh install) or the
 * DB query fails. Admin can override these in /admin → "Ezbo Tiers".
 */
export const EZBO_TIER_DEFAULTS: Record<EzboTier, EzboTierConfig> = {
  standard: {
    id: "standard",
    label: "Ezbo 1.0",
    description: "Balanced everyday assistant",
    taskType: "chat-smart",
    promptAddon: "",
  },
  mini: {
    id: "mini",
    label: "Ezbo 1.0 Mini",
    description: "Fast, concise replies",
    taskType: "chat-fast",
    promptAddon:
      "\n\nResponse style: be concise. Prefer short, direct answers — usually 1-3 sentences. Skip preamble. Only expand when the user explicitly asks for detail.",
  },
  pro: {
    id: "pro",
    label: "Ezbo 1.0 Pro (Beta)",
    description: "Deeper reasoning, longer answers",
    taskType: "chat-smart",
    promptAddon:
      "\n\nResponse style: take extra care. Reason step-by-step internally before answering. Provide thorough, well-structured responses with examples and clear sections (use Markdown headings or bullet lists when helpful). Prefer accuracy over speed.",
  },
};

// Backwards-compat export for any external imports.
export const EZBO_TIERS = EZBO_TIER_DEFAULTS;

/**
 * Tiny in-process cache so we don't hit the DB on every chat turn.
 * Invalidated explicitly when admin saves a change.
 */
const TIER_CACHE_TTL_MS = 60_000;
let tierCache: { at: number; data: Record<EzboTier, EzboTierConfig> } | null = null;

export function invalidateEzboTierCache(): void {
  tierCache = null;
}

async function loadTiersFromDb(): Promise<Record<EzboTier, EzboTierConfig>> {
  const merged: Record<EzboTier, EzboTierConfig> = {
    standard: { ...EZBO_TIER_DEFAULTS.standard },
    mini: { ...EZBO_TIER_DEFAULTS.mini },
    pro: { ...EZBO_TIER_DEFAULTS.pro },
  };
  try {
    const rows = await db.select().from(ezboTierPromptsTable);
    for (const r of rows) {
      const id = r.tier as EzboTier;
      if (!merged[id]) continue;
      merged[id] = {
        id,
        label: r.label || merged[id].label,
        description: r.description || merged[id].description,
        taskType: (r.taskType as "chat-fast" | "chat-smart") || merged[id].taskType,
        promptAddon: r.promptAddon ?? merged[id].promptAddon,
      };
    }
  } catch {
    // table missing on first deploy — defaults are fine
  }
  return merged;
}

export async function getEzboTier(id: EzboTier): Promise<EzboTierConfig> {
  if (!tierCache || Date.now() - tierCache.at > TIER_CACHE_TTL_MS) {
    tierCache = { at: Date.now(), data: await loadTiersFromDb() };
  }
  return tierCache.data[id];
}

export function parseEzboModelId(id: string | undefined): EzboTierConfig | null {
  if (!id || !id.startsWith("ezbo:")) return null;
  const tier = id.slice(5) as EzboTier;
  return EZBO_TIER_DEFAULTS[tier] ?? null;
}

/**
 * Resolves the runtime tier (DB-backed addon merged in). Returns the default
 * (`standard`) when no id is supplied.
 */
export async function resolveEzboTier(
  id: string | undefined,
): Promise<EzboTierConfig | null> {
  const parsed = parseEzboModelId(id);
  if (!parsed) return null;
  return getEzboTier(parsed.id);
}

export async function buildSystemPrompt(tier?: EzboTierConfig | null): Promise<string> {
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
  if (tier?.promptAddon) {
    prompt += tier.promptAddon;
  }
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

// Suppress unused import warning for eq when memory queries don't use it directly.
void eq;
