import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Saved browser-automation jobs. The `prompt` is fed to the AI agent at run
 * time; `schedule` (when set) is a cron expression interpreted by the same
 * scheduler that fires reminders.
 */
export const automationsTable = pgTable(
  "automations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default(""),
    prompt: text("prompt").notNull(),
    /** Cron string (e.g. "0 9 * * *"). Null = manual / on-demand only. */
    schedule: text("schedule"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status"), // "ok" | "error" | "running"
    lastRunSummary: text("last_run_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    scheduleIdx: index("automations_schedule_idx").on(t.schedule),
  }),
);

export type Automation = typeof automationsTable.$inferSelect;
export type NewAutomation = typeof automationsTable.$inferInsert;
