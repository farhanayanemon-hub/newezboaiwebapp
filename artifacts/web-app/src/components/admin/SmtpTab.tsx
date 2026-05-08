import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api";

interface SmtpView {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  fromName: string;
  enabled: boolean;
  hasPassword: boolean;
  updatedAt: string | null;
}

export function SmtpTab() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["admin", "smtp"],
    queryFn: () => apiClient.get<{ config: SmtpView }>("/admin/smtp"),
  });

  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!cfg.data) return;
    const c = cfg.data.config;
    setHost(c.host);
    setPort(c.port);
    setSecure(c.secure);
    setUsername(c.username);
    setFromAddress(c.fromAddress);
    setFromName(c.fromName);
    setEnabled(c.enabled);
    setPassword("");
  }, [cfg.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.put("/admin/smtp", {
        host,
        port: Number(port) || 587,
        secure,
        username,
        password, // empty string means "keep existing"
        fromAddress,
        fromName,
        enabled,
      }),
    onSuccess: () => {
      toast.success("SMTP saved.");
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        toast.error(typeof e.body === "object" && e.body && "error" in e.body ? String((e.body as { error: string }).error) : `Save failed (${e.status})`);
      } else {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    },
  });

  const testMut = useMutation({
    mutationFn: () => apiClient.post("/admin/smtp/test", { to: testTo }),
    onSuccess: () => toast.success(`Test email sent to ${testTo}`),
    onError: (e) => {
      if (e instanceof ApiError) {
        toast.error(typeof e.body === "object" && e.body && "error" in e.body ? String((e.body as { error: string }).error) : `Send failed (${e.status})`);
      } else {
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> SMTP configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Outgoing email</div>
              <div className="text-xs text-muted-foreground">
                When off, signup verification and password reset emails are skipped.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-smtp-enabled" />
          </div>
          <div>
            <Label htmlFor="smtp-host">Host</Label>
            <Input id="smtp-host" placeholder="smtp.gmail.com" value={host}
              onChange={(e) => setHost(e.target.value)} data-testid="input-smtp-host" />
          </div>
          <div>
            <Label htmlFor="smtp-port">Port</Label>
            <Input id="smtp-port" type="number" min={1} max={65535} value={port}
              onChange={(e) => setPort(Number(e.target.value) || 587)} data-testid="input-smtp-port" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Switch checked={secure} onCheckedChange={setSecure} data-testid="switch-smtp-secure" />
            <Label className="text-sm">Use SSL/TLS (port 465)</Label>
          </div>
          <div>
            <Label htmlFor="smtp-user">Username</Label>
            <Input id="smtp-user" value={username}
              onChange={(e) => setUsername(e.target.value)} data-testid="input-smtp-user" />
          </div>
          <div>
            <Label htmlFor="smtp-pass">
              Password {cfg.data?.config.hasPassword && <span className="text-xs text-muted-foreground">(leave blank to keep existing)</span>}
            </Label>
            <Input id="smtp-pass" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} data-testid="input-smtp-pass" />
          </div>
          <div>
            <Label htmlFor="smtp-from">From address</Label>
            <Input id="smtp-from" type="email" placeholder="noreply@ezboai.com" value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)} data-testid="input-smtp-from" />
          </div>
          <div>
            <Label htmlFor="smtp-from-name">From name</Label>
            <Input id="smtp-from-name" placeholder="EzboAI" value={fromName}
              onChange={(e) => setFromName(e.target.value)} data-testid="input-smtp-from-name" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-smtp-save">
              {saveMut.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Send test email
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            data-testid="input-smtp-test-to"
          />
          <Button onClick={() => testMut.mutate()} disabled={testMut.isPending || !testTo} data-testid="button-smtp-test">
            {testMut.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
            Send test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
