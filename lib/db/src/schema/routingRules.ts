import { pgTable, text, jsonb, timestamp, serial } from "drizzle-orm/pg-core";

export const taskTypes = [
  "chat-fast",
  "chat-smart",
  "vision",
  "code",
  "image-gen",
  "audio-tts",
  "audio-stt",
  "embedding",
  "web-agent",
] as const;

export type TaskType = (typeof taskTypes)[number];

export interface RoutingCandidate {
  provider: string;
  model: string;
}

export const routingRulesTable = pgTable("routing_rules", {
  id: serial("id").primaryKey(),
  taskType: text("task_type").notNull().unique(),
  providerOrder: jsonb("provider_order").$type<RoutingCandidate[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RoutingRule = typeof routingRulesTable.$inferSelect;
