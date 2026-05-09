import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  userSessionsTable,
  emailVerificationTokensTable,
  passwordResetTokensTable,
  type User,
} from "@workspace/db";
import {
  authRateLimit,
  createUserSession,
  destroyUserSession,
  getUserFromRequest,
  hashPassword,
  requireUser,
  verifyPassword,
} from "../middleware/userAuth";
import { sendMail, smtpEnabled } from "../lib/mailer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(256);
const nameSchema = z.string().trim().max(80).default("");
// ISO date (YYYY-MM-DD). Optional / nullable so it can be cleared.
const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .optional()
  .nullable();

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  dateOfBirth: dobSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

// Email + DOB intentionally NOT exposed here — DOB is read-only after
// signup (admin can edit via DB) and email changes go through verification
// in a separate flow if/when we add it.
const updateAccountSchema = z.object({
  name: nameSchema.optional(),
  profession: z.string().trim().max(120).optional(),
  instructions: z.string().max(4_000).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appBaseUrl(req: Request): string {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return `${proto}://${host}`;
}

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    bannedAt: u.bannedAt,
    emailVerifiedAt: u.emailVerifiedAt,
    dateOfBirth: u.dateOfBirth,
    profession: u.profession,
    instructions: u.instructions,
    createdAt: u.createdAt,
  };
}

async function issueAndSendVerification(user: User, req: Request): Promise<boolean> {
  if (!(await smtpEnabled())) return false;
  const token = randomBytes(32).toString("hex");
  await db.insert(emailVerificationTokensTable).values({
    tokenHash: tokenHash(token),
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const link = `${appBaseUrl(req)}/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: "Verify your EzboAI email",
    text: `Hi${user.name ? ` ${user.name}` : ""},\n\nClick the link below to verify your email address. The link expires in 24 hours.\n\n${link}\n\nIf you didn't sign up, you can ignore this message.`,
    html: `<p>Hi${user.name ? ` ${user.name}` : ""},</p><p>Click the link below to verify your email address. The link expires in 24 hours.</p><p><a href="${link}">${link}</a></p><p>If you didn't sign up, you can ignore this message.</p>`,
  });
}

router.post("/signup", authRateLimit, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, name, dateOfBirth } = parsed.data;
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name,
      ...(dateOfBirth ? { dateOfBirth } : {}),
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create account" });
    return;
  }
  await createUserSession(res, created.id);
  const verificationSent = await issueAndSendVerification(created, req).catch((err) => {
    logger.error({ err }, "verification send failed");
    return false;
  });
  res.status(201).json({ user: publicUser(created), verificationSent });
});

router.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (user.bannedAt) {
    res.status(403).json({
      error: user.banReason
        ? `This account has been suspended: ${user.banReason}`
        : "This account has been suspended.",
    });
    return;
  }
  await createUserSession(res, user.id);
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .catch(() => undefined);
  res.json({ user: publicUser(user) });
});

router.post("/logout", async (req, res) => {
  await destroyUserSession(req, res);
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.json({ user: null });
    return;
  }
  res.json({ user: publicUser(user) });
});

router.patch("/account", requireUser(), async (req, res) => {
  const user = (req as typeof req & { user: User }).user;
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.profession !== undefined) updates.profession = parsed.data.profession;
  if (parsed.data.instructions !== undefined) updates.instructions = parsed.data.instructions;
  if (Object.keys(updates).length === 0) {
    res.json({ user: publicUser(user) });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ ...updates, updatedAt: sql`now()` })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json({ user: publicUser(updated ?? user) });
});

router.post("/change-password", requireUser(), async (req, res) => {
  const user = (req as typeof req & { user: User }).user;
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const newHash = await hashPassword(parsed.data.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash: newHash, updatedAt: sql`now()` })
      .where(eq(usersTable.id, user.id));
    await tx
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.userId, user.id));
  });
  await createUserSession(res, user.id);
  res.json({ ok: true });
});

// --- Email verification ---------------------------------------------------

router.post("/verify-email/request", authRateLimit, requireUser(), async (req, res) => {
  const user = (req as typeof req & { user: User }).user;
  if (user.emailVerifiedAt) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }
  const sent = await issueAndSendVerification(user, req);
  if (!sent) {
    res.status(503).json({ error: "Email is not configured. Please try later." });
    return;
  }
  res.json({ ok: true });
});

const verifyConfirmSchema = z.object({ token: z.string().min(8).max(128) });
router.post("/verify-email/confirm", authRateLimit, async (req, res) => {
  const parsed = verifyConfirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  const hash = tokenHash(parsed.data.token);
  const ok = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emailVerificationTokensTable)
      .where(
        and(
          eq(emailVerificationTokensTable.tokenHash, hash),
          gt(emailVerificationTokensTable.expiresAt, new Date()),
          isNull(emailVerificationTokensTable.consumedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) return false;
    await tx
      .update(emailVerificationTokensTable)
      .set({ consumedAt: new Date() })
      .where(eq(emailVerificationTokensTable.id, row.id));
    await tx
      .update(usersTable)
      .set({ emailVerifiedAt: new Date(), updatedAt: sql`now()` })
      .where(eq(usersTable.id, row.userId));
    return true;
  });
  if (!ok) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }
  res.json({ ok: true });
});

// --- Password reset -------------------------------------------------------

const forgotSchema = z.object({ email: emailSchema });
router.post("/forgot-password", authRateLimit, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.json({ ok: true });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email))
    .limit(1);
  if (!user) {
    res.json({ ok: true });
    return;
  }
  if (!(await smtpEnabled())) {
    res.status(503).json({ error: "Email is not configured. Please contact support." });
    return;
  }
  const token = randomBytes(32).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    tokenHash: tokenHash(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  const link = `${appBaseUrl(req)}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: "Reset your EzboAI password",
    text: `Click the link below to reset your password. The link expires in 1 hour.\n\n${link}\n\nIf you didn't request this, you can ignore the message.`,
    html: `<p>Click the link below to reset your password. The link expires in 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore the message.</p>`,
  }).catch((err) => logger.error({ err }, "reset email send failed"));
  res.json({ ok: true });
});

const resetSchema = z.object({
  token: z.string().min(8).max(128),
  newPassword: passwordSchema,
});
router.post("/reset-password", authRateLimit, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const hash = tokenHash(parsed.data.token);
  const newHash = await hashPassword(parsed.data.newPassword);
  const ok = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, hash),
          gt(passwordResetTokensTable.expiresAt, new Date()),
          isNull(passwordResetTokensTable.consumedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) return false;
    await tx
      .update(passwordResetTokensTable)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, row.id));
    await tx
      .update(usersTable)
      .set({ passwordHash: newHash, updatedAt: sql`now()` })
      .where(eq(usersTable.id, row.userId));
    await tx
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.userId, row.userId));
    return true;
  });
  if (!ok) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }
  res.json({ ok: true });
});

export default router;
