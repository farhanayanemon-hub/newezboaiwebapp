import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, siteCredentialsTable } from "@workspace/db";
import { decrypt, encrypt } from "../../ai/crypto";
import { requireAdmin } from "../../middleware/adminAuth";

const router: IRouter = Router();
router.use(requireAdmin());

/**
 * Vault for per-domain credentials the browser agent may use during a run.
 * The username and password are AES-GCM encrypted at rest. The list endpoint
 * returns *only* the username (in cleartext) and a masked password — full
 * passwords never leave the server: the agent fills them via a dedicated
 * tool that bypasses the model's context entirely.
 */

const upsertSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .transform((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!),
  username: z.string().min(1).max(500),
  password: z.string().min(1).max(2_048),
  notes: z.string().max(1_000).optional(),
});

function safeView(row: typeof siteCredentialsTable.$inferSelect) {
  let username = "";
  try {
    username = decrypt(row.encryptedUsername);
  } catch {
    username = "(unreadable)";
  }
  return {
    id: row.id,
    domain: row.domain,
    username,
    passwordMask: "••••••••",
    notes: row.notes ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(siteCredentialsTable)
    .orderBy(siteCredentialsTable.domain);
  res.json({ credentials: rows.map(safeView) });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { domain, username, password, notes } = parsed.data;
  const encryptedUsername = encrypt(username);
  const encryptedPassword = encrypt(password);
  // Upsert by domain — one credential per host in v1.
  const existing = await db
    .select()
    .from(siteCredentialsTable)
    .where(eq(siteCredentialsTable.domain, domain))
    .limit(1);
  if (existing.length > 0) {
    const [row] = await db
      .update(siteCredentialsTable)
      .set({
        encryptedUsername,
        encryptedPassword,
        notes: notes ?? "",
        updatedAt: new Date(),
      })
      .where(eq(siteCredentialsTable.domain, domain))
      .returning();
    res.json({ credential: safeView(row!) });
    return;
  }
  const [row] = await db
    .insert(siteCredentialsTable)
    .values({ domain, encryptedUsername, encryptedPassword, notes: notes ?? "" })
    .returning();
  res.status(201).json({ credential: safeView(row!) });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .delete(siteCredentialsTable)
    .where(eq(siteCredentialsTable.id, id))
    .returning({ id: siteCredentialsTable.id });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
