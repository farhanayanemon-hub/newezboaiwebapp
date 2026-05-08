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
          Apnar browser e Web Push support nai (Safari/iOS er purono version
          ba in-app browser hote pare). Mobile e Chrome/Edge/Firefox try
          korun.
        </p>
      </div>
    );
  }

  if (perm === "denied") {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Notification permission block hoye ache. Browser address bar er
          lock icon e click kore notifications "Allow" korun, tarpor page
          refresh dile abar try korte parben.
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
        EzboAI reminder set korle, time hole apnar device e browser
        notification ashbe — even if EzboAI tab band thake (PWA install thakle
        background eo kaaj kore).
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
                toast.success("Notification off kora hoyeche.");
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
                toast.success("Notification on kora hoyeche!");
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
