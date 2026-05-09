import { pgTable, text, timestamp, boolean, serial, integer } from "drizzle-orm/pg-core";

/**
 * Singleton web-search config (id = 1). API key stored AES-GCM encrypted via
 * the existing ai/crypto helper. Provider currently only "tavily" but kept
 * as a string column so we can swap providers later without a migration.
 */
export const webSearchConfigTable = pgTable("web_search_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("tavily"),
  encryptedApiKey: text("encrypted_api_key").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  maxResults: integer("max_results").notNull().default(5),
  guestDailyLimit: integer("guest_daily_limit").notNull().default(50),
  userDailyLimit: integer("user_daily_limit").notNull().default(500),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestStatus: text("last_test_status"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WebSearchConfig = typeof webSearchConfigTable.$inferSelect;
