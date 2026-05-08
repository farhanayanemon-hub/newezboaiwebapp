import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useVoiceStore } from "@/stores/voiceStore";
import {
  isBrowserSttSupported,
  startBrowserStt,
  type BrowserSttHandle,
} from "@/lib/speech/sttBrowser";
import { startRecorder, type RecorderHandle } from "@/lib/speech/recorder";
import { transcribeCloud } from "@/lib/speech/sttCloud";
import { stopActiveSpeech } from "@/lib/speech/speechQueue";
import { AudioVisualizer } from "@/components/AudioVisualizer";

interface MicButtonProps {
  /** Live (interim + final) transcript appended to the input as user speaks. */
  onInterim: (text: string) => void;
  /** Replace the entire input value (used to commit a final transcript). */
  onFinal: (text: string) => void;
  /** Optional: auto-send after final transcript (one-shot mode). */
  onAutoSend?: () => void;
  disabled?: boolean;
}

const SILENCE_MS = 2000;
const LONG_PRESS_MS = 350;

export function MicButton({ onInterim, onFinal, onAutoSend, disabled }: MicButtonProps) {
  const sttEngine = useVoiceStore((s) => s.sttEngine);
  const sttLang = useVoiceStore((s) => s.sttLang);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const setRecording = useVoiceStore((s) => s.setRecording);
  const isRecording = useVoiceStore((s) => s.isRecording);

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const browserHandle = useRef<BrowserSttHandle | null>(null);
  const recorderHandle = useRef<RecorderHandle | null>(null);
  const finalText = useRef<string>("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const autoSendOnEnd = useRef(false);
  /** Set true if the user releases pointer before the async start finishes. */
  const pendingRelease = useRef<{ commit: boolean } | null>(null);

  const cleanup = useCallback(() => {
    setRecording(false);
    setAnalyser(null);
    if (browserHandle.current) {
      browserHandle.current.abort();
      browserHandle.current = null;
    }
    if (recorderHandle.current) {
      recorderHandle.current.cancel();
      recorderHandle.current = null;
    }
  }, [setRecording]);

  useEffect(() => () => cleanup(), [cleanup]);

  const startBrowser = useCallback(
    (autoSend: boolean) => {
      if (!isBrowserSttSupported()) {
        toast.error("Browser does not support speech recognition. Switching to cloud STT in Settings.");
        return false;
      }
      finalText.current = "";
      autoSendOnEnd.current = autoSend;
      const handle = startBrowserStt({
        lang: sttLang === "auto" ? undefined : sttLang,
        continuous: false,
        silenceMs: autoSend ? SILENCE_MS : 0,
        onStart: () => {
          setRecording(true);
          // If the pointer was already released during async startup, honor it.
          const pending = pendingRelease.current;
          if (pending) {
            pendingRelease.current = null;
            autoSendOnEnd.current = pending.commit;
            try {
              browserHandle.current?.stop();
            } catch {
              /* noop */
            }
          }
        },
        onTranscript: (text, isFinal) => {
          if (isFinal) {
            finalText.current += text;
            onFinal(finalText.current);
          } else {
            onInterim(finalText.current + text);
          }
        },
        onSilence: () => {
          browserHandle.current?.stop();
        },
        onError: (code, msg) => {
          if (code === "not-allowed" || code === "service-not-allowed") {
            toast.error("Microphone permission denied.");
          } else if (code !== "aborted" && code !== "no-speech") {
            toast.error(`Speech: ${code}${msg ? ` — ${msg}` : ""}`);
          }
          cleanup();
        },
        onEnd: () => {
          const finalValue = finalText.current.trim();
          cleanup();
          if (autoSendOnEnd.current && finalValue) {
            onAutoSend?.();
          }
          autoSendOnEnd.current = false;
        },
      });
      if (!handle) return false;
      browserHandle.current = handle;
      return true;
    },
    [sttLang, onFinal, onInterim, onAutoSend, cleanup, setRecording],
  );

  const startCloud = useCallback(
    async (autoSend: boolean) => {
      try {
        autoSendOnEnd.current = autoSend;
        const handle = await startRecorder({
          silenceMs: autoSend ? SILENCE_MS : 0,
          onSilence: () => {
            void stopAndTranscribe();
          },
          onError: (msg) => {
            toast.error(`Mic: ${msg}`);
            cleanup();
          },
          onStart: () => {
            setRecording(true);
            const pending = pendingRelease.current;
            if (pending) {
              pendingRelease.current = null;
              autoSendOnEnd.current = pending.commit;
              void stopAndTranscribe();
            }
          },
        });
        recorderHandle.current = handle;
        setAnalyser(handle.analyser);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/permission|denied|NotAllowed/i.test(msg)) {
          toast.error("Microphone permission denied.");
        } else {
          toast.error(`Mic error: ${msg}`);
        }
        cleanup();
        return false;
      }
    },
    [cleanup, setRecording],
  );

  const stopAndTranscribe = useCallback(async () => {
    const handle = recorderHandle.current;
    if (!handle) return;
    recorderHandle.current = null;
    setAnalyser(null);
    setRecording(false);
    const blob = await handle.stop();
    if (!blob || blob.size < 200) {
      toast.info("No audio captured.");
      return;
    }
    try {
      const result = await transcribeCloud(blob, {
        language: sttLang === "auto" ? undefined : sttLang,
      });
      const t = result.transcript?.trim();
      if (!t) {
        toast.info("Could not understand audio.");
        return;
      }
      onFinal(t);
      if (autoSendOnEnd.current) onAutoSend?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      autoSendOnEnd.current = false;
    }
  }, [sttLang, onFinal, onAutoSend, setRecording]);

  const startListening = useCallback(
    async (autoSend: boolean) => {
      // Critical: mute AI speech before opening the mic so we don't loop.
      if (isSpeaking) stopActiveSpeech();
      if (sttEngine === "browser") {
        if (startBrowser(autoSend)) return;
        // Fall back to cloud.
        await startCloud(autoSend);
        return;
      }
      await startCloud(autoSend);
    },
    [sttEngine, isSpeaking, startBrowser, startCloud],
  );

  const stopListening = useCallback(async () => {
    if (browserHandle.current) {
      browserHandle.current.stop();
      return;
    }
    if (recorderHandle.current) {
      await stopAndTranscribe();
    }
  }, [stopAndTranscribe]);

  // Tap = one-shot with auto-send on silence; long-press = push-to-talk (commit on release).
  const onPointerDown = useCallback(() => {
    if (disabled) return;
    isLongPress.current = false;
    pendingRelease.current = null;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      // Push-to-talk: don't auto-send on silence; commit on release instead.
      void startListening(false);
    }, LONG_PRESS_MS);
  }, [disabled, startListening]);

  const onPointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current) {
      // End of push-to-talk. The recorder may still be starting up
      // asynchronously — record the intent so onStart can honor it.
      isLongPress.current = false;
      if (isRecording) {
        autoSendOnEnd.current = true;
        void stopListening();
      } else {
        pendingRelease.current = { commit: true };
      }
      return;
    }
    if (isRecording) {
      // Tap-to-stop while recording from a previous tap.
      void stopListening();
      return;
    }
    // Plain tap: start one-shot with silence-detected auto-send.
    void startListening(true);
  }, [isRecording, startListening, stopListening]);

  const onPointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pendingRelease.current = null;
    if (isRecording) cleanup();
    isLongPress.current = false;
  }, [isRecording, cleanup]);

  return (
    <div className="flex items-center gap-1">
      {isRecording && (
        <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          {analyser && <AudioVisualizer analyser={analyser} className="h-5 w-16" />}
        </div>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerCancel}
            onPointerCancel={onPointerCancel}
            className={cn(
              "h-8 w-8 rounded-lg text-muted-foreground hover-elevate active-elevate-2",
              isRecording && "text-destructive",
            )}
            aria-label={isRecording ? "Stop recording" : "Voice input"}
            data-testid="button-action-mic"
          >
            {isRecording ? (
              <Square className="h-4 w-4 fill-current" />
            ) : sttEngine === "browser" && !isBrowserSttSupported() ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isRecording
            ? "Tap to stop"
            : "Tap to speak · long-press for push-to-talk"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
