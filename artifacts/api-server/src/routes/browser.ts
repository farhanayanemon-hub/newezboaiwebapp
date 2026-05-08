import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  closeSession,
  createSession,
  getSession,
  listSessions,
  requestAbort,
} from "../browser/manager";
import { runAgent } from "../browser/runAgent";
import { publish } from "../browser/wsHub";
import { requireAdmin } from "../middleware/adminAuth";

const router: IRouter = Router();

// Single-tenant model: only the admin can drive the browser. All endpoints
// (and the WS upgrade handler) gate on the admin session cookie.
router.use(requireAdmin());

router.get("/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

router.post("/sessions", async (req, res) => {
  try {
    const s = await createSession();
    res.status(201).json({ sessionId: s.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log?.error({ err }, "browser session create failed");
    res.status(503).json({ error: msg });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  const ok = await closeSession(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

const runSchema = z.object({
  prompt: z.string().min(1).max(2_000),
  conversationId: z.string().uuid().optional(),
});

router.post("/sessions/:id/run", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Fire-and-forget: the WebSocket carries progress, this just acks.
  res.status(202).json({ accepted: true, sessionId: session.id });
  void runAgent({ sessionId: session.id, prompt: parsed.data.prompt }).catch((err) => {
    // Defense in depth — runAgent already publishes its own error events,
    // but a startup failure (e.g. NO_OPENAI_KEY thrown before the loop)
    // would otherwise leave the UI hanging on "busy". Always publish.
    const message = err instanceof Error ? err.message : String(err);
    publish(session.id, { type: "error", payload: { message } });
    publish(session.id, { type: "done", payload: { stopped: "error" } });
    req.log?.error({ err, sessionId: session.id }, "browser run unhandled rejection");
  });
});

router.post("/sessions/:id/abort", (req, res) => {
  const ok = requestAbort(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

// sendBeacon-friendly close (POST, no body required). Same effect as DELETE
// but the browser can fire it during pagehide where fetch() may be killed.
router.post("/sessions/:id/end", async (req, res) => {
  await closeSession(req.params.id, "client unload");
  res.status(204).end();
});

export default router;
