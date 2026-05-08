import { Router, type IRouter } from "express";
import { count, desc, gt, isNotNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  providerKeysTable,
  routingRulesTable,
  ezboTierPromptsTable,
  conversationsTable,
  messagesTable,
  adminAuditLogTable,
  smtpConfigTable,
} from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";

const router: IRouter = Router();
router.use(requireAdmin());

/**
 * GET /admin/overview
 *
 * Aggregate counters + a slice of recent activity for the admin Dashboard.
 * One round-trip per metric, all in parallel — cheap enough that we don't
 * bother caching at this point.
 */
router.get("/", async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    [usersTotal],
    [usersBanned],
    [usersVerified],
    [usersNew7d],
    [providersCount],
    [routingCount],
    [tiersCount],
    [conversationsTotal],
    [messagesTotal],
    [smtpRow],
    recentAudit,
  ] = await Promise.all([
    db.select({ value: count() }).from(usersTable),
    db
      .select({ value: count() })
      .from(usersTable)
      .where(isNotNull(usersTable.bannedAt)),
    db
      .select({ value: count() })
      .from(usersTable)
      .where(isNotNull(usersTable.emailVerifiedAt)),
    db
      .select({ value: count() })
      .from(usersTable)
      .where(gt(usersTable.createdAt, sevenDaysAgo)),
    db.select({ value: count() }).from(providerKeysTable),
    db.select({ value: count() }).from(routingRulesTable),
    db.select({ value: count() }).from(ezboTierPromptsTable),
    db.select({ value: count() }).from(conversationsTable),
    db.select({ value: count() }).from(messagesTable),
    db.select().from(smtpConfigTable).limit(1),
    db
      .select()
      .from(adminAuditLogTable)
      .orderBy(desc(adminAuditLogTable.createdAt))
      .limit(10),
  ]);

  res.json({
    users: {
      total: usersTotal?.value ?? 0,
      banned: usersBanned?.value ?? 0,
      verified: usersVerified?.value ?? 0,
      newLast7Days: usersNew7d?.value ?? 0,
    },
    content: {
      providers: providersCount?.value ?? 0,
      routingRules: routingCount?.value ?? 0,
      ezboTiers: tiersCount?.value ?? 0,
      conversations: conversationsTotal?.value ?? 0,
      messages: messagesTotal?.value ?? 0,
    },
    smtp: {
      enabled: Boolean(smtpRow?.enabled && smtpRow?.host),
      host: smtpRow?.host ?? "",
      fromAddress: smtpRow?.fromAddress ?? "",
      updatedAt: smtpRow?.updatedAt ?? null,
    },
    recentAudit: recentAudit.map((r) => ({
      id: r.id,
      action: r.action,
      targetUserId: r.targetUserId,
      actorIp: r.actorIp,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
