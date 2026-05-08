import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, routingRulesTable, taskTypes } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../middleware/adminAuth";

const router: IRouter = Router();
router.use(requireAdmin());

const candidateSchema = z.object({ provider: z.string(), model: z.string() });
const updateSchema = z.object({
  rules: z.array(
    z.object({
      taskType: z.enum(taskTypes),
      providerOrder: z.array(candidateSchema),
    }),
  ),
});

router.get("/", async (_req, res) => {
  const rows = await db.select().from(routingRulesTable);
  const map: Record<string, unknown[]> = {};
  for (const r of rows) map[r.taskType] = r.providerOrder;
  res.json({ rules: map, taskTypes });
});

router.put("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  for (const rule of parsed.data.rules) {
    await db
      .insert(routingRulesTable)
      .values({
        taskType: rule.taskType,
        providerOrder: rule.providerOrder,
      })
      .onConflictDoUpdate({
        target: routingRulesTable.taskType,
        set: { providerOrder: rule.providerOrder, updatedAt: sql`now()` },
      });
  }
  res.json({ ok: true });
});

export default router;
