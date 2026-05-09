import { eq } from "drizzle-orm";
import { db, elevenlabsConfigTable, type ElevenlabsConfig } from "@workspace/db";
import { decrypt } from "../ai/crypto";
import { logger } from "./logger";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export async function loadElevenlabsConfig(): Promise<ElevenlabsConfig | null> {
  const [row] = await db
    .select()
    .from(elevenlabsConfigTable)
    .where(eq(elevenlabsConfigTable.id, 1))
    .limit(1);
  if (!row || !row.enabled || !row.encryptedApiKey || !row.voiceId) return null;
  return row;
}

export function getApiKey(cfg: ElevenlabsConfig): string {
  return decrypt(cfg.encryptedApiKey);
}

export interface ElevenVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

/** Fetch the voice catalog. Throws on non-2xx so callers can surface the
 * actual ElevenLabs error string in the admin UI. */
export async function listVoices(apiKey: string): Promise<ElevenVoice[]> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ElevenLabs voices ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { voices: ElevenVoice[] };
  return json.voices ?? [];
}

/** Lightweight key probe: GET /user. Returns subscription tier on success. */
export async function probeKey(apiKey: string): Promise<{ ok: true; tier: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/user`, {
      headers: { "xi-api-key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `ElevenLabs ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      subscription?: { tier?: string };
    };
    return { ok: true, tier: json.subscription?.tier ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface SynthesizeInput {
  text: string;
  voiceId?: string; // override the configured voice (optional)
}

/** Synthesize speech. Returns the raw mp3 bytes. Throws on failure. */
export async function synthesize(cfg: ElevenlabsConfig, input: SynthesizeInput): Promise<Buffer> {
  const apiKey = getApiKey(cfg);
  const voiceId = input.voiceId || cfg.voiceId;
  if (!voiceId) throw new Error("No ElevenLabs voice configured.");
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: cfg.modelId || "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    logger.error({ status: res.status, body: txt }, "elevenlabs synthesize failed");
    throw new Error(`ElevenLabs ${res.status}: ${txt.slice(0, 200)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
