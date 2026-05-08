import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCameraStore } from "@/stores/cameraStore";
import { useScreenShareStore } from "@/stores/screenShareStore";
import { Video, Monitor } from "lucide-react";

/**
 * Shows up to two pulsing red badges in the top bar:
 *  - Camera: lit when the camera MediaStream is active (Live label when
 *    sampling continuously)
 *  - Screen: lit when the screen-share stream is active (Watch label in
 *    proactive mode)
 *
 * Both are non-interactive but tooltipped so the user always knows what the
 * AI can currently see.
 */
export function PrivacyIndicator() {
  const cameraActive = useCameraStore((s) => s.isActive);
  const cameraLive = useCameraStore((s) => s.isLive);
  const screenActive = useScreenShareStore((s) => s.isActive);
  const screenMode = useScreenShareStore((s) => s.mode);

  if (!cameraActive && !screenActive) return null;

  return (
    <div className="flex items-center gap-1">
      {cameraActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
              data-testid="indicator-camera-active"
              aria-label={cameraLive ? "Live camera on" : "Camera on"}
            >
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              <Video className="h-3 w-3" />
              <span className="hidden sm:inline">{cameraLive ? "Live" : "Cam"}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {cameraLive ? "Live camera on — AI is watching" : "Camera is on"}
          </TooltipContent>
        </Tooltip>
      )}
      {screenActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
              data-testid="indicator-screen-active"
              aria-label={
                screenMode === "proactive"
                  ? "Screen sharing — AI is watching"
                  : "Screen sharing"
              }
            >
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              <Monitor className="h-3 w-3" />
              <span className="hidden sm:inline">
                {screenMode === "proactive" ? "Watch" : "Screen"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {screenMode === "proactive"
              ? "Screen share + proactive AI"
              : "Screen share on"}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
