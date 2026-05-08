import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level safety net. If a render throws (bad WS payload, missing data,
 * stale cache, etc.) the user gets a recover screen instead of a white page.
 * The reload button bypasses the SW cache so a deploy-time bug self-heals
 * after one click.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort console log for production debugging via the browser
    // devtools — we deliberately don't ship a remote logger here.
    // eslint-disable-next-line no-console
    console.error("[EzboAI] Render error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    // Hard reload bypasses the in-memory React tree and the SW precache
    // so the next visit picks up the latest build.
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="text-base font-semibold">Something went wrong</h1>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            An unexpected error occurred while loading the app. Reloading
            should fix it — your chats are safely saved.
          </p>
          {this.state.error?.message && (
            <pre className="mb-4 max-h-32 overflow-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <Button
            onClick={this.handleReload}
            className="w-full"
            data-testid="button-error-reload"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Reload
          </Button>
        </div>
      </div>
    );
  }
}
