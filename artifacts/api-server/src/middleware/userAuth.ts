import type { Request, Response, NextFunction } from "express";
import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { db, usersTable, userSessionsTable, type User } from "@workspace/db";
import { and, eq, gt, lt } from "drizzle-orm";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE_NAME = "ezboai_user";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1]!, "hex");
    const expected = Buffer.from(parts[2]!, "hex");
    const derived = await scrypt(password, salt, expected.length);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function createUserSession(
  res: Response,
  userId: string,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(userSessionsTable).values({
    tokenHash: tokenHash(token),
    userId,
    expiresAt,
  });
  // Opportunistic cleanup of expired sessions; failures are non-fatal.
  await db
    .delete(userSessionsTable)
    .where(lt(userSessionsTable.expiresAt, new Date()))
    .catch(() => {});
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export async function destroyUserSession(
  req: Request,
  res: Response,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (token) {
    await db
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.tokenHash, tokenHash(token)));
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return null;
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
      name: usersTable.name,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(userSessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userSessionsTable.userId))
    .where(
      and(
        eq(userSessionsTable.tokenHash, tokenHash(token)),
        gt(userSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function requireUser(): (
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  return async (req, res, next) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as Request & { user?: User }).user = user;
    next();
  };
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  if (entry.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  entry.count += 1;
  next();
}
