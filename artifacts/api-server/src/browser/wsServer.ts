import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../lib/logger";
import { subscribe, unsubscribe } from "./wsHub";
import { getSession } from "./manager";

function reject(socket: { write: (s: string) => void; destroy: () => void }, code: number, reason: string): void {
  socket.write(
    `HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

/**
 * Attach a WebSocket endpoint at /ws/browser/:sessionId to the given HTTP
 * server. Per-session events are fanned out via wsHub; this layer just
 * routes connecting sockets to the right room. Single-tenant deployment —
 * no admin gate; the only inbound check is "does this session exist?".
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
    try {
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
  });
}
