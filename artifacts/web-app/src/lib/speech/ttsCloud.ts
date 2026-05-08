import { baseUrl } from "@/lib/api";

export interface CloudTtsRequest {
  text: string;
  voice?: string;
  speed?: number;
  signal?: AbortSignal;
}

/** POST text → audio blob (mp3). */
export async function synthesizeCloud(req: CloudTtsRequest): Promise<Blob> {
  const res = await fetch(baseUrl("/voice/tts"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: req.text, voice: req.voice, speed: req.speed }),
    signal: req.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS failed (${res.status}): ${body || res.statusText}`);
  }
  return await res.blob();
}

export interface CloudPlayHandle {
  done: Promise<void>;
  stop: () => void;
}

/** Synthesize + play. Resolves `done` when playback ends (or is stopped). */
export async function playCloud(req: CloudTtsRequest): Promise<CloudPlayHandle> {
  const blob = await synthesizeCloud(req);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  let resolved = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolveDone = () => {
      if (resolved) return;
      resolved = true;
      URL.revokeObjectURL(url);
      r();
    };
  });
  audio.onended = resolveDone;
  audio.onerror = resolveDone;
  if (req.signal) {
    if (req.signal.aborted) {
      audio.pause();
      resolveDone();
    } else {
      req.signal.addEventListener(
        "abort",
        () => {
          audio.pause();
          resolveDone();
        },
        { once: true },
      );
    }
  }
  try {
    await audio.play();
  } catch (err) {
    resolveDone();
    throw err;
  }
  return {
    done,
    stop: () => {
      audio.pause();
      resolveDone();
    },
  };
}
