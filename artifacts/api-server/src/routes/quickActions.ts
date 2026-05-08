import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, asc, desc, sql } from "drizzle-orm";
import {
  db,
  quickActionsTable,
  quickActionUsesTable,
} from "@workspace/db";

const router: IRouter = Router();

const taskTypes = [
  "chat-smart",
  "chat-fast",
  "code",
  "vision",
  "long-context",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(40).optional(),
  promptTemplate: z.string().trim().min(1).max(4000),
  taskType: z.enum(taskTypes).optional(),
  sortOrder: z.number().int().optional(),
});
const updateSchema = createSchema.partial();
const idParam = z.string().uuid();

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(quickActionsTable)
    .orderBy(asc(quickActionsTable.sortOrder), asc(quickActionsTable.createdAt));
  res.json({ quickActions: rows });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Default sortOrder = max + 1 so new ones append.
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${quickActionsTable.sortOrder}), -1)` })
    .from(quickActionsTable);
  const nextSort =
    parsed.data.sortOrder ?? (Number(maxRow?.max ?? -1) + 1);
  const [row] = await db
    .insert(quickActionsTable)
    .values({
      name: parsed.data.name,
      icon: parsed.data.icon ?? "Wand2",
      promptTemplate: parsed.data.promptTemplate,
      taskType: parsed.data.taskType ?? "chat-smart",
      sortOrder: nextSort,
    })
    .returning();
  res.status(201).json({ quickAction: row });
});

router.patch("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(quickActionsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(quickActionsTable.id, id.data))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ quickAction: row });
});

router.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(quickActionsTable).where(eq(quickActionsTable.id, id.data));
  res.json({ ok: true });
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

router.post("/reorder", async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await Promise.all(
    parsed.data.ids.map((id, idx) =>
      db
        .update(quickActionsTable)
        .set({ sortOrder: idx, updatedAt: new Date() })
        .where(eq(quickActionsTable.id, id)),
    ),
  );
  res.json({ ok: true });
});

const useSchema = z.object({
  actionId: z.string().trim().min(1).max(120),
});

router.post("/uses", async (req, res) => {
  const parsed = useSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .insert(quickActionUsesTable)
    .values({ actionId: parsed.data.actionId });
  res.status(201).json({ ok: true });
});

router.get("/stats", async (_req, res) => {
  const rows = await db
    .select({
      actionId: quickActionUsesTable.actionId,
      count: sql<number>`count(*)::int`,
    })
    .from(quickActionUsesTable)
    .groupBy(quickActionUsesTable.actionId)
    .orderBy(desc(sql`count(*)`));
  res.json({ stats: rows });
});

export default router;
