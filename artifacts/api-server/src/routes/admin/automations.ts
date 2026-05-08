import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { RRule } from "rrule";
import { db, automationsTable } from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { runAutomationNow } from "../../services/automationsScheduler";

const router: IRouter = Router();
router.use(requireAdmin());

const upsertSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional(),
  prompt: z.string().min(3).max(8_000),
  /** Optional RRULE string (e.g. "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"). */
  schedule: z.string().max(500).nullable().optional(),
});

function validateRrule(s: string): void {
  try {
    RRule.fromString(s.startsWith("RRULE:") ? s : `RRULE:${s}`);
  } catch {
    throw new Error(`Invalid RRULE: ${s}`);
  }
}

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(automationsTable)
    .orderBy(desc(automationsTable.updatedAt));
  res.json({ automations: rows });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, prompt, schedule } = parsed.data;
  if (schedule) {
    try {
      validateRrule(schedule);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
  }
  const [row] = await db
    .insert(automationsTable)
    .values({
      name,
      description: description ?? "",
      prompt,
      schedule: schedule ?? null,
    })
    .returning();
  res.status(201).json({ automation: row });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.prompt !== undefined) updates.prompt = parsed.data.prompt;
  if (parsed.data.schedule !== undefined) {
    if (parsed.data.schedule) {
      try {
        validateRrule(parsed.data.schedule);
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
        return;
      }
    }
    updates.schedule = parsed.data.schedule ?? null;
  }
  const [row] = await db
    .update(automationsTable)
    .set(updates)
    .where(eq(automationsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ automation: row });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .delete(automationsTable)
    .where(eq(automationsTable.id, id))
    .returning({ id: automationsTable.id });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/:id/run", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await runAutomationNow(id);
    res.status(202).json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
