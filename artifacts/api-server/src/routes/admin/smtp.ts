import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, smtpConfigTable, adminAuditLogTable } from "@workspace/db";
import { requireAdmin } from "../../middleware/adminAuth";
import { encrypt } from "../../ai/crypto";
import { sendTestMail } from "../../lib/mailer";

const router: IRouter = Router();
router.use(requireAdmin());

const upsertSchema = z.object({
  host: z.string().trim().max(253).default(""),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().trim().max(254).default(""),
  // Empty string means "leave existing password unchanged" so the operator
  // can save other settings without re-entering the secret each time.
  password: z.string().max(2_048).default(""),
  fromAddress: z.string().trim().max(254).default(""),
  fromName: z.string().trim().max(120).default(""),
  enabled: z.boolean().default(false),
});

function safeView(row: typeof smtpConfigTable.$inferSelect) {
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    enabled: row.enabled,
    hasPassword: !!row.encryptedPassword,
    updatedAt: row.updatedAt,
  };
}

router.get("/", async (_req, res) => {
  const [row] = await db
    .select()
    .from(smtpConfigTable)
    .where(eq(smtpConfigTable.id, 1))
    .limit(1);
  if (!row) {
    res.json({
      config: {
        host: "",
        port: 587,
        secure: false,
        username: "",
        fromAddress: "",
        fromName: "",
        enabled: false,
        hasPassword: false,
        updatedAt: null,
      },
    });
    return;
  }
  res.json({ config: safeView(row) });
});

router.put("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  // Look up existing so we can preserve the encrypted password when the
  // operator submits an empty `password` field.
  const [existing] = await db
    .select()
    .from(smtpConfigTable)
    .where(eq(smtpConfigTable.id, 1))
    .limit(1);
  const encryptedPassword = d.password
    ? encrypt(d.password)
    : (existing?.encryptedPassword ?? "");
  const values = {
    id: 1 as const,
    host: d.host,
    port: d.port,
    secure: d.secure,
    username: d.username,
    encryptedPassword,
    fromAddress: d.fromAddress,
    fromName: d.fromName,
    enabled: d.enabled,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(smtpConfigTable).set(values).where(eq(smtpConfigTable.id, 1));
  } else {
    await db.insert(smtpConfigTable).values(values);
  }
  await db
    .insert(adminAuditLogTable)
    .values({
      action: "smtp.update",
      actorIp: (req.ip || "").toString().slice(0, 64),
      metadata: { host: d.host, enabled: d.enabled, fromAddress: d.fromAddress },
    })
    .catch(() => undefined);
  const [row] = await db
    .select()
    .from(smtpConfigTable)
    .where(eq(smtpConfigTable.id, 1))
    .limit(1);
  res.json({ config: safeView(row!) });
});

const testSchema = z.object({ to: z.string().email().max(254) });
router.post("/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await sendTestMail(parsed.data.to);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Send failed",
    });
  }
});

export default router;
