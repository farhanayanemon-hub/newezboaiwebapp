import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Loader2, Trash2, Plus, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";

interface Rule {
  id: number;
  host: string;
  mode: "allow" | "block";
  note: string | null;
  createdAt: string;
}

export function AccessRulesTab() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "access-rules"],
    queryFn: () => apiClient.get<{ rules: Rule[] }>("/admin/access-rules"),
  });

  const [host, setHost] = useState("");
  const [mode, setMode] = useState<"allow" | "block">("block");
  const [note, setNote] = useState("");

  const createMut = useMutation({
    mutationFn: () => apiClient.post("/admin/access-rules", { host, mode, note }),
    onSuccess: () => {
      toast.success("Rule added.");
      setHost(""); setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "access-rules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/access-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "access-rules"] }),
  });

  const allowCount = list.data?.rules.filter((r) => r.mode === "allow").length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> New rule
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Block: this host will be blocked. Allow: if any allow rule exists,
            the agent can only visit hosts on the allow list.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
          <div>
            <Label htmlFor="rule-host">Host</Label>
            <Input id="rule-host" placeholder="example.com" value={host}
              onChange={(e) => setHost(e.target.value)} data-testid="input-rule-host" />
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "allow" | "block")}>
              <SelectTrigger data-testid="select-rule-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="block">Block</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rule-note">Note (optional)</Label>
            <Input id="rule-note" value={note}
              onChange={(e) => setNote(e.target.value)} data-testid="input-rule-note" />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !host}
              data-testid="button-rule-save"
            >
              {createMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Active rules
            {allowCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                Allow-list mode active
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : list.data?.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet. Default: allow everything (private hosts blocked).</p>
          ) : (
            <div className="space-y-2">
              {list.data?.rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  data-testid={`row-rule-${r.host}`}
                >
                  <div className="flex items-center gap-2">
                    {r.mode === "allow" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <div>
                      <div className="font-medium">{r.host}</div>
                      {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMut.mutate(r.id)}
                    disabled={deleteMut.isPending}
                    aria-label="Delete"
                    data-testid={`button-rule-delete-${r.host}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
