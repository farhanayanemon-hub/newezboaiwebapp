import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  RotateCw,
  X,
  Zap,
  ZapOff,
  Pause,
  Play,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useCameraStore } from "@/stores/cameraStore";
import { useChatStore } from "@/stores/chatStore";
import { conversationKeys } from "@/lib/conversations";
import { baseUrl } from "@/lib/api";
import { captureFrame, blobToFile } from "@/lib/camera/captureFrame";
import { isMeaningfullyNew } from "@/lib/camera/similarity";

interface CameraOverlayProps {
  /** Called when Snap mode captures a frame; receives a JPEG File for the
   * caller to push into the existing attachment pipeline. */
  onSnap: (file: File) => void;
}

const LIVE_INTERVAL_MS = 4000;

export function CameraOverlay({ onSnap }: CameraOverlayProps) {
  const isOpen = useCameraStore((s) => s.isOpen);
  const close = useCameraStore((s) => s.close);
  const mode = useCameraStore((s) => s.mode);
  const setMode = useCameraStore((s) => s.setMode);
  const facing = useCameraStore((s) => s.facing);
  const toggleFacing = useCameraStore((s) => s.toggleFacing);
  const setActive = useCameraStore((s) => s.setActive);
  const isLive = useCameraStore((s) => s.isLive);
  const setLive = useCameraStore((s) => s.setLive);

  const conversationId = useChatStore((s) => s.activeConversationId);
  const qc = useQueryClient();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Generation counter — incremented every startStream() call. Late-resolving
   * getUserMedia promises whose generation is stale immediately stop their
   * tracks, preventing camera leaks on rapid open/close or facing toggles. */
  const streamGenRef = useRef(0);
  /** Conversation pinned for the current live session. Set on first response
   * so subsequent frames stay in the same chat even if the user switches the
   * active conversation in the sidebar. */
  const liveConversationIdRef = useRef<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Live mode loop refs
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveInFlightRef = useRef(false);
  const lastReplyRef = useRef<string | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  // ---- Stream lifecycle -----------------------------------------------------
  const stopStream = useCallback(() => {
    // Invalidate any in-flight startStream so its resolution path won't
    // reattach a camera after we've torn down.
    streamGenRef.current++;
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setTorchSupported(false);
    setTorchOn(false);
    setZoomCaps(null);
    setZoom(1);
  }, [setActive]);

  const startStream = useCallback(async () => {
    setPermissionError(null);
    stopStream();
    const myGen = ++streamGenRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      // If overlay closed or another startStream ran while we were waiting,
      // immediately release this stream — never expose it to the UI.
      if (myGen !== streamGenRef.current) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setActive(true);

      // Probe capabilities for zoom + torch (if browser supports it).
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        zoom?: { min: number; max: number; step: number };
        torch?: boolean;
      };
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        setZoomCaps({
          min: caps.zoom.min,
          max: caps.zoom.max,
          step: caps.zoom.step || 0.1,
        });
        const settings = track.getSettings() as MediaTrackSettings & {
          zoom?: number;
        };
        setZoom(settings.zoom ?? caps.zoom.min);
      }
      if (caps.torch) setTorchSupported(true);
    } catch (err) {
      // Stale rejections shouldn't surface either.
      if (myGen !== streamGenRef.current) return;
      const e = err as DOMException;
      const name = e?.name || "";
      let msg = "Camera khulte parina.";
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg =
          "Camera permission deya hoyni. Browser settings e giye permission allow korun, tarpor abar try korun.";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        msg = "Camera khuje pelam na. Onno camera select korun ba device check korun.";
      } else if (name === "NotReadableError") {
        msg = "Camera onno app use korche. Sheta bondho kore abar try korun.";
      }
      setPermissionError(msg);
      setActive(false);
    }
  }, [facing, setActive, stopStream]);

  // Open / close lifecycle.
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }
    void startStream();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Restart stream when facing changes (only while open).
  useEffect(() => {
    if (!isOpen) return;
    void startStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // ---- Zoom / torch ---------------------------------------------------------
  const applyZoom = useCallback(async (z: number) => {
    setZoom(z);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: z } as MediaTrackConstraintSet & { zoom: number }],
      });
    } catch {
      /* ignore */
    }
  }, []);
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchOn(next);
    } catch {
      toast.error("Flash on kora gelo na.");
    }
  }, [torchOn]);

  // ---- Snap mode ------------------------------------------------------------
  const handleSnap = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      const blob = await captureFrame(v);
      if (!blob) {
        toast.error("Frame capture korte parina.");
        return;
      }
      const file = blobToFile(blob, `snap-${Date.now()}.jpg`);
      onSnap(file);
      toast.success("Chobi attach hoyeche — ekhon proshno likhe send korun.");
      close();
    } finally {
      setBusy(false);
    }
  }, [onSnap, close]);

  // ---- Live mode ------------------------------------------------------------
  const sendLiveFrame = useCallback(async () => {
    if (liveInFlightRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    const blob = await captureFrame(v);
    if (!blob) return;

    liveInFlightRef.current = true;
    const ac = new AbortController();
    liveAbortRef.current = ac;
    try {
      const fd = new FormData();
      fd.append("image", blob, "live.jpg");
      fd.append("mode", "live");
      // Pin the conversation to the *first* one resolved during this live
      // session — if the user switches the active chat in the sidebar mid-
      // stream, commentary stays in the original chat instead of leaking.
      const targetConv = liveConversationIdRef.current ?? conversationId;
      if (targetConv) fd.append("conversationId", targetConv);

      const res = await fetch(baseUrl("/vision/analyze"), {
        method: "POST",
        body: fd,
        signal: ac.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Vision call failed (${res.status})`);
      }
      const data = (await res.json()) as {
        text: string;
        conversationId: string | null;
        duplicate?: boolean;
      };
      // Lock in conversation id from server (covers auto-create case too).
      if (!liveConversationIdRef.current && data.conversationId) {
        liveConversationIdRef.current = data.conversationId;
      }
      const text = (data.text || "").trim();
      if (!text) return;
      // Server already enforces dedup, but we mirror client-side as a fast
      // path for status UI and to avoid a wasted invalidate round-trip.
      const localDup = !isMeaningfullyNew(lastReplyRef.current, text);
      if (data.duplicate || localDup) {
        setLiveStatus("Same scene — skipped");
        return;
      }
      lastReplyRef.current = text;
      setLiveStatus(text.length > 60 ? text.slice(0, 60) + "…" : text);
      if (data.conversationId) {
        qc.invalidateQueries({
          queryKey: conversationKeys.detail(data.conversationId),
        });
        qc.invalidateQueries({ queryKey: conversationKeys.list() });
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      // eslint-disable-next-line no-console
      console.warn("live-vision frame failed", err);
      setLiveStatus("Network/AI error — will retry");
    } finally {
      liveInFlightRef.current = false;
      liveAbortRef.current = null;
    }
  }, [conversationId, qc]);

  useEffect(() => {
    if (!isLive) {
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      liveAbortRef.current?.abort();
      return;
    }
    // Fire one immediately, then on interval.
    void sendLiveFrame();
    liveTimerRef.current = setInterval(() => {
      void sendLiveFrame();
    }, LIVE_INTERVAL_MS);
    return () => {
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      liveAbortRef.current?.abort();
    };
  }, [isLive, sendLiveFrame]);

  // Stop live + stream when switching mode.
  useEffect(() => {
    if (mode !== "live" && isLive) setLive(false);
  }, [mode, isLive, setLive]);

  // Reset live tracking when overlay closes or live stops.
  useEffect(() => {
    if (!isOpen) {
      lastReplyRef.current = null;
      liveConversationIdRef.current = null;
      setLiveStatus(null);
    }
  }, [isOpen]);
  useEffect(() => {
    if (!isLive) liveConversationIdRef.current = null;
  }, [isLive]);

  // Pause live capture + release stream when the tab is hidden — browsers
  // throttle background tabs anyway, and burning vision tokens / camera
  // power while invisible is exactly the abuse case we want to avoid.
  useEffect(() => {
    if (!isOpen) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (isLive) setLive(false);
        stopStream();
      } else if (document.visibilityState === "visible" && !streamRef.current) {
        void startStream();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isOpen, isLive, setLive, startStream, stopStream]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-label="Camera"
      data-testid="overlay-camera"
    >
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden bg-black text-white shadow-2xl",
          "sm:h-auto sm:max-h-[90vh] sm:w-[min(560px,90vw)] sm:rounded-2xl",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4" />
            <span>EzboAI Camera</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover-elevate active-elevate-2"
            onClick={close}
            aria-label="Close camera"
            data-testid="button-camera-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 border-b border-white/10 bg-black/40 p-1">
          {(["snap", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-white text-black"
                  : "text-white/70 hover:bg-white/10",
              )}
              data-testid={`button-camera-mode-${m}`}
            >
              {m === "snap" ? "📸 Snap & Ask" : "🎥 Live Vision"}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="relative flex-1 overflow-hidden bg-black">
          {permissionError ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera className="h-10 w-10 text-white/40" />
              <p className="text-sm text-white/80">{permissionError}</p>
              <Button
                variant="secondary"
                onClick={() => void startStream()}
                data-testid="button-camera-retry"
              >
                Abar try korun
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={cn(
                  "h-full w-full bg-black object-contain",
                  facing === "user" && "scale-x-[-1]",
                )}
                data-testid="video-camera-preview"
              />
              {isLive && (
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive/90 px-2 py-1 text-[11px] font-semibold">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-white" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  LIVE
                </div>
              )}
            </>
          )}
        </div>

        {/* Live status banner */}
        {mode === "live" && liveStatus && (
          <div
            className="border-t border-white/10 bg-black/60 px-3 py-2 text-[11px] text-white/80"
            data-testid="text-live-status"
          >
            {liveStatus}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-2 border-t border-white/10 bg-black/60 p-3">
          {zoomCaps && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-10 text-white/60">Zoom</span>
              <Slider
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={[zoom]}
                onValueChange={(v) => void applyZoom(v[0] ?? zoomCaps.min)}
                className="flex-1"
                data-testid="slider-camera-zoom"
              />
              <span className="w-10 text-right text-white/60">{zoom.toFixed(1)}×</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 text-white hover-elevate active-elevate-2"
                onClick={toggleFacing}
                aria-label="Switch camera"
                disabled={!!permissionError}
                data-testid="button-camera-flip"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              {torchSupported && (
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-9 w-9 text-white hover-elevate active-elevate-2",
                    torchOn && "bg-yellow-400/30",
                  )}
                  onClick={() => void toggleTorch()}
                  aria-label="Toggle flash"
                  data-testid="button-camera-flash"
                >
                  {torchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                </Button>
              )}
            </div>

            {mode === "snap" ? (
              <Button
                size="lg"
                className="h-12 min-w-[160px] rounded-full bg-white text-black hover:bg-white/90 hover-elevate active-elevate-2"
                onClick={() => void handleSnap()}
                disabled={!!permissionError || busy}
                data-testid="button-camera-snap"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="mr-2 h-5 w-5" />
                    Capture
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="lg"
                className={cn(
                  "h-12 min-w-[160px] rounded-full hover-elevate active-elevate-2",
                  isLive
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-white text-black hover:bg-white/90",
                )}
                onClick={() => setLive(!isLive)}
                disabled={!!permissionError}
                data-testid="button-camera-live-toggle"
              >
                {isLive ? (
                  <>
                    <Pause className="mr-2 h-5 w-5" />
                    Stop Live
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Start Live
                  </>
                )}
              </Button>
            )}

            <div className="w-[72px]" />
          </div>

          <p className="text-center text-[10px] text-white/50">
            {mode === "snap"
              ? "Capture korle chobi attach hobe — tarpor proshno likhe send korun."
              : "Pratyek 4 second e ekta frame AI ke pathano hobe."}
          </p>
        </div>
      </div>
    </div>
  );
}
