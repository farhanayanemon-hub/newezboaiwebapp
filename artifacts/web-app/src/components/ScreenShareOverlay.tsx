import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Monitor,
  X,
  Send,
  Pause,
  Play,
  GripHorizontal,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useScreenShareStore } from "@/stores/screenShareStore";
import { useChatStore } from "@/stores/chatStore";
import { conversationKeys } from "@/lib/conversations";
import { baseUrl } from "@/lib/api";
import { captureFrame } from "@/lib/camera/captureFrame";
import { dHash, isFrameChanged } from "@/lib/frameDiff";
import { isMeaningfullyNew } from "@/lib/camera/similarity";

/**
 * The overlay renders as a small floating, draggable thumbnail in the bottom-
 * right corner. Clicking the thumbnail expands the controls panel.
 *
 * Two modes:
 *  - "ask": frames are *only* captured + sent when the user submits a
 *    question via the inline input. No background API spend.
 *  - "proactive": every `intervalMs`, frame is hashed and (if it actually
 *    changed) sent to /vision/analyze with the proactive system prompt.
 *    Backend filters [no action] replies before persisting.
 */

const MIN_INTERVAL = 4000;
const MAX_INTERVAL = 15000;

export function ScreenShareOverlay() {
  const isOpen = useScreenShareStore((s) => s.isOpen);
  const close = useScreenShareStore((s) => s.close);
  const isActive = useScreenShareStore((s) => s.isActive);
  const setActive = useScreenShareStore((s) => s.setActive);
  const mode = useScreenShareStore((s) => s.mode);
  const setMode = useScreenShareStore((s) => s.setMode);
  const intervalMs = useScreenShareStore((s) => s.intervalMs);
  const setIntervalMs = useScreenShareStore((s) => s.setIntervalMs);
  const framesSent = useScreenShareStore((s) => s.framesSent);
  const incrementFrames = useScreenShareStore((s) => s.incrementFrames);
  const resetFrames = useScreenShareStore((s) => s.resetFrames);
  const isPaused = useScreenShareStore((s) => s.isPaused);
  const togglePaused = useScreenShareStore((s) => s.togglePaused);

  const conversationId = useChatStore((s) => s.activeConversationId);
  const qc = useQueryClient();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamGenRef = useRef(0);

  // Proactive loop refs
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const proactiveAbortRef = useRef<AbortController | null>(null);
  const lastHashRef = useRef<bigint | null>(null);
  const lastReplyRef = useRef<string | null>(null);
  const sessionConvIdRef = useRef<string | null>(null);

  const [askInput, setAskInput] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Draggable position (stored only in component state — resets on close).
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // ---- Stream lifecycle -----------------------------------------------------
  const stopStream = useCallback(() => {
    streamGenRef.current++;
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    lastHashRef.current = null;
    lastReplyRef.current = null;
    sessionConvIdRef.current = null;
  }, [setActive]);

  const startStream = useCallback(async () => {
    setPermissionError(null);
    stopStream();
    const myGen = ++streamGenRef.current;
    try {
      // Standard call — browser shows the native picker (Screen / Window / Tab).
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 15 } },
        audio: false,
      });
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
      resetFrames();

      // The native "Stop sharing" button fires `ended` on the track. We must
      // listen for both `ended` and `inactive` to handle every browser.
      const track = stream.getVideoTracks()[0];
      const onEnded = () => {
        toast.info("Screen share bondho hoyeche.");
        stopStream();
      };
      track.addEventListener("ended", onEnded);
      stream.addEventListener("inactive", onEnded);
    } catch (err) {
      if (myGen !== streamGenRef.current) return;
      const name = (err as DOMException)?.name || "";
      if (name === "NotAllowedError" || name === "AbortError") {
        // User dismissed the picker — silent.
        close();
        return;
      }
      setPermissionError(
        "Screen share start kora gelo na. Browser support na thakte pare ba permission deni.",
      );
    }
  }, [stopStream, setActive, resetFrames, close]);

  // Start stream when overlay opens; clean up on close.
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

  // Visibility: stop the proactive loop when tab hidden. We *don't* tear
  // down the stream (re-prompting getDisplayMedia is annoying). When the
  // tab becomes visible again, the main effect below restarts the loop —
  // no need to handle that here.
  useEffect(() => {
    if (!isOpen) return;
    const onVis = () => {
      if (document.visibilityState === "hidden" && loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isOpen]);

  // ---- Frame analysis -------------------------------------------------------
  const analyzeCurrentFrame = useCallback(
    async (
      analyzeMode: "screen-ask" | "screen-proactive",
      question?: string,
    ): Promise<{ skipped?: boolean }> => {
      const v = videoRef.current;
      if (!v) return { skipped: true };

      // For proactive: skip if frame hasn't meaningfully changed.
      if (analyzeMode === "screen-proactive") {
        const hash = dHash(v);
        if (!isFrameChanged(lastHashRef.current, hash)) {
          setStatusMsg("Screen unchanged — skipped");
          return { skipped: true };
        }
        lastHashRef.current = hash;
      }

      const blob = await captureFrame(v, { maxWidth: 1280, quality: 0.7 });
      if (!blob) return { skipped: true };

      const ac = new AbortController();
      proactiveAbortRef.current = ac;
      const fd = new FormData();
      fd.append("image", blob, "screen.jpg");
      fd.append("mode", analyzeMode);
      if (question) fd.append("question", question);
      const targetConv = sessionConvIdRef.current ?? conversationId;
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
        suppressed?: boolean;
      };
      incrementFrames();
      if (!sessionConvIdRef.current && data.conversationId) {
        sessionConvIdRef.current = data.conversationId;
      }
      const text = (data.text || "").trim();
      if (data.suppressed) {
        setStatusMsg("AI dekhche — kichu bola dorkar nai");
        return {};
      }
      if (data.duplicate) {
        setStatusMsg("Same as before — skipped");
        return {};
      }
      if (
        analyzeMode === "screen-proactive" &&
        !isMeaningfullyNew(lastReplyRef.current, text)
      ) {
        setStatusMsg("Same suggestion — skipped");
        return {};
      }
      lastReplyRef.current = text;
      setStatusMsg(text.length > 80 ? text.slice(0, 80) + "…" : text);
      if (data.conversationId) {
        qc.invalidateQueries({
          queryKey: conversationKeys.detail(data.conversationId),
        });
        qc.invalidateQueries({ queryKey: conversationKeys.list() });
      }
      return {};
    },
    [conversationId, incrementFrames, qc],
  );

  // ---- Proactive loop -------------------------------------------------------
  // Loop must read pause state from a ref (not closure) so the running
  // setTimeout callback always sees fresh values without re-creation.
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const scheduleNext = useCallback(() => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    loopTimerRef.current = setTimeout(async () => {
      loopTimerRef.current = null;
      if (!isActive || mode !== "proactive" || isPausedRef.current) return;
      if (inFlightRef.current) {
        scheduleNext();
        return;
      }
      inFlightRef.current = true;
      try {
        await analyzeCurrentFrame("screen-proactive");
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.warn("proactive frame failed", err);
          setStatusMsg("Network/AI error — will retry");
        }
      } finally {
        inFlightRef.current = false;
        proactiveAbortRef.current = null;
        if (isActive && mode === "proactive" && !isPausedRef.current) {
          scheduleNext();
        }
      }
    }, intervalMs);
  }, [intervalMs, isActive, mode, analyzeCurrentFrame]);

  // Single source of truth: runs whenever any of the gating inputs change.
  useEffect(() => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    proactiveAbortRef.current?.abort();
    if (isActive && mode === "proactive" && !isPaused) scheduleNext();
    return () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      proactiveAbortRef.current?.abort();
    };
  }, [isActive, mode, isPaused, scheduleNext]);

  // ---- Ask flow -------------------------------------------------------------
  const handleAsk = useCallback(async () => {
    const q = askInput.trim();
    if (!q || askBusy) return;
    setAskBusy(true);
    try {
      await analyzeCurrentFrame("screen-ask", q);
      setAskInput("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Screen ask failed",
      );
    } finally {
      setAskBusy(false);
    }
  }, [askInput, askBusy, analyzeCurrentFrame]);

  // ---- Drag -----------------------------------------------------------------
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // Drag origin is bottom-right anchored, so subtract.
    setPos({
      x: Math.max(0, dragRef.current.origX - dx),
      y: Math.max(0, dragRef.current.origY - dy),
    });
  };
  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  if (!isOpen) return null;

  // Cost estimate: rough — assumes ~0.005 USD per vision call (gpt-4o-mini-ish).
  // Display only; no billing logic.
  const callsPerMin = mode === "proactive" ? 60_000 / intervalMs : 0;
  const estPerMin = (callsPerMin * 0.005).toFixed(3);

  return (
    <div
      className="fixed z-40 flex w-[320px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      style={{ right: pos.x, bottom: pos.y }}
      data-testid="overlay-screen-share"
    >
      {/* Drag handle / header */}
      <div
        className="flex cursor-grab items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Monitor className="h-3.5 w-3.5" />
          <span>Screen share</span>
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover-elevate active-elevate-2"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            data-testid="button-screen-collapse"
          >
            {expanded ? "−" : "+"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover-elevate active-elevate-2"
            onClick={close}
            aria-label="Close screen share"
            data-testid="button-screen-close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview thumbnail */}
      <div className="relative aspect-video w-full bg-black">
        {permissionError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-white/80">
            <Monitor className="h-6 w-6 opacity-60" />
            <p>{permissionError}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void startStream()}
              data-testid="button-screen-retry"
            >
              Abar try korun
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-contain"
            data-testid="video-screen-preview"
          />
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 p-2">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
            {(["ask", "proactive"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`button-screen-mode-${m}`}
              >
                {m === "ask" ? (
                  <>
                    <HelpCircle className="h-3 w-3" /> Ask
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-3 w-3" /> Proactive
                  </>
                )}
              </button>
            ))}
          </div>

          {mode === "ask" ? (
            <div className="flex items-end gap-1">
              <textarea
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleAsk();
                  }
                }}
                placeholder="Ei screen sombondhe ki janite chao?"
                rows={2}
                disabled={!isActive || askBusy}
                className="min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                data-testid="input-screen-ask"
              />
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={() => void handleAsk()}
                disabled={!isActive || askBusy || !askInput.trim()}
                aria-label="Ask"
                data-testid="button-screen-ask-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Sample every</span>
                <span className="font-medium text-foreground">
                  {(intervalMs / 1000).toFixed(0)}s
                </span>
              </div>
              <Slider
                min={MIN_INTERVAL}
                max={MAX_INTERVAL}
                step={1000}
                value={[intervalMs]}
                onValueChange={(v) => setIntervalMs(v[0] ?? intervalMs)}
                data-testid="slider-screen-interval"
              />
              <p className="text-[10px] text-muted-foreground/80">
                ~{callsPerMin.toFixed(1)} calls/min · est. ${estPerMin}/min ·
                only sends on real screen change
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Frames sent: <span className="font-medium text-foreground">{framesSent}</span>
                </span>
                <Button
                  size="sm"
                  variant={isPaused ? "secondary" : "destructive"}
                  className="h-7"
                  onClick={() => {
                    togglePaused();
                    setStatusMsg(isPaused ? "Resumed" : "Paused");
                  }}
                  disabled={!isActive}
                  data-testid="button-screen-pause"
                >
                  {isPaused ? (
                    <>
                      <Play className="mr-1 h-3 w-3" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1 h-3 w-3" /> Pause
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {statusMsg && (
            <div
              className="rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground"
              data-testid="text-screen-status"
            >
              {statusMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
