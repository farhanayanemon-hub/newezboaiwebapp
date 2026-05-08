import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVoiceStore, type SttEngine, type SttLang, type TtsEngine } from "@/stores/voiceStore";
import { isBrowserSttSupported } from "@/lib/speech/sttBrowser";
import { isBrowserTtsSupported, waitForVoices, speakBrowser } from "@/lib/speech/ttsBrowser";
import { playCloud } from "@/lib/speech/ttsCloud";
import { baseUrl } from "@/lib/api";
import { toast } from "sonner";

interface Capabilities {
  stt: { cloud: boolean; provider?: string; model?: string };
  tts: { cloud: boolean; provider?: string; model?: string; voices: string[] };
}

const SAMPLE_BN = "আমি ইজবো এআই, আপনার বাংলা সহকারী।";

export function VoiceSettings() {
  const prefs = useVoiceStore();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    fetch(baseUrl("/voice/capabilities"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setCaps(c))
      .catch(() => setCaps(null));
  }, []);

  useEffect(() => {
    if (!isBrowserTtsSupported()) return;
    void waitForVoices().then(setBrowserVoices);
  }, []);

  const browserSttOk = isBrowserSttSupported();
  const browserTtsOk = isBrowserTtsSupported();
  const cloudVoices = caps?.tts?.voices ?? [];

  const previewBrowser = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      await speakBrowser(SAMPLE_BN, {
        lang: prefs.sttLang === "bn-BD" ? "bn-BD" : "en-US",
        voiceName: prefs.browserTtsVoice,
        rate: prefs.ttsSpeed,
      });
    } finally {
      setPreviewing(false);
    }
  };

  const previewCloud = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      const handle = await playCloud({
        text: SAMPLE_BN,
        voice: prefs.ttsVoice,
        speed: prefs.ttsSpeed,
      });
      await handle.done;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* STT */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Speech recognition</h3>

        <div className="space-y-2">
          <Label className="text-xs">Engine</Label>
          <Select
            value={prefs.sttEngine}
            onValueChange={(v) => prefs.setSttEngine(v as SttEngine)}
          >
            <SelectTrigger data-testid="select-stt-engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browser" disabled={!browserSttOk}>
                Browser{!browserSttOk ? " (unavailable)" : ""}
              </SelectItem>
              <SelectItem value="cloud" disabled={!caps?.stt.cloud}>
                Cloud (Whisper){!caps?.stt.cloud ? " — needs API key" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Language</Label>
          <Select
            value={prefs.sttLang}
            onValueChange={(v) => prefs.setSttLang(v as SttLang)}
          >
            <SelectTrigger data-testid="select-stt-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bn-BD">বাংলা (bn-BD)</SelectItem>
              <SelectItem value="en-US">English (en-US)</SelectItem>
              <SelectItem value="auto">Auto-detect</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm">Continuous listen</Label>
            <p className="text-xs text-muted-foreground">
              Keep mic on; AI responds when you speak. Pauses while AI talks.
            </p>
          </div>
          <Switch
            checked={prefs.continuousListen}
            onCheckedChange={prefs.setContinuousListen}
            data-testid="switch-continuous-listen"
          />
        </div>

        {prefs.continuousListen && (
          <div className="space-y-2">
            <Label className="text-xs">Wake phrase (optional)</Label>
            <Input
              value={prefs.wakePhrase}
              onChange={(e) => prefs.setWakePhrase(e.target.value)}
              placeholder="e.g. ezbo, hey ezbo"
              data-testid="input-wake-phrase"
            />
            <p className="text-xs text-muted-foreground">
              When set, only utterances containing this phrase are sent.
            </p>
          </div>
        )}
      </section>

      {/* TTS */}
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium text-foreground">Speech output</h3>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm">Auto-speak replies</Label>
            <p className="text-xs text-muted-foreground">
              Read AI responses aloud as they stream in.
            </p>
          </div>
          <Switch
            checked={prefs.autoSpeak}
            onCheckedChange={prefs.setAutoSpeak}
            data-testid="switch-auto-speak"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Engine</Label>
          <Select
            value={prefs.ttsEngine}
            onValueChange={(v) => prefs.setTtsEngine(v as TtsEngine)}
          >
            <SelectTrigger data-testid="select-tts-engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browser" disabled={!browserTtsOk}>
                Browser{!browserTtsOk ? " (unavailable)" : ""}
              </SelectItem>
              <SelectItem value="cloud" disabled={!caps?.tts.cloud}>
                Cloud (OpenAI TTS){!caps?.tts.cloud ? " — needs API key" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {prefs.ttsEngine === "browser" && browserVoices.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Browser voice</Label>
            <Select
              value={prefs.browserTtsVoice ?? "__default__"}
              onValueChange={(v) =>
                prefs.setBrowserTtsVoice(v === "__default__" ? null : v)
              }
            >
              <SelectTrigger data-testid="select-browser-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__default__">System default</SelectItem>
                {browserVoices.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {browserVoices.some((v) => v.lang.startsWith("bn"))
                ? "A Bangla voice is available on this device."
                : "No Bangla voice installed — speech will use the system default."}
            </p>
          </div>
        )}

        {prefs.ttsEngine === "cloud" && cloudVoices.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Cloud voice</Label>
            <Select value={prefs.ttsVoice} onValueChange={prefs.setTtsVoice}>
              <SelectTrigger data-testid="select-cloud-voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {cloudVoices.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Speed</Label>
            <span className="text-xs text-muted-foreground">{prefs.ttsSpeed.toFixed(2)}×</span>
          </div>
          <Slider
            value={[prefs.ttsSpeed]}
            min={0.7}
            max={1.5}
            step={0.05}
            onValueChange={(v) => prefs.setTtsSpeed(v[0])}
            data-testid="slider-tts-speed"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={previewing}
          onClick={() => (prefs.ttsEngine === "cloud" ? previewCloud() : previewBrowser())}
          data-testid="button-preview-voice"
        >
          {previewing ? "Playing…" : "Preview voice"}
        </Button>
      </section>
    </div>
  );
}
