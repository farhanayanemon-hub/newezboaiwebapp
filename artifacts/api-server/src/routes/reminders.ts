import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { RRule } from "rrule";
import {
  db,
  remindersTable,
  reminderStatuses,
  type ReminderStatus,
} from "@workspace/db";

const router: IRouter = Router();

const createSchema = z.object({
  message: z.string().min(1).max(500),
  /** ISO 8601 timestamp (UTC). */
  scheduledAt: z.string().datetime(),
  recurring: z.string().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  message: z.string().min(1).max(500).optional(),
  scheduledAt: z.string().datetime().optional(),
  recurring: z.string().optional().nullable(),
  status: z.enum(reminderStatuses).optional(),
  /** Convenience: snooze by N minutes from now. */
  snoozeMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

/** Validate an RRULE string by trying to parse it — throws on bad input. */
function validateRrule(s: string): void {
  try {
    RRule.fromString(s.startsWith("RRULE:") ? s : `RRULE:${s}`);
  } catch {
    throw new Error(`Invalid RRULE: ${s}`);
  }
}

// GET /api/reminders?scope=upcoming|past|all
router.get("/", async (req, res) => {
  const scope = (req.query.scope as string) || "all";
  const now = new Date();
  try {
    let rows;
    if (scope === "upcoming") {
      rows = await db
        .select()
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.status, "pending"),
            gt(remindersTable.scheduledAt, now),
          ),
        )
        .orderBy(remindersTable.scheduledAt);
    } else if (scope === "past") {
      rows = await db
        .select()
        .from(remindersTable)
        .where(
          // sent OR overdue pending
          // Drizzle doesn't have OR helper here; just two queries via SQL is overkill — fetch both.
          // Simpler: anything not strictly upcoming pending.
          lt(remindersTable.scheduledAt, now),
        )
        .orderBy(desc(remindersTable.scheduledAt))
        .limit(200);
    } else {
      rows = await db
        .select()
        .from(remindersTable)
        .orderBy(remindersTable.scheduledAt)
        .limit(500);
    }
    res.json({ reminders: rows });
  } catch (err) {
    req.log?.error({ err }, "reminders list failed");
    res.status(500).json({ error: "List failed" });
  }
});

// POST /api/reminders
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { message, scheduledAt, recurring, conversationId } = parsed.data as {
    message: string;
    scheduledAt: string;
    recurring?: string | null;
    conversationId?: string | null;
  };
  try {
    if (recurring) validateRrule(recurring);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
  try {
    const [row] = await db
      .insert(remindersTable)
      .values({
        message,
        scheduledAt: new Date(scheduledAt),
        recurring: recurring ?? null,
        conversationId: conversationId ?? null,
      })
      .returning();
    res.status(201).json({ reminder: row });
  } catch (err) {
    req.log?.error({ err }, "reminders create failed");
    res.status(500).json({ error: "Create failed" });
  }
});

// PATCH /api/reminders/:id
router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = req.params.id;
  // Zod's optional().nullable() inference plays badly with strict TS here;
  // narrow once via an explicit shape so the rest of the handler stays clean.
  const data = parsed.data as {
    message?: string;
    scheduledAt?: string;
    recurring?: string | null;
    status?: ReminderStatus;
    snoozeMinutes?: number;
  };
  const updates: Partial<{
    message: string;
    scheduledAt: Date;
    recurring: string | null;
    status: ReminderStatus;
  }> = {};
  if (data.message !== undefined) updates.message = data.message;
  if (data.scheduledAt !== undefined)
    updates.scheduledAt = new Date(data.scheduledAt);
  if (data.recurring !== undefined) {
    if (data.recurring) {
      try {
        validateRrule(data.recurring);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }
    updates.recurring = data.recurring ?? null;
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.snoozeMinutes !== undefined) {
    updates.scheduledAt = new Date(Date.now() + data.snoozeMinutes * 60_000);
    updates.status = "pending";
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    const [row] = await db
      .update(remindersTable)
      .set(updates)
      .where(eq(remindersTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ reminder: row });
  } catch (err) {
    req.log?.error({ err }, "reminders update failed");
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE /api/reminders/:id
router.delete("/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(remindersTable)
      .where(eq(remindersTable.id, req.params.id))
      .returning({ id: remindersTable.id });
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "reminders delete failed");
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
