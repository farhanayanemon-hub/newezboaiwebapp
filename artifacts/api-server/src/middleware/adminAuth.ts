import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, adminSessionsTable } from "@workspace/db";
import { eq, gt, and, lt } from "drizzle-orm";

const COOKIE_NAME = "ezboai_admin";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createAdminSession(res: Response): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(adminSessionsTable).values({ tokenHash, expiresAt });
  await db.delete(adminSessionsTable).where(lt(adminSessionsTable.expiresAt, new Date())).catch(() => {});
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export async function destroyAdminSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (token) {
    const tokenHash = hashToken(token);
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, tokenHash));
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function isAuthenticated(req: Request): Promise<boolean> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return false;
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(adminSessionsTable)
    .where(and(eq(adminSessionsTable.tokenHash, tokenHash), gt(adminSessionsTable.expiresAt, new Date())))
    .limit(1);
  return rows.length > 0;
}

export function requireAdmin(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req, res, next) => {
    if (await isAuthenticated(req)) return next();
    res.status(401).json({ error: "Unauthorized" });
  };
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  entry.count += 1;
  next();
}
