import { Router, type IRouter } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, ttsCacheTable } from "@workspace/db";
import { router as aiRouter } from "../ai/router";
import { getProvider } from "../ai/providers";
import { decrypt } from "../ai/crypto";

const router: IRouter = Router();

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_TTS_CHARS = 4000;

const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

function uploadsRoot(): string {
  return path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
}

function ttsCacheDir(): string {
  return path.join(uploadsRoot(), "tts");
}

function cacheKeyFor(engine: string, voice: string, speed: number, text: string): string {
  return createHash("sha256")
    .update(`${engine}|${voice}|${speed.toFixed(2)}|${text}`)
    .digest("hex");
}

/**
 * In-process inflight dedupe for /tts. If two requests for the same cacheKey
 * arrive concurrently after both miss the cache, the second one waits for the
 * first to finish and reuses the same audio buffer instead of paying for a
 * duplicate provider call.
 */
const ttsInflight = new Map<
  string,
  Promise<{ audio: Buffer; mimeType: string }>
>();

// POST /stt — multipart/form-data field "audio"
router.post("/stt", (req, res, next) => {
  upload.single("audio")(req, res, (err) => {
    if (err) {
      // Multer may have already written a partial temp file; clean it up.
      const tmp = req.file?.path;
      if (tmp) void unlink(tmp).catch(() => undefined);
      const code = (err as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Audio exceeds 20 MB." });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No audio uploaded (field name: audio)." });
    return;
  }
  const language = typeof req.body?.language === "string" ? req.body.language : undefined;

  try {
    const candidates = await aiRouter.getCandidatesForTask("audio-stt");
    const cand = candidates.find((c) => {
      const p = getProvider(c.provider);
      return p && typeof p.transcribeAudio === "function";
    });
    if (!cand) {
      await unlink(file.path).catch(() => undefined);
      res.status(503).json({ error: "No STT provider configured." });
      return;
    }
    const provider = getProvider(cand.provider)!;
    const audio = await readFile(file.path);
    const start = Date.now();
    const result = await provider.transcribeAudio!({
      apiKey: cand.apiKey,
      model: cand.model,
      audio,
      mimeType: file.mimetype,
      filename: file.originalname || `audio${path.extname(file.originalname || "") || ".webm"}`,
      language,
    });
    const latencyMs = Date.now() - start;
    await unlink(file.path).catch(() => undefined);

    res.json({
      transcript: result.transcript,
      language: result.language,
      durationSec: result.durationSec,
      provider: cand.provider,
      model: cand.model,
      latencyMs,
    });
  } catch (err) {
    req.log?.error({ err }, "stt failed");
    await unlink(file.path).catch(() => undefined);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

const ttsBody = z.object({
  text: z.string().min(1).max(MAX_TTS_CHARS),
  voice: z.string().min(1).max(64).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  engine: z.string().min(1).max(64).optional(),
});

// POST /tts — JSON body { text, voice?, speed?, engine? } -> audio bytes
router.post("/tts", async (req, res) => {
  const parsed = ttsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { text } = parsed.data;
  const voice = parsed.data.voice ?? "alloy";
  const speed = parsed.data.speed ?? 1.0;

  try {
    const candidates = await aiRouter.getCandidatesForTask("audio-tts");
    const cand = candidates.find((c) => {
      const p = getProvider(c.provider);
      return p && typeof p.synthesizeSpeech === "function";
    });
    if (!cand) {
      res.status(503).json({ error: "No TTS provider configured." });
      return;
    }
    const engine = parsed.data.engine ?? `${cand.provider}:${cand.model}`;
    const key = cacheKeyFor(engine, voice, speed, text);

    // Cache hit?
    const [hit] = await db
      .select()
      .from(ttsCacheTable)
      .where(eq(ttsCacheTable.cacheKey, key))
      .limit(1);
    if (hit) {
      const abs = path.join(uploadsRoot(), hit.storageKey);
      if (existsSync(abs)) {
        const buf = await readFile(abs);
        await db
          .update(ttsCacheTable)
          .set({ lastUsedAt: sql`now()` })
          .where(eq(ttsCacheTable.cacheKey, key))
          .catch(() => undefined);
        res.setHeader("Content-Type", hit.mimeType);
        res.setHeader("X-Tts-Cache", "hit");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(buf);
        return;
      }
      // Stale row pointing at missing file — delete and regenerate.
      await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, key)).catch(() => undefined);
    }

    const provider = getProvider(cand.provider)!;
    const start = Date.now();
    let coalesced = false;
    let inflight = ttsInflight.get(key);
    if (inflight) {
      coalesced = true;
    } else {
      inflight = (async () => {
        try {
          const r = await provider.synthesizeSpeech!({
            apiKey: cand.apiKey,
            model: cand.model,
            text,
            voice,
            speed,
          });
          // Persist to disk + cache table while still inflight so later
          // arrivals after this resolves see the row immediately.
          await mkdir(ttsCacheDir(), { recursive: true });
          const ext = r.mimeType.includes("mpeg") ? "mp3" : "bin";
          const fileName = `${key}.${ext}`;
          const storageKey = path.join("tts", fileName);
          const abs = path.join(uploadsRoot(), storageKey);
          await writeFile(abs, r.audio);
          await db
            .insert(ttsCacheTable)
            .values({
              cacheKey: key,
              engine,
              voice,
              speed: speed.toFixed(2),
              storageKey,
              mimeType: r.mimeType,
              sizeBytes: r.audio.length,
            })
            .onConflictDoNothing()
            .catch(() => undefined);
          return r;
        } finally {
          ttsInflight.delete(key);
        }
      })();
      ttsInflight.set(key, inflight);
    }

    const result = await inflight;
    const latencyMs = Date.now() - start;

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("X-Tts-Cache", coalesced ? "coalesced" : "miss");
    res.setHeader("X-Provider", cand.provider);
    res.setHeader("X-Model", cand.model);
    res.setHeader("X-Latency-Ms", String(latencyMs));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(result.audio);
  } catch (err) {
    req.log?.error({ err }, "tts failed");
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /capabilities — what STT/TTS engines are available now.
router.get("/capabilities", async (_req, res) => {
  try {
    const sttCands = await aiRouter.getCandidatesForTask("audio-stt");
    const ttsCands = await aiRouter.getCandidatesForTask("audio-tts");
    const sttCloud = sttCands.find((c) => {
      const p = getProvider(c.provider);
      return p && typeof p.transcribeAudio === "function";
    });
    const ttsCloud = ttsCands.find((c) => {
      const p = getProvider(c.provider);
      return p && typeof p.synthesizeSpeech === "function";
    });
    res.json({
      stt: { cloud: !!sttCloud, provider: sttCloud?.provider, model: sttCloud?.model },
      tts: {
        cloud: !!ttsCloud,
        provider: ttsCloud?.provider,
        model: ttsCloud?.model,
        voices:
          ttsCloud?.provider === "openai"
            ? ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]
            : [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Quietly mark decrypt as used to satisfy unused-import lint in some configs.
void decrypt;

export default router;
