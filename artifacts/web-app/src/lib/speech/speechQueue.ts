import { useVoiceStore } from "@/stores/voiceStore";
import { speakBrowser, cancelBrowserTts } from "./ttsBrowser";
import { playCloud, type CloudPlayHandle } from "./ttsCloud";

/**
 * Speech queue for streaming AI replies. Splits incoming token deltas on
 * sentence boundaries (। . ! ? newline) and speaks each sentence in order.
 *
 *   const q = new SpeechQueue();
 *   q.feed(deltaText);
 *   q.flush();         // speak any trailing buffered text
 *   q.cancel();        // stop everything immediately
 */

const SENTENCE_RE = /[।.!?\n]+\s*/g;

export class SpeechQueue {
  private buffer = "";
  private queue: string[] = [];
  private playing = false;
  private cloudHandle: CloudPlayHandle | null = null;
  private abort: AbortController | null = null;
  private cancelled = false;

  /** Append an incoming delta and enqueue any newly-completed sentences. */
  feed(delta: string): void {
    if (this.cancelled) return;
    this.buffer += delta;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    SENTENCE_RE.lastIndex = 0;
    const sentences: string[] = [];
    while ((m = SENTENCE_RE.exec(this.buffer)) != null) {
      const end = m.index + m[0].length;
      const piece = this.buffer.slice(lastEnd, end).trim();
      if (piece) sentences.push(piece);
      lastEnd = end;
    }
    if (lastEnd > 0) this.buffer = this.buffer.slice(lastEnd);
    if (sentences.length) {
      this.queue.push(...sentences);
      void this.drain();
    }
  }

  /** Flush any trailing partial text as a final sentence. */
  flush(): void {
    if (this.cancelled) return;
    const tail = this.buffer.trim();
    this.buffer = "";
    if (tail) {
      this.queue.push(tail);
      void this.drain();
    }
  }

  /** Cancel everything in-flight and clear queue. */
  cancel(): void {
    this.cancelled = true;
    this.queue = [];
    this.buffer = "";
    if (this.abort) {
      this.abort.abort();
      this.abort = null;
    }
    if (this.cloudHandle) {
      this.cloudHandle.stop();
      this.cloudHandle = null;
    }
    cancelBrowserTts();
    useVoiceStore.getState().setSpeaking(false);
  }

  private async drain(): Promise<void> {
    if (this.playing || this.cancelled) return;
    this.playing = true;
    useVoiceStore.getState().setSpeaking(true);
    try {
      while (this.queue.length > 0 && !this.cancelled) {
        const next = this.queue.shift()!;
        await this.speakOne(next);
      }
    } finally {
      this.playing = false;
      useVoiceStore.getState().setSpeaking(this.queue.length > 0);
    }
  }

  private async speakOne(text: string): Promise<void> {
    const prefs = useVoiceStore.getState();
    if (prefs.ttsEngine === "cloud") {
      this.abort = new AbortController();
      try {
        this.cloudHandle = await playCloud({
          text,
          voice: prefs.ttsVoice,
          speed: prefs.ttsSpeed,
          signal: this.abort.signal,
        });
        await this.cloudHandle.done;
      } catch {
        // Cloud failure → fall back to browser TTS for this sentence.
        if (!this.cancelled) {
          await speakBrowser(text, {
            lang: prefs.sttLang === "bn-BD" ? "bn-BD" : "en-US",
            voiceName: prefs.browserTtsVoice,
            rate: prefs.ttsSpeed,
          });
        }
      } finally {
        this.cloudHandle = null;
        this.abort = null;
      }
      return;
    }
    // Browser engine.
    this.abort = new AbortController();
    await speakBrowser(text, {
      lang: prefs.sttLang === "bn-BD" ? "bn-BD" : "en-US",
      voiceName: prefs.browserTtsVoice,
      rate: prefs.ttsSpeed,
      signal: this.abort.signal,
    });
    this.abort = null;
  }
}

// Singleton shared by Chat (producer) and the global stop button (consumer).
let active: SpeechQueue | null = null;
export function getActiveSpeechQueue(): SpeechQueue {
  if (!active) active = new SpeechQueue();
  return active;
}
export function resetActiveSpeechQueue(): SpeechQueue {
  active?.cancel();
  active = new SpeechQueue();
  return active;
}
export function stopActiveSpeech(): void {
  active?.cancel();
}
