import { createWriteStream, existsSync } from "node:fs";
import { mkdir, stat, unlink, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Local-disk object storage. We can't use the Replit GCS sidecar because
 * production runs on a self-hosted VPS. Files are stored under UPLOADS_DIR
 * (default `./uploads`) keyed by the SHA-256 of their bytes — identical
 * uploads dedupe to the same on-disk file regardless of filename/extension.
 *
 * Storage layout: `<root>/<aa>/<bb>/<full-sha256>` where `aa/bb` are the
 * first two pairs of hex characters of the hash (avoids huge flat dirs).
 * The original extension is metadata only; it is NOT in the canonical path.
 */

function rootDir(): string {
  return path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
}

function shardPath(sha: string): string {
  const a = sha.slice(0, 2);
  const b = sha.slice(2, 4);
  return path.join(rootDir(), a, b, sha);
}

export interface HashedTempFile {
  tempPath: string;
  sha256: string;
  sizeBytes: number;
  buf: Buffer;
}

/** Hash a temp upload, return its bytes + sha. Caller decides what to do next. */
export async function hashTempFile(tempPath: string): Promise<HashedTempFile> {
  const buf = await readFile(tempPath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  return { tempPath, sha256, sizeBytes: buf.length, buf };
}

export interface MaterializeResult {
  storageKey: string;
  absolutePath: string;
  alreadyExisted: boolean;
}

/**
 * Ensure the canonical blob for `sha` exists on disk. Idempotent and safe to
 * call after a concurrent delete may have unlinked it — re-writes from `buf`.
 * Callers should hold an advisory lock on the sha to serialize against delete.
 */
export async function materializeBlob(
  sha256: string,
  buf: Buffer,
): Promise<MaterializeResult> {
  const dest = shardPath(sha256);
  const storageKey = path.relative(rootDir(), dest);
  if (existsSync(dest)) {
    return { storageKey, absolutePath: dest, alreadyExisted: true };
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.from(buf), createWriteStream(dest));
  return { storageKey, absolutePath: dest, alreadyExisted: false };
}

/** Remove a temp upload after it has been materialized. */
export async function discardTempFile(tempPath: string): Promise<void> {
  await unlink(tempPath).catch(() => undefined);
}

export function resolveStorageKey(storageKey: string): string {
  // Defense-in-depth against path traversal.
  const root = rootDir();
  const abs = path.resolve(root, storageKey);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("Invalid storage key");
  }
  return abs;
}

export async function readObject(storageKey: string): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}

export async function deleteObject(storageKey: string): Promise<void> {
  await unlink(resolveStorageKey(storageKey)).catch(() => undefined);
}

export async function ensureRootExists(): Promise<void> {
  await mkdir(rootDir(), { recursive: true });
}

export async function objectExists(storageKey: string): Promise<boolean> {
  try {
    await stat(resolveStorageKey(storageKey));
    return true;
  } catch {
    return false;
  }
}
