/**
 * MediaRecorder helper for cloud STT. Records mic audio into a single Blob
 * (webm/opus on most browsers) and exposes a live WebAudio AnalyserNode for
 * the visualizer. Stops automatically on `silenceMs` of detected silence.
 */

export interface RecorderOptions {
  /** Auto-stop after N ms of silence (RMS below threshold). 0 = manual only. */
  silenceMs?: number;
  /** RMS threshold for "silence" (0–1). 0.015 is a reasonable default. */
  silenceThreshold?: number;
  onSilence?: () => void;
  onLevel?: (rms: number) => void;
  onError?: (msg: string) => void;
  onStart?: () => void;
}

export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
  analyser: AnalyserNode | null;
  mimeType: string;
}

function pickMime(): string {
  const mr = (typeof MediaRecorder !== "undefined" ? MediaRecorder : null) as
    | typeof MediaRecorder
    | null;
  if (!mr) return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (mr.isTypeSupported?.(c)) return c;
  }
  return "audio/webm";
}

export async function startRecorder(opts: RecorderOptions = {}): Promise<RecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // WebAudio analyser for VAD + visualization.
  const audioCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);
  let silenceStart: number | null = null;
  let speechSeen = false;
  const threshold = opts.silenceThreshold ?? 0.015;
  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    opts.onLevel?.(rms);
    if (rms > threshold) {
      speechSeen = true;
      silenceStart = null;
    } else if (speechSeen) {
      const now = performance.now();
      if (silenceStart == null) silenceStart = now;
      else if (opts.silenceMs && now - silenceStart >= opts.silenceMs) {
        opts.onSilence?.();
        silenceStart = null;
      }
    }
    raf = requestAnimationFrame(tick);
  };

  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const t of stream.getTracks()) t.stop();
    audioCtx.close().catch(() => undefined);
  };

  recorder.onstart = () => {
    raf = requestAnimationFrame(tick);
    opts.onStart?.();
  };
  recorder.onerror = (e) => {
    opts.onError?.(String((e as unknown as { error?: { message?: string } }).error?.message ?? e));
  };

  recorder.start();

  return {
    analyser,
    mimeType,
    stop: () =>
      new Promise<Blob>((resolve) => {
        if (recorder.state === "inactive") {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType }));
          return;
        }
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* noop */
      }
      cleanup();
    },
  };
}
