import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  taskTypes,
  type TaskType,
  attachmentsTable,
  type MessageAttachmentMeta,
} from "@workspace/db";
import { router as aiRouter } from "../ai/router";
import { buildSystemPrompt, extractMemoriesFromReply, parseEzboModelId, getEzboTier } from "../ai/prompts";
import { upsertMemoryFromChat } from "./memories";
import { loadAttachments, type ResolvedAttachment } from "./files";
import { readObject } from "../services/objectStorage";
import type { ChatMessage, ChatContentPart } from "../ai/providers/types";

const router: IRouter = Router();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const streamSchema = z.object({
  messages: z.array(messageSchema).min(1).max(200),
  taskType: z.enum(taskTypes).optional(),
  modelOverride: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});

// Hard cap on attached text bytes injected into a single chat turn so we
// never blow past provider context windows.
const MAX_ATTACHED_TEXT_CHARS = 120_000;

function attachmentsTextBlock(attachments: ResolvedAttachment[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const a of attachments) {
    if (a.kind === "image") continue;
    const header = `\n\n[Attachment: ${a.originalName}]\n`;
    let body = "";
    if (a.extractedText && a.extractedText.trim()) {
      body = a.extractedText;
    } else if (a.extractError) {
      body = `(could not extract text: ${a.extractError})`;
    } else {
      body = "(no text extracted)";
    }
    const footer = `\n[End attachment]`;
    const piece = header + body + footer;
    if (used + piece.length > MAX_ATTACHED_TEXT_CHARS) {
      const remaining = MAX_ATTACHED_TEXT_CHARS - used;
      if (remaining > 200) {
        lines.push(piece.slice(0, remaining) + "\n...[truncated]");
      }
      lines.push("\n[Note: remaining attachments omitted to fit context.]");
      break;
    }
    lines.push(piece);
    used += piece.length;
  }
  return lines.join("");
}

async function buildImageParts(
  attachments: ResolvedAttachment[],
  log?: { error?: (obj: unknown, msg?: string) => void },
): Promise<ChatContentPart[]> {
  const parts: ChatContentPart[] = [];
  for (const a of attachments) {
    if (a.kind !== "image") continue;
    try {
      const buf = await readObject(a.storageKey);
      const mime = a.mimeType || "image/jpeg";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      parts.push({ type: "image_url", image_url: { url: dataUrl } });
    } catch (err) {
      log?.error?.({ err, key: a.storageKey }, "failed to load image attachment");
    }
  }
  return parts;
}

router.post("/stream", async (req, res) => {
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { messages, modelOverride: rawModelOverride, attachmentIds = [] } = parsed.data;

  // The frontend now sends synthetic Ezbo tier IDs (`ezbo:standard|mini|pro`)
  // rather than raw `provider:model` strings. Translate the tier into a
  // taskType + system-prompt addon, and never forward the synthetic id to the
  // router (it has no idea what `ezbo:*` means).
  const ezboTier = parseEzboModelId(rawModelOverride);
  const modelOverride = ezboTier ? undefined : rawModelOverride;

  const attachments = attachmentIds.length
    ? await loadAttachments(attachmentIds)
    : [];
  const hasImage = attachments.some((a) => a.kind === "image");
  // If the caller didn't pin a task type and they attached an image, route
  // the request to a vision-capable provider. Vision always wins over the
  // tier's preferred chat task type so image questions hit a vision model.
  const taskType: TaskType =
    parsed.data.taskType ??
    (hasImage ? "vision" : ezboTier ? ezboTier.taskType : "chat-smart");

  // Resolve conversation: use provided, or auto-create.
  let conversationId = parsed.data.conversationId;
  let conversationCreated = false;
  if (conversationId) {
    const existing = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
  } else {
    const [row] = await db
      .insert(conversationsTable)
      .values({ title: "New chat" })
      .returning({ id: conversationsTable.id });
    conversationId = row.id;
    conversationCreated = true;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({ type: "conversation", conversationId, created: conversationCreated });

  const userMessages = messages.filter((m) => m.role !== "system");
  const lastUserIdx = (() => {
    for (let i = userMessages.length - 1; i >= 0; i--) {
      if (userMessages[i].role === "user") return i;
    }
    return -1;
  })();
  const lastUser = lastUserIdx >= 0 ? userMessages[lastUserIdx] : undefined;

  // Build the augmented last-user message if we have attachments.
  const textBlock = attachmentsTextBlock(attachments);
  const imageParts = hasImage ? await buildImageParts(attachments, req.log) : [];

  let augmentedLastUser: ChatMessage | null = null;
  if (lastUser && (textBlock || imageParts.length)) {
    const augmentedText = (lastUser.content || "") + textBlock;
    if (imageParts.length) {
      augmentedLastUser = {
        role: "user",
        content: [{ type: "text", text: augmentedText }, ...imageParts],
      };
    } else {
      augmentedLastUser = { role: "user", content: augmentedText };
    }
  }

  // Persist the latest user message + attachment metadata before invoking the AI.
  let savedUserMessageId: string | null = null;
  if (lastUser) {
    try {
      const attMeta: MessageAttachmentMeta[] = attachments.map((a) => ({
        id: a.id,
        name: a.originalName,
        kind: a.kind === "image" ? "image" : "file",
        url: a.url,
        mimeType: a.mimeType ?? undefined,
        size: a.sizeBytes ?? undefined,
      }));
      const [saved] = await db
        .insert(messagesTable)
        .values({
          conversationId,
          role: "user",
          content: lastUser.content,
          attachments: attMeta,
        })
        .returning({ id: messagesTable.id });
      savedUserMessageId = saved.id;
      // Link attachment rows back to this message (for cascade-cleanup parity).
      if (attachments.length) {
        await Promise.all(
          attachments.map((a) =>
            db
              .update(attachmentsTable)
              .set({ messageId: saved.id })
              .where(eq(attachmentsTable.id, a.id)),
          ),
        ).catch((err) =>
          req.log?.error({ err }, "failed to link attachments to message"),
        );
      }
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));
    } catch (err) {
      req.log?.error({ err }, "failed to persist user message");
      send({ type: "error", message: "Failed to save your message. Please try again." });
      res.end();
      return;
    }
  }
  void savedUserMessageId;

  // Pull the latest (admin-editable) tier config from the DB so prompt
  // overrides made in /admin → "Ezbo Models" take effect on the next chat.
  const resolvedTier = ezboTier ? await getEzboTier(ezboTier.id) : null;
  const systemPrompt = await buildSystemPrompt(resolvedTier);
  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...userMessages.map((m, i): ChatMessage => {
      if (i === lastUserIdx && augmentedLastUser) return augmentedLastUser;
      return { role: m.role, content: m.content };
    }),
  ];

  let fullReply = "";
  try {
    const out = await aiRouter.streamChat({
      taskType,
      messages: fullMessages,
      modelOverride,
      onChunk: ({ delta }) => {
        fullReply += delta;
        send({ type: "chunk", content: delta });
      },
    });

    const { cleaned, memories } = extractMemoriesFromReply(fullReply);
    for (const m of memories) {
      await upsertMemoryFromChat(m.key, m.value).catch((err) =>
        req.log?.error({ err }, "failed to upsert memory"),
      );
    }

    try {
      await db.insert(messagesTable).values({
        conversationId,
        role: "assistant",
        content: cleaned || fullReply,
        provider: out.provider,
        model: out.model,
      });
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));
    } catch (err) {
      req.log?.error({ err }, "failed to persist assistant message");
    }

    send({
      type: "done",
      provider: out.provider,
      model: out.model,
      latencyMs: out.latencyMs,
      usage: out.result.usage,
      savedMemories: memories,
    });

    void maybeAutoTitle(conversationId, lastUser?.content ?? "", cleaned || fullReply, req).catch(
      (err) => req.log?.error({ err }, "auto-title failed"),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_PROVIDERS") {
      send({
        type: "error",
        message: "No AI provider available. Add a key in the admin panel.",
      });
    } else if (msg.startsWith("ALL_PROVIDERS_FAILED")) {
      send({
        type: "error",
        message: "All providers failed. Check provider keys in the admin panel.",
      });
    } else if (msg === "MODEL_NOT_ALLOWED") {
      send({
        type: "error",
        message:
          "Selected model is not enabled. Update allowed models in the admin panel.",
      });
    } else if (msg.startsWith("STREAM_FAILED_AFTER_PARTIAL")) {
      send({
        type: "error",
        message: "Provider failed mid-stream. Please try again.",
      });
    } else {
      send({ type: "error", message: msg });
    }

    if (fullReply) {
      await db
        .insert(messagesTable)
        .values({
          conversationId,
          role: "assistant",
          content: fullReply,
        })
        .catch(() => undefined);
    }
  } finally {
    res.end();
  }
});

async function maybeAutoTitle(
  conversationId: string,
  userText: string,
  assistantText: string,
  req: { log?: { info?: (obj: unknown, msg?: string) => void } },
): Promise<void> {
  const conv = await db
    .select({ title: conversationsTable.title })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!conv[0] || (conv[0].title && conv[0].title !== "New chat")) return;
  if (!userText.trim()) return;

  const titlePrompt =
    "Generate a short 3 to 5 word chat title summarizing this exchange. " +
    "Always respond in English. Reply with only the title — no quotes, no punctuation at the end.";
  const sample = `User: ${userText.slice(0, 400)}\nAssistant: ${assistantText.slice(0, 400)}`;

  let title = "";
  try {
    const out = await aiRouter.streamChat({
      taskType: "chat-fast",
      messages: [
        { role: "system", content: titlePrompt },
        { role: "user", content: sample },
      ],
      onChunk: ({ delta }) => {
        title += delta;
      },
    });
    void out;
  } catch {
    return;
  }

  const cleaned = title
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!cleaned) return;

  await db
    .update(conversationsTable)
    .set({ title: cleaned, updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
  req.log?.info?.({ conversationId, title: cleaned }, "auto-titled conversation");
}

export default router;
