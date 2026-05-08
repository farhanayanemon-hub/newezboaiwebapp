import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

type TaskType = "chat-fast" | "chat-smart";

interface TierRow {
  tier: "standard" | "mini" | "pro";
  label: string;
  description: string;
  taskType: TaskType;
  promptAddon: string;
}

interface ApiResponse {
  tiers: TierRow[];
  taskTypes: readonly TaskType[];
}

const ORDER: Array<TierRow["tier"]> = ["mini", "standard", "pro"];

const DEFAULTS: Record<TierRow["tier"], TierRow> = {
  standard: {
    tier: "standard",
    label: "Ezbo 1.0",
    description: "Balanced everyday assistant",
    taskType: "chat-smart",
    promptAddon: "",
  },
  mini: {
    tier: "mini",
    label: "Ezbo 1.0 Mini",
    description: "Fast, concise replies",
    taskType: "chat-fast",
    promptAddon:
      "\n\nResponse style: be concise. Prefer short, direct answers — usually 1-3 sentences. Skip preamble. Only expand when the user explicitly asks for detail.",
  },
  pro: {
    tier: "pro",
    label: "Ezbo 1.0 Pro (Beta)",
    description: "Deeper reasoning, longer answers",
    taskType: "chat-smart",
    promptAddon:
      "\n\nResponse style: take extra care. Reason step-by-step internally before answering. Provide thorough, well-structured responses with examples and clear sections (use Markdown headings or bullet lists when helpful). Prefer accuracy over speed.",
  },
};

export function EzboTiersTab() {
  const [rows, setRows] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient
      .get<ApiResponse>("/admin/ezbo-tiers")
      .then((res) => {
        const byId = new Map(res.tiers.map((t) => [t.tier, t]));
        setRows(ORDER.map((id) => byId.get(id) ?? DEFAULTS[id]));
      })
      .catch(() => {
        // Brand-new install — no rows yet. Show defaults so admin can save.
        setRows(ORDER.map((id) => DEFAULTS[id]));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const update = (tier: TierRow["tier"], patch: Partial<TierRow>) => {
    setRows((prev) => prev.map((r) => (r.tier === tier ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put("/admin/ezbo-tiers", { tiers: rows });
      toast.success("Ezbo model instructions saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = (tier: TierRow["tier"]) => {
    update(tier, DEFAULTS[tier]);
    toast.info("Reset to default — click Save to apply");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Customize how each Ezbo tier behaves. The instructions below are
            appended to the base system prompt for every chat using that tier.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
          data-testid="button-save-ezbo-tiers"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <Card key={row.tier}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">
                    {row.label || DEFAULTS[row.tier].label}
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResetToDefault(row.tier)}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCcw className="h-3 w-3" />
                  Reset to default
                </Button>
              </div>
              <CardDescription className="text-xs">
                Tier id: <code className="rounded bg-muted px-1">ezbo:{row.tier}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`label-${row.tier}`} className="text-xs">
                    Display label
                  </Label>
                  <Input
                    id={`label-${row.tier}`}
                    value={row.label}
                    onChange={(e) => update(row.tier, { label: e.target.value })}
                    data-testid={`input-tier-label-${row.tier}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`task-${row.tier}`} className="text-xs">
                    Routing tier (cost / speed)
                  </Label>
                  <Select
                    value={row.taskType}
                    onValueChange={(v) =>
                      update(row.tier, { taskType: v as TaskType })
                    }
                  >
                    <SelectTrigger id={`task-${row.tier}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat-fast">
                        chat-fast (cheap, low latency)
                      </SelectItem>
                      <SelectItem value="chat-smart">
                        chat-smart (best quality)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`desc-${row.tier}`} className="text-xs">
                  Short description (shown in the model picker)
                </Label>
                <Input
                  id={`desc-${row.tier}`}
                  value={row.description}
                  onChange={(e) => update(row.tier, { description: e.target.value })}
                  data-testid={`input-tier-desc-${row.tier}`}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`addon-${row.tier}`} className="text-xs">
                  System prompt addon / training instructions
                </Label>
                <Textarea
                  id={`addon-${row.tier}`}
                  value={row.promptAddon}
                  onChange={(e) =>
                    update(row.tier, { promptAddon: e.target.value })
                  }
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="Free-form instructions appended to the base prompt for this tier..."
                  data-testid={`textarea-tier-addon-${row.tier}`}
                />
                <p className="text-[10px] text-muted-foreground">
                  Tip: describe the desired response style, depth, and any guardrails.
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
