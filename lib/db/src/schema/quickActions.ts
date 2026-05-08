import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const quickActionsTable = pgTable(
  "quick_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("Wand2"),
    promptTemplate: text("prompt_template").notNull(),
    taskType: text("task_type").notNull().default("chat-smart"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    sortIdx: index("quick_actions_sort_idx").on(t.sortOrder),
  }),
);

export const quickActionUsesTable = pgTable(
  "quick_action_uses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionId: text("action_id").notNull(),
    usedAt: timestamp("used_at").notNull().defaultNow(),
  },
  (t) => ({
    actionIdx: index("quick_action_uses_action_idx").on(t.actionId),
  }),
);

export type QuickAction = typeof quickActionsTable.$inferSelect;
export type InsertQuickAction = typeof quickActionsTable.$inferInsert;
export type QuickActionUse = typeof quickActionUsesTable.$inferSelect;
