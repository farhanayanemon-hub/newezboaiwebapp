import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, projectsTable, type User } from "@workspace/db";
import { requireUser } from "../middleware/userAuth";

const router: IRouter = Router();

// All project routes require an authenticated user.
router.use(requireUser());

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });
const idParam = z.string().uuid();

function reqUser(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): User {
  return (req as typeof req & { user: User }).user;
}

// GET /api/projects — list this user's projects (oldest first feels natural
// for a sidebar; clients are free to sort however they want).
router.get("/", async (req, res) => {
  const user = reqUser(req);
  const rows = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, user.id))
    .orderBy(asc(projectsTable.createdAt));
  res.json({ projects: rows });
});

// POST /api/projects — create.
router.post("/", async (req, res) => {
  const user = reqUser(req);
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(projectsTable)
    .values({ userId: user.id, name: parsed.data.name })
    .returning();
  res.status(201).json({ project: row });
});

// PATCH /api/projects/:id — rename. Owner-only.
router.patch("/:id", async (req, res) => {
  const user = reqUser(req);
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(projectsTable)
    .set({ name: parsed.data.name, updatedAt: sql`now()` })
    .where(and(eq(projectsTable.id, id.data), eq(projectsTable.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ project: row });
});

// DELETE /api/projects/:id — owner-only. ON DELETE SET NULL on
// conversations.project_id keeps the conversations themselves intact;
// they fall back to "Unfiled".
router.delete("/:id", async (req, res) => {
  const user = reqUser(req);
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, id.data), eq(projectsTable.userId, user.id)))
    .returning({ id: projectsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
