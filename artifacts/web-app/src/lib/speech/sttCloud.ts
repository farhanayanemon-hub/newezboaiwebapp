import { baseUrl } from "@/lib/api";

export interface CloudSttResult {
  transcript: string;
  language?: string;
  durationSec?: number;
  provider?: string;
  model?: string;
  latencyMs?: number;
}

export async function transcribeCloud(
  blob: Blob,
  opts: { language?: string; signal?: AbortSignal } = {},
): Promise<CloudSttResult> {
  const fd = new FormData();
  const ext = (() => {
    const t = blob.type.toLowerCase();
    if (t.includes("webm")) return "webm";
    if (t.includes("ogg")) return "ogg";
    if (t.includes("mp4")) return "m4a";
    if (t.includes("wav")) return "wav";
    return "webm";
  })();
  fd.append("audio", blob, `audio.${ext}`);
  if (opts.language) fd.append("language", opts.language);
  const res = await fetch(baseUrl("/voice/stt"), {
    method: "POST",
    body: fd,
    credentials: "include",
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`STT failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as CloudSttResult;
}
