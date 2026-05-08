import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, baseUrl } from "@/lib/api";

export type FileKind =
  | "image"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "text"
  | "code"
  | "other";

export interface UploadedFile {
  id: string;
  kind: FileKind;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string;
  sha256: string;
  extractedTextPreview: string | null;
  extractError: string | null;
  createdAt: string;
  error?: string;
}

export interface FileListItem {
  id: string;
  kind: FileKind;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string;
  sha256: string;
  extractError: string | null;
  createdAt: string;
}

export interface FileFull extends FileListItem {
  storageKey: string;
  extractedText: string | null;
  messageId: string | null;
}

export const fileKeys = {
  all: ["files"] as const,
  list: (q: string, kind: string) => [...fileKeys.all, "list", q, kind] as const,
  detail: (id: string) => [...fileKeys.all, "detail", id] as const,
};

/** Resolve the absolute serving URL for a file (handles non-root BASE_PATH). */
export function fileServingUrl(id: string, download = false): string {
  const base = baseUrl(`/files/${id}/raw`);
  return download ? `${base}?download=1` : base;
}

export function useFiles(q: string, kind: string) {
  return useQuery({
    queryKey: fileKeys.list(q, kind),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kind) params.set("kind", kind);
      const qs = params.toString();
      const res = await apiClient.get<{ files: FileListItem[] }>(
        `/files${qs ? `?${qs}` : ""}`,
      );
      return res.files;
    },
  });
}

export function useFile(id: string | null) {
  return useQuery({
    queryKey: id ? fileKeys.detail(id) : ["files", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<{ file: FileFull }>(`/files/${id}`);
      return res.file;
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/files/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.all }),
  });
}

export function useBulkDeleteFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await apiClient.post(`/files/bulk-delete`, { ids });
      return ids;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.all }),
  });
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Upload one or more files via multipart/form-data with XHR so we can surface
 * a real progress bar. Each call uploads the whole batch in one request.
 */
export function uploadFiles(
  files: File[],
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", baseUrl("/files/upload"));
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = xhr.response as { files: UploadedFile[] } | null;
        resolve(body?.files ?? []);
      } else {
        const body = xhr.response as { error?: string } | null;
        reject(new Error(body?.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(fd);
  });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
