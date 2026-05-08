import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, browserAccessRulesTable } from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { invalidateAccessRulesCache } from "../../browser/urlGuard";

const router: IRouter = Router();
router.use(requireAdmin());

const upsertSchema = z.object({
  host: z
    .string()
    .min(2)
    .max(253)
    .transform((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!),
  mode: z.enum(["allow", "block"]),
  note: z.string().max(500).optional(),
});

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(browserAccessRulesTable)
    .orderBy(browserAccessRulesTable.host);
  res.json({ rules: rows });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { host, mode, note } = parsed.data;
  // Upsert by host
  const existing = await db
    .select()
    .from(browserAccessRulesTable)
    .where(eq(browserAccessRulesTable.host, host))
    .limit(1);
  if (existing.length > 0) {
    const [row] = await db
      .update(browserAccessRulesTable)
      .set({ mode, note: note ?? "" })
      .where(eq(browserAccessRulesTable.host, host))
      .returning();
    invalidateAccessRulesCache();
    res.json({ rule: row });
    return;
  }
  const [row] = await db
    .insert(browserAccessRulesTable)
    .values({ host, mode, note: note ?? "" })
    .returning();
  invalidateAccessRulesCache();
  res.status(201).json({ rule: row });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .delete(browserAccessRulesTable)
    .where(eq(browserAccessRulesTable.id, id))
    .returning({ id: browserAccessRulesTable.id });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  invalidateAccessRulesCache();
  res.json({ ok: true });
});

export default router;
