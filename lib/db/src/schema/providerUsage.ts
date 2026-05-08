import { pgTable, text, integer, timestamp, serial, real } from "drizzle-orm/pg-core";

export const providerUsageTable = pgTable("provider_usage", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  taskType: text("task_type").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProviderUsage = typeof providerUsageTable.$inferSelect;
