import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Loader2,
  KeyRound,
  Sparkle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import {
  PROVIDER_LABELS,
  PROVIDER_SLUGS,
  type ProviderRow,
  type ProvidersResponse,
  type ProviderSlug,
} from "./types";

export function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiClient.get<ProvidersResponse>("/admin/providers");
      setProviders(res.providers);
    } catch {
      toast.error("Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = async (row: ProviderRow, enabled: boolean) => {
    setProviders((p) => p.map((x) => (x.id === row.id ? { ...x, enabled } : x)));
    try {
      await apiClient.patch(`/admin/providers/${row.id}`, { enabled });
    } catch {
      toast.error("Update failed");
      refresh();
    }
  };

  const handleDelete = async (row: ProviderRow) => {
    if (!confirm(`Delete the ${PROVIDER_LABELS[row.provider as ProviderSlug] ?? row.provider} key "${row.label || "(unnamed)"}"?`)) return;
    try {
      await apiClient.delete(`/admin/providers/${row.id}`);
      toast.success("Provider key deleted");
      refresh();
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleTest = async (row: ProviderRow) => {
    setTestingId(row.id);
    try {
      const res = await apiClient.post<{ ok: boolean; error?: string; latencyMs: number }>(
        `/admin/providers/${row.id}/test`,
      );
      if (res.ok) toast.success(`Connected · ${res.latencyMs}ms`);
      else toast.error(res.error ?? "Test failed");
      refresh();
    } catch {
      toast.error("Test failed");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add API keys for each provider you want to use. Keys are encrypted at rest.
        </p>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5" data-testid="button-add-provider">
          <Plus className="h-4 w-4" /> Add Key
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : providers.length === 0 ? (
        <Card className="border-dashed py-16 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No provider keys yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add an OpenAI, Anthropic, or other provider key to get started.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Enabled</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {providers.map((p) => (
                  <tr key={p.id} data-testid={`provider-row-${p.id}`} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      {PROVIDER_LABELS[p.provider as ProviderSlug] ?? p.provider}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.label || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.maskedKey}
                    </td>
                    <td className="px-4 py-3">
                      {p.lastTestStatus === "ok" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </span>
                      ) : p.lastTestStatus === "error" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                          title={p.lastTestError ?? undefined}
                        >
                          <XCircle className="h-3 w-3" /> Error
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Untested</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(v) => handleToggle(p, v)}
                        data-testid={`switch-enabled-${p.id}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(p)}
                          disabled={testingId === p.id}
                          className="gap-1.5"
                          data-testid={`button-test-${p.id}`}
                        >
                          {testingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkle className="h-3 w-3" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(p)}
                          aria-label="Delete"
                          data-testid={`button-delete-${p.id}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddProviderDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onAdded={() => {
          setShowAdd(false);
          refresh();
        }}
      />
    </div>
  );
}

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}

function AddProviderDialog({ open, onOpenChange, onAdded }: AddProviderDialogProps) {
  const [provider, setProvider] = useState<ProviderSlug>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setProvider("openai");
    setLabel("");
    setApiKey("");
  };

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post("/admin/providers", {
        provider,
        label: label.trim(),
        apiKey: apiKey.trim(),
      });
      toast.success("Provider key added");
      reset();
      onAdded();
    } catch {
      toast.error("Failed to add key");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add provider key</DialogTitle>
          <DialogDescription>
            Your key is encrypted with AES-256-GCM before being stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderSlug)}>
              <SelectTrigger data-testid="select-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_SLUGS.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {PROVIDER_LABELS[slug]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Label (optional)
            </label>
            <Input
              placeholder="e.g. Personal, Work, Team"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="input-provider-label"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API Key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              data-testid="input-api-key"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!apiKey || submitting}
            data-testid="button-submit-provider"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
