import { Router, type IRouter } from "express";
import { z } from "zod";
import { sql, eq, desc, and, isNull, type SQL } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  messageRoles,
  projectsTable,
} from "@workspace/db";
import { getUserFromRequest } from "../middleware/userAuth";

const router: IRouter = Router();

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
});
const renameSchema = z.object({ title: z.string().trim().min(1).max(200) });
const moveSchema = z.object({
  projectId: z.string().uuid().nullable(),
});
const idParam = z.string().uuid();
const messageSchema = z.object({
  role: z.enum(messageRoles),
  content: z.string().min(1).max(50_000),
  provider: z.string().max(64).nullish(),
  model: z.string().max(128).nullish(),
});

/**
 * Returns the SQL fragment that scopes a query to the caller. Logged-in
 * users see only their own rows; guests share the user_id IS NULL pool
 * (preserves the pre-Phase-2 anonymous behavior).
 */
function ownershipFilter(userId: string | null): SQL {
  return userId
    ? eq(conversationsTable.userId, userId)
    : isNull(conversationsTable.userId);
}

/**
 * Verify the caller owns the project (404 if not). Guests cannot use
 * projects at all, since projects always require auth.
 */
async function callerOwnsProject(
  userId: string | null,
  projectId: string,
): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// GET /conversations[?projectId=<uuid>|unfiled]
router.get("/", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const filterRaw = req.query.projectId;

  const conditions: SQL[] = [ownershipFilter(callerUserId)];
  if (typeof filterRaw === "string" && filterRaw.length > 0) {
    if (filterRaw === "unfiled" || filterRaw === "null") {
      conditions.push(isNull(conversationsTable.projectId));
    } else {
      const parsed = idParam.safeParse(filterRaw);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid projectId" });
        return;
      }
      // Don't leak existence of others' projects: 404 if caller doesn't own it.
      if (!(await callerOwnsProject(callerUserId, parsed.data))) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      conditions.push(eq(conversationsTable.projectId, parsed.data));
    }
  }

  const lastMsgSub = db
    .select({
      conversationId: messagesTable.conversationId,
      content: messagesTable.content,
      createdAt: messagesTable.createdAt,
      rn: sql<number>`row_number() over (partition by ${messagesTable.conversationId} order by ${messagesTable.createdAt} desc)`.as(
        "rn",
      ),
    })
    .from(messagesTable)
    .as("lm");

  const rows = await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      projectId: conversationsTable.projectId,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
      preview: lastMsgSub.content,
    })
    .from(conversationsTable)
    .leftJoin(
      lastMsgSub,
      sql`${lastMsgSub.conversationId} = ${conversationsTable.id} AND ${lastMsgSub.rn} = 1`,
    )
    .where(and(...conditions))
    .orderBy(desc(conversationsTable.updatedAt));

  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      preview: r.preview ? r.preview.replace(/\s+/g, " ").trim().slice(0, 80) : "",
    })),
  });
});

// POST /conversations
router.post("/", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let projectId: string | null = null;
  if (parsed.data.projectId) {
    if (!(await callerOwnsProject(callerUserId, parsed.data.projectId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    projectId = parsed.data.projectId;
  }
  const [row] = await db
    .insert(conversationsTable)
    .values({
      title: parsed.data.title?.trim() || "New chat",
      userId: callerUserId,
      projectId,
    })
    .returning();
  res.status(201).json({ conversation: row });
});

// PATCH /conversations/:id  (rename — owner only)
router.patch("/:id", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(conversationsTable)
    .set({ title: parsed.data.title.trim(), updatedAt: new Date() })
    .where(and(eq(conversationsTable.id, id.data), ownershipFilter(callerUserId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ conversation: row });
});

// POST /conversations/:id/move  (move into a project, or unfile with null)
router.post("/:id/move", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Only logged-in users can use projects.
  if (parsed.data.projectId !== null && !callerUserId) {
    res.status(401).json({ error: "Login required to use projects" });
    return;
  }
  if (parsed.data.projectId) {
    if (!(await callerOwnsProject(callerUserId, parsed.data.projectId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
  }
  const [row] = await db
    .update(conversationsTable)
    .set({ projectId: parsed.data.projectId, updatedAt: new Date() })
    .where(and(eq(conversationsTable.id, id.data), ownershipFilter(callerUserId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ conversation: row });
});

// DELETE /conversations/:id  (owner only)
router.delete("/:id", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db
    .delete(conversationsTable)
    .where(and(eq(conversationsTable.id, id.data), ownershipFilter(callerUserId)))
    .returning({ id: conversationsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

// GET /conversations/:id/messages  (owner only)
router.get("/:id/messages", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const owns = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id.data), ownershipFilter(callerUserId)))
    .limit(1);
  if (owns.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id.data))
    .orderBy(messagesTable.createdAt);
  res.json({ messages: rows });
});

// POST /conversations/:id/messages  (owner only)
router.post("/:id/messages", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const owns = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id.data), ownershipFilter(callerUserId)))
    .limit(1);
  if (owns.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(messagesTable)
    .values({
      conversationId: id.data,
      role: parsed.data.role,
      content: parsed.data.content,
      provider: parsed.data.provider ?? null,
      model: parsed.data.model ?? null,
    })
    .returning();
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id.data));
  res.status(201).json({ message: row });
});

// GET /conversations/search?q=...  (scoped to caller's pool)
router.get("/search", async (req, res) => {
  const caller = await getUserFromRequest(req);
  const callerUserId = caller?.id ?? null;
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ results: [] });
    return;
  }
  // Use plainto_tsquery to safely accept arbitrary input. 'simple' config preserves Bangla.
  // Owner filter is a parameterized literal in the WHERE clause.
  const ownerClause = callerUserId
    ? sql`c.user_id = ${callerUserId}`
    : sql`c.user_id IS NULL`;
  const results = await db.execute<{
    conversation_id: string;
    title: string;
    updated_at: Date;
    snippet: string;
  }>(
    sql`
      SELECT DISTINCT ON (c.id)
        c.id AS conversation_id,
        c.title,
        c.updated_at,
        ts_headline('simple', m.content, plainto_tsquery('simple', ${q}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5, ShortWord=2'
        ) AS snippet
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.search_vector @@ plainto_tsquery('simple', ${q})
        AND ${ownerClause}
      ORDER BY c.id, m.created_at DESC
      LIMIT 50
    `,
  );
  const rows = (results as unknown as { rows: Array<{ conversation_id: string; title: string; updated_at: Date; snippet: string }> }).rows ?? [];
  res.json({
    results: rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      updatedAt: r.updated_at,
      snippet: r.snippet,
    })),
  });
});

export default router;
