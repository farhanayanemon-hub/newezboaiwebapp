/**
 * Web search integration (Tavily).
 *
 * NOTE — design deviation from the original spec: instead of registering a
 * `web_search` tool that the model invokes via tool-calling, we run a
 * server-side heuristic on the user's last message and pre-fetch results
 * before the LLM call, then inject them into the system prompt as grounding
 * context. The user-visible outcome is the same (auto-search + cited
 * sources), and this avoids rewriting all 4 providers' streamChat to
 * support multi-turn tool_use loops.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  webSearchConfigTable,
  webSearchUsageTable,
  type MessageSource,
} from "@workspace/db";
import { decrypt } from "../ai/crypto";

export interface WebSearchDecision {
  shouldSearch: boolean;
  reason: string;
  query: string;
}

const FRESH_INFO_PATTERNS: RegExp[] = [
  /\b(today|tonight|right now|currently|at the moment|this (week|month|year|morning|afternoon|evening))\b/i,
  /\b(latest|newest|most recent|recent|breaking|live|update[ds]?)\b/i,
  /\b(news|headline|score|standings|forecast|weather)\b/i,
  /\b(price|stock|crypto|exchange rate|usd to|btc|eth|nasdaq|s&p)\b/i,
  /\b(202[5-9]|20[3-9][0-9])\b/,
  /\b(who (won|is winning|leads)|when (does|is|will))\b/i,
  /\b(how (much|many) (does|is|are).*(now|today))\b/i,
  /\bwhat'?s happening\b/i,
];

const EXPLICIT_PREFIX = /^(\s*)(@search|\/search|search:)\s+/i;

/** Decide whether the latest user turn warrants a real web search. */
export function decideSearch(userText: string): WebSearchDecision {
  const trimmed = (userText || "").trim();
  if (!trimmed) return { shouldSearch: false, reason: "empty", query: "" };

  const explicit = trimmed.match(EXPLICIT_PREFIX);
  if (explicit) {
    return {
      shouldSearch: true,
      reason: "explicit",
      query: trimmed.slice(explicit[0].length).trim(),
    };
  }

  for (const re of FRESH_INFO_PATTERNS) {
    if (re.test(trimmed)) {
      return { shouldSearch: true, reason: `pattern:${re.source.slice(0, 30)}`, query: trimmed };
    }
  }
  return { shouldSearch: false, reason: "no-signal", query: trimmed };
}

interface TavilyHit {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyResponse {
  query?: string;
  answer?: string;
  results?: TavilyHit[];
}

async function callTavily(
  apiKey: string,
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<{ answer?: string; results: MessageSource[] }> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.max(1, Math.min(10, maxResults)),
      search_depth: "basic",
      include_answer: true,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  const data = (await res.json()) as TavilyResponse;
  const results: MessageSource[] = (data.results ?? []).map((r) => {
    const url = r.url ?? "";
    let domain = "";
    try {
      domain = url ? new URL(url).hostname.replace(/^www\./, "") : "";
    } catch {
      domain = "";
    }
    return {
      title: (r.title || domain || "Source").slice(0, 200),
      url,
      domain,
      snippet: (r.content || "").slice(0, 400),
    };
  });
  return { answer: data.answer, results };
}

/** Lightweight handle for a single test ping (used by the admin "test" button). */
export async function probeTavilyKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callTavily(apiKey, "ping", 1);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Probe failed" };
  }
}

async function loadConfig(): Promise<typeof webSearchConfigTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(webSearchConfigTable)
    .where(eq(webSearchConfigTable.id, 1))
    .limit(1);
  return row ?? null;
}

async function countRecentUsage(ownerKey: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(webSearchUsageTable)
    .where(
      and(
        eq(webSearchUsageTable.ownerKey, ownerKey),
        gte(webSearchUsageTable.createdAt, since),
      ),
    );
  return rows[0]?.c ?? 0;
}

export interface RunSearchInput {
  ownerKey: string;
  ownerKind: "user" | "guest";
  query: string;
}

export interface RunSearchResult {
  ran: boolean;
  reason?: string;
  results: MessageSource[];
  answer?: string;
}

/**
 * Run a search if config allows, the rate limit is not hit, and the API key
 * is configured. Always logs an audit row when a real call is made.
 */
export async function runWebSearch(input: RunSearchInput): Promise<RunSearchResult> {
  const cfg = await loadConfig();
  if (!cfg || !cfg.enabled) return { ran: false, reason: "disabled", results: [] };
  if (!cfg.encryptedApiKey) return { ran: false, reason: "no-key", results: [] };

  const limit = input.ownerKind === "user" ? cfg.userDailyLimit : cfg.guestDailyLimit;
  const used = await countRecentUsage(input.ownerKey);
  if (used >= limit) return { ran: false, reason: "rate-limit", results: [] };

  let apiKey: string;
  try {
    apiKey = decrypt(cfg.encryptedApiKey);
  } catch {
    return { ran: false, reason: "key-decrypt-failed", results: [] };
  }

  const startedAt = Date.now();
  try {
    const out = await callTavily(apiKey, input.query, cfg.maxResults);
    const latencyMs = Date.now() - startedAt;
    await db
      .insert(webSearchUsageTable)
      .values({
        ownerKey: input.ownerKey,
        query: input.query.slice(0, 500),
        resultCount: out.results.length,
        latencyMs,
      })
      .catch(() => undefined);
    return { ran: true, results: out.results, answer: out.answer };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : "Search failed";
    await db
      .insert(webSearchUsageTable)
      .values({
        ownerKey: input.ownerKey,
        query: input.query.slice(0, 500),
        resultCount: 0,
        latencyMs,
        error: msg.slice(0, 500),
      })
      .catch(() => undefined);
    return { ran: false, reason: `error:${msg}`, results: [] };
  }
}

/** Format results as a system-prompt grounding block. */
export function formatResultsForPrompt(query: string, results: MessageSource[], answer?: string): string {
  if (!results.length && !answer) return "";
  const lines: string[] = [];
  lines.push("");
  lines.push("=== LIVE WEB SEARCH RESULTS ===");
  lines.push(`User's query was searched: ${query.slice(0, 200)}`);
  if (answer) {
    lines.push("");
    lines.push(`Provider summary: ${answer.slice(0, 600)}`);
  }
  if (results.length) {
    lines.push("");
    lines.push("Sources (use these to ground your answer; cite by listing the source numbers you used):");
    results.forEach((r, i) => {
      lines.push(`[${i + 1}] ${r.title} — ${r.domain || r.url}`);
      if (r.snippet) lines.push(`    ${r.snippet.replace(/\s+/g, " ").slice(0, 300)}`);
      lines.push(`    ${r.url}`);
    });
  }
  lines.push("");
  lines.push("Use these results as the primary basis for your answer when they are relevant. " +
    "If results contradict your prior knowledge, prefer the results (they are fresher). " +
    "Do not invent sources. Do not include URLs in your reply — the UI shows them separately.");
  lines.push("=== END WEB SEARCH RESULTS ===");
  return lines.join("\n");
}
