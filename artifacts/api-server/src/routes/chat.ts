import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  taskTypes,
  type TaskType,
} from "@workspace/db";
import { router as aiRouter } from "../ai/router";
import { buildSystemPrompt, extractMemoriesFromReply } from "../ai/prompts";
import { upsertMemoryFromChat } from "./memories";

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
});

router.post("/stream", async (req, res) => {
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { messages, modelOverride } = parsed.data;
  const taskType: TaskType = parsed.data.taskType ?? "chat-smart";

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

  // Notify client of resolved conversation id immediately.
  send({ type: "conversation", conversationId, created: conversationCreated });

  const userMessages = messages.filter((m) => m.role !== "system");
  const lastUser = [...userMessages].reverse().find((m) => m.role === "user");

  // Persist the latest user message before invoking the AI. Failures here
  // are surfaced to the client because they break the persistence contract.
  if (lastUser) {
    try {
      await db.insert(messagesTable).values({
        conversationId,
        role: "user",
        content: lastUser.content,
      });
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

  const systemPrompt = await buildSystemPrompt();
  const fullMessages = [
    { role: "system" as const, content: systemPrompt },
    ...userMessages,
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

    // Extract any [REMEMBER: ...] tags and persist them, then save cleaned reply.
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

    // Auto-title in background if conversation was just created or still default.
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

    // Persist whatever partial reply we got so the UI can recover on reload.
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
    "Respond in the same language the user used. Reply with only the title — no quotes, no punctuation at the end.";
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
