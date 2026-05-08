import { z } from "zod";
import type { Page } from "playwright";
import { assertSafeUrl } from "./urlGuard";

/**
 * Tool registry exposed to the AI agent. Each tool has a Zod schema for its
 * arguments (also surfaced as JSON Schema to the LLM) and an `execute` that
 * runs against a Playwright Page. Results are summarized for the model — we
 * deliberately cap text length to keep token usage bounded.
 */

export interface ToolContext {
  page: Page;
  /** Captures an updated screenshot to broadcast after each action. */
  onScreenshot?: (b64: string) => void;
}

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  execute: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>;
}

const MAX_TEXT = 8_000;
function truncate(s: string, n = MAX_TEXT): string {
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

async function snap(ctx: ToolContext): Promise<void> {
  if (!ctx.onScreenshot) return;
  try {
    const buf = await ctx.page.screenshot({ type: "jpeg", quality: 60, fullPage: false });
    ctx.onScreenshot(buf.toString("base64"));
  } catch {
    /* page might be navigating */
  }
}

const navigate: ToolDef = {
  name: "navigate",
  description:
    "Open a URL in the browser. Use this to start a task or move to a new page. " +
    "Only http(s) URLs are allowed; private/internal hosts are blocked.",
  schema: z.object({ url: z.string().describe("Full URL including scheme.") }),
  async execute(ctx, { url }) {
    const safe = assertSafeUrl(url);
    await ctx.page.goto(safe.toString(), { waitUntil: "domcontentloaded" });
    const title = await ctx.page.title().catch(() => "");
    await snap(ctx);
    return { ok: true, finalUrl: ctx.page.url(), title: truncate(title, 300) };
  },
};

const click: ToolDef = {
  name: "click",
  description:
    "Click an element. Pass a CSS selector OR human-visible text. We try " +
    "the selector first, then fall back to getByText.",
  schema: z.object({
    selector: z.string().optional().describe("CSS selector"),
    text: z.string().optional().describe("Visible text on the element"),
  }),
  async execute(ctx, { selector, text }) {
    if (!selector && !text) throw new Error("click requires selector or text");
    if (selector) {
      try {
        await ctx.page.locator(selector).first().click({ timeout: 8_000 });
        await snap(ctx);
        return { ok: true, via: "selector", selector };
      } catch (e) {
        if (!text) throw e;
      }
    }
    if (text) {
      await ctx.page.getByText(text, { exact: false }).first().click({ timeout: 8_000 });
      await snap(ctx);
      return { ok: true, via: "text", text };
    }
    throw new Error("click failed");
  },
};

const typeText: ToolDef = {
  name: "type",
  description: "Fill an input/textarea identified by CSS selector with text.",
  schema: z.object({
    selector: z.string(),
    text: z.string(),
    submit: z.boolean().optional().describe("Press Enter after typing."),
  }),
  async execute(ctx, { selector, text, submit }) {
    const loc = ctx.page.locator(selector).first();
    await loc.fill(text, { timeout: 8_000 });
    if (submit) await loc.press("Enter");
    await snap(ctx);
    return { ok: true };
  },
};

const pressKey: ToolDef = {
  name: "press_key",
  description: "Press a single keyboard key (e.g. Enter, Escape, ArrowDown, Tab).",
  schema: z.object({ key: z.string() }),
  async execute(ctx, { key }) {
    await ctx.page.keyboard.press(key);
    await snap(ctx);
    return { ok: true };
  },
};

const screenshot: ToolDef = {
  name: "screenshot",
  description: "Take a screenshot of the current viewport. Returns base64 PNG.",
  schema: z.object({}),
  async execute(ctx) {
    const buf = await ctx.page.screenshot({ type: "jpeg", quality: 70 });
    const b64 = buf.toString("base64");
    if (ctx.onScreenshot) ctx.onScreenshot(b64);
    // We hand a small note back to the LLM, not the bytes — the bytes already
    // went over the WS to the user UI. Including image bytes in the model
    // history is an avoidable token bomb.
    return { ok: true, captured: true, bytes: buf.length };
  },
};

const extract: ToolDef = {
  name: "extract",
  description:
    "Extract text content from elements matching a selector. Returns up to " +
    "20 results as an array of strings.",
  schema: z.object({ selector: z.string() }),
  async execute(ctx, { selector }) {
    const items = await ctx.page.locator(selector).allInnerTexts();
    const trimmed = items.slice(0, 20).map((s) => truncate(s.trim(), 500));
    return { ok: true, count: items.length, items: trimmed };
  },
};

const readPage: ToolDef = {
  name: "read_page",
  description:
    "Read a simplified, mostly-text view of the current page so you can " +
    "understand its structure. Heavy whitespace is collapsed; max 8 KB.",
  schema: z.object({}),
  async execute(ctx) {
    // The callback runs in the page's browser context; DOM globals exist
    // there. We type the function loosely to avoid pulling lib.dom into the
    // server's tsconfig.
    const evaluator = (() => {
      const win = globalThis as unknown as { document: { body: unknown } };
      const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
      const TEXT_NODE = 3;
      const ELEMENT_NODE = 1;
      const walk = (n: { nodeType: number; textContent?: string; tagName?: string; childNodes?: ArrayLike<unknown> }): string => {
        if (n.nodeType === TEXT_NODE) return n.textContent ?? "";
        if (n.nodeType !== ELEMENT_NODE) return "";
        const tag = (n.tagName ?? "").toUpperCase();
        if (skip.has(tag)) return "";
        let out = "";
        const kids = Array.from(n.childNodes ?? []) as Array<{ nodeType: number; textContent?: string; tagName?: string; childNodes?: ArrayLike<unknown> }>;
        for (const c of kids) out += walk(c);
        if (["P", "DIV", "LI", "H1", "H2", "H3", "H4", "TR", "BR"].includes(tag)) out += "\n";
        return out;
      };
      return walk(win.document.body as { nodeType: number; childNodes: ArrayLike<unknown> });
    });
    const text = await ctx.page.evaluate(evaluator).catch(() => "");
    const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return {
      ok: true,
      url: ctx.page.url(),
      title: await ctx.page.title().catch(() => ""),
      text: truncate(cleaned),
    };
  },
};

const wait: ToolDef = {
  name: "wait",
  description:
    "Wait for either a number of seconds, a CSS selector to appear, or " +
    "the page load state. Use sparingly; prefer for_selector when you know " +
    "what you're waiting on.",
  schema: z.object({
    seconds: z.number().min(0).max(30).optional(),
    for_selector: z.string().optional(),
    for_load_state: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  }),
  async execute(ctx, args) {
    if (args.for_selector) {
      await ctx.page.locator(args.for_selector).first().waitFor({ timeout: 15_000 });
    } else if (args.for_load_state) {
      await ctx.page.waitForLoadState(args.for_load_state, { timeout: 15_000 });
    } else if (typeof args.seconds === "number") {
      await ctx.page.waitForTimeout(args.seconds * 1_000);
    } else {
      throw new Error("wait requires seconds, for_selector, or for_load_state");
    }
    return { ok: true };
  },
};

const scroll: ToolDef = {
  name: "scroll",
  description:
    "Scroll the page. Either a pixel amount (positive = down) or 'to_element' selector to scroll into view.",
  schema: z.object({
    pixels: z.number().int().optional(),
    to_element: z.string().optional(),
  }),
  async execute(ctx, { pixels, to_element }) {
    if (to_element) {
      await ctx.page.locator(to_element).first().scrollIntoViewIfNeeded({ timeout: 8_000 });
    } else {
      const dy = typeof pixels === "number" ? pixels : 600;
      await ctx.page.mouse.wheel(0, dy);
    }
    await snap(ctx);
    return { ok: true };
  },
};

export const ALL_TOOLS: ToolDef[] = [
  navigate,
  click,
  typeText,
  pressKey,
  screenshot,
  extract,
  readPage,
  wait,
  scroll,
];

/** Render the registry into the OpenAI tool-calling format. */
export function toOpenAITools(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  // We hand-write a minimal JSON Schema rather than pulling in zod-to-json-schema.
  const toJsonSchema = (def: ToolDef) => {
    const shape = (def.schema as unknown as { _def: { typeName: string; shape?: () => Record<string, z.ZodTypeAny> } })._def;
    const params: Record<string, unknown> = { type: "object", properties: {}, required: [] };
    if (shape.typeName === "ZodObject" && shape.shape) {
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape.shape())) {
        const inner = (v as { _def: { typeName: string; description?: string; innerType?: z.ZodTypeAny; values?: string[] } })._def;
        const isOptional = inner.typeName === "ZodOptional";
        const target = isOptional ? (inner.innerType as { _def: { typeName: string; description?: string; values?: string[] } })._def : inner;
        const desc = inner.description ?? target.description;
        let schemaForKey: Record<string, unknown>;
        switch (target.typeName) {
          case "ZodString": schemaForKey = { type: "string" }; break;
          case "ZodNumber": schemaForKey = { type: "number" }; break;
          case "ZodBoolean": schemaForKey = { type: "boolean" }; break;
          case "ZodEnum": schemaForKey = { type: "string", enum: target.values ?? [] }; break;
          default: schemaForKey = { type: "string" };
        }
        if (desc) schemaForKey.description = desc;
        props[k] = schemaForKey;
        if (!isOptional) required.push(k);
      }
      params.properties = props;
      if (required.length) params.required = required; else delete params.required;
    }
    return params;
  };
  return ALL_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: toJsonSchema(t) },
  }));
}

export function findTool(name: string): ToolDef | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
