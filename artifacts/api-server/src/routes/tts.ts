import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { loadElevenlabsConfig, synthesize } from "../lib/elevenlabs";

const router: IRouter = Router();

const speakSchema = z.object({
  text: z.string().min(1).max(2_000),
  voiceId: z.string().trim().max(128).optional(),
});

// Simple in-memory IP rate limiter for the public TTS endpoint to prevent
// cost-amplification abuse against the ElevenLabs key. 30 requests per IP
// per hour. State is per-process (good enough for a single-pm2-instance
// deploy); resets on restart.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 30;
const ipHits = new Map<string, { count: number; reset: number }>();

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  // Opportunistic GC.
  if (ipHits.size > 5_000) {
    for (const [k, v] of ipHits) if (v.reset <= now) ipHits.delete(k);
  }
  const entry = ipHits.get(ip);
  if (!entry || entry.reset <= now) {
    ipHits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count >= RATE_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((entry.reset - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Public TTS endpoint — anyone (guest or user) can call it from the
 * onboarding screen. Returns audio/mpeg bytes or 503 when ElevenLabs is
 * not configured. Rate-limited per IP. */
router.post("/speak", async (req, res) => {
  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }
  const parsed = speakSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cfg = await loadElevenlabsConfig();
  if (!cfg) {
    res.status(503).json({ error: "Voice synthesis is not configured." });
    return;
  }
  try {
    const mp3 = await synthesize(cfg, {
      text: parsed.data.text,
      voiceId: parsed.data.voiceId,
    });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(mp3);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "TTS failed" });
  }
});

/** Lightweight status check the onboarding page can poll. */
router.get("/status", async (_req, res) => {
  const cfg = await loadElevenlabsConfig();
  res.json({ enabled: !!cfg });
});

export default router;
