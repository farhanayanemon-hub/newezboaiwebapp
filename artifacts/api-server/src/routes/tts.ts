import { Router, type IRouter } from "express";
import { z } from "zod";
import { loadElevenlabsConfig, synthesize } from "../lib/elevenlabs";

const router: IRouter = Router();

const speakSchema = z.object({
  text: z.string().min(1).max(2_000),
  voiceId: z.string().trim().max(128).optional(),
});

/** Public TTS endpoint — anyone (guest or user) can call it from the
 * onboarding screen. Returns audio/mpeg bytes or 503 when ElevenLabs is
 * not configured. */
router.post("/speak", async (req, res) => {
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
