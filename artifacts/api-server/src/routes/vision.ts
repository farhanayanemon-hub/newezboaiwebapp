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
  "You are watching a live camera feed. In 1–2 short English sentences, describe what you see. " +
  "If the user has asked a question, answer it concisely in the context of what's visible. " +
  "Do not greet, do not repeat yourself. Always reply in English.";

const SNAP_SYSTEM_PROMPT =
  "You are looking at a single photo the user just took. Answer their question about it concisely. " +
  "If the user did not ask anything specific, briefly describe the photo. Always reply in English.";

const SCREEN_ASK_SYSTEM_PROMPT =
  "You are looking at a screenshot of the user's screen. Answer their question about what's on screen, " +
  "concisely and helpfully. If they reference 'this', 'this error', 'this code', etc., they mean what's visible. " +
  "Always reply in English.";

const SCREEN_PROACTIVE_SYSTEM_PROMPT =
  "You are silently watching the user's screen. ONLY speak up if you see something the user clearly needs help with: " +
  "code errors, typos, broken Excel/Word formulas, misspelled names, obvious mistakes. " +
  "If you do speak up, give one concise English suggestion (1–2 sentences). " +
  "If nothing on screen warrants a comment right now, reply with EXACTLY: [no action] " +
  "Do not greet, do not narrate, do not describe normal activity. Stay quiet by default.";

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
    const rawMode = typeof req.body?.mode === "string" ? req.body.mode : "snap";
    const mode: "snap" | "live" | "screen-ask" | "screen-proactive" =
      rawMode === "live" ||
      rawMode === "screen-ask" ||
      rawMode === "screen-proactive"
        ? rawMode
        : "snap";
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
          const titleByMode: Record<typeof mode, string> = {
            snap: "Camera snap",
            live: "Live camera",
            "screen-ask": "Screen share",
            "screen-proactive": "Screen share (assist)",
          };
          const [row] = await db
            .insert(conversationsTable)
            .values({ title: titleByMode[mode] })
            .returning({ id: conversationsTable.id });
          conversationId = row.id;
        }
      }

      const buf = await readFile(file.path);
      await unlink(file.path).catch(() => undefined);
      const dataUrl = `data:${file.mimetype};base64,${buf.toString("base64")}`;

      const fallbackQuestionByMode: Record<typeof mode, string> = {
        snap: "What can you see in this photo?",
        live: "What do you see?",
        "screen-ask": "What's on this screen?",
        "screen-proactive": "(silent watch — only speak up if user needs help)",
      };
      const userText = question || fallbackQuestionByMode[mode];

      const userParts: ChatContentPart[] = [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: dataUrl } },
      ];

      const systemByMode: Record<typeof mode, string> = {
        snap: SNAP_SYSTEM_PROMPT,
        live: LIVE_SYSTEM_PROMPT,
        "screen-ask": SCREEN_ASK_SYSTEM_PROMPT,
        "screen-proactive": SCREEN_PROACTIVE_SYSTEM_PROMPT,
      };
      const messages: ChatMessage[] = [
        { role: "system", content: systemByMode[mode] },
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

      // ---- Proactive-mode suppression: AI may say [no action] when nothing
      // on screen warrants a comment. Skip persistence + signal suppressed.
      // Normalise heavily — strip brackets, punctuation, underscores, all
      // whitespace — so "[no action]", "No action.", "no_action", " NoAction "
      // all collapse to "noaction".
      let suppressed = false;
      if (mode === "screen-proactive") {
        const norm = fullText
          .toLowerCase()
          .replace(/[\s_\-[\](){}.,!?;:'"]+/g, "");
        if (!norm || norm === "noaction" || norm.startsWith("noaction")) {
          suppressed = true;
        }
      }

      // ---- Server-side dedup for streaming modes (live + proactive). -------
      let assistantMsgId: string | null = null;
      let duplicate = false;
      if (conversationId && !suppressed) {
        if (mode === "live" || mode === "screen-proactive") {
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
            // Tag proactive messages so the chat UI can render them with the
            // 💡 hint affordance without inspecting content.
            const content =
              mode === "screen-proactive" ? `💡 ${fullText}` : fullText;
            const [saved] = await db
              .insert(messagesTable)
              .values({
                conversationId,
                role: "assistant",
                content,
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
        suppressed,
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
