import { Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChatStore } from "@/stores/chatStore";

/**
 * Public per-browser opt-out for the live web search feature. Default is
 * ON. The actual key + global enable lives in the admin panel.
 */
export function WebSearchSettings() {
  const enabled = useChatStore((s) => s.webSearchEnabled);
  const setEnabled = useChatStore((s) => s.setWebSearchEnabled);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="ws-pref" className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-primary" /> Use web search
          </Label>
          <p className="text-xs text-muted-foreground">
            When asked about today&apos;s news, current prices, or recent events, Ezbo
            can fetch fresh results from the web and cite sources. Turn this off
            to keep every answer based purely on the model&apos;s training data.
          </p>
        </div>
        <Switch
          id="ws-pref"
          checked={enabled}
          onCheckedChange={setEnabled}
          data-testid="switch-web-search-pref"
        />
      </div>
    </div>
  );
}
