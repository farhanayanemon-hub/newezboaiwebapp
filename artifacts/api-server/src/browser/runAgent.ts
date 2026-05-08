import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import {
  db,
  providerKeysTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { decrypt } from "../ai/crypto";
import { logger } from "../lib/logger";
import { findTool, toOpenAITools, type ToolContext } from "./tools";
import { getSession } from "./manager";
import { publish } from "./wsHub";

/**
 * Single-turn agent loop powered by OpenAI tool-calling. We deliberately
 * keep this isolated from the existing AIRouter — that stack is tuned for
 * SSE streaming chat, not multi-turn function calling, and refactoring it
 * to do both was a larger surgery than this slice warrants.
 */

const SYSTEM_PROMPT = `You are EzboAI's web automation agent. Understand the user's request (in any language) and use the browser tools to get the job done. Always respond in English.

Rules:
- Before each step, write one short English line explaining what you're about to do (e.g. "Going to Daraz", "Searching for 'iPhone 15'", "Extracting results").
- A screenshot is streamed after every tool call automatically — you don't need to take one yourself.
- Use read_page to inspect page content before extracting directly.
- If a selector doesn't work, try clicking by text, or scroll to find the element.
- Avoid tasks that require login on the user's behalf — ask the user for help in your final answer instead.
- Before any destructive action (purchase, payment, delete, send, submit that saves a change), call the "confirm" tool — do not act without explicit user approval.
- If login is required, first call get_credentials — if a saved entry exists, use fill_credentials (the password never enters your context; the server fills it).
- If you hit a blocked URL or a captcha, clearly explain to the user where you got stuck.
- Maximum 30 steps. If progress stalls, give the best final answer you can with what you've gathered.

When the task is finished, return a concise final answer in English (no tool call) summarizing what you found.`;

const MAX_STEPS = Number(process.env.BROWSER_AGENT_MAX_STEPS ?? "30");

interface OAITools {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

async function getOpenAIKey(): Promise<{ key: string; model: string }> {
  const rows = await db
    .select()
    .from(providerKeysTable)
    .where(eq(providerKeysTable.provider, "openai"));
  for (const r of rows) {
    if (!r.enabled) continue;
    try {
      const key = decrypt(r.encryptedKey);
      // Prefer a tool-capable model. gpt-4o-mini is cheap + reliable for
      // multi-step tool use.
      const enabled = r.enabledModels ?? [];
      const preferred = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"];
      const model =
        preferred.find((m) => enabled.length === 0 || enabled.includes(m)) ?? "gpt-4o-mini";
      return { key, model };
    } catch {
      /* try next */
    }
  }
  throw new Error("NO_OPENAI_KEY: Browser agent needs an OpenAI key in /admin.");
}

export interface RunAgentResult {
  finalText: string;
  steps: number;
  stoppedReason: "done" | "max_steps" | "aborted" | "error";
  error?: string;
}

export async function runAgent(args: {
  sessionId: string;
  prompt: string;
  /** When set, the user-prompt + final answer are persisted as chat messages. */
  conversationId?: string | null;
}): Promise<RunAgentResult> {
  const session = getSession(args.sessionId);
  if (!session) throw new Error(`Session ${args.sessionId} not found`);
  if (session.busy) throw new Error("Session is already running an agent loop");
  session.busy = true;
  session.abortRequested = false;
  session.conversationId = args.conversationId ?? null;

  // If a chat conversation is bound, write the user's request into it now so
  // the message order is correct even if the agent crashes mid-run.
  if (args.conversationId) {
    try {
      await db.insert(messagesTable).values({
        conversationId: args.conversationId,
        role: "user",
        content: args.prompt,
        provider: null,
        model: null,
      });
    } catch (e) {
      logger.warn({ err: e, conversationId: args.conversationId }, "agent: write user msg failed");
    }
  }

  const result: RunAgentResult = { finalText: "", steps: 0, stoppedReason: "done" };
  try {
    const { key, model } = await getOpenAIKey();
    const openai = new OpenAI({ apiKey: key });
    const tools: OAITools[] = toOpenAITools();
    const toolCtx: ToolContext = {
      page: session.page,
      onScreenshot: (b64) => publish(args.sessionId, { type: "screenshot", payload: { b64 } }),
      requestConfirmation: (question, detail) =>
        new Promise<boolean>((resolve) => {
          const s = getSession(args.sessionId);
          if (!s) {
            resolve(false);
            return;
          }
          // Unattended runs (no chat conversation = no UI panel) auto-deny
          // immediately. Otherwise we time out after CONFIRM_TIMEOUT_MS so
          // a forgotten dialog can't hang the agent forever.
          if (!args.conversationId) {
            publish(args.sessionId, {
              type: "confirm_resolved",
              payload: { approved: false, reason: "unattended" },
            });
            resolve(false);
            return;
          }
          let settled = false;
          const finish = (approved: boolean, reason: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // Clear pending only if it's still ours.
            if (s.pendingConfirm?.id === pendingId) s.pendingConfirm = null;
            publish(args.sessionId, {
              type: "confirm_resolved",
              payload: { id: pendingId, approved, reason },
            });
            resolve(approved);
          };
          const pendingId = randomUUID();
          const CONFIRM_TIMEOUT_MS = 2 * 60 * 1000;
          const timer = setTimeout(() => finish(false, "timeout"), CONFIRM_TIMEOUT_MS);
          s.pendingConfirm = {
            id: pendingId,
            question,
            detail,
            resolve: (approved) => finish(approved, "user"),
          };
          publish(args.sessionId, {
            type: "confirm_request",
            payload: { id: pendingId, question, detail },
          });
        }),
    };

    publish(args.sessionId, { type: "plan", payload: { prompt: args.prompt, model } });

    interface Msg {
      role: "system" | "user" | "assistant" | "tool";
      content?: string | null;
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      tool_call_id?: string;
      name?: string;
    }
    const messages: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: args.prompt },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      result.steps = step + 1;
      if (session.abortRequested) {
        result.stoppedReason = "aborted";
        break;
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: tools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
        tool_choice: "auto",
        temperature: 0.2,
      });
      const choice = completion.choices[0];
      const msg = choice?.message;
      if (!msg) {
        result.stoppedReason = "error";
        result.error = "Empty completion";
        break;
      }
      // Newer OpenAI SDK uses a discriminated union for tool calls; we only
      // care about function calls (the only kind we expose).
      type FnToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
      const fnCalls: FnToolCall[] = (msg.tool_calls ?? [])
        .filter((tc): tc is FnToolCall => (tc as { type?: string }).type === "function")
        .map((tc) => ({ id: tc.id, type: "function", function: { name: tc.function.name, arguments: tc.function.arguments } }));

      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: fnCalls.length > 0 ? fnCalls : undefined,
      });

      // No tool calls → assistant produced the final answer.
      if (fnCalls.length === 0) {
        result.finalText = msg.content ?? "";
        result.stoppedReason = "done";
        publish(args.sessionId, { type: "done", payload: { text: result.finalText } });
        break;
      }

      for (const tc of fnCalls) {
        if (session.abortRequested) {
          result.stoppedReason = "aborted";
          break;
        }
        // If the page got closed under us (panel closed → DELETE → context
        // close), bail immediately rather than firing a tool against a
        // dead Page.
        if (session.page.isClosed()) {
          result.stoppedReason = "aborted";
          break;
        }
        const tool = findTool(tc.function.name);
        let toolResult: unknown;
        if (!tool) {
          toolResult = { ok: false, error: `Unknown tool ${tc.function.name}` };
        } else {
          let parsedArgs: unknown;
          try {
            parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            parsedArgs = {};
          }
          publish(args.sessionId, {
            type: "action",
            payload: { tool: tc.function.name, args: parsedArgs },
          });
          try {
            const validated = tool.schema.parse(parsedArgs);
            toolResult = await tool.execute(toolCtx, validated);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toolResult = { ok: false, error: msg };
            // "Target closed" / "page closed" mean the underlying browser is
            // gone — there's nothing left for the agent to do.
            if (/target closed|page closed|context closed|browser has been closed/i.test(msg)) {
              publish(args.sessionId, { type: "tool_result", payload: { tool: tc.function.name, result: toolResult } });
              result.stoppedReason = "aborted";
              break;
            }
          }
        }
        publish(args.sessionId, {
          type: "tool_result",
          payload: { tool: tc.function.name, result: toolResult },
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult).slice(0, 16_000),
        });
      }
    }

    if (result.stoppedReason !== "done" && result.stoppedReason !== "aborted") {
      result.stoppedReason = "max_steps";
      result.finalText =
        result.finalText ||
        "Reached the maximum number of steps without finishing the task. What was gathered so far is in the action log above.";
      publish(args.sessionId, {
        type: "done",
        payload: { text: result.finalText, stopped: "max_steps" },
      });
    } else if (result.stoppedReason === "aborted") {
      publish(args.sessionId, { type: "done", payload: { stopped: "aborted" } });
    }

    // Persist the agent's final answer to the bound conversation, if any.
    if (args.conversationId && (result.finalText || result.error)) {
      try {
        const content = result.finalText
          ? result.finalText
          : `Web task error: ${result.error ?? "unknown"}`;
        await db.insert(messagesTable).values({
          conversationId: args.conversationId,
          role: "assistant",
          content,
          provider: "browser-agent",
          model,
        });
        await db
          .update(conversationsTable)
          .set({ updatedAt: new Date() })
          .where(eq(conversationsTable.id, args.conversationId));
      } catch (e) {
        logger.warn(
          { err: e, conversationId: args.conversationId },
          "agent: write assistant msg failed",
        );
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, sessionId: args.sessionId }, "browser agent error");
    publish(args.sessionId, { type: "error", payload: { message } });
    publish(args.sessionId, { type: "done", payload: { stopped: "error" } });
    result.stoppedReason = "error";
    result.error = message;
    return result;
  } finally {
    session.busy = false;
    if (session.pendingConfirm) {
      // Defensive: if we exited while a confirm was pending, deny it so any
      // downstream awaiter unblocks.
      session.pendingConfirm.resolve(false);
      session.pendingConfirm = null;
    }
  }
}
