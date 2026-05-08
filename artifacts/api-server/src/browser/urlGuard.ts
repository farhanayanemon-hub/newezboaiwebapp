/**
 * URL safety checks for browser-agent navigation. Blocks file:// /
 * chrome:// / about:, plus private IP ranges to prevent SSRF-style abuse
 * where the AI is talked into reading internal services.
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
  // IPv4 literal
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number) as [number, number, number, number];
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
  // .replit.dev / .replit.app traffic to ourselves — common SSRF target.
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
