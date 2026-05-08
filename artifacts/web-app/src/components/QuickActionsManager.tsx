import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ICON_REGISTRY,
  resolveIcon,
  useCustomQuickActions,
  useCreateQuickAction,
  useUpdateQuickAction,
  useDeleteQuickAction,
  useReorderQuickActions,
  type CustomQuickAction,
  type QuickActionTaskType,
  type QuickActionFormValues,
} from "@/lib/quickActions";

const TASK_TYPES: QuickActionTaskType[] = [
  "chat-smart",
  "chat-fast",
  "code",
  "long-context",
  "vision",
];

interface SortableRowProps {
  action: CustomQuickAction;
  onEdit: (a: CustomQuickAction) => void;
  onDelete: (a: CustomQuickAction) => void;
}

function SortableRow({ action, onEdit, onDelete }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: action.id });
  const Icon = action.icon;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-card p-2 hover-elevate"
      data-testid={`custom-action-row-${action.id}`}
    >
      <button
        type="button"
        className="flex h-7 w-7 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{action.label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {action.taskType} · {action.promptTemplate}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onEdit(action)}
        data-testid={`edit-action-${action.id}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onDelete(action)}
        data-testid={`delete-action-${action.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function QuickActionsManager() {
  const { data: actions = [] } = useCustomQuickActions();
  const create = useCreateQuickAction();
  const update = useUpdateQuickAction();
  const remove = useDeleteQuickAction();
  const reorder = useReorderQuickActions();

  const [editing, setEditing] = useState<CustomQuickAction | null>(null);
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = actions.findIndex((a) => a.id === e.active.id);
    const newIdx = actions.findIndex((a) => a.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(actions, oldIdx, newIdx);
    reorder.mutate(next.map((a) => a.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Reorder by dragging. Custom actions appear after built-ins in the chat.
        </p>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          data-testid="button-add-quick-action"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      {actions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No custom actions yet.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={actions.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {actions.map((a) => (
                <SortableRow
                  key={a.id}
                  action={a}
                  onEdit={setEditing}
                  onDelete={(action) => {
                    if (confirm(`Delete "${action.label}"?`)) {
                      remove.mutate(action.id);
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {creating && (
        <QuickActionEditor
          open
          title="New Quick Action"
          initial={{
            name: "",
            icon: "Wand2",
            promptTemplate: "{input}",
            taskType: "chat-smart",
          }}
          submitting={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            setCreating(false);
          }}
        />
      )}

      {editing && (
        <QuickActionEditor
          open
          title="Edit Quick Action"
          initial={{
            name: editing.label,
            icon: editing.iconName,
            promptTemplate: editing.promptTemplate,
            taskType: editing.taskType,
          }}
          submitting={update.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: editing.id, values });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface QuickActionEditorProps {
  open: boolean;
  title: string;
  initial: QuickActionFormValues;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: QuickActionFormValues) => Promise<void> | void;
}

function QuickActionEditor({
  open,
  title,
  initial,
  submitting,
  onCancel,
  onSubmit,
}: QuickActionEditorProps) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [template, setTemplate] = useState(initial.promptTemplate);
  const [taskType, setTaskType] = useState<QuickActionTaskType>(initial.taskType);

  const canSubmit = name.trim().length > 0 && template.trim().length > 0;
  const PreviewIcon = resolveIcon(icon);
  const iconNames = Object.keys(ICON_REGISTRY);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-quick-action-editor">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Use <code>{`{input}`}</code> in the template — it gets replaced
            with the user&apos;s text (safely wrapped to prevent injection).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-name">Name</Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fact-check"
              data-testid="input-qa-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Icon{" "}
                <PreviewIcon className="inline h-3.5 w-3.5 text-muted-foreground" />
              </Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger data-testid="select-qa-icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconNames.map((n) => {
                    const I = ICON_REGISTRY[n];
                    return (
                      <SelectItem key={n} value={n}>
                        <span className="inline-flex items-center gap-2">
                          <I className="h-3.5 w-3.5" />
                          {n}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Task type</Label>
              <Select
                value={taskType}
                onValueChange={(v) => setTaskType(v as QuickActionTaskType)}
              >
                <SelectTrigger data-testid="select-qa-tasktype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-template">Prompt template</Label>
            <Textarea
              id="qa-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              placeholder="Summarize the following in 3 bullets:&#10;&#10;{input}"
              data-testid="textarea-qa-template"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                name: name.trim(),
                icon,
                promptTemplate: template.trim(),
                taskType,
              })
            }
            disabled={!canSubmit || submitting}
            data-testid="button-save-quick-action"
          >
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
