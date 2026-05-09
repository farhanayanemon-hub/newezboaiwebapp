import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";

/**
 * One row per real provider call. Used both as an audit trail and as the
 * source of truth for the per-owner daily rate limit (no Redis needed).
 *
 * `ownerKey` is "user:<uuid>" or "guest:<id>" — matches the chat ownership
 * primitive so opt-out/limits follow the same identity that owns the
 * conversation.
 */
export const webSearchUsageTable = pgTable(
  "web_search_usage",
  {
    id: serial("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    query: text("query").notNull().default(""),
    resultCount: integer("result_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerCreatedIdx: index("web_search_usage_owner_created_idx").on(t.ownerKey, t.createdAt),
  }),
);

export type WebSearchUsage = typeof webSearchUsageTable.$inferSelect;
