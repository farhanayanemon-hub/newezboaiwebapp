import type { Server as HttpServer, IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, adminSessionsTable } from "@workspace/db";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../lib/logger";
import { subscribe, unsubscribe } from "./wsHub";
import { getSession } from "./manager";

const COOKIE_NAME = "ezboai_admin";

/** Parse a single cookie value from the raw Cookie header. */
function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function isAdminAuthed(req: IncomingMessage): Promise<boolean> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select()
    .from(adminSessionsTable)
    .where(
      and(
        eq(adminSessionsTable.tokenHash, tokenHash),
        gt(adminSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function reject(socket: { write: (s: string) => void; destroy: () => void }, code: number, reason: string): void {
  socket.write(
    `HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

/**
 * Attach a WebSocket endpoint at /ws/browser/:sessionId to the given HTTP
 * server. Per-session events are fanned out via wsHub; this layer just
 * routes connecting sockets to the right room. Auth: requires the same
 * admin session cookie as the REST API — single-tenant model.
 */
export function attachBrowserWs(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const m = url.match(/^\/ws\/browser\/([0-9a-fA-F-]{36})(?:\?.*)?$/);
    if (!m) {
      // Not our route — leave the socket alone for other handlers.
      return;
    }
    const sessionId = m[1]!;
    void (async () => {
      try {
        if (!(await isAdminAuthed(req))) {
          reject(socket, 401, "Unauthorized");
          return;
        }
        if (!getSession(sessionId)) {
          reject(socket, 404, "Not Found");
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          subscribe(sessionId, ws);
          logger.debug({ sessionId }, "browser ws connected");
          ws.on("close", () => unsubscribe(sessionId, ws));
          ws.on("error", () => unsubscribe(sessionId, ws));
        });
      } catch (err) {
        logger.error({ err, sessionId }, "ws upgrade failed");
        reject(socket, 500, "Internal Error");
      }
    })();
  });
}
