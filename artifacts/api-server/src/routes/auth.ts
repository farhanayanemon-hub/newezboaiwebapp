import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import {
  authRateLimit,
  createUserSession,
  destroyUserSession,
  getUserFromRequest,
  hashPassword,
  requireUser,
  verifyPassword,
} from "../middleware/userAuth";

const router: IRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(256);
const nameSchema = z.string().trim().max(80).default("");

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const updateAccountSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
  };
}

router.post("/signup", authRateLimit, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, name } = parsed.data;
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
    .values({ email, passwordHash, name })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create account" });
    return;
  }
  await createUserSession(res, created.id);
  res.status(201).json({ user: publicUser(created) });
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
  await createUserSession(res, user.id);
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
  if (parsed.data.email && parsed.data.email !== user.email) {
    const dup = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email))
      .limit(1);
    if (dup.length > 0) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    updates.email = parsed.data.email;
  }
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
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, updatedAt: sql`now()` })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

export default router;
