import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SttEngine = "browser" | "cloud";
export type TtsEngine = "browser" | "cloud";
export type SttLang = "bn-BD" | "en-US" | "auto";

export interface VoicePrefs {
  sttEngine: SttEngine;
  sttLang: SttLang;
  ttsEngine: TtsEngine;
  ttsVoice: string;
  /** Browser TTS voice name (separate from cloud voice id). */
  browserTtsVoice: string | null;
  /** 0.7 – 1.5 */
  ttsSpeed: number;
  /** Auto-speak streaming AI replies. */
  autoSpeak: boolean;
  /** Continuous listen mode — mic auto-restarts after each utterance. */
  continuousListen: boolean;
  /** Optional wake-phrase filter for continuous mode. Empty = no filter. */
  wakePhrase: string;
}

interface VoiceState extends VoicePrefs {
  /** Live UI state — true while AI TTS is speaking. */
  isSpeaking: boolean;
  /** Live UI state — true while mic is actively recording / listening. */
  isRecording: boolean;

  setSttEngine: (e: SttEngine) => void;
  setSttLang: (l: SttLang) => void;
  setTtsEngine: (e: TtsEngine) => void;
  setTtsVoice: (v: string) => void;
  setBrowserTtsVoice: (v: string | null) => void;
  setTtsSpeed: (s: number) => void;
  setAutoSpeak: (b: boolean) => void;
  setContinuousListen: (b: boolean) => void;
  setWakePhrase: (s: string) => void;

  setSpeaking: (b: boolean) => void;
  setRecording: (b: boolean) => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      sttEngine: "browser",
      sttLang: "bn-BD",
      ttsEngine: "browser",
      ttsVoice: "alloy",
      browserTtsVoice: null,
      ttsSpeed: 1.0,
      autoSpeak: false,
      continuousListen: false,
      wakePhrase: "",

      isSpeaking: false,
      isRecording: false,

      setSttEngine: (sttEngine) => set({ sttEngine }),
      setSttLang: (sttLang) => set({ sttLang }),
      setTtsEngine: (ttsEngine) => set({ ttsEngine }),
      setTtsVoice: (ttsVoice) => set({ ttsVoice }),
      setBrowserTtsVoice: (browserTtsVoice) => set({ browserTtsVoice }),
      setTtsSpeed: (ttsSpeed) => set({ ttsSpeed: Math.min(1.5, Math.max(0.7, ttsSpeed)) }),
      setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
      setContinuousListen: (continuousListen) => set({ continuousListen }),
      setWakePhrase: (wakePhrase) => set({ wakePhrase }),

      setSpeaking: (isSpeaking) => set({ isSpeaking }),
      setRecording: (isRecording) => set({ isRecording }),
    }),
    {
      name: "ezboai-voice-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): VoicePrefs => ({
        sttEngine: s.sttEngine,
        sttLang: s.sttLang,
        ttsEngine: s.ttsEngine,
        ttsVoice: s.ttsVoice,
        browserTtsVoice: s.browserTtsVoice,
        ttsSpeed: s.ttsSpeed,
        autoSpeak: s.autoSpeak,
        continuousListen: s.continuousListen,
        wakePhrase: s.wakePhrase,
      }),
    },
  ),
);
