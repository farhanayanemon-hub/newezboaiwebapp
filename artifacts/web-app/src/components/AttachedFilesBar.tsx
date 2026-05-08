import { useEffect, useRef, useState } from "react";
import {
  X,
  FileText,
  FileSpreadsheet,
  FileCode2,
  FileImage,
  File as FileIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  uploadFiles,
  formatFileSize,
  type UploadedFile,
  type FileKind,
} from "@/lib/files";

const MAX_PER_MESSAGE = 10;
const MAX_BYTES = 25 * 1024 * 1024;

export interface AttachedItem {
  /** Local id while uploading; replaced by server id on success. */
  localId: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
  file: File;
  uploaded?: UploadedFile;
}

interface AttachedFilesBarProps {
  items: AttachedItem[];
  onChange: (next: AttachedItem[]) => void;
}

function iconFor(kind: FileKind | undefined) {
  switch (kind) {
    case "image":
      return FileImage;
    case "pdf":
      return FileText;
    case "word":
      return FileText;
    case "spreadsheet":
      return FileSpreadsheet;
    case "code":
      return FileCode2;
    case "text":
      return FileText;
    default:
      return FileIcon;
  }
}

export function useAttachedFiles() {
  const [items, setItems] = useState<AttachedItem[]>([]);
  return { items, setItems } as const;
}

export function AttachedFilesBar({ items, onChange }: AttachedFilesBarProps) {
  if (items.length === 0) return null;

  const remove = (localId: string) => {
    onChange(items.filter((i) => i.localId !== localId));
  };

  return (
    <div className="border-t border-border/60 bg-background/95 px-4 pt-2 pb-1 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-1.5">
        {items.map((it) => {
          const kind = it.uploaded?.kind;
          const Icon = iconFor(kind);
          const name = it.uploaded?.originalName ?? it.file.name;
          const size = it.uploaded?.sizeBytes ?? it.file.size;
          const isImage = kind === "image";
          return (
            <div
              key={it.localId}
              className={cn(
                "group flex items-center gap-2 rounded-lg border bg-card pl-1.5 pr-1 py-1 text-xs shadow-sm",
                it.status === "error"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border",
              )}
              data-testid={`attached-chip-${it.localId}`}
              title={it.error || name}
            >
              {isImage && it.uploaded ? (
                <img
                  src={it.uploaded.url}
                  alt={name}
                  className="h-6 w-6 rounded object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground">
                  {it.status === "uploading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : it.status === "error" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="max-w-[180px] truncate font-medium leading-tight">
                  {name}
                </span>
                {it.status === "uploading" ? (
                  <Progress
                    value={it.progress}
                    className="mt-0.5 h-1 w-[120px]"
                  />
                ) : (
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    {it.status === "error" ? it.error || "Failed" : formatFileSize(size)}
                  </span>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(it.localId)}
                aria-label={`Remove ${name}`}
                className="h-5 w-5 rounded-md opacity-60 hover:opacity-100"
                data-testid={`button-remove-attachment-${it.localId}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface UseFileUploadOptions {
  items: AttachedItem[];
  setItems: (next: AttachedItem[] | ((prev: AttachedItem[]) => AttachedItem[])) => void;
}

/** Hook that handles validation + batch upload + per-item progress wiring. */
export function useFileUploads({ items, setItems }: UseFileUploadOptions) {
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const current = itemsRef.current;
    const remainingSlots = MAX_PER_MESSAGE - current.length;
    if (remainingSlots <= 0) {
      toast.error(`You can attach at most ${MAX_PER_MESSAGE} files per message.`);
      return;
    }
    let take = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.warning(
        `Only the first ${remainingSlots} file(s) added — limit is ${MAX_PER_MESSAGE} per message.`,
      );
    }
    take = take.filter((f) => {
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" exceeds the 25 MB limit.`);
        return false;
      }
      return true;
    });
    if (take.length === 0) return;

    const newItems: AttachedItem[] = take.map((f) => ({
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "uploading",
      progress: 0,
      file: f,
    }));
    setItems((prev) => [...prev, ...newItems]);

    try {
      const uploaded = await uploadFiles(take, (p) => {
        const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
        setItems((prev) =>
          prev.map((it) =>
            newItems.some((n) => n.localId === it.localId)
              ? { ...it, progress: pct }
              : it,
          ),
        );
      });

      // Pair returned items to local items in order; server may include
      // per-file errors in the array.
      setItems((prev) =>
        prev.map((it) => {
          const idx = newItems.findIndex((n) => n.localId === it.localId);
          if (idx === -1) return it;
          const u = uploaded[idx] as UploadedFile | undefined;
          if (!u || (u as { error?: string }).error || !u.id) {
            return {
              ...it,
              status: "error",
              error: (u as { error?: string } | undefined)?.error || "Upload failed",
              progress: 100,
            };
          }
          return { ...it, status: "ready", progress: 100, uploaded: u };
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Upload failed: ${msg}`);
      setItems((prev) =>
        prev.map((it) =>
          newItems.some((n) => n.localId === it.localId)
            ? { ...it, status: "error", error: msg }
            : it,
        ),
      );
    }
  };

  return { addFiles };
}
