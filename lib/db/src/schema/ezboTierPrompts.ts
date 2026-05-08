import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ezboTiers = ["standard", "mini", "pro"] as const;
export type EzboTierId = (typeof ezboTiers)[number];

export const ezboTaskTypes = ["chat-fast", "chat-smart"] as const;
export type EzboTaskType = (typeof ezboTaskTypes)[number];

export const ezboTierPromptsTable = pgTable("ezbo_tier_prompts", {
  tier: text("tier").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  taskType: text("task_type").notNull(),
  promptAddon: text("prompt_addon").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type EzboTierPrompt = typeof ezboTierPromptsTable.$inferSelect;
