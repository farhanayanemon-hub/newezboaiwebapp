import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface CredView {
  id: number;
  domain: string;
  username: string;
  passwordMask: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function CredentialsTab() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "credentials"],
    queryFn: () => apiClient.get<{ credentials: CredView[] }>("/admin/credentials"),
  });

  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post("/admin/credentials", { domain, username, password, notes }),
    onSuccess: () => {
      toast.success("Credential saved.");
      setDomain(""); setUsername(""); setPassword(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "credentials"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/credentials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "credentials"] }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> Add new credential
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cred-domain">Domain</Label>
            <Input id="cred-domain" placeholder="daraz.com.bd" value={domain}
              onChange={(e) => setDomain(e.target.value)} data-testid="input-cred-domain" />
          </div>
          <div>
            <Label htmlFor="cred-user">Username / Email</Label>
            <Input id="cred-user" value={username}
              onChange={(e) => setUsername(e.target.value)} data-testid="input-cred-user" />
          </div>
          <div>
            <Label htmlFor="cred-pass">Password</Label>
            <Input id="cred-pass" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} data-testid="input-cred-pass" />
          </div>
          <div>
            <Label htmlFor="cred-notes">Notes (optional)</Label>
            <Input id="cred-notes" value={notes}
              onChange={(e) => setNotes(e.target.value)} data-testid="input-cred-notes" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !domain || !username || !password}
              data-testid="button-cred-save"
            >
              {createMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Saved credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : list.data?.credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credentials yet.</p>
          ) : (
            <div className="space-y-2">
              {list.data?.credentials.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  data-testid={`row-cred-${c.domain}`}
                >
                  <div>
                    <div className="font-medium">{c.domain}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.username} · {c.passwordMask}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMut.mutate(c.id)}
                    disabled={deleteMut.isPending}
                    aria-label="Delete"
                    data-testid={`button-cred-delete-${c.domain}`}
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
