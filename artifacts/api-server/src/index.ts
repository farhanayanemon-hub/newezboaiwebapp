import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureMessagesFts, ensureBrowserAccessRules } from "./db/bootstrap";
import { startReminderScheduler } from "./services/scheduler";
import { startAutomationsScheduler } from "./services/automationsScheduler";
import { attachBrowserWs } from "./browser/wsServer";
import { closeAllSessions } from "./browser/manager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await ensureMessagesFts();
  await ensureBrowserAccessRules();
  startReminderScheduler();
  startAutomationsScheduler();

  // We use a raw http.Server (not app.listen) so we can attach the
  // WebSocket upgrade handler for the browser-agent live preview.
  const server = createServer(app);
  attachBrowserWs(server);

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
  server.on("error", (err) => {
    logger.error({ err }, "Server error");
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await closeAllSessions();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
