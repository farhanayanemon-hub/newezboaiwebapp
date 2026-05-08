import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import { lookup as mimeLookup } from "mime-types";
import { z } from "zod";
import { sql, eq, desc, inArray } from "drizzle-orm";
import { db, attachmentsTable, attachmentKinds, type AttachmentKind } from "@workspace/db";
import {
  storeFromTempFile,
  resolveStorageKey,
  deleteObject,
  ensureRootExists,
} from "../services/objectStorage";
import { detectKind, extractTextByKind } from "../services/extractText";

const router: IRouter = Router();

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const safe = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 80);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    },
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
});

const PREVIEW_CHARS = 240;

function publicUrlFor(id: string): string {
  return `/api/files/${id}/raw`;
}

// POST /upload — multipart/form-data, field name "files"
router.post("/upload", (req, res, next) => {
  ensureRootExists().catch(() => undefined);
  upload.array("files", MAX_FILES_PER_REQUEST)(req, res, (err) => {
    if (err) {
      const code = (err as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "One or more files exceed 25 MB." });
        return;
      }
      if (code === "LIMIT_FILE_COUNT") {
        res.status(413).json({ error: "Maximum 10 files per upload." });
        return;
      }
      req.log?.error({ err }, "multer upload failed");
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    next();
  });
}, async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "No files provided." });
    return;
  }

  const out: unknown[] = [];
  for (const file of files) {
    try {
      const stored = await storeFromTempFile(file.path, file.originalname);
      const mimeType =
        file.mimetype && file.mimetype !== "application/octet-stream"
          ? file.mimetype
          : (mimeLookup(file.originalname) || null) || file.mimetype || null;
      const kind = detectKind(file.originalname, mimeType ?? undefined);

      const extract = await extractTextByKind(stored.absolutePath, kind);

      const [row] = await db
        .insert(attachmentsTable)
        .values({
          kind,
          storageKey: stored.storageKey,
          url: "", // filled after we have id
          originalName: file.originalname,
          mimeType,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          extractedText: extract.text,
          extractError: extract.error,
        })
        .returning();

      const url = publicUrlFor(row.id);
      await db.update(attachmentsTable).set({ url }).where(eq(attachmentsTable.id, row.id));

      out.push({
        id: row.id,
        kind: row.kind,
        url,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        originalName: row.originalName,
        sha256: row.sha256,
        extractedTextPreview: extract.text ? extract.text.slice(0, PREVIEW_CHARS) : null,
        extractError: extract.error,
        createdAt: row.createdAt,
      });
    } catch (err) {
      req.log?.error({ err, name: file.originalname }, "file upload failed");
      out.push({
        originalName: file.originalname,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  res.status(201).json({ files: out });
});

// GET /  — list with optional q/kind/limit
router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const kindParam = String(req.query.kind ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 500);

  const conditions = [];
  if (kindParam && (attachmentKinds as readonly string[]).includes(kindParam)) {
    conditions.push(eq(attachmentsTable.kind, kindParam));
  }
  if (q) {
    conditions.push(
      sql`(${attachmentsTable.originalName} ILIKE ${"%" + q + "%"} OR coalesce(${attachmentsTable.extractedText}, '') ILIKE ${"%" + q + "%"})`,
    );
  }

  const rows = await db
    .select({
      id: attachmentsTable.id,
      kind: attachmentsTable.kind,
      url: attachmentsTable.url,
      mimeType: attachmentsTable.mimeType,
      sizeBytes: attachmentsTable.sizeBytes,
      originalName: attachmentsTable.originalName,
      sha256: attachmentsTable.sha256,
      extractError: attachmentsTable.extractError,
      createdAt: attachmentsTable.createdAt,
    })
    .from(attachmentsTable)
    .where(conditions.length ? sql.join(conditions, sql` AND `) : undefined)
    .orderBy(desc(attachmentsTable.createdAt))
    .limit(limit);

  res.json({ files: rows });
});

const idParam = z.string().uuid();

// GET /:id — full metadata + extracted text
router.get("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, id.data))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ file: row });
});

// GET /:id/raw — stream the file bytes
router.get("/:id/raw", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, id.data))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let abs: string;
  try {
    abs = resolveStorageKey(row.storageKey);
  } catch (err) {
    req.log?.error({ err, key: row.storageKey }, "invalid storage key");
    res.status(500).json({ error: "Bad storage key" });
    return;
  }
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  if (req.query.download === "1") {
    const safe = (row.originalName || "file").replace(/["\\]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  } else {
    res.setHeader("Content-Disposition", "inline");
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(abs, (err) => {
    if (err) req.log?.error({ err }, "sendFile failed");
  });
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ storageKey: attachmentsTable.storageKey, sha256: attachmentsTable.sha256 })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, id.data))
    .limit(1);
  if (!row) {
    res.json({ ok: true });
    return;
  }
  await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id.data));
  // Only delete the on-disk blob when no other attachment row references it.
  const others = await db
    .select({ id: attachmentsTable.id })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.sha256, row.sha256))
    .limit(1);
  if (others.length === 0) {
    await deleteObject(row.storageKey);
  }
  res.json({ ok: true });
});

// POST /bulk-delete  body: { ids: string[] }
router.post("/bulk-delete", async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db
    .select({ id: attachmentsTable.id, storageKey: attachmentsTable.storageKey, sha256: attachmentsTable.sha256 })
    .from(attachmentsTable)
    .where(inArray(attachmentsTable.id, parsed.data.ids));
  if (rows.length === 0) {
    res.json({ ok: true, deleted: 0 });
    return;
  }
  await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, rows.map((r) => r.id)));
  for (const r of rows) {
    const remaining = await db
      .select({ id: attachmentsTable.id })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.sha256, r.sha256))
      .limit(1);
    if (remaining.length === 0) {
      await deleteObject(r.storageKey);
    }
  }
  res.json({ ok: true, deleted: rows.length });
});

export interface ResolvedAttachment {
  id: string;
  kind: AttachmentKind;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageKey: string;
  url: string;
  extractedText: string | null;
  extractError: string | null;
}

/** Used by the chat route to fetch attachments referenced by a message. */
export async function loadAttachments(ids: string[]): Promise<ResolvedAttachment[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(inArray(attachmentsTable.id, ids));
  const order = new Map(ids.map((id, i) => [id, i] as const));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => ({
      id: r.id,
      kind: r.kind as AttachmentKind,
      originalName: r.originalName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      storageKey: r.storageKey,
      url: r.url,
      extractedText: r.extractedText,
      extractError: r.extractError,
    }));
}

export default router;
