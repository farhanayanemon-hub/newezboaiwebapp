import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCameraStore } from "@/stores/cameraStore";
import { Video } from "lucide-react";

/**
 * Pulsing red dot shown in the top bar whenever the camera MediaStream is
 * active. Non-interactive but tooltipped, so users instantly know "the AI
 * can see me right now".
 */
export function PrivacyIndicator() {
  const isActive = useCameraStore((s) => s.isActive);
  const isLive = useCameraStore((s) => s.isLive);
  if (!isActive) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
          data-testid="indicator-camera-active"
          aria-label={isLive ? "Live camera on" : "Camera on"}
        >
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <Video className="h-3 w-3" />
          <span className="hidden sm:inline">{isLive ? "Live" : "Camera"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isLive ? "Live camera on — AI is watching" : "Camera is on"}
      </TooltipContent>
    </Tooltip>
  );
}
