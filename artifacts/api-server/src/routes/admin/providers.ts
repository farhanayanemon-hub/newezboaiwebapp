import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, providerKeysTable, providerSlugs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt, encrypt, maskKey } from "../../ai/crypto";
import { getProvider } from "../../ai/providers";
import { requireAdmin } from "../../middleware/adminAuth";

const router: IRouter = Router();
router.use(requireAdmin());

const providerEnum = z.enum(providerSlugs);

const createSchema = z.object({
  provider: providerEnum,
  label: z.string().max(80).default(""),
  apiKey: z.string().min(8).max(2048),
});

const patchSchema = z.object({
  label: z.string().max(80).optional(),
  enabled: z.boolean().optional(),
  enabledModels: z.array(z.string()).optional(),
});

function serialize(row: typeof providerKeysTable.$inferSelect) {
  let masked = "";
  try {
    masked = maskKey(decrypt(row.encryptedKey));
  } catch {
    masked = "(unreadable)";
  }
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    maskedKey: masked,
    enabled: row.enabled,
    enabledModels: row.enabledModels,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus,
    lastTestError: row.lastTestError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/", async (_req, res) => {
  const rows = await db.select().from(providerKeysTable).orderBy(providerKeysTable.id);
  res.json({ providers: rows.map(serialize) });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { provider, label, apiKey } = parsed.data;
  const encryptedKey = encrypt(apiKey);
  const [row] = await db
    .insert(providerKeysTable)
    .values({ provider, label, encryptedKey, enabled: true, enabledModels: [] })
    .returning();
  res.json({ provider: serialize(row) });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.enabledModels !== undefined) update.enabledModels = parsed.data.enabledModels;

  const [row] = await db
    .update(providerKeysTable)
    .set(update)
    .where(eq(providerKeysTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ provider: serialize(row) });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(providerKeysTable).where(eq(providerKeysTable.id, id));
  res.json({ ok: true });
});

router.post("/:id/test", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(providerKeysTable).where(eq(providerKeysTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const provider = getProvider(row.provider);
  if (!provider) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  let apiKey: string;
  try {
    apiKey = decrypt(row.encryptedKey);
  } catch {
    res.status(500).json({ error: "Cannot decrypt key" });
    return;
  }
  const result = await provider.testConnection(apiKey);
  await db
    .update(providerKeysTable)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? "ok" : "error",
      lastTestError: result.ok ? null : (result.error?.slice(0, 500) ?? "Unknown"),
      updatedAt: new Date(),
    })
    .where(eq(providerKeysTable.id, id));
  res.json(result);
});

router.get("/:id/models", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(providerKeysTable).where(eq(providerKeysTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const provider = getProvider(row.provider);
  if (!provider) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  try {
    const apiKey = decrypt(row.encryptedKey);
    const models = await provider.listModels(apiKey);
    res.json({ models, enabledModels: row.enabledModels });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
