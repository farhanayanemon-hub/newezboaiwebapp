import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Server, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  type ProviderRow,
  type ProviderSlug,
  type ProviderModelRow,
  type ProvidersResponse,
} from "./types";

interface ModelsResponse {
  models: ProviderModelRow[];
  enabledModels: string[];
}

export function ModelsTab() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [models, setModels] = useState<ProviderModelRow[]>([]);
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set());
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient
      .get<ProvidersResponse>("/admin/providers")
      .then((res) => {
        setProviders(res.providers);
        if (res.providers[0]) setSelectedId(res.providers[0].id);
      })
      .catch(() => toast.error("Failed to load providers"))
      .finally(() => setLoadingProviders(false));
  }, []);

  const loadModels = useCallback(async (id: number) => {
    setLoadingModels(true);
    try {
      const res = await apiClient.get<ModelsResponse>(`/admin/providers/${id}/models`);
      setModels(res.models);
      setEnabledModels(new Set(res.enabledModels));
    } catch {
      toast.error("Failed to load models. Check the API key.");
      setModels([]);
      setEnabledModels(new Set());
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId !== null) loadModels(selectedId);
  }, [selectedId, loadModels]);

  const toggleModel = (id: string) => {
    setEnabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedId === null) return;
    setSaving(true);
    try {
      await apiClient.patch(`/admin/providers/${selectedId}`, {
        enabledModels: Array.from(enabledModels),
      });
      toast.success("Models updated");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, search]);

  if (loadingProviders) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <Card className="border-dashed py-16 text-center">
        <Server className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">No providers configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a provider key first to enable models.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem]">
          <Select
            value={selectedId !== null ? String(selectedId) : ""}
            onValueChange={(v) => setSelectedId(Number(v))}
          >
            <SelectTrigger data-testid="select-models-provider">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {PROVIDER_LABELS[p.provider as ProviderSlug] ?? p.provider}
                  {p.label ? ` · ${p.label}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedId !== null && loadModels(selectedId)}
          className="gap-1.5"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </Button>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {enabledModels.size} enabled
          <Button
            onClick={handleSave}
            disabled={saving || selectedId === null}
            data-testid="button-save-models"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </div>

      {loadingModels ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed py-12 text-center text-sm text-muted-foreground">
          No models found
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {filtered.map((m) => {
            const checked = enabledModels.has(m.id);
            return (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30"
                data-testid={`model-row-${m.id}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleModel(m.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-xs">{m.id}</p>
                  {(m.contextWindow || m.capabilities?.length) && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {m.contextWindow
                        ? `${m.contextWindow.toLocaleString()} ctx`
                        : null}
                      {m.contextWindow && m.capabilities?.length ? " · " : ""}
                      {m.capabilities?.join(", ")}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </Card>
      )}
    </div>
  );
}
