import { useState } from "react";
import { Plus, Trash2, Pencil, Brain } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import {
  useCreateMemory,
  useDeleteMemory,
  useMemories,
  useUpdateMemory,
} from "@/lib/memories";
import type { Memory } from "@/types/chat";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function MemoriesPage() {
  const { data: memories = [], isLoading } = useMemories();
  const createMutation = useCreateMemory();
  const updateMutation = useUpdateMemory();
  const deleteMutation = useDeleteMemory();

  const [editing, setEditing] = useState<Memory | null>(null);
  const [creating, setCreating] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [deleting, setDeleting] = useState<Memory | null>(null);

  const openCreate = () => {
    setKeyDraft("");
    setValueDraft("");
    setCreating(true);
  };
  const openEdit = (m: Memory) => {
    setEditing(m);
    setKeyDraft(m.key);
    setValueDraft(m.value);
  };
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = () => {
    const k = keyDraft.trim();
    const v = valueDraft.trim();
    if (!k || !v) return;
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, key: k, value: v },
        {
          onSuccess: () => {
            toast.success("Memory updated");
            closeForm();
          },
        },
      );
    } else {
      createMutation.mutate(
        { key: k, value: v },
        {
          onSuccess: () => {
            toast.success("Memory saved");
            closeForm();
          },
        },
      );
    }
  };

  return (
    <AppShell
      headerCenter={<span className="text-sm font-medium">Memories</span>}
      headerRight={
        <Button
          size="sm"
          onClick={openCreate}
          className="gap-1"
          data-testid="button-add-memory"
        >
          <Plus className="h-4 w-4" />
          Add memory
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <Brain className="h-5 w-5 flex-shrink-0 text-primary" />
          <div>
            <p className="font-medium">Long-term memory</p>
            <p className="text-xs text-muted-foreground">
              Facts EzboAI remembers about you across conversations. Add manually
              or ask in chat ("remember my name is …") and it's saved automatically.
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading...</p>
        ) : memories.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center">
            <Brain className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">No memories yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one manually or ask in chat to remember something.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div
                key={m.id}
                className="group flex items-start gap-3 rounded-lg border bg-card p-3"
                data-testid={`memory-${m.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {m.key}
                    </code>
                    <Badge variant="outline" className="text-[10px]">
                      {m.source}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm">{m.value}</p>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(m)}
                    aria-label="Edit memory"
                    data-testid={`button-edit-memory-${m.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleting(m)}
                    aria-label="Delete memory"
                    data-testid={`button-delete-memory-${m.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit memory" : "Add memory"}</DialogTitle>
            <DialogDescription>
              A short snake_case key and the value EzboAI should remember.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Key</label>
              <Input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="user_name"
                data-testid="input-memory-key"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Value</label>
              <Textarea
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                placeholder="Rakib"
                rows={4}
                data-testid="input-memory-value"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              disabled={
                !keyDraft.trim() ||
                !valueDraft.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              onClick={submit}
              data-testid="button-save-memory"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this memory?</AlertDialogTitle>
            <AlertDialogDescription>
              EzboAI will no longer recall "{deleting?.key}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) {
                  deleteMutation.mutate(deleting.id, {
                    onSuccess: () => toast.success("Deleted"),
                  });
                  setDeleting(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
