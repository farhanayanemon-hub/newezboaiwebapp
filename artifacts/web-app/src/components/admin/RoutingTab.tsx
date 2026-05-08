import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, GripVertical, Plus, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import {
  PROVIDER_LABELS,
  TASK_DESCRIPTIONS,
  TASK_LABELS,
  TASK_TYPES,
  type ProviderRow,
  type ProvidersResponse,
  type ProviderSlug,
  type RoutingCandidate,
  type TaskType,
} from "./types";

interface RulesResponse {
  rules: Record<string, RoutingCandidate[]>;
}

export function RoutingTab() {
  const [rules, setRules] = useState<Record<TaskType, RoutingCandidate[]>>(() => {
    const init = {} as Record<TaskType, RoutingCandidate[]>;
    for (const t of TASK_TYPES) init[t] = [];
    return init;
  });
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [rulesRes, provRes] = await Promise.all([
        apiClient.get<RulesResponse>("/admin/routing-rules"),
        apiClient.get<ProvidersResponse>("/admin/providers"),
      ]);
      const merged = {} as Record<TaskType, RoutingCandidate[]>;
      for (const t of TASK_TYPES) merged[t] = rulesRes.rules[t] ?? [];
      setRules(merged);
      setProviders(provRes.providers);
    } catch {
      toast.error("Failed to load routing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put("/admin/routing-rules", {
        rules: TASK_TYPES.map((t) => ({ taskType: t, providerOrder: rules[t] })),
      });
      toast.success("Routing saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const updateRule = (task: TaskType, fn: (prev: RoutingCandidate[]) => RoutingCandidate[]) => {
    setRules((p) => ({ ...p, [task]: fn(p[task]) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Drag to reorder fallback chains. The first available provider for each task is used,
          and on failure the next is tried.
        </p>
        <Button onClick={handleSave} disabled={saving} data-testid="button-save-routing">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
      </div>

      <div className="space-y-3">
        {TASK_TYPES.map((task) => (
          <TaskRuleCard
            key={task}
            task={task}
            order={rules[task]}
            providers={providers}
            onChange={(fn) => updateRule(task, fn)}
          />
        ))}
      </div>
    </div>
  );
}

interface TaskRuleCardProps {
  task: TaskType;
  order: RoutingCandidate[];
  providers: ProviderRow[];
  onChange: (fn: (prev: RoutingCandidate[]) => RoutingCandidate[]) => void;
}

function TaskRuleCard({ task, order, providers, onChange }: TaskRuleCardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const items = useMemo(
    () => order.map((c, i) => ({ ...c, _key: `${c.provider}:${c.model}:${i}` })),
    [order],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i._key === active.id);
    const newIndex = items.findIndex((i) => i._key === over.id);
    onChange((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const handleRemove = (idx: number) => {
    onChange((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Card className="p-4" data-testid={`task-card-${task}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{TASK_LABELS[task]}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{TASK_DESCRIPTIONS[task]}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          {task}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i._key)} strategy={verticalListSortingStrategy}>
            {items.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                No providers in chain. Add one below.
              </p>
            )}
            {items.map((item, idx) => (
              <SortableRow
                key={item._key}
                id={item._key}
                provider={item.provider}
                model={item.model}
                index={idx}
                onRemove={() => handleRemove(idx)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <AddCandidateRow
          providers={providers}
          onAdd={(c) => onChange((prev) => [...prev, c])}
        />
      </div>
    </Card>
  );
}

interface SortableRowProps {
  id: string;
  provider: string;
  model: string;
  index: number;
  onRemove: () => void;
}

function SortableRow({ id, provider, model, index, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
        {index + 1}
      </span>
      <span className="text-xs font-medium capitalize">
        {PROVIDER_LABELS[provider as ProviderSlug] ?? provider}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{model}</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface AddCandidateRowProps {
  providers: ProviderRow[];
  onAdd: (c: RoutingCandidate) => void;
}

function AddCandidateRow({ providers, onAdd }: AddCandidateRowProps) {
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");

  const selected = providers.find((p) => p.provider === provider);
  const availableModels = selected?.enabledModels ?? [];

  return (
    <div className="flex items-center gap-2 pt-1">
      <Select value={provider} onValueChange={(v) => { setProvider(v); setModel(""); }}>
        <SelectTrigger className="h-8 w-[10rem] text-xs">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {providers
            .filter((p) => p.enabled)
            .map((p) => (
              <SelectItem key={p.id} value={p.provider}>
                {PROVIDER_LABELS[p.provider as ProviderSlug] ?? p.provider}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Select value={model} onValueChange={setModel} disabled={!provider || availableModels.length === 0}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder={availableModels.length === 0 ? "No models enabled" : "Model"} />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m} value={m} className="font-mono text-xs">
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="outline"
        disabled={!provider || !model}
        onClick={() => {
          onAdd({ provider, model });
          setProvider("");
          setModel("");
        }}
        className="gap-1"
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  );
}
