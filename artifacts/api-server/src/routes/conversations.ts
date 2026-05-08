import { Router, type IRouter } from "express";
import { z } from "zod";
import { sql, eq, desc } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  messageRoles,
} from "@workspace/db";

const router: IRouter = Router();

const createSchema = z.object({ title: z.string().trim().max(200).optional() });
const renameSchema = z.object({ title: z.string().trim().min(1).max(200) });
const idParam = z.string().uuid();
const messageSchema = z.object({
  role: z.enum(messageRoles),
  content: z.string().min(1).max(50_000),
  provider: z.string().max(64).nullish(),
  model: z.string().max(128).nullish(),
});

// GET /conversations
router.get("/", async (_req, res) => {
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
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
      preview: lastMsgSub.content,
    })
    .from(conversationsTable)
    .leftJoin(
      lastMsgSub,
      sql`${lastMsgSub.conversationId} = ${conversationsTable.id} AND ${lastMsgSub.rn} = 1`,
    )
    .orderBy(desc(conversationsTable.updatedAt));

  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      preview: r.preview ? r.preview.replace(/\s+/g, " ").trim().slice(0, 80) : "",
    })),
  });
});

// POST /conversations
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title?.trim() || "New chat" })
    .returning();
  res.status(201).json({ conversation: row });
});

// PATCH /conversations/:id
router.patch("/:id", async (req, res) => {
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
    .where(eq(conversationsTable.id, id.data))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ conversation: row });
});

// DELETE /conversations/:id
router.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(conversationsTable).where(eq(conversationsTable.id, id.data));
  res.json({ ok: true });
});

// GET /conversations/:id/messages
router.get("/:id/messages", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id.data))
    .orderBy(messagesTable.createdAt);
  res.json({ messages: rows });
});

// POST /conversations/:id/messages
router.post("/:id/messages", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
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

// GET /conversations/search?q=...
router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ results: [] });
    return;
  }
  // Use plainto_tsquery to safely accept arbitrary input. 'simple' config preserves Bangla.
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
