import cron from "node-cron";
import { and, eq, lte, sql } from "drizzle-orm";
import { RRule } from "rrule";
import {
  db,
  remindersTable,
  type Reminder,
} from "@workspace/db";
import { sendPushToAll } from "./pushService";
import { logger } from "../lib/logger";

let started = false;
/** Re-entrancy guard — a long DB call shouldn't be re-invoked by the next tick. */
let running = false;

/** Computes the next firing instant strictly after `from` for the given RRULE.
 *  Returns null if the RRULE has exhausted (e.g. UNTIL passed). */
function nextOccurrence(rrule: string, from: Date): Date | null {
  try {
    const parsed = RRule.fromString(
      rrule.startsWith("RRULE:") ? rrule : `RRULE:${rrule}`,
    );
    const next = parsed.after(from, false); // strictly after
    return next ?? null;
  } catch {
    return null;
  }
}

async function processOneDue(r: Reminder): Promise<void> {
  // Single atomic claim that *also* advances the schedule. This collapses
  // the previous two-step "mark sent → reschedule" into one UPDATE so a
  // crash between steps cannot drop a recurring sequence on the floor.
  //
  //  - Recurring: bump scheduledAt to the next occurrence and stay
  //    "pending". No follow-up write is needed if the push later fails;
  //    we accept at-most-once delivery for any single firing in exchange
  //    for guaranteed continuation of the series.
  //  - One-shot: flip to "sent".
  //
  // The WHERE clause guards against two ticks racing on the same row:
  // pinning scheduledAt = r.scheduledAt means the second tick sees no
  // matching row (because the first tick moved scheduledAt forward).
  const next = r.recurring ? nextOccurrence(r.recurring, new Date()) : null;
  const claim = r.recurring && next
    ? { status: "pending" as const, scheduledAt: next, lastSentAt: sql`now()` }
    : { status: "sent" as const, lastSentAt: sql`now()` };

  const [claimed] = await db
    .update(remindersTable)
    .set(claim)
    .where(
      and(
        eq(remindersTable.id, r.id),
        eq(remindersTable.status, "pending"),
        eq(remindersTable.scheduledAt, r.scheduledAt),
      ),
    )
    .returning({ id: remindersTable.id });
  if (!claimed) return; // another tick won the race, or row changed

  try {
    const result = await sendPushToAll({
      title: "EzboAI · Reminder",
      body: r.message,
      tag: `reminder:${r.id}`,
      requireInteraction: true,
      url: r.conversationId ? `/?c=${r.conversationId}` : "/reminders",
      data: { reminderId: r.id, conversationId: r.conversationId },
    });
    logger.info({ id: r.id, recurring: !!r.recurring, ...result }, "reminder pushed");
  } catch (err) {
    logger.error({ err, id: r.id }, "reminder push errored");
    // For one-shots only, surface the failure. Recurring rows are already
    // pointed at their next occurrence, so we leave them pending.
    if (!r.recurring) {
      await db
        .update(remindersTable)
        .set({ status: "failed" })
        .where(eq(remindersTable.id, r.id))
        .catch(() => undefined);
    }
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await db
      .select()
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.status, "pending"),
          lte(remindersTable.scheduledAt, new Date()),
        ),
      )
      .limit(50);
    for (const r of due) {
      await processOneDue(r);
    }
  } catch (err) {
    logger.error({ err }, "scheduler tick failed");
  } finally {
    running = false;
  }
}

/** Boot the cron job. Idempotent — safe to call multiple times. */
export function startReminderScheduler(): void {
  if (started) return;
  started = true;
  // Every 30 seconds.
  cron.schedule("*/30 * * * * *", () => {
    void tick();
  });
  logger.info("reminder scheduler started (every 30s)");
}
