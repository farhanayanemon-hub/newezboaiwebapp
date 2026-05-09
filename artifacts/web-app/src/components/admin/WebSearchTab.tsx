import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Globe, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api";

interface WebSearchView {
  provider: string;
  enabled: boolean;
  maxResults: number;
  guestDailyLimit: number;
  userDailyLimit: number;
  hasApiKey: boolean;
  apiKeyMask: string;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  updatedAt: string | null;
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.body === "object" && e.body && "error" in e.body) {
      return String((e.body as { error: string }).error);
    }
    return `Request failed (${e.status})`;
  }
  return e instanceof Error ? e.message : "Request failed";
}

export function WebSearchTab() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["admin", "web-search"],
    queryFn: () => apiClient.get<{ config: WebSearchView }>("/admin/web-search"),
  });

  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [maxResults, setMaxResults] = useState(5);
  const [guestLimit, setGuestLimit] = useState(50);
  const [userLimit, setUserLimit] = useState(500);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!cfg.data) return;
    const c = cfg.data.config;
    setEnabled(c.enabled);
    setMaxResults(c.maxResults);
    setGuestLimit(c.guestDailyLimit);
    setUserLimit(c.userDailyLimit);
    setApiKey("");
  }, [cfg.data]);

  const saveMut = useMutation({
    mutationFn: (payload: {
      apiKey?: string;
      enabled: boolean;
      maxResults: number;
      guestDailyLimit: number;
      userDailyLimit: number;
    }) => apiClient.put<{ config: WebSearchView }>("/admin/web-search", payload),
    onSuccess: () => {
      toast.success("Web search settings saved");
      qc.invalidateQueries({ queryKey: ["admin", "web-search"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const testMut = useMutation({
    mutationFn: (payload: { apiKey?: string }) =>
      apiClient.post<{ ok: boolean; error?: string }>("/admin/web-search/test", payload),
    onSuccess: (data) => {
      if (data.ok) {
        setStatus({ ok: true, text: "API key is working." });
        toast.success("Tavily key is working");
      } else {
        setStatus({ ok: false, text: data.error ?? "Test failed" });
        toast.error(data.error ?? "Test failed");
      }
      qc.invalidateQueries({ queryKey: ["admin", "web-search"] });
    },
    onError: (e) => {
      const m = errMsg(e);
      setStatus({ ok: false, text: m });
      toast.error(m);
    },
  });

  const handleSave = () => {
    saveMut.mutate({
      apiKey: apiKey || undefined,
      enabled,
      maxResults,
      guestDailyLimit: guestLimit,
      userDailyLimit: userLimit,
    });
  };

  if (cfg.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const c = cfg.data?.config;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Globe className="h-6 w-6" /> Web Search
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lets the assistant fetch live web results when a question needs fresh
          information (today&apos;s news, current prices, recent events). Powered by
          Tavily.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-key">
              Tavily API key {c?.hasApiKey && <span className="text-xs text-muted-foreground">(currently set: {c.apiKeyMask})</span>}
            </Label>
            <Input
              id="ws-key"
              type="password"
              placeholder={c?.hasApiKey ? "Leave blank to keep current key" : "tvly-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="input-tavily-key"
            />
            <p className="text-xs text-muted-foreground">
              Get a free key at <a className="underline" href="https://tavily.com" target="_blank" rel="noreferrer">tavily.com</a> — generous free tier.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={testMut.isPending || (!apiKey && !c?.hasApiKey)}
              onClick={() => testMut.mutate({ apiKey: apiKey || undefined })}
              data-testid="button-test-tavily"
            >
              {testMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test key
            </Button>
            {status && (
              <span
                className={`flex items-center gap-1 text-sm ${status.ok ? "text-green-600" : "text-destructive"}`}
              >
                {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {status.text}
              </span>
            )}
            {c?.lastTestedAt && (
              <span className="text-xs text-muted-foreground">
                Last tested: {new Date(c.lastTestedAt).toLocaleString()} — {c.lastTestStatus}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ws-enabled" className="text-sm">Enable web search</Label>
              <p className="text-xs text-muted-foreground">
                When off, no live searches happen even if the user opts in.
              </p>
            </div>
            <Switch
              id="ws-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-web-search-enabled"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ws-max">Results per query</Label>
              <Input
                id="ws-max"
                type="number"
                min={1}
                max={10}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-guest-limit">Guest daily limit</Label>
              <Input
                id="ws-guest-limit"
                type="number"
                min={0}
                value={guestLimit}
                onChange={(e) => setGuestLimit(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-user-limit">User daily limit</Label>
              <Input
                id="ws-user-limit"
                type="number"
                min={0}
                value={userLimit}
                onChange={(e) => setUserLimit(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Limits are per identity per rolling 24h window — controls how much you spend on Tavily.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMut.isPending} data-testid="button-save-web-search">
          {saveMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}
