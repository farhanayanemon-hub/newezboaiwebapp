import { pgTable, text, timestamp, uuid, serial, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Append-only audit log of admin actions: ban/unban, impersonate, delete,
 * SMTP edits, etc. `targetUserId` is nullable so config-level actions
 * (e.g. SMTP update) can also be recorded.
 */
export const adminAuditLogTable = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id"),
    actorIp: text("actor_ip").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionIdx: index("admin_audit_log_action_idx").on(t.action, t.createdAt),
    targetIdx: index("admin_audit_log_target_idx").on(t.targetUserId),
  }),
);

export type AdminAuditLogEntry = typeof adminAuditLogTable.$inferSelect;
