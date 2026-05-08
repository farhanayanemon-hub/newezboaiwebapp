import { useEffect, useRef } from "react";
import { useVoiceStore } from "@/stores/voiceStore";
import {
  isBrowserSttSupported,
  startBrowserStt,
  type BrowserSttHandle,
} from "./sttBrowser";

/**
 * Continuous-listen mode. When enabled in settings AND the AI isn't speaking
 * AND the user isn't already actively recording, keep a passive Web Speech
 * recognizer open. On a final transcript that passes the wake-phrase filter,
 * fire `onUtterance(text)`; the host (Chat) then sends it.
 *
 * IMPORTANT: We pause this loop while `isSpeaking` is true so the mic doesn't
 * pick up TTS output and feed it back as a new prompt.
 */
export function useContinuousListen(onUtterance: (text: string) => void): void {
  const enabled = useVoiceStore((s) => s.continuousListen);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const isRecording = useVoiceStore((s) => s.isRecording);
  const lang = useVoiceStore((s) => s.sttLang);
  const wakePhrase = useVoiceStore((s) => s.wakePhrase);

  const handle = useRef<BrowserSttHandle | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  useEffect(() => {
    if (!enabled) return;
    if (!isBrowserSttSupported()) return;
    // Don't run while the user is actively driving the mic (one-shot/PTT) or
    // while the AI is talking — both would cause echo / collisions.
    if (isSpeaking || isRecording) {
      handle.current?.abort();
      handle.current = null;
      return;
    }

    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFinal = "";

    const arm = () => {
      if (stopped) return;
      const h = startBrowserStt({
        lang: lang === "auto" ? undefined : lang,
        continuous: false,
        silenceMs: 1500,
        onTranscript: (text, isFinal) => {
          if (isFinal) lastFinal = (lastFinal + " " + text).trim();
        },
        onSilence: () => {
          handle.current?.stop();
        },
        onEnd: () => {
          const text = lastFinal.trim();
          lastFinal = "";
          if (text) {
            const wp = wakePhrase.trim().toLowerCase();
            if (!wp || text.toLowerCase().includes(wp)) {
              const cleaned = wp
                ? text.replace(new RegExp(wp, "ig"), "").trim()
                : text;
              if (cleaned) onUtteranceRef.current(cleaned);
            }
          }
          // Re-arm shortly so we keep listening.
          if (!stopped) restartTimer = setTimeout(arm, 250);
        },
        onError: (code) => {
          // "no-speech" / "aborted" are normal; back off briefly.
          const wait = code === "not-allowed" ? 5000 : 800;
          if (!stopped) restartTimer = setTimeout(arm, wait);
        },
      });
      handle.current = h;
    };

    arm();
    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      handle.current?.abort();
      handle.current = null;
    };
  }, [enabled, isSpeaking, isRecording, lang, wakePhrase]);
}
