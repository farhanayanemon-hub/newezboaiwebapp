import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db, smtpConfigTable, type SmtpConfig } from "@workspace/db";
import { decrypt } from "../ai/crypto";
import { logger } from "./logger";

/**
 * Read the singleton SMTP config row. Returns null if SMTP is disabled or
 * not configured — callers should treat that as "skip email, no error".
 */
export async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  const [row] = await db
    .select()
    .from(smtpConfigTable)
    .where(eq(smtpConfigTable.id, 1))
    .limit(1);
  if (!row || !row.enabled || !row.host || !row.fromAddress) return null;
  return row;
}

/** True if SMTP is configured AND enabled — used to gate verification UX. */
export async function smtpEnabled(): Promise<boolean> {
  return (await loadSmtpConfig()) !== null;
}

function buildTransport(cfg: SmtpConfig): Transporter {
  const auth =
    cfg.username && cfg.encryptedPassword
      ? { user: cfg.username, pass: decrypt(cfg.encryptedPassword) }
      : undefined;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth,
  });
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Best-effort email send. Returns true on success, false (and logs) on
 * failure or when SMTP is disabled. Never throws — callers don't want a
 * mailer outage to take down signup.
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  const cfg = await loadSmtpConfig();
  if (!cfg) {
    logger.warn({ to: input.to }, "smtp disabled; skipping email");
    return false;
  }
  try {
    const transport = buildTransport(cfg);
    const fromName = cfg.fromName || "EzboAI";
    await transport.sendMail({
      from: `"${fromName}" <${cfg.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to: input.to }, "failed to send email");
    return false;
  }
}

/** Send a test email — used by /admin/smtp/test. Throws on failure so the
 * UI can show the actual SMTP error to the operator. */
export async function sendTestMail(to: string): Promise<void> {
  const cfg = await loadSmtpConfig();
  if (!cfg) throw new Error("SMTP is not enabled or not fully configured");
  const transport = buildTransport(cfg);
  await transport.sendMail({
    from: `"${cfg.fromName || "EzboAI"}" <${cfg.fromAddress}>`,
    to,
    subject: "EzboAI SMTP test",
    text: "If you can read this, SMTP is configured correctly.",
  });
}
