import { db, memoriesTable, ezboTierPromptsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const BASE_PROMPT =
  "You are EzboAI, a friendly, capable AI assistant. " +
  "Always reply in the SAME language the user wrote in. Match their script and tone. " +
  "If the user mixes languages, reply in the dominant one. If the language is unclear, default to Bangla. " +
  "Never switch language mid-conversation unless the user does. " +
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

/**
 * Lightweight Unicode-script-based language detector. Looks at the chars in
 * the latest user message and picks the dominant script. Returns a BCP-47
 * code on a confident match, or null when ambiguous (the model will pick).
 *
 * No external dep — works fine for the Bangla/English/Hindi/Arabic/Urdu/CJK
 * mix this app actually sees. For Latin-script languages (English, Spanish,
 * French, German, etc.) we cannot disambiguate by script alone, so we tag
 * them as "latin" and rely on the model to pick the specific language from
 * vocabulary cues — the system prompt already tells it to match the user.
 */
export function detectLanguage(text: string | undefined | null): string | null {
  if (!text) return null;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    let bucket: string | null = null;
    if (cp >= 0x0980 && cp <= 0x09ff) bucket = "bn"; // Bengali / Bangla
    else if (cp >= 0x0900 && cp <= 0x097f) bucket = "hi"; // Devanagari (Hindi/Marathi/Sanskrit)
    else if (cp >= 0x0600 && cp <= 0x06ff) bucket = "ar"; // Arabic (also covers Urdu/Persian)
    else if (cp >= 0x0750 && cp <= 0x077f) bucket = "ar"; // Arabic Supplement
    else if (cp >= 0x0a80 && cp <= 0x0aff) bucket = "gu"; // Gujarati
    else if (cp >= 0x0b80 && cp <= 0x0bff) bucket = "ta"; // Tamil
    else if (cp >= 0x0c00 && cp <= 0x0c7f) bucket = "te"; // Telugu
    else if (cp >= 0x0d00 && cp <= 0x0d7f) bucket = "ml"; // Malayalam
    else if (cp >= 0x4e00 && cp <= 0x9fff) bucket = "zh"; // CJK Unified Ideographs
    else if (cp >= 0x3040 && cp <= 0x30ff) bucket = "ja"; // Hiragana/Katakana
    else if (cp >= 0xac00 && cp <= 0xd7af) bucket = "ko"; // Hangul
    else if (cp >= 0x0590 && cp <= 0x05ff) bucket = "he"; // Hebrew
    else if (cp >= 0x0e00 && cp <= 0x0e7f) bucket = "th"; // Thai
    else if (cp >= 0x0400 && cp <= 0x04ff) bucket = "ru"; // Cyrillic (treat as Russian)
    else if (cp >= 0x0370 && cp <= 0x03ff) bucket = "el"; // Greek
    else if (
      (cp >= 0x0041 && cp <= 0x005a) ||
      (cp >= 0x0061 && cp <= 0x007a) ||
      (cp >= 0x00c0 && cp <= 0x024f) // Latin Extended-A/B (accents)
    ) bucket = "latin";
    if (bucket) {
      counts[bucket] = (counts[bucket] ?? 0) + 1;
      total += 1;
    }
  }
  if (total < 1) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) { bestCount = v; best = k; }
  }
  // Require the dominant script to be at least 60% of detected chars to
  // commit to a label; otherwise leave it null (model decides).
  if (best == null || bestCount / total < 0.6) return null;
  return best;
}

const LANGUAGE_NAMES: Record<string, string> = {
  bn: "Bangla (Bengali)",
  hi: "Hindi",
  ar: "Arabic / Urdu",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  he: "Hebrew",
  th: "Thai",
  ru: "Russian",
  el: "Greek",
  // Latin script can be English, Spanish, French, German, Portuguese, etc.
  // We let the model pick from vocabulary cues.
  latin: "the same Latin-script language the user used (English, Spanish, French, German, etc.)",
};

export function languageHintForPrompt(code: string | null): string {
  if (!code) return "";
  const name = LANGUAGE_NAMES[code] ?? code;
  return `\n\nLanguage hint for THIS turn: the user's latest message is in ${name}. Reply in ${name} unless the user explicitly switches.`;
}

export async function buildSystemPrompt(tier?: EzboTierConfig | null, lastUserText?: string | null): Promise<string> {
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
  // Per-turn language hint (Task #22): inject a small directive based on
  // the dominant Unicode script of the user's latest message. Helps the
  // model commit to the right language on first token.
  const langHint = languageHintForPrompt(detectLanguage(lastUserText));
  if (langHint) prompt += langHint;
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
