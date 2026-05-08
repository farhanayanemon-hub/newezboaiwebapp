import { useState } from "react";
import { Folder, FolderInput, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuth } from "@/lib/auth";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRenameProject,
  type Project,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ProjectsSectionProps {
  selected: string | undefined;
  onSelect: (filter: string | undefined) => void;
}

/**
 * Projects sidebar group. Only shown for logged-in users; guests get nothing
 * here (projects are auth-only).
 *
 * `selected`:
 *   - undefined → "All chats"
 *   - "unfiled" → "Unfiled"
 *   - "<uuid>"  → that project
 */
export function ProjectsSection({ selected, onSelect }: ProjectsSectionProps) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const { data: projects = [], isLoading } = useProjects(isLoggedIn);
  const createMutation = useCreateProject();
  const renameMutation = useRenameProject();
  const deleteMutation = useDeleteProject();

  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  const submitCreate = () => {
    const name = createName.trim();
    if (!name) return;
    createMutation.mutate(name, {
      onSuccess: (p) => {
        toast.success("Project created");
        onSelect(p.id);
      },
      onError: () => toast.error("Could not create project"),
    });
    setCreating(false);
    setCreateName("");
  };

  const submitRename = () => {
    if (!renaming) return;
    const name = renameName.trim();
    if (!name) return;
    renameMutation.mutate(
      { id: renaming.id, name },
      {
        onSuccess: () => toast.success("Renamed"),
        onError: () => toast.error("Could not rename"),
      },
    );
    setRenaming(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const wasSelected = selected === deleting.id;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Project deleted");
        if (wasSelected) onSelect(undefined);
      },
      onError: () => toast.error("Could not delete"),
    });
    setDeleting(null);
  };

  const renderRow = (
    label: string,
    filter: string | undefined,
    icon: React.ReactNode,
    project?: Project,
  ) => {
    const isActive = selected === filter;
    return (
      <div
        key={filter ?? "all"}
        className={cn(
          "group/proj relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover-elevate active-elevate-2",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/85",
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(filter)}
          className="flex flex-1 min-w-0 items-center gap-2 text-left text-sm focus:outline-none"
          data-testid={`project-${filter ?? "all"}`}
        >
          {icon}
          <span className="truncate">{label}</span>
        </button>
        {project && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover/proj:opacity-100 hover-elevate active-elevate-2 data-[state=open]:opacity-100"
                aria-label="Project options"
                data-testid={`project-menu-${project.id}`}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[8rem]">
              <DropdownMenuItem
                onClick={() => {
                  setRenaming(project);
                  setRenameName(project.name);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleting(project)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Projects
        </p>
        {isLoggedIn && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover-elevate active-elevate-2"
            aria-label="New project"
            onClick={() => {
              setCreating(true);
              setCreateName("");
            }}
            data-testid="button-new-project"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="space-y-0.5">
        {renderRow(
          "All chats",
          undefined,
          <FolderInput className="h-3.5 w-3.5 flex-shrink-0" />,
        )}
        {isLoggedIn &&
          renderRow(
            "Unfiled",
            "unfiled",
            <Folder className="h-3.5 w-3.5 flex-shrink-0" />,
          )}
        {isLoggedIn && isLoading && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Loading...
          </p>
        )}
        {isLoggedIn &&
          projects.map((p) =>
            renderRow(
              p.name,
              p.id,
              <Folder className="h-3.5 w-3.5 flex-shrink-0" />,
              p,
            ),
          )}
        {!isLoggedIn && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Log in to create projects.
          </p>
        )}
      </div>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group related chats into a project folder.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Project name..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
            }}
            data-testid="input-new-project"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={!createName.trim() || createMutation.isPending}
              onClick={submitCreate}
              data-testid="button-confirm-new-project"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Choose a new name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
            }}
            data-testid="input-rename-project"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameName.trim() || renameMutation.isPending}
              onClick={submitRename}
              data-testid="button-confirm-rename-project"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" will be deleted. The chats inside it will not
              be deleted — they will move to "Unfiled".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              data-testid="button-confirm-delete-project"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
