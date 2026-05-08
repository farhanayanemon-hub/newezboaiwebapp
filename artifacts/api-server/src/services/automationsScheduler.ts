import cron from "node-cron";
import { eq } from "drizzle-orm";
import { RRule } from "rrule";
import { db, automationsTable, type Automation } from "@workspace/db";
import { logger } from "../lib/logger";
import { createSession, closeSession } from "../browser/manager";
import { runAgent } from "../browser/runAgent";

/**
 * Periodic runner for saved automations. Once a minute we look at every
 * automation with an RRULE schedule and run it if its next-occurrence-after
 * lastRunAt is in the past. Each run spins up its own browser session and
 * tears it down so a hung run can't pin the (small) concurrent-session pool.
 */

let started = false;
let running = false;
const inFlight = new Set<number>();

function nextOccurrence(rrule: string, after: Date): Date | null {
  try {
    const parsed = RRule.fromString(rrule.startsWith("RRULE:") ? rrule : `RRULE:${rrule}`);
    return parsed.after(after, false) ?? null;
  } catch {
    return null;
  }
}

async function executeAutomation(a: Automation): Promise<{ ok: boolean; summary: string }> {
  if (inFlight.has(a.id)) {
    return { ok: false, summary: "already running" };
  }
  inFlight.add(a.id);
  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    await db
      .update(automationsTable)
      .set({ lastRunStatus: "running", lastRunAt: new Date() })
      .where(eq(automationsTable.id, a.id));

    session = await createSession();
    const result = await runAgent({ sessionId: session.id, prompt: a.prompt });
    const summary = (result.finalText || result.error || "").slice(0, 1_000);
    const ok = result.stoppedReason === "done";
    await db
      .update(automationsTable)
      .set({
        lastRunStatus: ok ? "ok" : "error",
        lastRunSummary: summary,
        lastRunAt: new Date(),
      })
      .where(eq(automationsTable.id, a.id));
    return { ok, summary };
  } catch (err) {
    const summary = err instanceof Error ? err.message : String(err);
    await db
      .update(automationsTable)
      .set({ lastRunStatus: "error", lastRunSummary: summary, lastRunAt: new Date() })
      .where(eq(automationsTable.id, a.id));
    return { ok: false, summary };
  } finally {
    if (session) await closeSession(session.id, "automation finished");
    inFlight.delete(a.id);
  }
}

/** Manually trigger an automation. Returns once the run starts (fire-and-forget). */
export async function runAutomationNow(id: number): Promise<{ accepted: true; id: number }> {
  const [a] = await db
    .select()
    .from(automationsTable)
    .where(eq(automationsTable.id, id))
    .limit(1);
  if (!a) throw new Error("Automation not found");
  void executeAutomation(a).catch((err) =>
    logger.error({ err, id }, "automation manual run errored"),
  );
  return { accepted: true, id };
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await db.select().from(automationsTable);
    const now = new Date();
    for (const a of rows) {
      if (!a.schedule) continue;
      // First-ever run: anchor "after" at createdAt; otherwise at lastRunAt.
      const anchor = a.lastRunAt ?? a.createdAt ?? new Date(0);
      const next = nextOccurrence(a.schedule, anchor);
      if (!next || next > now) continue;
      // Skip if the next occurrence after lastRunAt is still in the future
      // (the loop already handles that). Avoid stampede on startup if many
      // are due — they will queue serially through this awaited loop.
      logger.info({ id: a.id, name: a.name, next: next.toISOString() }, "automation due, running");
      await executeAutomation(a);
    }
  } catch (err) {
    logger.error({ err }, "automations scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startAutomationsScheduler(): void {
  if (started) return;
  started = true;
  // Once a minute. Long-running tasks won't overlap because of the running flag.
  cron.schedule("0 * * * * *", () => {
    void tick();
  });
  logger.info("automations scheduler started (every 60s)");
}
