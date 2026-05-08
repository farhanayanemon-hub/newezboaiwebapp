import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Idempotent runtime DDL that drizzle-kit's schema push cannot express:
 * a generated tsvector column + GIN index on messages.content for full-text
 * search across Bangla and English ('simple' config preserves both).
 */
export async function ensureMessagesFts(): Promise<void> {
  try {
    await db.execute(
      sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
          GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING GIN (search_vector)`,
    );
    logger.info("messages FTS column + index ensured");
  } catch (err) {
    logger.error({ err }, "failed to ensure messages FTS");
  }
}
