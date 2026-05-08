import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Cache for cloud TTS audio. Keyed on the SHA-256 of
 * `engine|voice|speed|text` so identical (text, voice, speed, engine) requests
 * reuse the same on-disk audio file. The `storageKey` is relative to
 * UPLOADS_DIR and the audio is stored under the `tts/` subdir.
 */
export const ttsCacheTable = pgTable(
  "tts_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    engine: text("engine").notNull(),
    voice: text("voice").notNull(),
    speed: text("speed").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  },
  (t) => ({
    storageKeyIdx: uniqueIndex("tts_cache_storage_key_idx").on(t.storageKey),
  }),
);

export type TtsCacheRow = typeof ttsCacheTable.$inferSelect;
export type InsertTtsCacheRow = typeof ttsCacheTable.$inferInsert;
