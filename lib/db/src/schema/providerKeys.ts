import { pgTable, text, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const providerSlugs = [
  "openai",
  "openrouter",
  "anthropic",
  "xai",
  "replicate",
  "gemini",
] as const;

export type ProviderSlug = (typeof providerSlugs)[number];

export const providerKeysTable = pgTable("provider_keys", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  label: text("label").notNull().default(""),
  encryptedKey: text("encrypted_key").notNull(),
  enabledModels: text("enabled_models").array().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: text("last_test_status"),
  lastTestError: text("last_test_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProviderKeySchema = createInsertSchema(providerKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProviderKey = typeof providerKeysTable.$inferSelect;
export type InsertProviderKey = z.infer<typeof insertProviderKeySchema>;
