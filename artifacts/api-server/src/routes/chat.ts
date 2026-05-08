import { Router, type IRouter } from "express";
import { z } from "zod";
import { router as aiRouter } from "../ai/router";
import { taskTypes, type TaskType } from "@workspace/db";

const router: IRouter = Router();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const streamSchema = z.object({
  messages: z.array(messageSchema).min(1).max(200),
  taskType: z.enum(taskTypes).optional(),
  modelOverride: z.string().optional(),
  threadId: z.string().optional(),
});

const SYSTEM_PROMPT =
  "You are EzboAI, a friendly, capable AI assistant. " +
  "Answer in the same language the user writes in. " +
  "If the user writes in Banglish (Bengali in Latin script), respond in Banglish. " +
  "Use Markdown when helpful. Be accurate, concise, and helpful.";

router.post("/stream", async (req, res) => {
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { messages, modelOverride } = parsed.data;
  const taskType: TaskType = parsed.data.taskType ?? "chat-smart";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const fullMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...messages.filter((m) => m.role !== "system"),
  ];

  try {
    const out = await aiRouter.streamChat({
      taskType,
      messages: fullMessages,
      modelOverride,
      onChunk: ({ delta }) => send({ type: "chunk", content: delta }),
    });
    send({
      type: "done",
      provider: out.provider,
      model: out.model,
      latencyMs: out.latencyMs,
      usage: out.result.usage,
    });
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
        message: "Selected model is not enabled. Update allowed models in the admin panel.",
      });
    } else if (msg.startsWith("STREAM_FAILED_AFTER_PARTIAL")) {
      send({
        type: "error",
        message: "Provider failed mid-stream. Please try again.",
      });
    } else {
      send({ type: "error", message: msg });
    }
  } finally {
    res.end();
  }
});

export default router;
