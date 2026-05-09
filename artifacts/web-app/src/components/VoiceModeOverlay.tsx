import { useEffect, useMemo, useRef, useState } from "react";
import { X, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/stores/voiceStore";
import { startRecorder, type RecorderHandle } from "@/lib/speech/recorder";
import { transcribeCloud } from "@/lib/speech/sttCloud";
import { isBrowserSttSupported, startBrowserStt } from "@/lib/speech/sttBrowser";
import { stopActiveSpeech } from "@/lib/speech/speechQueue";
import { toast } from "sonner";

type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Push transcribed text into the composer input. */
  onChange: (text: string) => void;
  /** Trigger composer send (used when silence is detected). */
  onAutoSend: () => void;
  disabled?: boolean;
}

const SILENCE_MS = 1200;

export function VoiceModeOverlay({ open, onClose, onChange, onAutoSend, disabled }: Props) {
  const sttEngine = useVoiceStore((s) => s.sttEngine);
  const sttLang = useVoiceStore((s) => s.sttLang);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);

  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0); // 0..1 RMS
  const recorderRef = useRef<RecorderHandle | null>(null);
  const browserStopRef = useRef<(() => void) | null>(null);
  const finalTextRef = useRef("");
  const rafRef = useRef(0);
  const speakingPulseRef = useRef(0);

  // Track AI speaking → drive phase + restart mic on speech end.
  useEffect(() => {
    if (!open) return;
    if (isSpeaking) {
      setPhase("speaking");
    } else if (phase === "speaking") {
      // AI just finished speaking — auto-restart listening for hands-free loop.
      setPhase("idle");
      const t = setTimeout(() => {
        if (open) void start();
      }, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, open]);

  // Smooth synthetic pulse when AI is speaking (browser TTS has no tappable
  // audio stream, so we drive an oscillator).
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const tick = (t: number) => {
      if (!mounted) return;
      if (phase === "speaking") {
        speakingPulseRef.current = 0.55 + 0.35 * Math.abs(Math.sin(t / 220));
        setLevel(speakingPulseRef.current);
      } else if (phase === "idle" || phase === "thinking") {
        // Gentle breathing.
        setLevel(0.18 + 0.08 * Math.abs(Math.sin(t / 700)));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [open, phase]);

  // Auto-start when opened.
  useEffect(() => {
    if (!open) return;
    void start();
    return () => {
      void cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Hard stop everything when closing.
  useEffect(() => {
    if (!open) {
      void cleanup();
      stopActiveSpeech();
      setPhase("idle");
      setInterim("");
      setLevel(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function cleanup() {
    if (recorderRef.current) {
      try { recorderRef.current.cancel(); } catch { /* */ }
      recorderRef.current = null;
    }
    if (browserStopRef.current) {
      try { browserStopRef.current(); } catch { /* */ }
      browserStopRef.current = null;
    }
  }

  async function start() {
    if (disabled) return;
    if (isSpeaking) stopActiveSpeech();
    finalTextRef.current = "";
    setInterim("");
    setPhase("listening");

    // Browser STT path — instant, but no analyser. We open a parallel
    // getUserMedia for the visualizer.
    if (sttEngine === "browser" && isBrowserSttSupported()) {
      const ok = await startBrowserVisualizer();
      if (!ok) {
        // Permission denied — fall back to cloud which surfaces the same error
        // via a toast inside the recorder helper.
        await startCloud();
        return;
      }
      const handle = startBrowserStt({
        lang: sttLang === "auto" ? undefined : sttLang,
        continuous: false,
        silenceMs: SILENCE_MS,
        onTranscript: (t, isFinal) => {
          if (isFinal) {
            finalTextRef.current += t;
            setInterim(finalTextRef.current);
          } else {
            setInterim(finalTextRef.current + t);
          }
        },
        onSilence: () => handle?.stop(),
        onError: (code) => {
          if (code === "not-allowed" || code === "service-not-allowed") {
            toast.error("Microphone permission denied.");
            onClose();
          }
          void cleanup();
        },
        onEnd: () => {
          const text = finalTextRef.current.trim();
          void cleanup();
          if (text) {
            setPhase("thinking");
            onChange(text);
            setTimeout(() => onAutoSend(), 30);
          } else {
            setPhase("idle");
          }
        },
      });
      if (!handle) await startCloud();
      return;
    }
    await startCloud();
  }

  // Open a stand-alone getUserMedia stream just to feed the orb animation
  // while browser STT does the actual transcription.
  async function startBrowserVisualizer(): Promise<boolean> {
    try {
      const handle = await startRecorder({
        silenceMs: 0,
        onLevel: (rms) => setLevel(Math.min(1, rms * 6)),
      });
      recorderRef.current = handle;
      return true;
    } catch (e) {
      console.warn("visualizer mic failed", e);
      return false;
    }
  }

  async function startCloud() {
    try {
      const handle = await startRecorder({
        silenceMs: SILENCE_MS,
        onLevel: (rms) => setLevel(Math.min(1, rms * 6)),
        onSilence: () => void stopAndTranscribe(),
        onError: (msg) => {
          toast.error(`Mic: ${msg}`);
          void cleanup();
          setPhase("idle");
        },
      });
      recorderRef.current = handle;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/permission|denied|NotAllowed/i.test(msg)) {
        toast.error("Microphone permission denied.");
        onClose();
      } else {
        toast.error(`Mic error: ${msg}`);
      }
      setPhase("idle");
    }
  }

  async function stopAndTranscribe() {
    const handle = recorderRef.current;
    if (!handle) return;
    recorderRef.current = null;
    setPhase("thinking");
    const blob = await handle.stop();
    if (!blob || blob.size < 200) {
      setPhase("idle");
      return;
    }
    try {
      const r = await transcribeCloud(blob, {
        language: sttLang === "auto" ? undefined : sttLang,
      });
      const t = r.transcript?.trim();
      if (!t) {
        setPhase("idle");
        return;
      }
      setInterim(t);
      onChange(t);
      setTimeout(() => onAutoSend(), 30);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  function tapOrb() {
    if (phase === "listening") {
      // Stop and commit.
      if (sttEngine === "browser" && isBrowserSttSupported()) {
        // browser STT: just clean up — onEnd handler will commit.
        void cleanup();
      } else {
        void stopAndTranscribe();
      }
      return;
    }
    if (phase === "speaking") {
      stopActiveSpeech();
      setPhase("idle");
      return;
    }
    void start();
  }

  // Visual sizing — orb scales with `level`.
  const scale = useMemo(() => 1 + level * 0.55, [level]);
  const ringScale = useMemo(() => 1 + level * 0.9, [level]);

  if (!open) return null;

  const phaseLabel: Record<Phase, string> = {
    idle: "Tap to talk",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-background/95 backdrop-blur-xl"
      data-testid="voice-mode-overlay"
    >
      {/* Top bar */}
      <div className="flex w-full items-center justify-between p-4">
        <div className="text-sm font-medium text-muted-foreground">Voice mode</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close voice mode"
          data-testid="button-voice-close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Center orb + transcript */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <button
          type="button"
          onClick={tapOrb}
          className="relative h-56 w-56 cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-primary/50 rounded-full"
          aria-label="Toggle listening"
          data-testid="voice-orb"
        >
          {/* Outer ring */}
          <div
            className={cn(
              "absolute inset-0 rounded-full bg-primary/15 transition-transform duration-100 ease-out",
            )}
            style={{ transform: `scale(${ringScale})` }}
          />
          {/* Mid ring */}
          <div
            className="absolute inset-4 rounded-full bg-primary/25 transition-transform duration-75 ease-out"
            style={{ transform: `scale(${1 + level * 0.6})` }}
          />
          {/* Core orb */}
          <div
            className={cn(
              "absolute inset-8 rounded-full transition-transform duration-75 ease-out",
              "bg-gradient-to-br from-primary via-primary to-primary/70 shadow-[0_0_60px_-10px_var(--primary)]",
              phase === "thinking" && "animate-pulse",
            )}
            style={{ transform: `scale(${scale})` }}
          />
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center text-primary-foreground">
            {phase === "thinking" ? (
              <Loader2 className="h-10 w-10 animate-spin" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </div>
        </button>

        <div className="min-h-[3.5rem] max-w-xl text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {phaseLabel[phase]}
          </div>
          {interim && (
            <div
              className="mt-2 text-base text-foreground/90 line-clamp-3"
              data-testid="voice-transcript"
            >
              {interim}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex w-full items-center justify-center gap-3 p-6">
        <Button
          variant="outline"
          onClick={onClose}
          data-testid="button-voice-end"
        >
          End call
        </Button>
      </div>
    </div>
  );
}
