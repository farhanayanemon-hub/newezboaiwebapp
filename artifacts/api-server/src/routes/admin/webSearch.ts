import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, webSearchConfigTable } from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { encrypt, decrypt } from "../../ai/crypto";
import { probeTavilyKey } from "../../lib/webSearch";

const router: IRouter = Router();
router.use(requireAdmin());

const upsertSchema = z.object({
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  maxResults: z.number().int().min(1).max(10).optional(),
  guestDailyLimit: z.number().int().min(0).max(100000).optional(),
  userDailyLimit: z.number().int().min(0).max(100000).optional(),
  provider: z.string().optional(),
});

function safeView(row: typeof webSearchConfigTable.$inferSelect) {
  return {
    provider: row.provider,
    enabled: row.enabled,
    maxResults: row.maxResults,
    guestDailyLimit: row.guestDailyLimit,
    userDailyLimit: row.userDailyLimit,
    hasApiKey: !!row.encryptedApiKey,
    apiKeyMask: row.encryptedApiKey ? "••••••••" : "",
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastTestStatus: row.lastTestStatus,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

async function ensureRow() {
  const [existing] = await db
    .select()
    .from(webSearchConfigTable)
    .where(eq(webSearchConfigTable.id, 1))
    .limit(1);
  if (existing) return existing;
  await db
    .insert(webSearchConfigTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(webSearchConfigTable)
    .where(eq(webSearchConfigTable.id, 1))
    .limit(1);
  return row!;
}

router.get("/", async (_req, res) => {
  const row = await ensureRow();
  res.json({ config: safeView(row) });
});

router.put("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await ensureRow();
  const updates: Partial<typeof webSearchConfigTable.$inferInsert> = {
    enabled: parsed.data.enabled,
    updatedAt: new Date(),
  };
  if (parsed.data.maxResults !== undefined) updates.maxResults = parsed.data.maxResults;
  if (parsed.data.guestDailyLimit !== undefined)
    updates.guestDailyLimit = parsed.data.guestDailyLimit;
  if (parsed.data.userDailyLimit !== undefined)
    updates.userDailyLimit = parsed.data.userDailyLimit;
  if (parsed.data.provider) updates.provider = parsed.data.provider;
  if (parsed.data.apiKey) updates.encryptedApiKey = encrypt(parsed.data.apiKey);

  await db
    .update(webSearchConfigTable)
    .set(updates)
    .where(eq(webSearchConfigTable.id, existing.id));
  const [refreshed] = await db
    .select()
    .from(webSearchConfigTable)
    .where(eq(webSearchConfigTable.id, 1))
    .limit(1);
  res.json({ config: safeView(refreshed!) });
});

router.post("/test", async (req, res) => {
  const body = req.body ?? {};
  let apiKey: string | undefined =
    typeof body.apiKey === "string" && body.apiKey ? body.apiKey : undefined;
  if (!apiKey) {
    const row = await ensureRow();
    if (!row.encryptedApiKey) {
      res.status(400).json({ ok: false, error: "No API key configured." });
      return;
    }
    try {
      apiKey = decrypt(row.encryptedApiKey);
    } catch {
      res.status(500).json({ ok: false, error: "Stored key cannot be decrypted." });
      return;
    }
  }
  const result = await probeTavilyKey(apiKey);
  await db
    .update(webSearchConfigTable)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? "ok" : `error: ${result.error?.slice(0, 200) ?? "unknown"}`,
    })
    .where(eq(webSearchConfigTable.id, 1));
  res.json(result);
});

export default router;
