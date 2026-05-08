import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logger } from "../lib/logger";
import { clearSession, publish } from "./wsHub";

/**
 * Browser session lifecycle. Each session owns one Chromium instance with
 * one BrowserContext + one Page. Sessions auto-expire after IDLE_MS without
 * activity. We cap concurrent sessions to keep memory bounded — Chromium
 * uses ~150–250 MB resident.
 */

export interface PendingConfirmation {
  id: string;
  question: string;
  detail?: string;
  resolve: (approved: boolean) => void;
}

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastActivity: number;
  busy: boolean;
  /** Set when an in-flight agent run is being signaled to stop. */
  abortRequested: boolean;
  /** Optional conversation to write the agent's final answer into. */
  conversationId?: string | null;
  /** A confirm() tool call awaiting user approval, if any. */
  pendingConfirm?: PendingConfirmation | null;
}

const IDLE_MS = 15 * 60 * 1000;
const MAX_SESSIONS = Number(process.env.BROWSER_MAX_SESSIONS ?? "3");
const SWEEP_MS = 60 * 1000;

const sessions = new Map<string, BrowserSession>();
let sweeperStarted = false;

function startSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (s.busy) continue;
      if (now - s.lastActivity > IDLE_MS) {
        logger.info({ sessionId: id, idleMs: now - s.lastActivity }, "browser session idle expired");
        void closeSession(id, "idle timeout");
      }
    }
  }, SWEEP_MS).unref?.();
}

export async function createSession(): Promise<BrowserSession> {
  startSweeper();
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`MAX_SESSIONS_REACHED (limit ${MAX_SESSIONS})`);
  }
  const browser = await chromium.launch({
    headless: true,
    // The Replit container has no setuid sandbox helper; without these flags
    // Chromium dies with "Failed to move to new namespace".
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120.0.0.0 Safari/537.36 EzboAI/1.0",
    locale: "bn-BD",
    timezoneId: "Asia/Dhaka",
  });
  // Block heavy/irrelevant resources to keep the shell snappy & screenshots fast.
  await context.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "media" || t === "font") return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  const id = randomUUID();
  const now = Date.now();
  const session: BrowserSession = {
    id,
    browser,
    context,
    page,
    createdAt: now,
    lastActivity: now,
    busy: false,
    abortRequested: false,
    conversationId: null,
    pendingConfirm: null,
  };
  sessions.set(id, session);
  logger.info({ sessionId: id, total: sessions.size }, "browser session created");
  publish(id, { type: "ready", payload: { sessionId: id } });
  return session;
}

export function getSession(id: string): BrowserSession | undefined {
  const s = sessions.get(id);
  if (s) s.lastActivity = Date.now();
  return s;
}

export async function closeSession(id: string, reason = "manual"): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  sessions.delete(id);
  // Unblock any in-flight confirmation so the awaiting tool call can return
  // a denied result and the agent loop can exit cleanly. Without this, the
  // run promise would dangle until process exit.
  if (s.pendingConfirm) {
    s.pendingConfirm.resolve(false);
    s.pendingConfirm = null;
  }
  try {
    await s.context.close();
  } catch {
    /* ignore */
  }
  try {
    await s.browser.close();
  } catch {
    /* ignore */
  }
  logger.info({ sessionId: id, reason }, "browser session closed");
  clearSession(id);
  return true;
}

export function listSessions(): Array<{
  id: string;
  createdAt: number;
  lastActivity: number;
  busy: boolean;
}> {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    busy: s.busy,
  }));
}

export function requestAbort(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  s.abortRequested = true;
  // If a confirm() is hanging, unblock it as denied so the loop can exit.
  if (s.pendingConfirm) {
    s.pendingConfirm.resolve(false);
    s.pendingConfirm = null;
  }
  return true;
}

/** Resolve the session's pending confirmation, if any. The confirmId guards
 *  against a stale/replayed approval landing on a *later* confirm prompt
 *  in the same session. */
export function answerConfirmation(
  id: string,
  approved: boolean,
  confirmId?: string,
): { ok: true } | { ok: false; reason: "no_pending" | "id_mismatch" } {
  const s = sessions.get(id);
  if (!s || !s.pendingConfirm) return { ok: false, reason: "no_pending" };
  if (confirmId && s.pendingConfirm.id !== confirmId) {
    return { ok: false, reason: "id_mismatch" };
  }
  s.pendingConfirm.resolve(approved);
  s.pendingConfirm = null;
  return { ok: true };
}

/** Close every session — used at process shutdown. */
export async function closeAllSessions(): Promise<void> {
  await Promise.allSettled([...sessions.keys()].map((id) => closeSession(id, "shutdown")));
}
