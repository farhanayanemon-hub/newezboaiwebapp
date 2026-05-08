import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  enablePush,
  disablePush,
  getCurrentSubscription,
  permissionState,
  pushSupported,
} from "@/lib/push";

/**
 * Toggle that hides the gnarly Push API ceremony from the user. Three
 * buckets:
 *   - unsupported (Safari/iOS<16.4, in-app browsers): explain + nothing to do
 *   - permission denied: ask user to fix it in browser settings
 *   - granted but no subscription: one click "Enable"
 *   - active subscription: one click "Disable"
 */
export function NotificationSettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!pushSupported()) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setPerm(permissionState());
    const sub = await getCurrentSubscription();
    setSubscribed(!!sub);
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (supported === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking…
      </div>
    );
  }

  if (supported === false) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Your browser doesn't support Web Push (older Safari/iOS or an
          in-app browser). Try Chrome, Edge, or Firefox on mobile.
        </p>
      </div>
    );
  }

  if (perm === "denied") {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Notifications are blocked. Click the lock icon in your browser's
          address bar, allow notifications, then refresh the page and try
          again.
        </p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Recheck
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        When you set a reminder, your device gets a browser notification at
        the scheduled time — even if the EzboAI tab is closed (works in the
        background once installed as a PWA).
      </p>
      <div className="flex items-center gap-2">
        {subscribed ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await disablePush();
                toast.success("Notifications turned off.");
                await refresh();
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Disable failed",
                );
              } finally {
                setBusy(false);
              }
            }}
            data-testid="button-push-disable"
          >
            <BellOff className="mr-2 h-4 w-4" /> Disable notifications
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await enablePush();
                toast.success("Notifications turned on!");
                await refresh();
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Enable failed",
                );
              } finally {
                setBusy(false);
              }
            }}
            data-testid="button-push-enable"
          >
            <Bell className="mr-2 h-4 w-4" /> Enable notifications
          </Button>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
