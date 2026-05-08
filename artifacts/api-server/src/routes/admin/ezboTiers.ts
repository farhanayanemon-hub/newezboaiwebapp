import { Router, type IRouter } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  db,
  ezboTierPromptsTable,
  ezboTiers,
  ezboTaskTypes,
} from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { invalidateEzboTierCache } from "../../ai/prompts";

const router: IRouter = Router();
router.use(requireAdmin());

const updateSchema = z.object({
  tiers: z.array(
    z.object({
      tier: z.enum(ezboTiers),
      label: z.string().trim().min(1).max(80),
      description: z.string().trim().max(280).default(""),
      taskType: z.enum(ezboTaskTypes),
      promptAddon: z.string().max(8000).default(""),
    }),
  ),
});

router.get("/", async (_req, res) => {
  const rows = await db.select().from(ezboTierPromptsTable);
  res.json({
    tiers: rows.sort((a, b) => ezboTiers.indexOf(a.tier as typeof ezboTiers[number]) - ezboTiers.indexOf(b.tier as typeof ezboTiers[number])),
    taskTypes: ezboTaskTypes,
  });
});

router.put("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  for (const t of parsed.data.tiers) {
    await db
      .insert(ezboTierPromptsTable)
      .values({
        tier: t.tier,
        label: t.label,
        description: t.description,
        taskType: t.taskType,
        promptAddon: t.promptAddon,
      })
      .onConflictDoUpdate({
        target: ezboTierPromptsTable.tier,
        set: {
          label: t.label,
          description: t.description,
          taskType: t.taskType,
          promptAddon: t.promptAddon,
          updatedAt: sql`now()`,
        },
      });
  }
  invalidateEzboTierCache();
  res.json({ ok: true });
});

export default router;
