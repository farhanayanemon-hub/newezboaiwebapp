import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Idempotent runtime DDL that drizzle-kit's schema push cannot express:
 * a generated tsvector column + GIN index on messages.content for full-text
 * search across Bangla and English ('simple' config preserves both).
 */
export async function ensureMessagesFts(): Promise<void> {
  // Wait for the messages table to exist (drizzle-kit push may run before/after
  // this on first deploy). Retries a few times so startup doesn't permanently
  // fail on a fresh DB; logs but does not throw.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const exists = await db.execute<{ exists: boolean }>(
        sql`SELECT to_regclass('public.messages') IS NOT NULL AS exists`,
      );
      const rows = (exists as unknown as { rows: { exists: boolean }[] }).rows;
      if (!rows?.[0]?.exists) {
        if (attempt === maxAttempts) {
          logger.warn("messages table missing; skipping FTS bootstrap");
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      await db.execute(
        sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
            GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING GIN (search_vector)`,
      );
      logger.info("messages FTS column + index ensured");
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.error({ err }, "failed to ensure messages FTS after retries");
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}
