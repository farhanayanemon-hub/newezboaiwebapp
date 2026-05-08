import { lookup } from "node:dns/promises";
import { db, browserAccessRulesTable } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * URL safety checks for browser-agent navigation. Blocks file:// /
 * chrome:// / about:, plus private IP ranges to prevent SSRF-style abuse
 * where the AI is talked into reading internal services.
 *
 * Two layers:
 *   1. Synchronous string check (`assertSafeUrl`) — catches obvious
 *      protocol/hostname-literal abuse and is what the agent's tool args
 *      are validated against before navigation.
 *   2. Async DNS check (`assertSafeResolved`) — resolves the hostname and
 *      verifies the resulting IP isn't in any private/internal range.
 *      This is the DNS-rebinding mitigation: an attacker who points a
 *      "public" name at 127.0.0.1 will be blocked here, even though the
 *      string check passed.
 *   3. Admin allow/block list — overrides 1 & 2 for hosts the operator
 *      has explicitly allowed or denied.
 */

const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "chrome:",
  "chrome-extension:",
  "about:",
  "javascript:",
  "data:",
  "view-source:",
  "ws:",
  "wss:",
]);

/** Hosts that resolve to "the server itself" or local network. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::" || h === "::1") return true;
  // IPv4 literal (also catches dotted-decimal alt formats once we round-trip
  // through dns.lookup — see assertSafeResolved).
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number) as [number, number, number, number];
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  return false;
}

export function assertSafeUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (BLOCKED_PROTOCOLS.has(u.protocol)) {
    throw new Error(`Blocked protocol: ${u.protocol}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Only http(s) is allowed (got ${u.protocol})`);
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error(`Private/internal host blocked: ${u.hostname}`);
  }
  return u;
}

// ---------- Admin allow/block-list ----------

interface RulesCache {
  allowHosts: Set<string>; // exact + suffix match
  blockHosts: Set<string>;
  loadedAt: number;
}

let cache: RulesCache | null = null;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateAccessRulesCache(): void {
  cache = null;
}

async function loadRules(): Promise<RulesCache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  try {
    const rows = await db.select().from(browserAccessRulesTable);
    const allowHosts = new Set<string>();
    const blockHosts = new Set<string>();
    for (const r of rows) {
      if (r.mode === "allow") allowHosts.add(r.host.toLowerCase());
      else if (r.mode === "block") blockHosts.add(r.host.toLowerCase());
    }
    cache = { allowHosts, blockHosts, loadedAt: Date.now() };
  } catch (err) {
    // Fail open *to the deny side* — if DB is down, behave as no-rules
    // (still subject to private-host blocking) rather than locking the
    // agent out completely.
    logger.warn({ err }, "browser access rules load failed");
    cache = { allowHosts: new Set(), blockHosts: new Set(), loadedAt: Date.now() };
  }
  return cache;
}

function hostMatches(host: string, set: Set<string>): boolean {
  const h = host.toLowerCase();
  if (set.has(h)) return true;
  for (const rule of set) {
    if (h === rule || h.endsWith("." + rule)) return true;
  }
  return false;
}

/**
 * Async second-pass check used right before Playwright navigation.
 * Resolves the hostname through Node's DNS (separate from Chromium's
 * resolver) and verifies the resulting IP isn't private. Also enforces
 * the admin allow/block list.
 */
export async function assertSafeResolved(url: string): Promise<URL> {
  const u = assertSafeUrl(url); // synchronous gate first
  const rules = await loadRules();
  if (hostMatches(u.hostname, rules.blockHosts)) {
    throw new Error(`Host blocked by admin policy: ${u.hostname}`);
  }
  if (rules.allowHosts.size > 0 && !hostMatches(u.hostname, rules.allowHosts)) {
    throw new Error(
      `Host not in admin allow-list: ${u.hostname}. Add it under /admin → Access.`,
    );
  }
  // DNS lookup — get every address, reject if any is private. We deliberately
  // ignore the answer for navigation (Chromium will resolve again) — this is
  // a defense layer, not a pinning layer. With normal DNS TTLs (≥60s) the
  // window for rebinding is small.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch (err) {
    throw new Error(
      `DNS lookup failed for ${u.hostname}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const a of addrs) {
    if (isPrivateHost(a.address)) {
      throw new Error(
        `Hostname ${u.hostname} resolves to a private address (${a.address}).`,
      );
    }
  }
  return u;
}
