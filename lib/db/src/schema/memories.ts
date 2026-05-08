import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

export const memorySources = ["chat", "manual"] as const;
export type MemorySource = (typeof memorySources)[number];

export const memoriesTable = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    keyUniq: uniqueIndex("memories_key_uniq").on(t.key),
  }),
);

export type Memory = typeof memoriesTable.$inferSelect;
export type InsertMemory = typeof memoriesTable.$inferInsert;
