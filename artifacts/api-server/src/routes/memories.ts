import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, memoriesTable, memorySources } from "@workspace/db";

const router: IRouter = Router();

const createSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(4000),
  source: z.enum(memorySources).optional(),
});
const updateSchema = createSchema.partial();
const idParam = z.string().uuid();

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(memoriesTable)
    .orderBy(desc(memoriesTable.updatedAt));
  res.json({ memories: rows });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(memoriesTable)
    .values({
      key: parsed.data.key,
      value: parsed.data.value,
      source: parsed.data.source ?? "manual",
    })
    .returning();
  res.status(201).json({ memory: row });
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
    .update(memoriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(memoriesTable.id, id.data))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ memory: row });
});

router.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(memoriesTable).where(eq(memoriesTable.id, id.data));
  res.json({ ok: true });
});

export async function upsertMemoryFromChat(key: string, value: string): Promise<void> {
  const k = key.toLowerCase().trim();
  const v = value.trim();
  if (!k || !v) return;
  const existing = await db
    .select()
    .from(memoriesTable)
    .where(eq(memoriesTable.key, k))
    .limit(1);
  if (existing[0]) {
    await db
      .update(memoriesTable)
      .set({ value: v, source: "chat", updatedAt: new Date() })
      .where(eq(memoriesTable.id, existing[0].id));
  } else {
    await db.insert(memoriesTable).values({ key: k, value: v, source: "chat" });
  }
}

export default router;
