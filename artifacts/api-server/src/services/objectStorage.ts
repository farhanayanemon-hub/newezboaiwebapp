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
 * uploads dedupe to the same on-disk file.
 *
 * Storage layout: `<root>/<aa>/<bb>/<full-sha256>.<ext>` where `aa/bb` are
 * the first two pairs of hex characters of the hash (avoid huge flat dirs).
 */

function rootDir(): string {
  return path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
}

function shardPath(sha: string, ext: string): string {
  const safeExt = (ext || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  const a = sha.slice(0, 2);
  const b = sha.slice(2, 4);
  const filename = safeExt ? `${sha}.${safeExt}` : sha;
  return path.join(rootDir(), a, b, filename);
}

export interface StoreResult {
  storageKey: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string;
  alreadyExisted: boolean;
}

export async function storeFromTempFile(
  tempFile: string,
  originalName: string,
): Promise<StoreResult> {
  const buf = await readFile(tempFile);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ext = path.extname(originalName).slice(1);
  const dest = shardPath(sha256, ext);
  const sizeBytes = buf.length;

  if (existsSync(dest)) {
    await unlink(tempFile).catch(() => undefined);
    const storageKey = path.relative(rootDir(), dest);
    return { storageKey, absolutePath: dest, sizeBytes, sha256, alreadyExisted: true };
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.from(buf), createWriteStream(dest));
  await unlink(tempFile).catch(() => undefined);
  const storageKey = path.relative(rootDir(), dest);
  return { storageKey, absolutePath: dest, sizeBytes, sha256, alreadyExisted: false };
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
