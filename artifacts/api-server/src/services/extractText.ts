import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { AttachmentKind } from "@workspace/db";

const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift",
  "c", "cpp", "h", "hpp", "cs", "php", "html", "css", "scss", "sass",
  "json", "yaml", "yml", "toml", "xml", "sh", "bash", "zsh", "sql", "r",
  "lua", "dart", "scala", "clj", "ex", "exs", "vue", "svelte",
]);

const TEXT_EXTS = new Set(["txt", "md", "markdown", "csv", "log", "rst", "tex"]);

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function detectKind(originalName: string, mimeType: string | undefined): AttachmentKind {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  if (mimeType?.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "docx" || mimeType?.includes("wordprocessingml")) return "word";
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv" ||
    mimeType?.includes("spreadsheetml") ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv"
  ) {
    return "spreadsheet";
  }
  if (CODE_EXTS.has(ext)) return "code";
  if (TEXT_EXTS.has(ext) || mimeType?.startsWith("text/")) return "text";
  return "other";
}

const MAX_TEXT_CHARS = 200_000; // ~50k tokens, hard ceiling

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_TEXT_CHARS) + "\n\n...[truncated]",
    truncated: true,
  };
}

async function extractPdf(absolutePath: string): Promise<string> {
  // pdfjs-dist legacy build is the only one that works in pure-Node ESM
  // bundles without a DOM. Loaded lazily so cold start stays cheap.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(absolutePath));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const out: string[] = [];
  const pages = Math.min(doc.numPages, 500);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const lineMap = new Map<number, string[]>();
    for (const item of text.items) {
      const it = item as { str?: string; transform?: number[] };
      const y = it.transform ? Math.round(it.transform[5]) : 0;
      const list = lineMap.get(y) ?? [];
      list.push(it.str ?? "");
      lineMap.set(y, list);
    }
    const ys = [...lineMap.keys()].sort((a, b) => b - a);
    const pageText = ys.map((y) => (lineMap.get(y) ?? []).join(" ")).join("\n");
    out.push(`[Page ${i}]\n${pageText}`);
    page.cleanup();
  }
  await doc.destroy();
  return out.join("\n\n");
}

async function extractDocx(absolutePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: absolutePath });
  return result.value;
}

async function extractSpreadsheet(absolutePath: string): Promise<string> {
  const buf = await readFile(absolutePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const md = XLSX.utils.sheet_to_csv(sheet, { FS: " | " });
    out.push(`### Sheet: ${sheetName}\n${md}`);
  }
  return out.join("\n\n");
}

async function extractTextFile(absolutePath: string): Promise<string> {
  const buf = await readFile(absolutePath);
  return buf.toString("utf8");
}

export interface ExtractResult {
  text: string | null;
  truncated: boolean;
  error: string | null;
}

export async function extractTextByKind(
  absolutePath: string,
  kind: AttachmentKind,
): Promise<ExtractResult> {
  try {
    let raw = "";
    switch (kind) {
      case "pdf":
        raw = await extractPdf(absolutePath);
        break;
      case "word":
        raw = await extractDocx(absolutePath);
        break;
      case "spreadsheet":
        raw = await extractSpreadsheet(absolutePath);
        break;
      case "text":
      case "code":
        raw = await extractTextFile(absolutePath);
        break;
      case "image":
      case "other":
      default:
        return { text: null, truncated: false, error: null };
    }
    const t = truncate(raw.trim());
    return { text: t.text, truncated: t.truncated, error: null };
  } catch (err) {
    return {
      text: null,
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
