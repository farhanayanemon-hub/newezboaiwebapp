import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { apiClient, ApiError } from "@/lib/api";

interface Automation {
  id: number;
  name: string;
  description: string;
  prompt: string;
  schedule: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

const SCHEDULE_PRESETS: Array<{ label: string; value: string }> = [
  { label: "One-shot (manual run only)", value: "" },
  { label: "Every hour", value: "FREQ=HOURLY" },
  { label: "Daily at 9:00 AM", value: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" },
  { label: "Daily at 9:00 PM", value: "FREQ=DAILY;BYHOUR=21;BYMINUTE=0" },
  { label: "Weekdays 8:30 AM", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=30" },
  { label: "Weekly Mon 10 AM", value: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0" },
];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");
  useEffect(() => {
    apiClient
      .get<{ loggedIn: boolean }>("/admin/me")
      .then((r) => setAuthState(r.loggedIn ? "ok" : "denied"))
      .catch(() => setAuthState("denied"));
  }, []);

  const list = useQuery({
    queryKey: ["automations"],
    queryFn: () => apiClient.get<{ automations: Automation[] }>("/admin/automations"),
    enabled: authState === "ok",
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("");

  const createMut = useMutation({
    mutationFn: (cleanedSchedule: string | null) =>
      apiClient.post("/admin/automations", {
        name,
        description,
        prompt,
        schedule: cleanedSchedule,
      }),
    onSuccess: () => {
      toast.success("Automation save hoyeche.");
      setName(""); setDescription(""); setPrompt(""); setSchedule(""); setShowForm(false);
      qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError
        ? (err.body as { error?: string })?.error ?? err.message
        : err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/automations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });

  const runMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/admin/automations/${id}/run`),
    onSuccess: () => {
      toast.success("Run shuru hoyeche — koyek minit por refresh koro.");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["automations"] }), 3_000);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  if (authState === "checking") {
    return (
      <AppShell title="Automations">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (authState === "denied") {
    return (
      <AppShell title="Automations">
        <div className="mx-auto max-w-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Automations admin only. <a href="/admin" className="text-primary underline">Login here</a>.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      headerCenter={
        <div className="flex items-center gap-2 text-sm font-medium">
          <Workflow className="h-4 w-4 text-primary" /> Automations
        </div>
      }
      headerRight={
        <Button size="sm" onClick={() => setShowForm((s) => !s)} data-testid="button-new-automation">
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      }
      scrollContent
    >
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notun automation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="auto-name">Name</Label>
                <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Daily Daraz price check" data-testid="input-automation-name" />
              </div>
              <div>
                <Label htmlFor="auto-desc">Description</Label>
                <Input id="auto-desc" value={description}
                  onChange={(e) => setDescription(e.target.value)} data-testid="input-automation-desc" />
              </div>
              <div>
                <Label htmlFor="auto-prompt">Web task prompt</Label>
                <Textarea id="auto-prompt" rows={4} value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Daraz e jao, iPhone 15 search koro, top 3 dam likhe dao."
                  data-testid="input-automation-prompt" />
              </div>
              <div>
                <Label>Schedule</Label>
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger data-testid="select-automation-schedule"><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_PRESETS.map((p) => (
                      <SelectItem key={p.value || "none"} value={p.value || "__none"}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Schedule chara save korle khali "Run now" diye chalate parba.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    // map "__none" sentinel back to empty/null and pass the
                    // cleaned value directly so we don't read stale state.
                    const cleaned =
                      !schedule || schedule === "__none" ? null : schedule;
                    createMut.mutate(cleaned);
                  }}
                  disabled={createMut.isPending || !name || !prompt}
                  data-testid="button-automation-save"
                >
                  {createMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {list.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : list.data?.automations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Workflow className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Kono automation nei. "New" theke add koro.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {list.data?.automations.map((a) => {
              const ok = a.lastRunStatus === "ok";
              const err = a.lastRunStatus === "error";
              return (
                <Card key={a.id} data-testid={`card-automation-${a.id}`}>
                  <CardContent className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{a.name}</div>
                        {a.description && (
                          <div className="text-xs text-muted-foreground">{a.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => runMut.mutate(a.id)}
                          disabled={runMut.isPending}
                          data-testid={`button-automation-run-${a.id}`}
                        >
                          <Play className="mr-1 h-3 w-3" /> Run
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => deleteMut.mutate(a.id)}
                          disabled={deleteMut.isPending}
                          aria-label="Delete"
                          data-testid={`button-automation-delete-${a.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="rounded bg-muted/40 px-2 py-1 text-xs text-foreground/80">
                      {a.prompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {a.schedule ? a.schedule : "Manual"}
                      </span>
                      <span>Last run: {fmt(a.lastRunAt)}</span>
                      {ok && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> OK</span>}
                      {err && <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Error</span>}
                    </div>
                    {a.lastRunSummary && (
                      <p className="rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        {a.lastRunSummary}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
