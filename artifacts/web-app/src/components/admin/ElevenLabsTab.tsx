import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Save, Wand2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api";

interface ElevenView {
  voiceId: string;
  modelId: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyMask: string;
  updatedAt: string | null;
}

interface VoiceOption {
  id: string;
  name: string;
  labels?: Record<string, string>;
  previewUrl?: string | null;
}

const MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (recommended)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 (low latency)" },
  { id: "eleven_monolingual_v1", label: "Monolingual v1 (English)" },
];

function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.body === "object" && e.body && "error" in e.body) {
      return String((e.body as { error: string }).error);
    }
    return `Request failed (${e.status})`;
  }
  return e instanceof Error ? e.message : "Request failed";
}

export function ElevenLabsTab() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["admin", "elevenlabs"],
    queryFn: () => apiClient.get<{ config: ElevenView }>("/admin/elevenlabs"),
  });

  const [apiKey, setApiKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("eleven_multilingual_v2");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!cfg.data) return;
    const c = cfg.data.config;
    setVoiceId(c.voiceId);
    setModelId(c.modelId || "eleven_multilingual_v2");
    setEnabled(c.enabled);
    setApiKey("");
  }, [cfg.data]);

  const voices = useQuery({
    queryKey: ["admin", "elevenlabs", "voices"],
    queryFn: () => apiClient.get<{ voices: VoiceOption[] }>("/admin/elevenlabs/voices"),
    enabled: !!cfg.data?.config.hasApiKey,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.put("/admin/elevenlabs", {
        apiKey, // empty string means "keep existing"
        voiceId,
        modelId,
        enabled,
      }),
    onSuccess: () => {
      toast.success("ElevenLabs settings saved.");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["admin", "elevenlabs"] });
      qc.invalidateQueries({ queryKey: ["admin", "elevenlabs", "voices"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const testMut = useMutation({
    mutationFn: () =>
      apiClient.post<{ ok: boolean; tier?: string; error?: string }>(
        "/admin/elevenlabs/test",
        apiKey ? { apiKey } : {},
      ),
    onSuccess: (res) => {
      if (res.ok) {
        setStatus({ ok: true, text: `Connected — plan: ${res.tier ?? "unknown"}` });
        toast.success("ElevenLabs key works.");
      } else {
        setStatus({ ok: false, text: res.error ?? "Key check failed" });
        toast.error(res.error ?? "Key check failed");
      }
    },
    onError: (e) => {
      const msg = errMsg(e);
      setStatus({ ok: false, text: msg });
      toast.error(msg);
    },
  });

  const voiceOptions = useMemo<VoiceOption[]>(() => {
    const list = voices.data?.voices ?? [];
    if (voiceId && !list.some((v) => v.id === voiceId)) {
      return [{ id: voiceId, name: `${voiceId} (current)` }, ...list];
    }
    return list;
  }, [voices.data, voiceId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4" /> ElevenLabs voice synthesis
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Voice synthesis</div>
              <div className="text-xs text-muted-foreground">
                When off, the onboarding screen falls back to the browser&apos;s built-in voice.
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-elevenlabs-enabled"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="el-key">
              API key
              {cfg.data?.config.hasApiKey && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (current: {cfg.data.config.apiKeyMask} — leave blank to keep)
                </span>
              )}
            </Label>
            <Input
              id="el-key"
              type="password"
              placeholder="sk_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="input-elevenlabs-key"
            />
          </div>

          <div>
            <Label htmlFor="el-voice">Voice</Label>
            <Select value={voiceId || undefined} onValueChange={setVoiceId}>
              <SelectTrigger
                id="el-voice"
                data-testid="select-elevenlabs-voice"
                disabled={!cfg.data?.config.hasApiKey && !apiKey}
              >
                <SelectValue
                  placeholder={
                    voices.isLoading
                      ? "Loading voices…"
                      : voices.error
                        ? "Save key first to load voices"
                        : "Select a voice"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voices.error && (
              <p className="mt-1 text-xs text-destructive">{errMsg(voices.error)}</p>
            )}
          </div>

          <div>
            <Label htmlFor="el-model">Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger id="el-model" data-testid="select-elevenlabs-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending || (!apiKey && !cfg.data?.config.hasApiKey)}
              data-testid="button-elevenlabs-test"
            >
              {testMut.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-3 w-3" />
              )}
              Test API key
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              data-testid="button-elevenlabs-save"
            >
              {saveMut.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-2 h-3 w-3" />
              )}
              Save
            </Button>
          </div>

          {status && (
            <div
              className={`sm:col-span-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${status.ok ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-destructive/40 text-destructive"}`}
              data-testid="text-elevenlabs-status"
            >
              {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span>{status.text}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
