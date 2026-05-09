import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

/**
 * Singleton ElevenLabs config (id = 1). API key stored AES-GCM encrypted
 * via the existing ai/crypto helper. Voice + model are public-ish strings.
 */
export const elevenlabsConfigTable = pgTable("elevenlabs_config", {
  id: serial("id").primaryKey(),
  encryptedApiKey: text("encrypted_api_key").notNull().default(""),
  voiceId: text("voice_id").notNull().default(""),
  modelId: text("model_id").notNull().default("eleven_multilingual_v2"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ElevenlabsConfig = typeof elevenlabsConfigTable.$inferSelect;
