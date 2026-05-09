import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, elevenlabsConfigTable } from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { encrypt, decrypt, maskKey } from "../../ai/crypto";
import { listVoices, probeKey } from "../../lib/elevenlabs";

const router: IRouter = Router();
router.use(requireAdmin());

const upsertSchema = z.object({
  // Empty string means "leave existing key unchanged" so the operator can
  // toggle settings without re-pasting the secret.
  apiKey: z.string().max(2_048).default(""),
  voiceId: z.string().trim().max(128).default(""),
  modelId: z.string().trim().max(128).default("eleven_multilingual_v2"),
  enabled: z.boolean().default(false),
});

function safeView(row: typeof elevenlabsConfigTable.$inferSelect) {
  return {
    voiceId: row.voiceId,
    modelId: row.modelId,
    enabled: row.enabled,
    hasApiKey: !!row.encryptedApiKey,
    apiKeyMask: row.encryptedApiKey ? maskKey(decrypt(row.encryptedApiKey)) : "",
    updatedAt: row.updatedAt,
  };
}

async function ensureRow(): Promise<typeof elevenlabsConfigTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(elevenlabsConfigTable)
    .where(eq(elevenlabsConfigTable.id, 1))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(elevenlabsConfigTable)
    .values({ id: 1 })
    .returning();
  return created!;
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
  const updates: Partial<typeof elevenlabsConfigTable.$inferInsert> = {
    voiceId: parsed.data.voiceId,
    modelId: parsed.data.modelId || "eleven_multilingual_v2",
    enabled: parsed.data.enabled,
    updatedAt: new Date(),
  };
  if (parsed.data.apiKey) {
    updates.encryptedApiKey = encrypt(parsed.data.apiKey);
  }
  await db
    .update(elevenlabsConfigTable)
    .set(updates)
    .where(eq(elevenlabsConfigTable.id, existing.id));
  const [refreshed] = await db
    .select()
    .from(elevenlabsConfigTable)
    .where(eq(elevenlabsConfigTable.id, 1))
    .limit(1);
  res.json({ config: safeView(refreshed!) });
});

/** Probe the configured key (or a freshly-supplied one). */
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
    apiKey = decrypt(row.encryptedApiKey);
  }
  const result = await probeKey(apiKey);
  res.json(result);
});

/** List voices using the saved key (or a supplied one). */
router.get("/voices", async (req, res) => {
  const supplied = typeof req.query.apiKey === "string" ? req.query.apiKey : "";
  let apiKey = supplied;
  if (!apiKey) {
    const row = await ensureRow();
    if (!row.encryptedApiKey) {
      res.status(400).json({ error: "No API key configured." });
      return;
    }
    apiKey = decrypt(row.encryptedApiKey);
  }
  try {
    const voices = await listVoices(apiKey);
    res.json({
      voices: voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        labels: v.labels ?? {},
        previewUrl: v.preview_url ?? null,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to load voices" });
  }
});

export default router;
