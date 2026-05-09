import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, baseUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const ONBOARDING_FLAG = "ezboai-onboarding-seen";

const WELCOME_TEXT_GUEST =
  "Hello Boss! I am Ezbo, your personal AI partner. Tap the microphone to talk with me, or press Start Exploring whenever you are ready.";
const WELCOME_TEXT_USER = (name: string) =>
  `Welcome ${name || "Boss"}! I am Ezbo, your personal AI partner. Tap the microphone to talk with me, or press Start Exploring whenever you are ready.`;

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> & {
    [index: number]: ArrayLike<SpeechRecognitionResultLike>;
  };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Animated voice-orb visualizer — pure CSS, no audio analyser required so
 * it works even before the user grants mic permission. */
function VoiceOrb({ active }: { active: boolean }) {
  return (
    <div className="relative flex h-56 w-56 items-center justify-center sm:h-72 sm:w-72">
      <div
        className={`absolute inset-0 rounded-full bg-primary/20 blur-3xl transition-opacity ${active ? "opacity-100 animate-pulse" : "opacity-50"}`}
      />
      <div
        className={`absolute inset-6 rounded-full bg-gradient-to-br from-primary/60 via-primary/30 to-transparent blur-2xl ${active ? "animate-pulse" : ""}`}
      />
      <div className="absolute inset-12 rounded-full border border-primary/40" />
      <div className="absolute inset-16 rounded-full border border-primary/30" />
      <div
        className={`absolute inset-20 rounded-full bg-primary/40 ${active ? "animate-ping" : ""}`}
      />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-2xl shadow-primary/40 sm:h-24 sm:w-24">
        <Sparkles className="h-9 w-9 text-primary-foreground sm:h-10 sm:w-10" />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [ttsEnabled, setTtsEnabled] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioActive, setAudioActive] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const greetedRef = useRef(false);

  const welcomeText = user
    ? WELCOME_TEXT_USER(user.name || "Boss")
    : WELCOME_TEXT_GUEST;

  // Check whether ElevenLabs is configured.
  useEffect(() => {
    apiClient
      .get<{ enabled: boolean }>("/tts/status")
      .then((r) => setTtsEnabled(r.enabled))
      .catch(() => setTtsEnabled(false));
  }, []);

  // Speak a string. Uses ElevenLabs when enabled, otherwise falls back to
  // the browser's built-in speechSynthesis so the page is still useful.
  async function speak(text: string) {
    if (muted || !text.trim()) return;
    setAudioActive(true);
    try {
      if (ttsEnabled) {
        const res = await fetch(baseUrl("/tts/speak"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setAudioActive(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utt = new SpeechSynthesisUtterance(text);
        utt.onend = () => setAudioActive(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
      } else {
        setAudioActive(false);
      }
    } catch {
      setAudioActive(false);
    }
  }

  // Greet exactly once after we know the TTS status.
  useEffect(() => {
    if (ttsEnabled === null || greetedRef.current) return;
    greetedRef.current = true;
    void speak(welcomeText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled]);

  // Cleanup audio + recognition on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function toggleListen() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setTranscript("Voice input is not supported in this browser — press Start Exploring to chat.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const first = e.results[0];
      const heard = first?.[0]?.transcript ?? "";
      setTranscript(heard);
      if (heard.trim()) {
        void speak("Got it. Press Start Exploring to continue our conversation in chat.");
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    setTranscript("");
    rec.start();
  }

  function startExploring() {
    try {
      window.localStorage.setItem(ONBOARDING_FLAG, "1");
    } catch {
      /* localStorage may be disabled */
    }
    audioRef.current?.pause();
    recognitionRef.current?.stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setLocation("/");
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-4 py-10 text-center">
      {/* Top: brand + mute */}
      <div className="flex w-full max-w-3xl items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">EzboAI</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          data-testid="button-toggle-mute"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
      </div>

      {/* Center: orb + welcome */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <VoiceOrb active={audioActive || listening} />
        <div className="max-w-xl space-y-3">
          <h1
            className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl"
            data-testid="text-onboarding-heading"
          >
            {user ? `Welcome ${user.name || "Boss"}!` : "Hello Boss!"}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {welcomeText}
          </p>
          {ttsEnabled === false && (
            <p className="text-xs text-muted-foreground/70">
              (Premium voice not configured — using your browser&apos;s built-in voice.)
            </p>
          )}
        </div>

        {/* Live transcript */}
        <div className="min-h-[3rem] w-full max-w-xl">
          {transcript && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm">
              <span className="text-xs font-medium text-muted-foreground">You said: </span>
              <span className="text-foreground">{transcript}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: mic + start */}
      <div className="flex w-full max-w-3xl flex-col items-center gap-4">
        <Button
          variant={listening ? "destructive" : "outline"}
          size="lg"
          onClick={toggleListen}
          className="h-14 w-14 rounded-full p-0"
          aria-label={listening ? "Stop listening" : "Start talking"}
          data-testid="button-onboarding-mic"
        >
          {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
        <Button
          size="lg"
          onClick={startExploring}
          className="min-w-[200px]"
          data-testid="button-start-exploring"
        >
          Start Exploring
        </Button>
      </div>
    </div>
  );
}
