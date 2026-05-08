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

/**
 * Idempotent creation + seeding of the ezbo_tier_prompts table. Mirrors the
 * defaults in `ai/prompts.ts` so a fresh DB still has all 3 tiers visible in
 * the admin UI.
 */
export async function ensureEzboTierPrompts(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ezbo_tier_prompts (
        tier text PRIMARY KEY,
        label text NOT NULL,
        description text NOT NULL DEFAULT '',
        task_type text NOT NULL,
        prompt_addon text NOT NULL DEFAULT '',
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    // Seed defaults on first run only (ON CONFLICT DO NOTHING preserves edits).
    await db.execute(sql`
      INSERT INTO ezbo_tier_prompts (tier, label, description, task_type, prompt_addon)
      VALUES
        ('standard', 'Ezbo 1.0', 'Balanced everyday assistant', 'chat-smart', ''),
        ('mini', 'Ezbo 1.0 Mini', 'Fast, concise replies', 'chat-fast',
          E'\n\nResponse style: be concise. Prefer short, direct answers — usually 1-3 sentences. Skip preamble. Only expand when the user explicitly asks for detail.'),
        ('pro', 'Ezbo 1.0 Pro (Beta)', 'Deeper reasoning, longer answers', 'chat-smart',
          E'\n\nResponse style: take extra care. Reason step-by-step internally before answering. Provide thorough, well-structured responses with examples and clear sections (use Markdown headings or bullet lists when helpful). Prefer accuracy over speed.')
      ON CONFLICT (tier) DO NOTHING
    `);
    logger.info("ezbo_tier_prompts table ensured");
  } catch (err) {
    logger.error({ err }, "failed to ensure ezbo_tier_prompts");
  }
}

/**
 * Idempotent creation of the users + user_sessions tables. Phase 2 auth.
 * Uses pgcrypto's gen_random_uuid() for the user id default; the extension is
 * created on demand. Does NOT seed any users.
 */
export async function ensureUsers(): Promise<void> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        name text NOT NULL DEFAULT '',
        role text NOT NULL DEFAULT 'user',
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id serial PRIMARY KEY,
        token_hash text NOT NULL UNIQUE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
      ON user_sessions (user_id)
    `);
    logger.info("users + user_sessions tables ensured");
  } catch (err) {
    logger.error({ err }, "failed to ensure users tables");
  }
}

/**
 * Idempotent creation of the browser_access_rules table. Drizzle-kit push
 * also knows about it, but we ensure it at runtime so a fresh deploy where
 * the operator skips `pnpm db push` doesn't 500 on the access-rules tab.
 */
export async function ensureBrowserAccessRules(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS browser_access_rules (
        id serial PRIMARY KEY,
        host text NOT NULL,
        mode text NOT NULL,
        note text DEFAULT '',
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS browser_access_rules_host_uq
      ON browser_access_rules (host)
    `);
    logger.info("browser_access_rules table ensured");
  } catch (err) {
    logger.error({ err }, "failed to ensure browser_access_rules");
  }
}
