import { Router, type IRouter } from "express";
import multer from "multer";
import os from "node:os";
import { readFile, unlink } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  db,
  messagesTable,
  conversationsTable,
} from "@workspace/db";
import { router as aiRouter } from "../ai/router";
import type { ChatMessage, ChatContentPart } from "../ai/providers/types";

const router: IRouter = Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

const LIVE_SYSTEM_PROMPT =
  "You are watching a live camera feed. In 1–2 short Bangla sentences, describe what you see. " +
  "If the user has asked a question, answer it concisely in the context of what's visible. " +
  "Do not greet, do not repeat yourself. Reply only in Bangla unless the user used English.";

const SNAP_SYSTEM_PROMPT =
  "You are looking at a single photo the user just took. Answer their question about it concisely. " +
  "If the user did not ask anything specific, briefly describe the photo. Reply in Bangla unless the user used English.";

// POST /analyze — multipart with field `image`; body fields: question?, conversationId?, mode?
router.post(
  "/analyze",
  (req, res, next) => {
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
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const mode: "snap" | "live" =
      req.body?.mode === "live" ? "live" : "snap";
    const persistMessages = req.body?.persist !== "false"; // default true
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
      const mime = file.mimetype || "image/jpeg";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

      const userText = question ||
        (mode === "live"
          ? "ki dekhcho?"
          : "ei chobi te ki dekha jacche?");

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

      // Persist the user message *before* the call so it shows up in the convo.
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

      let assistantMsgId: string | null = null;
      if (conversationId) {
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
          req.log?.error({ err }, "vision: failed to persist assistant message");
        }
      }

      res.json({
        text: fullText,
        conversationId,
        userMessageId: userMsgId,
        assistantMessageId: assistantMsgId,
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
