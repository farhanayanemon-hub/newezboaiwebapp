import { useEffect, useRef } from "react";
import { X, StopCircle, Loader2, Globe, ShieldAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrowserStore, type BrowserActionEntry } from "@/stores/browserStore";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "/api");

/** Build the WebSocket URL relative to the current host so it works through
 *  the Replit proxy (which terminates TLS at the edge). */
function wsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/browser/${sessionId}`;
}

export function BrowserPreviewPanel() {
  const {
    isOpen,
    sessionId,
    busy,
    screenshot,
    actions,
    finalText,
    error,
    pendingConfirm,
    close,
    setScreenshot,
    pushAction,
    setBusy,
    setFinalText,
    setError,
    setSession,
    setPendingConfirm,
    reset,
  } = useBrowserStore();

  // WS connection lifecycle — one socket per sessionId.
  const wsRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId || !isOpen) return;
    const ws = new WebSocket(wsUrl(sessionId));
    wsRef.current = ws;
    ws.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as {
          type: string;
          payload?: Record<string, unknown>;
        };
        switch (ev.type) {
          case "screenshot":
            if (typeof ev.payload?.b64 === "string") setScreenshot(ev.payload.b64);
            break;
          case "ready":
            pushAction({ kind: "ready", label: "Browser ready" });
            break;
          case "plan":
            setBusy(true);
            pushAction({
              kind: "plan",
              label: "Planning",
              detail: typeof ev.payload?.prompt === "string" ? ev.payload.prompt : "",
            });
            break;
          case "action":
            pushAction({
              kind: "action",
              label: String(ev.payload?.tool ?? "action"),
              detail: JSON.stringify(ev.payload?.args ?? {}).slice(0, 200),
            });
            break;
          case "tool_result": {
            const r = ev.payload?.result as { ok?: boolean; error?: string } | undefined;
            pushAction({
              kind: "tool_result",
              label: `${ev.payload?.tool ?? "tool"} → ${r?.ok ? "ok" : "fail"}`,
              detail: r?.error ?? undefined,
            });
            break;
          }
          case "error":
            setBusy(false);
            setError(typeof ev.payload?.message === "string" ? ev.payload.message : "Unknown error");
            pushAction({ kind: "error", label: "Error", detail: String(ev.payload?.message ?? "") });
            break;
          case "done":
            setBusy(false);
            setPendingConfirm(null);
            setFinalText(typeof ev.payload?.text === "string" ? ev.payload.text : "");
            pushAction({ kind: "done", label: "Done" });
            break;
          case "confirm_request":
            if (
              typeof ev.payload?.id === "string" &&
              typeof ev.payload?.question === "string"
            ) {
              setPendingConfirm({
                id: ev.payload.id,
                question: ev.payload.question,
                detail: typeof ev.payload?.detail === "string" ? ev.payload.detail : undefined,
              });
              pushAction({
                kind: "action",
                label: "Confirmation requested",
                detail: ev.payload.question,
              });
            }
            break;
        }
      } catch {
        /* malformed packet */
      }
    };
    ws.onerror = () => setError("Connection lost — try again.");
    return () => {
      try { ws.close(); } catch { /* noop */ }
    };
  }, [sessionId, isOpen, setScreenshot, pushAction, setBusy, setError, setFinalText, setPendingConfirm]);

  const respondConfirm = async (approved: boolean) => {
    if (!sessionId || !pendingConfirm) return;
    setPendingConfirm(null);
    try {
      await fetch(`${API_BASE}/browser/sessions/${sessionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, confirmId: pendingConfirm.id }),
      });
    } catch {
      /* the server will time out on its end */
    }
  };

  // If the user navigates away or closes the tab, free the server-side
  // session so the (small) concurrent-session pool doesn't leak. We use
  // sendBeacon because fetch() isn't reliably allowed during unload.
  useEffect(() => {
    if (!sessionId) return;
    const handler = () => {
      try {
        navigator.sendBeacon?.(`${API_BASE}/browser/sessions/${sessionId}/end`);
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [sessionId]);

  // Auto-scroll log to bottom on new entry.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [actions.length]);

  if (!isOpen) return null;

  const onStop = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE}/browser/sessions/${sessionId}/abort`, { method: "POST" });
  };
  const onCloseSession = async () => {
    if (sessionId) {
      await fetch(`${API_BASE}/browser/sessions/${sessionId}`, { method: "DELETE" }).catch(() => undefined);
    }
    setSession(null);
    reset();
    close();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40 backdrop-blur-sm sm:items-stretch"
      onClick={onCloseSession}
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="panel-browser"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">EzboAI Web Agent</h2>
          {busy && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> kaaj korche…
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {busy && (
              <Button variant="ghost" size="sm" onClick={onStop} data-testid="button-browser-stop">
                <StopCircle className="mr-1 h-4 w-4" /> Stop
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onCloseSession} aria-label="Close" data-testid="button-browser-close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
            <div className="relative flex items-center justify-center overflow-auto bg-muted/40 p-3">
              {screenshot ? (
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  alt="Browser screenshot"
                  className="max-h-full max-w-full rounded-md border border-border shadow-sm"
                  data-testid="img-browser-screenshot"
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {busy ? "Page load hocche…" : "Browser screenshot ekhane dekhabe."}
                </div>
              )}
            </div>
            <aside className="flex flex-col border-t border-border lg:border-l lg:border-t-0">
              <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Action log
              </div>
              <ScrollArea className="flex-1">
                <div ref={logRef} className="max-h-[40vh] space-y-1 px-3 py-2 text-xs lg:max-h-none">
                  {actions.length === 0 ? (
                    <p className="text-muted-foreground">Kichu shuru hoy nai.</p>
                  ) : (
                    actions.map((a) => <ActionRow key={a.id} entry={a} />)
                  )}
                </div>
              </ScrollArea>
              {pendingConfirm && (
                <div
                  className="border-t border-border bg-amber-50 px-3 py-3 text-xs dark:bg-amber-900/20"
                  data-testid="panel-browser-confirm"
                >
                  <div className="mb-2 flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Confirmation needed
                  </div>
                  <p className="mb-2 whitespace-pre-wrap leading-snug text-foreground">
                    {pendingConfirm.question}
                  </p>
                  {pendingConfirm.detail && (
                    <p className="mb-2 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {pendingConfirm.detail}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => respondConfirm(true)}
                      data-testid="button-confirm-approve"
                    >
                      <Check className="mr-1 h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => respondConfirm(false)}
                      data-testid="button-confirm-deny"
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              )}
              {(finalText || error) && (
                <div
                  className={cn(
                    "border-t border-border px-3 py-2 text-xs",
                    error ? "bg-destructive/10 text-destructive" : "bg-primary/5",
                  )}
                  data-testid="text-browser-final"
                >
                  <div className="mb-1 font-medium">{error ? "Error" : "Final answer"}</div>
                  <p className="whitespace-pre-wrap leading-snug">{error ?? finalText}</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ entry }: { entry: BrowserActionEntry }) {
  const tone =
    entry.kind === "error"
      ? "text-destructive"
      : entry.kind === "done"
        ? "text-primary"
        : entry.kind === "tool_result"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className={cn("flex flex-col gap-0.5 rounded px-1 py-1 hover:bg-muted/50", tone)}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className="font-medium">{entry.label}</span>
      </div>
      {entry.detail && <p className="ml-12 break-all text-[11px] text-muted-foreground">{entry.detail}</p>}
    </div>
  );
}
