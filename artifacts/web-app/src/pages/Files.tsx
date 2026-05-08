import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Trash2,
  X,
  Upload,
  FileText,
  FileSpreadsheet,
  FileCode2,
  FileImage,
  File as FileIcon,
  ExternalLink,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useFiles,
  useFile,
  useDeleteFile,
  useBulkDeleteFiles,
  fileServingUrl,
  formatFileSize,
  uploadFiles,
  type FileKind,
  type FileListItem,
} from "@/lib/files";
import { useChatStore } from "@/stores/chatStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<FileKind | "all", string> = {
  all: "All types",
  image: "Images",
  pdf: "PDF",
  word: "Word",
  spreadsheet: "Spreadsheet",
  text: "Text",
  code: "Code",
  other: "Other",
};

function iconFor(kind: FileKind): typeof FileIcon {
  switch (kind) {
    case "image":
      return FileImage;
    case "pdf":
    case "word":
    case "text":
      return FileText;
    case "spreadsheet":
      return FileSpreadsheet;
    case "code":
      return FileCode2;
    default:
      return FileIcon;
  }
}

export default function FilesPage() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const setPendingAttachments = useChatStore((s) => s.setPendingAttachments);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: files = [], refetch, isFetching } = useFiles(
    debounced,
    kindFilter === "all" ? "" : kindFilter,
  );
  const previewQuery = useFile(previewId);
  const deleteOne = useDeleteFile();
  const bulkDelete = useBulkDeleteFiles();

  const allChecked = files.length > 0 && files.every((f) => selected.has(f.id));
  const someChecked = !allChecked && files.some((f) => selected.has(f.id));

  const toggleAll = () => {
    if (allChecked || someChecked) setSelected(new Set());
    else setSelected(new Set(files.map((f) => f.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    setConfirmBulkDelete(false);
    try {
      await bulkDelete.mutateAsync(ids);
      toast.success(`Deleted ${ids.length} file(s)`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    }
  };

  const handleUploadInput = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;
    setUploading(true);
    try {
      const result = await uploadFiles(filesToUpload);
      const errors = result.filter((r) => (r as { error?: string }).error);
      if (errors.length > 0) {
        toast.warning(`${errors.length} file(s) failed to upload.`);
      }
      const ok = result.filter((r) => r.id).length;
      if (ok > 0) toast.success(`Uploaded ${ok} file(s)`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const attachToNewChat = (file: FileListItem) => {
    setPendingAttachments([file.id]);
    setActiveConversation(null);
    setPreviewId(null);
    setLocation("/");
    toast.success(`"${file.originalName}" attached — start your message.`);
  };

  const headerRight = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {selected.size > 0 && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkDelete(true)}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete {selected.size}
          </Button>
        )}
        <label>
          <input
            type="file"
            multiple
            hidden
            data-testid="input-files-upload"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) handleUploadInput(list);
              if (e.target) e.target.value = "";
            }}
          />
          <Button asChild size="sm" disabled={uploading}>
            <span className="cursor-pointer">
              <Upload className="mr-1.5 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload"}
            </span>
          </Button>
        </label>
      </div>
    ),
    [selected.size, uploading],
  );

  return (
    <AppShell
      headerCenter={<h1 className="text-sm font-semibold">File Library</h1>}
      headerRight={headerRight}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by file name or content…"
              className="pl-9"
              data-testid="input-search-files"
            />
          </div>
          <Select
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as FileKind | "all")}
          >
            <SelectTrigger className="w-full sm:w-44" data-testid="select-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as Array<FileKind | "all">).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {files.length > 0 && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Select all"
                data-testid="checkbox-select-all"
              />
              <span>Select all</span>
            </div>
          )}
        </div>

        {isFetching && files.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl border border-border/40 bg-muted/30"
              />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
            <FileIcon className="h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 text-sm font-medium">No files yet</h3>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Upload PDFs, Word docs, spreadsheets, code, or images. They'll be
              available to attach to any chat.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {files.map((f) => {
              const Icon = iconFor(f.kind as FileKind);
              const isSelected = selected.has(f.id);
              return (
                <div
                  key={f.id}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left text-xs shadow-sm transition-shadow hover:shadow-md",
                    isSelected ? "border-primary ring-2 ring-primary/30" : "border-border",
                  )}
                  data-testid={`file-card-${f.id}`}
                >
                  <div className="absolute left-2 top-2 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(f.id)}
                      aria-label={`Select ${f.originalName}`}
                      className="bg-background/80 backdrop-blur-sm"
                      data-testid={`checkbox-${f.id}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewId(f.id)}
                    className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted/40 hover-elevate"
                  >
                    {f.kind === "image" ? (
                      <img
                        src={fileServingUrl(f.id)}
                        alt={f.originalName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Icon className="h-12 w-12 text-muted-foreground/70" />
                    )}
                  </button>
                  <div className="flex flex-1 flex-col gap-0.5 p-2">
                    <span
                      className="truncate font-medium"
                      title={f.originalName}
                    >
                      {f.originalName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {KIND_LABELS[f.kind as FileKind] ?? f.kind} ·{" "}
                      {formatFileSize(f.sizeBytes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <span className="truncate">
                {previewQuery.data?.originalName ?? "Loading…"}
              </span>
            </DialogTitle>
          </DialogHeader>
          {previewQuery.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {KIND_LABELS[previewQuery.data.kind as FileKind] ??
                    previewQuery.data.kind}
                </span>
                <span>{formatFileSize(previewQuery.data.sizeBytes)}</span>
                {previewQuery.data.mimeType && (
                  <span className="font-mono">{previewQuery.data.mimeType}</span>
                )}
              </div>
              {previewQuery.data.kind === "image" ? (
                <a
                  href={fileServingUrl(previewQuery.data.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={fileServingUrl(previewQuery.data.id)}
                    alt={previewQuery.data.originalName}
                    className="max-h-[55vh] w-full rounded-md object-contain"
                  />
                </a>
              ) : previewQuery.data.extractedText ? (
                <ScrollArea className="h-[45vh] rounded-md border bg-muted/30 p-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                    {previewQuery.data.extractedText.slice(0, 50_000)}
                    {previewQuery.data.extractedText.length > 50_000 && "\n…"}
                  </pre>
                </ScrollArea>
              ) : previewQuery.data.extractError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  Could not extract text: {previewQuery.data.extractError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No text preview available for this file type.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-1 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!previewQuery.data}
                asChild
              >
                <a
                  href={previewQuery.data ? fileServingUrl(previewQuery.data.id, true) : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Download
                </a>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!previewQuery.data || deleteOne.isPending}
                onClick={async () => {
                  if (!previewQuery.data) return;
                  try {
                    await deleteOne.mutateAsync(previewQuery.data.id);
                    toast.success("Deleted");
                    setPreviewId(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Delete failed");
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
            </div>
            <Button
              size="sm"
              disabled={!previewQuery.data}
              onClick={() => previewQuery.data && attachToNewChat(previewQuery.data)}
              data-testid="button-attach-to-new-chat"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Attach to new chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} file(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file rows. Existing messages that
              reference these files will keep their attachment metadata but
              the file will no longer be downloadable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
