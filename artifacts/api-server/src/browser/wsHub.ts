import type { WebSocket } from "ws";

/**
 * Per-session pub/sub for browser-agent events. WebSocket clients subscribe
 * by sessionId; the agent loop publishes events that are forwarded to every
 * connected client for that session.
 */

export type BrowserEventType =
  | "ready"
  | "plan"
  | "action"
  | "tool_result"
  | "screenshot"
  | "thinking"
  | "error"
  | "done"
  | "closed"
  | "confirm_request"
  | "confirm_resolved";

export interface BrowserEvent {
  type: BrowserEventType;
  /** ISO timestamp; primarily for client-side ordering / animation. */
  ts: string;
  payload?: unknown;
}

const subscribers = new Map<string, Set<WebSocket>>();
/** Bounded backlog so a panel that connects mid-run still sees recent events. */
const backlog = new Map<string, BrowserEvent[]>();
const MAX_BACKLOG = 50;

export function subscribe(sessionId: string, ws: WebSocket): void {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  set.add(ws);
  // Replay backlog so a late-attaching client catches up.
  for (const ev of backlog.get(sessionId) ?? []) {
    safeSend(ws, ev);
  }
}

export function unsubscribe(sessionId: string, ws: WebSocket): void {
  const set = subscribers.get(sessionId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) subscribers.delete(sessionId);
}

export function publish(sessionId: string, event: Omit<BrowserEvent, "ts">): void {
  const ev: BrowserEvent = { ts: new Date().toISOString(), ...event };
  const list = backlog.get(sessionId) ?? [];
  // Screenshots are large (≈100 KB JPEG). Keep at most ONE screenshot in
  // the replay backlog — only the most recent one matters for a late
  // subscriber. Without this cap a 30-step run with screenshots after each
  // action would balloon to ≈3 MB per session resident in memory.
  if (ev.type === "screenshot") {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.type === "screenshot") list.splice(i, 1);
    }
  }
  list.push(ev);
  if (list.length > MAX_BACKLOG) list.shift();
  backlog.set(sessionId, list);
  const set = subscribers.get(sessionId);
  if (!set) return;
  for (const ws of set) safeSend(ws, ev);
}

export function clearSession(sessionId: string): void {
  publish(sessionId, { type: "closed" });
  const set = subscribers.get(sessionId);
  if (set) {
    for (const ws of set) {
      try {
        ws.close(1000, "session ended");
      } catch {
        /* ignore */
      }
    }
  }
  subscribers.delete(sessionId);
  backlog.delete(sessionId);
}

function safeSend(ws: WebSocket, ev: BrowserEvent): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(ev));
  } catch {
    /* socket gone */
  }
}
