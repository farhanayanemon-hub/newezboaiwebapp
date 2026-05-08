import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const reminderStatuses = [
  "pending",
  "sent",
  "cancelled",
  "failed",
] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];

export const remindersTable = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message: text("message").notNull(),
    /** Always stored UTC; converted from user's local TZ at the edge. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** RFC-5545 RRULE string for recurring reminders, e.g.
     *  "FREQ=DAILY;BYHOUR=8;BYMINUTE=0". Null = one-shot. */
    recurring: text("recurring"),
    status: text("status").notNull().default("pending"),
    conversationId: uuid("conversation_id").references(
      () => conversationsTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  (t) => ({
    dueIdx: index("reminders_due_idx").on(t.status, t.scheduledAt),
  }),
);

export type Reminder = typeof remindersTable.$inferSelect;
export type InsertReminder = typeof remindersTable.$inferInsert;
