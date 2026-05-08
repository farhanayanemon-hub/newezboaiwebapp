import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import os from "node:os";
import { readFile, unlink } from "node:fs/promises";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  messagesTable,
  conversationsTable,
} from "@workspace/db";
import { router as aiRouter } from "../ai/router";
import type { ChatMessage, ChatContentPart } from "../ai/providers/types";

const router: IRouter = Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error(`Unsupported image type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

const LIVE_SYSTEM_PROMPT =
  "You are watching a live camera feed. In 1–2 short Bangla sentences, describe what you see. " +
  "If the user has asked a question, answer it concisely in the context of what's visible. " +
  "Do not greet, do not repeat yourself. Reply only in Bangla unless the user used English.";

const SNAP_SYSTEM_PROMPT =
  "You are looking at a single photo the user just took. Answer their question about it concisely. " +
  "If the user did not ask anything specific, briefly describe the photo. Reply in Bangla unless the user used English.";

// ---- Tiny IP-keyed sliding-window rate limiter (vision is expensive). ------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // 30 frames / minute / IP — generous for 4-sec live mode
const ipBuckets = new Map<string, number[]>();
function ipKey(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "unknown").toString();
}
function rateLimitOk(req: Request): boolean {
  const key = ipKey(req);
  const now = Date.now();
  const arr = ipBuckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    ipBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  ipBuckets.set(key, fresh);
  return true;
}

// ---- Levenshtein-based dedup (mirrors frontend similarity). ----------------
function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length;
  const n = y.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}
const DEDUP_THRESHOLD = 0.85;

router.post(
  "/analyze",
  (req, res, next) => {
    if (!rateLimitOk(req)) {
      res.status(429).json({ error: "Too many vision requests. Slow down." });
      return;
    }
    upload.single("image")(req, res, (err) => {
      if (err) {
        const tmp = req.file?.path;
        if (tmp) void unlink(tmp).catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "Image exceeds 8 MB." });
          return;
        }
        res
          .status(400)
          .json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No image uploaded (field name: image)." });
      return;
    }
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      await unlink(file.path).catch(() => undefined);
      res.status(415).json({ error: "Unsupported image type." });
      return;
    }

    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const mode: "snap" | "live" =
      req.body?.mode === "live" ? "live" : "snap";
    const persistMessages = req.body?.persist !== "false";
    const conversationIdRaw =
      typeof req.body?.conversationId === "string"
        ? req.body.conversationId.trim()
        : "";

    try {
      // Resolve / create conversation if persistence is requested.
      let conversationId: string | null = null;
      if (persistMessages) {
        if (conversationIdRaw) {
          const [existing] = await db
            .select({ id: conversationsTable.id })
            .from(conversationsTable)
            .where(eq(conversationsTable.id, conversationIdRaw))
            .limit(1);
          if (!existing) {
            await unlink(file.path).catch(() => undefined);
            res.status(404).json({ error: "Conversation not found." });
            return;
          }
          conversationId = existing.id;
        } else {
          const [row] = await db
            .insert(conversationsTable)
            .values({ title: mode === "live" ? "Live camera" : "Camera snap" })
            .returning({ id: conversationsTable.id });
          conversationId = row.id;
        }
      }

      const buf = await readFile(file.path);
      await unlink(file.path).catch(() => undefined);
      const dataUrl = `data:${file.mimetype};base64,${buf.toString("base64")}`;

      const userText =
        question ||
        (mode === "live" ? "ki dekhcho?" : "ei chobi te ki dekha jacche?");

      const userParts: ChatContentPart[] = [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: dataUrl } },
      ];

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: mode === "live" ? LIVE_SYSTEM_PROMPT : SNAP_SYSTEM_PROMPT,
        },
        { role: "user", content: userParts },
      ];

      // For Live mode with an explicit user question, persist user msg first.
      let userMsgId: string | null = null;
      if (conversationId && question) {
        try {
          const [saved] = await db
            .insert(messagesTable)
            .values({
              conversationId,
              role: "user",
              content: question,
            })
            .returning({ id: messagesTable.id });
          userMsgId = saved.id;
          await db
            .update(conversationsTable)
            .set({ updatedAt: new Date() })
            .where(eq(conversationsTable.id, conversationId));
        } catch (err) {
          req.log?.error({ err }, "vision: failed to persist user message");
        }
      }

      let fullText = "";
      const out = await aiRouter.streamChat({
        taskType: "vision",
        messages,
        onChunk: ({ delta }) => {
          fullText += delta;
        },
      });

      // ---- Server-side dedup for live mode ---------------------------------
      // Skip persistence (and signal "duplicate") if this commentary is too
      // similar to the most recent assistant message in this conversation.
      let assistantMsgId: string | null = null;
      let duplicate = false;
      if (conversationId) {
        if (mode === "live") {
          const [last] = await db
            .select({ content: messagesTable.content })
            .from(messagesTable)
            .where(
              and(
                eq(messagesTable.conversationId, conversationId),
                eq(messagesTable.role, "assistant"),
              ),
            )
            .orderBy(desc(messagesTable.createdAt))
            .limit(1);
          if (last && similarity(last.content, fullText) >= DEDUP_THRESHOLD) {
            duplicate = true;
          }
        }
        if (!duplicate) {
          try {
            const [saved] = await db
              .insert(messagesTable)
              .values({
                conversationId,
                role: "assistant",
                content: fullText,
                provider: out.provider,
                model: out.model,
              })
              .returning({ id: messagesTable.id });
            assistantMsgId = saved.id;
            await db
              .update(conversationsTable)
              .set({ updatedAt: new Date() })
              .where(eq(conversationsTable.id, conversationId));
          } catch (err) {
            req.log?.error(
              { err },
              "vision: failed to persist assistant message",
            );
          }
        }
      }

      res.json({
        text: fullText,
        conversationId,
        userMessageId: userMsgId,
        assistantMessageId: assistantMsgId,
        duplicate,
        provider: out.provider,
        model: out.model,
        latencyMs: out.latencyMs,
        mode,
      });
    } catch (err) {
      req.log?.error({ err }, "vision/analyze failed");
      await unlink(file.path).catch(() => undefined);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export default router;
