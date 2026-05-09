import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Mic, X, LogIn, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, baseUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const ONBOARDING_FLAG = "ezboai-onboarding-seen";

const WELCOME_GUEST =
  "Hello Boss! Ami Ezbo, apnar personal AI partner. Boss, login korben naki kunu proshno ache?";
const WELCOME_USER = (name: string) =>
  `Welcome ${name || "Boss"}! Ami Ezbo, apnar personal AI partner. Kichu jiggesh korben naki next step e jabo?`;

const LOGIN_KEYWORDS = ["login", "log in", "sign in", "signin", "sign up", "signup", "register"];
const SKIP_KEYWORDS = ["next", "skip", "chat", "continue", "go", "start", "explore", "no", "nah", "agai", "agao", "egiye", "next step"];

function hasAny(t: string, words: string[]): boolean {
  const lower = t.toLowerCase();
  return words.some((w) => lower.includes(w));
}

interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> & {
    [index: number]: ArrayLike<SpeechRecognitionResultLike>;
  };
}
interface SpeechRecognitionLike {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
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

function VoiceOrb({ active, large = true }: { active: boolean; large?: boolean }) {
  const sizeClass = large ? "h-80 w-80 sm:h-[26rem] sm:w-[26rem]" : "h-44 w-44";
  return (
    <div className={`relative flex items-center justify-center ${sizeClass}`}>
      <style>{`
        @keyframes orb-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes orb-wave { 0% { transform: scale(0.8); opacity: 0.75; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orb-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      `}</style>
      <div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.5), rgba(236,72,153,0.35) 40%, rgba(6,182,212,0.4) 70%, transparent 80%)",
          animation: `orb-breathe ${active ? 2 : 4}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute inset-6 rounded-full opacity-60 blur-2xl"
        style={{
          background: "conic-gradient(from 0deg, #a855f7, #ec4899, #06b6d4, #a855f7)",
          animation: `orb-spin ${active ? 6 : 18}s linear infinite`,
        }}
      />
      <div
        className="absolute inset-12 rounded-full opacity-40 blur-xl"
        style={{
          background: "conic-gradient(from 180deg, #06b6d4, #a855f7, #ec4899, #06b6d4)",
          animation: `orb-spin-rev ${active ? 8 : 24}s linear infinite`,
        }}
      />
      {active && [0, 0.6, 1.2].map((delay, i) => (
        <div
          key={i}
          className="absolute inset-10 rounded-full border-2 border-white/40"
          style={{ animation: `orb-wave 2s ease-out ${delay}s infinite` }}
        />
      ))}
      <div
        className="relative rounded-full"
        style={{
          width: "55%", height: "55%",
          background: "radial-gradient(circle at 32% 28%, #fbcfe8 0%, #c084fc 25%, #8b5cf6 55%, #4338ca 85%, #1e1b4b 100%)",
          boxShadow: "0 0 100px rgba(168,85,247,0.7), inset 0 -30px 60px rgba(0,0,0,0.45), inset 0 30px 60px rgba(255,255,255,0.2)",
          animation: `orb-breathe ${active ? 1.4 : 3.5}s ease-in-out infinite`,
        }}
      >
        <div
          className="absolute rounded-full bg-white/50 blur-md"
          style={{ width: "32%", height: "28%", top: "14%", left: "20%" }}
        />
        <div
          className="absolute rounded-full bg-white/30 blur-sm"
          style={{ width: "12%", height: "10%", top: "20%", left: "30%" }}
        />
      </div>
    </div>
  );
}

type Phase = "speaking" | "listening" | "idle" | "ready";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("speaking");
  const [audioActive, setAudioActive] = useState(false);
  const [transcript, setTranscript] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const ttsEnabledRef = useRef<boolean | null>(null);
  const greetedRef = useRef(false);
  const phaseRef = useRef<Phase>("speaking");
  phaseRef.current = phase;

  const welcomeText = user ? WELCOME_USER(user.name || "Boss") : WELCOME_GUEST;

  function markSeen() {
    try { window.localStorage.setItem(ONBOARDING_FLAG, "1"); } catch { /* noop */ }
  }
  function stopAll() {
    audioRef.current?.pause();
    audioRef.current = null;
    try { recogRef.current?.stop(); } catch { /* noop */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
  function goToChat() {
    markSeen();
    stopAll();
    setLocation("/");
  }
  function goToLogin() {
    markSeen();
    stopAll();
    try { window.sessionStorage.setItem("ezboai-open-auth", "login"); } catch { /* noop */ }
    setLocation("/");
  }
  function dismiss() {
    stopAll();
    setPhase("ready");
  }

  function handleAnswer(t: string) {
    setTranscript(t);
    const text = t.trim();
    if (!text) { setPhase("idle"); return; }
    if (!user && hasAny(text, LOGIN_KEYWORDS)) { goToLogin(); return; }
    if (hasAny(text, SKIP_KEYWORDS)) { goToChat(); return; }
    try { window.sessionStorage.setItem("ezboai-initial-prompt", text); } catch { /* noop */ }
    goToChat();
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setPhase("idle"); return; }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    let answered = false;
    rec.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript ?? "";
      answered = true;
      handleAnswer(heard);
    };
    rec.onerror = () => { if (!answered && phaseRef.current !== "ready") setPhase("idle"); };
    rec.onend = () => { if (!answered && phaseRef.current === "listening") setPhase("idle"); };
    recogRef.current = rec;
    setPhase("listening");
    try { rec.start(); } catch { setPhase("idle"); }
    window.setTimeout(() => {
      if (phaseRef.current === "listening") {
        try { rec.stop(); } catch { /* noop */ }
      }
    }, 12000);
  }

  async function speak(): Promise<boolean> {
    if (greetedRef.current) return true;
    try {
      if (ttsEnabledRef.current === null) {
        const status = await apiClient.get<{ enabled: boolean }>("/tts/status").catch(() => ({ enabled: false }));
        ttsEnabledRef.current = status.enabled;
      }
      if (ttsEnabledRef.current) {
        setAudioActive(true);
        const res = await fetch(`${baseUrl}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text: welcomeText }),
        });
        if (!res.ok) throw new Error("tts_failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = () => { setAudioActive(false); URL.revokeObjectURL(url); startListening(); };
        a.onerror = () => { setAudioActive(false); URL.revokeObjectURL(url); startListening(); };
        await a.play();
        greetedRef.current = true;
        return true;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utt = new SpeechSynthesisUtterance(welcomeText);
        utt.onstart = () => setAudioActive(true);
        utt.onend = () => { setAudioActive(false); startListening(); };
        utt.onerror = () => { setAudioActive(false); startListening(); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
        setAudioActive(true);
        greetedRef.current = true;
        return true;
      }
      setPhase("idle");
      return false;
    } catch {
      setAudioActive(false);
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void speak().then((ok) => {
      if (cancelled || ok) return;
      const onGesture = () => {
        document.removeEventListener("pointerdown", onGesture);
        document.removeEventListener("keydown", onGesture);
        void speak().then((ok2) => { if (!ok2) setPhase("idle"); });
      };
      document.addEventListener("pointerdown", onGesture, { once: true });
      document.addEventListener("keydown", onGesture, { once: true });
    });
    return () => { cancelled = true; stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase !== "ready") {
    const statusLabel =
      phase === "speaking" ? "Ezbo speaking…"
      : phase === "listening" ? "Listening — speak now"
      : "Tap the orb to speak again";
    return (
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-4 py-10 text-center">
        <button
          type="button"
          aria-label="Close voice"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-full bg-muted/40 p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          data-testid="button-close-voice"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-8">
          <button
            type="button"
            onClick={() => { if (phase === "idle") startListening(); }}
            className="cursor-pointer focus:outline-none"
            aria-label="Tap to speak"
          >
            <VoiceOrb active={audioActive || phase === "listening"} large />
          </button>
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
            {phase === "listening" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                <Mic className="h-3.5 w-3.5 animate-pulse text-primary" />
                <span>{user ? "Say \"next step\" or ask a question" : "Say \"login\" or \"next step\""}</span>
              </div>
            )}
            {phase === "idle" && (
              <Button size="sm" variant="secondary" onClick={startListening} data-testid="button-listen-again">
                <Mic className="mr-2 h-3.5 w-3.5" /> Tap to speak
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-4 py-10 text-center">
      <div className="text-sm font-medium text-muted-foreground">EzboAI</div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <VoiceOrb active={audioActive} />
        {transcript && (
          <div className="max-w-md rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm">
            <span className="text-xs font-medium text-muted-foreground">You said: </span>
            <span className="text-foreground">{transcript}</span>
          </div>
        )}
      </div>
      <div className="flex w-full max-w-3xl flex-col items-center gap-3">
        {!user && (
          <Button variant="outline" size="lg" onClick={goToLogin} className="min-w-[200px]" data-testid="button-go-login">
            <LogIn className="mr-2 h-4 w-4" /> Login
          </Button>
        )}
        <Button size="lg" onClick={goToChat} className="min-w-[200px]" data-testid="button-start-exploring">
          {user ? "Start Exploring" : "Continue as Guest"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
