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


// Smart picker: choose the highest-quality available voice for the language.
// Prefer Google / Microsoft natural / Apple Siri / "Neural" / "Premium" tags
// over the system default, which is usually the worst-sounding option.
function pickBestVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (!voices.length) return null;
  const want = lang.toLowerCase();
  const wantPrefix = want.split(/[-_]/)[0];

  const sameLang = voices.filter((v) => {
    const vl = v.lang.toLowerCase();
    return vl === want || vl.startsWith(wantPrefix + "-") || vl === wantPrefix;
  });
  const pool = sameLang.length ? sameLang : voices;

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    // High-quality vendor neural voices.
    if (/google /i.test(v.name)) s += 100;
    if (/(natural|neural|premium|enhanced|wavenet|studio)/i.test(n)) s += 90;
    if (/microsoft .* (online|natural)/i.test(n)) s += 80;
    if (/(aria|jenny|guy|davis|emma|brian|samantha|alex|siri)/i.test(n)) s += 50;
    // Avoid eSpeak / Festival / "compact" / "fallback".
    if (/(espeak|festival|compact|fallback|robot)/i.test(n)) s -= 100;
    // Exact lang match beats partial.
    if (v.lang.toLowerCase() === want) s += 20;
    // localService=true is usually lower quality on Linux servers/old browsers.
    if (!v.localService) s += 10;
    if (v.default) s += 5;
    return s;
  };

  return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
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
    } else {
      const best = pickBestVoice(utt.lang);
      if (best) utt.voice = best;
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
