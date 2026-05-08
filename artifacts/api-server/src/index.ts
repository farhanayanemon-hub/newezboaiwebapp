import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureMessagesFts, ensureBrowserAccessRules, ensureEzboTierPrompts, ensureUsers, ensureProjects, ensureAdminPhase4 } from "./db/bootstrap";
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

/**
 * Production env sanity. We don't crash on missing OpenAI/etc — those are
 * configured at runtime via /admin — but APP_ENCRYPTION_KEY and
 * SESSION_SECRET MUST exist before serving, and DATABASE_URL is required
 * by drizzle anyway. Crashing early gives the deploy logs a clear error
 * instead of a 500 on first request.
 */
function assertProductionEnv(): void {
  if (process.env["NODE_ENV"] !== "production") return;
  const required = ["DATABASE_URL", "APP_ENCRYPTION_KEY", "SESSION_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error({ missing }, "missing required production env vars");
    throw new Error(
      `Missing required env vars in production: ${missing.join(", ")}`,
    );
  }
}

async function start(): Promise<void> {
  assertProductionEnv();
  await ensureMessagesFts();
  await ensureBrowserAccessRules();
  await ensureEzboTierPrompts();
  await ensureUsers();
  await ensureProjects();
  await ensureAdminPhase4();
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
