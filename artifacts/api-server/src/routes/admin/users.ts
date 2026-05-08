import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  userSessionsTable,
  conversationsTable,
  projectsTable,
  messagesTable,
  adminAuditLogTable,
} from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { createUserSession } from "../../middleware/userAuth";

const router: IRouter = Router();
router.use(requireAdmin());

const idParam = z.string().uuid();

function actorIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "").toString().slice(0, 64);
}

async function audit(
  action: string,
  req: Request,
  targetUserId: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db
    .insert(adminAuditLogTable)
    .values({ action, targetUserId, actorIp: actorIp(req), metadata })
    .catch(() => undefined);
}

function publicUser(u: typeof usersTable.$inferSelect): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    bannedAt: u.bannedAt,
    banReason: u.banReason,
    emailVerifiedAt: u.emailVerifiedAt,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// GET /admin/users?search=&page=&pageSize=
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25) || 25));
  const offset = (page - 1) * pageSize;

  const where = search
    ? or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`))
    : undefined;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(where ?? sql`true`);

  const rows = await db
    .select()
    .from(usersTable)
    .where(where ?? sql`true`)
    .orderBy(desc(usersTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Aggregate counts per user (project count, conversation count) in one
  // pass so the table can show the relevant stats without N+1 queries.
  const ids = rows.map((r) => r.id);
  const projCounts = ids.length
    ? await db
        .select({ userId: projectsTable.userId, n: count() })
        .from(projectsTable)
        .where(sql`${projectsTable.userId} = ANY(${ids})`)
        .groupBy(projectsTable.userId)
    : [];
  const convCounts = ids.length
    ? await db
        .select({ userId: conversationsTable.userId, n: count() })
        .from(conversationsTable)
        .where(sql`${conversationsTable.userId} = ANY(${ids})`)
        .groupBy(conversationsTable.userId)
    : [];
  const projMap = new Map(projCounts.map((r) => [r.userId, Number(r.n)]));
  const convMap = new Map(convCounts.map((r) => [r.userId, Number(r.n)]));

  res.json({
    users: rows.map((u) => ({
      ...publicUser(u),
      projectCount: projMap.get(u.id) ?? 0,
      conversationCount: convMap.get(u.id) ?? 0,
    })),
    page,
    pageSize,
    total: Number(total),
  });
});

// GET /admin/users/:id
router.get("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id.data)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [{ value: projectCount }] = await db
    .select({ value: count() })
    .from(projectsTable)
    .where(eq(projectsTable.userId, user.id));
  const [{ value: conversationCount }] = await db
    .select({ value: count() })
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, user.id));
  const [{ value: messageCount }] = await db
    .select({ value: count() })
    .from(messagesTable)
    .innerJoin(conversationsTable, eq(conversationsTable.id, messagesTable.conversationId))
    .where(eq(conversationsTable.userId, user.id));

  const recentConvs = await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      updatedAt: conversationsTable.updatedAt,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, user.id))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(10);

  const projectsRows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      createdAt: projectsTable.createdAt,
    })
    .from(projectsTable)
    .where(eq(projectsTable.userId, user.id))
    .orderBy(asc(projectsTable.name));

  res.json({
    user: publicUser(user),
    stats: {
      projectCount: Number(projectCount),
      conversationCount: Number(conversationCount),
      messageCount: Number(messageCount),
    },
    recentConversations: recentConvs,
    projects: projectsRows,
  });
});

// POST /admin/users/:id/ban  { reason? }
const banSchema = z.object({ reason: z.string().max(500).optional() });
router.post("/:id/ban", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = banSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      bannedAt: new Date(),
      banReason: parsed.data.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, id.data))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Revoke all live sessions so the ban takes effect immediately.
  await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, id.data));
  await audit("user.ban", req, id.data, { reason: parsed.data.reason ?? null });
  res.json({ user: publicUser(updated) });
});

// POST /admin/users/:id/unban
router.post("/:id/unban", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ bannedAt: null, banReason: null, updatedAt: new Date() })
    .where(eq(usersTable.id, id.data))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await audit("user.unban", req, id.data);
  res.json({ user: publicUser(updated) });
});

// POST /admin/users/:id/impersonate  -> issues a short-lived user session
// cookie for the target user. The admin's existing admin cookie is left
// alone so they can return to the admin panel without re-logging in.
router.post("/:id/impersonate", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id.data)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.bannedAt) {
    res.status(400).json({ error: "Cannot impersonate a banned user" });
    return;
  }
  await createUserSession(res, user.id);
  await audit("user.impersonate", req, user.id, { email: user.email });
  res.json({ user: publicUser(user) });
});

// DELETE /admin/users/:id
router.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id.data))
    .returning({ id: usersTable.id, email: usersTable.email });
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await audit("user.delete", req, id.data, { email: deleted.email });
  res.json({ ok: true });
});

// GET /admin/users/audit-log?targetId=&limit=
router.get("/audit-log/recent", async (req, res) => {
  const targetId = req.query.targetId ? idParam.safeParse(req.query.targetId) : null;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const where = targetId?.success
    ? eq(adminAuditLogTable.targetUserId, targetId.data)
    : undefined;
  const rows = await db
    .select()
    .from(adminAuditLogTable)
    .where(where ?? sql`true`)
    .orderBy(desc(adminAuditLogTable.createdAt))
    .limit(limit);
  res.json({ entries: rows });
});

// Stop the bare 'and' import lint warning if the only use ever vanishes.
void and;

export default router;
