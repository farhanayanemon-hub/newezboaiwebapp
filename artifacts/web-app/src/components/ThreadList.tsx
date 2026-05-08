import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Folder, FolderInput, FolderMinus, MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  startOfDay,
  startOfWeek,
  isSameDay,
  subDays,
  isAfter,
} from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useChatStore } from "@/stores/chatStore";
import {
  useConversations,
  useDeleteConversation,
  useRenameConversation,
  useSearchConversations,
} from "@/lib/conversations";
import { useAuth } from "@/lib/auth";
import { useMoveConversation, useProjects } from "@/lib/projects";
import type { Thread } from "@/types/chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ThreadListProps {
  searchQuery: string;
  /** undefined = all, "unfiled" = no project, "<uuid>" = that project */
  projectFilter?: string | undefined;
  onThreadSelected?: () => void;
}

interface GroupedThreads {
  label: string;
  threads: Thread[];
}

function groupThreads(threads: Thread[]): GroupedThreads[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subDays(today, 1);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const groups: GroupedThreads[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "This week", threads: [] },
    { label: "Older", threads: [] },
  ];

  for (const t of threads) {
    const updated = new Date(t.updatedAt);
    if (isSameDay(updated, today)) groups[0].threads.push(t);
    else if (isSameDay(updated, yesterday)) groups[1].threads.push(t);
    else if (isAfter(updated, weekStart)) groups[2].threads.push(t);
    else groups[3].threads.push(t);
  }

  return groups.filter((g) => g.threads.length > 0);
}

export function ThreadList({
  searchQuery,
  projectFilter,
  onThreadSelected,
}: ThreadListProps) {
  const [, setLocation] = useLocation();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const { data: threads = [], isLoading } = useConversations(projectFilter);
  const { data: searchResults = [] } = useSearchConversations(searchQuery);
  const { data: projects = [] } = useProjects(isLoggedIn);
  const renameMutation = useRenameConversation();
  const deleteMutation = useDeleteConversation();
  const moveMutation = useMoveConversation();

  const [renamingThread, setRenamingThread] = useState<Thread | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingThread, setDeletingThread] = useState<Thread | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return threads;
    // Combine: server-side FTS hits (full message search) + local title matches.
    const matchedIds = new Set(searchResults.map((r) => r.conversationId));
    const ql = q.toLowerCase();
    return threads.filter(
      (t) => matchedIds.has(t.id) || t.title.toLowerCase().includes(ql),
    );
  }, [threads, searchResults, searchQuery]);

  const grouped = useMemo(() => groupThreads(filtered), [filtered]);

  const openThread = (id: string) => {
    setActiveConversation(id);
    setLocation(`/?c=${id}`);
    onThreadSelected?.();
  };

  if (isLoading) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading...</p>;
  }

  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sidebar-border bg-sidebar-accent/30 px-3 py-8 text-center">
        <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <p className="mt-2 text-xs text-muted-foreground">No chats yet</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          Click + New Chat to begin
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No matches found
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {grouped.map((group) => (
          <div key={group.label}>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.threads.map((thread) => {
                const isActive = thread.id === activeConversationId;
                const preview = thread.preview || "Empty chat";
                return (
                  <div
                    key={thread.id}
                    className={cn(
                      "group/thread relative flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover-elevate active-elevate-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/85",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openThread(thread.id)}
                      className="flex-1 min-w-0 text-left focus:outline-none"
                      data-testid={`thread-${thread.id}`}
                    >
                      <p className="truncate text-sm font-medium">{thread.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {preview}
                      </p>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0 opacity-0 transition-opacity group-hover/thread:opacity-100 hover-elevate active-elevate-2 data-[state=open]:opacity-100"
                          aria-label="Thread options"
                          data-testid={`thread-menu-${thread.id}`}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[10rem]">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenamingThread(thread);
                            setRenameValue(thread.title);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Rename
                        </DropdownMenuItem>
                        {isLoggedIn && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FolderInput className="mr-2 h-3.5 w-3.5" />
                              Move to project
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="min-w-[10rem] max-h-64 overflow-auto">
                                {projects.length === 0 && (
                                  <DropdownMenuItem disabled>
                                    No projects yet
                                  </DropdownMenuItem>
                                )}
                                {projects.map((p) => (
                                  <DropdownMenuItem
                                    key={p.id}
                                    disabled={thread.projectId === p.id}
                                    onClick={() =>
                                      moveMutation.mutate(
                                        {
                                          conversationId: thread.id,
                                          projectId: p.id,
                                        },
                                        {
                                          onSuccess: () =>
                                            toast.success(`Moved to "${p.name}"`),
                                          onError: () =>
                                            toast.error("Could not move"),
                                        },
                                      )
                                    }
                                    data-testid={`move-to-${p.id}`}
                                  >
                                    <Folder className="mr-2 h-3.5 w-3.5" />
                                    {p.name}
                                  </DropdownMenuItem>
                                ))}
                                {thread.projectId && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        moveMutation.mutate(
                                          {
                                            conversationId: thread.id,
                                            projectId: null,
                                          },
                                          {
                                            onSuccess: () =>
                                              toast.success("Removed from project"),
                                            onError: () =>
                                              toast.error("Could not move"),
                                          },
                                        )
                                      }
                                      data-testid={`unfile-${thread.id}`}
                                    >
                                      <FolderMinus className="mr-2 h-3.5 w-3.5" />
                                      Remove from project
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingThread(thread)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!renamingThread} onOpenChange={(o) => !o && setRenamingThread(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Give this chat a new title</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat title..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && renamingThread && renameValue.trim()) {
                renameMutation.mutate(
                  { id: renamingThread.id, title: renameValue.trim() },
                  { onSuccess: () => toast.success("Renamed") },
                );
                setRenamingThread(null);
              }
            }}
            data-testid="input-rename-thread"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingThread(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || renameMutation.isPending}
              onClick={() => {
                if (renamingThread && renameValue.trim()) {
                  renameMutation.mutate(
                    { id: renamingThread.id, title: renameValue.trim() },
                    { onSuccess: () => toast.success("Renamed") },
                  );
                  setRenamingThread(null);
                }
              }}
              data-testid="button-confirm-rename"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingThread} onOpenChange={(o) => !o && setDeletingThread(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingThread?.title}" and all its messages will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingThread) {
                  const wasActive = deletingThread.id === activeConversationId;
                  deleteMutation.mutate(deletingThread.id, {
                    onSuccess: () => {
                      toast.success("Chat deleted");
                      if (wasActive) {
                        setActiveConversation(null);
                        setLocation("/");
                      }
                    },
                  });
                  setDeletingThread(null);
                }
              }}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
