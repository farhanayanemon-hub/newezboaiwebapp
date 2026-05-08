import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  closeSession,
  createSession,
  getSession,
  listSessions,
  requestAbort,
  answerConfirmation,
} from "../browser/manager";
import { runAgent } from "../browser/runAgent";
import { publish } from "../browser/wsHub";
import { requireAdmin } from "../middleware/adminAuth";

const router: IRouter = Router();

// Single-tenant model: only the admin can drive the browser. All endpoints
// (and the WS upgrade handler) gate on the admin session cookie.
router.use(requireAdmin());

// ---------- Per-IP rate limit on session creation ----------
//
// Defense-in-depth: with admin auth + MAX_SESSIONS=3 the cap is already
// tight, but a runaway client (or a script with a stolen cookie) shouldn't
// be able to thrash launch/teardown. Bucket: 10 creates per 60s per IP.

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function rateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now - b.windowStart >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterMs: 0 };
  }
  b.count += 1;
  if (b.count > RATE_MAX) {
    return { allowed: false, retryAfterMs: RATE_WINDOW_MS - (now - b.windowStart) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

router.get("/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

router.post("/sessions", async (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    res.status(429).json({
      error: `Too many session creates; try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.`,
    });
    return;
  }
  try {
    const session = await createSession();
    res.status(201).json({
      sessionId: session.id,
      createdAt: session.createdAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/MAX_SESSIONS_REACHED/.test(msg)) {
      res.status(503).json({ error: msg });
      return;
    }
    req.log?.error({ err: e }, "browser session create failed");
    res.status(500).json({ error: msg });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  const ok = await closeSession(req.params.id, "manual delete");
  res.status(ok ? 200 : 404).json({ ok });
});

const runSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  conversationId: z.string().uuid().optional(),
});

router.post("/sessions/:id/run", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (session.busy) {
    res.status(409).json({ error: "Session is busy" });
    return;
  }
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.status(202).json({ accepted: true, sessionId: session.id });
  void runAgent({
    sessionId: session.id,
    prompt: parsed.data.prompt,
    conversationId: parsed.data.conversationId ?? null,
  }).catch((err) => {
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

const confirmSchema = z.object({
  approved: z.boolean(),
  /** ID of the prompt being approved. Required to prevent a stale approval
   *  (e.g. user clicked Approve, network was slow, the agent has since
   *  raised a *different* confirm) from being applied to the wrong action. */
  confirmId: z.string().min(1),
});

router.post("/sessions/:id/confirm", (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const r = answerConfirmation(
    req.params.id,
    parsed.data.approved,
    parsed.data.confirmId,
  );
  if (!r.ok) {
    res.status(r.reason === "id_mismatch" ? 409 : 404).json({ error: r.reason });
    return;
  }
  res.json({ ok: true });
});

// sendBeacon-friendly close (POST, no body required).
router.post("/sessions/:id/end", async (req, res) => {
  await closeSession(req.params.id, "client unload");
  res.status(204).end();
});

export default router;
