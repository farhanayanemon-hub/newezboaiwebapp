/**
 * Thin wrapper over the browser's Web Speech API (SpeechRecognition).
 * Browser support is patchy: Chrome / Edge / Safari work, Firefox does not.
 * Caller should fall back to cloud STT when `isBrowserSttSupported()` is false.
 */

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence?: number };
  }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSttSupported(): boolean {
  return getCtor() !== null;
}

export interface BrowserSttOptions {
  /** BCP-47 tag, e.g. "bn-BD", "en-US". */
  lang?: string;
  /** Stay listening across pauses (used by continuous-listen mode). */
  continuous?: boolean;
  /** Auto-stop after this many ms of detected silence. 0 = never. */
  silenceMs?: number;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onSilence?: () => void;
  onError?: (code: string, message?: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

export interface BrowserSttHandle {
  stop: () => void;
  abort: () => void;
}

export function startBrowserStt(opts: BrowserSttOptions = {}): BrowserSttHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts.lang ?? "bn-BD";
  rec.interimResults = true;
  rec.continuous = !!opts.continuous;
  rec.maxAlternatives = 1;

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  const armSilence = () => {
    if (!opts.silenceMs || opts.silenceMs <= 0) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      opts.onSilence?.();
    }, opts.silenceMs);
  };

  rec.onstart = () => opts.onStart?.();
  rec.onspeechstart = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };
  rec.onspeechend = () => armSilence();
  rec.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0].transcript;
      if (r.isFinal) final += text;
      else interim += text;
    }
    if (final) opts.onTranscript?.(final, true);
    if (interim) opts.onTranscript?.(interim, false);
    armSilence();
  };
  rec.onerror = (e) => opts.onError?.(e.error, e.message);
  rec.onend = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch (err) {
    opts.onError?.("start-failed", err instanceof Error ? err.message : String(err));
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    },
  };
}
