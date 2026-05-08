/**
 * Browser SpeechSynthesis wrapper. `speak()` returns a promise that resolves
 * when the utterance finishes (or is cancelled). Caller controls queueing.
 */

export function isBrowserTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isBrowserTtsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/** Wait until the (often async) voices list is populated. */
export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isBrowserTtsSupported()) {
      resolve([]);
      return;
    }
    const initial = listVoices();
    if (initial.length > 0) {
      resolve(initial);
      return;
    }
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(listVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(listVoices());
    }, timeoutMs);
  });
}

export interface SpeakOptions {
  /** BCP-47 tag, e.g. "bn-BD". */
  lang?: string;
  /** Voice name (must match SpeechSynthesisVoice.name). */
  voiceName?: string | null;
  /** 0.1 – 10. */
  rate?: number;
  /** 0 – 1. */
  volume?: number;
  /** 0 – 2. */
  pitch?: number;
  signal?: AbortSignal;
}

export function speakBrowser(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!isBrowserTtsSupported() || !text.trim()) {
      resolve();
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = opts.lang ?? "bn-BD";
    utt.rate = opts.rate ?? 1;
    utt.volume = opts.volume ?? 1;
    utt.pitch = opts.pitch ?? 1;
    if (opts.voiceName) {
      const v = listVoices().find((vv) => vv.name === opts.voiceName);
      if (v) utt.voice = v;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    utt.onend = finish;
    utt.onerror = finish;
    if (opts.signal) {
      const onAbort = () => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* noop */
        }
        finish();
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    window.speechSynthesis.speak(utt);
  });
}

export function cancelBrowserTts(): void {
  if (!isBrowserTtsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}
