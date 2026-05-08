import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";

export const adminSessionsTable = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminSession = typeof adminSessionsTable.$inferSelect;
