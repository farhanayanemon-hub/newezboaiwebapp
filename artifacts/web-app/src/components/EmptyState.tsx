import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiClient, baseUrl } from "@/lib/api";

interface EmptyStateProps {
  onPromptSelect: (template: string) => void;
}

type Phase = "speaking" | "listening" | "idle" | "ready";

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

const SKIP_KEYWORDS = ["next", "skip", "chat", "continue", "go", "start", "no", "nah", "agai", "agao", "egiye", "next step"];
function isSkipIntent(t: string): boolean {
  const lower = t.toLowerCase();
  return SKIP_KEYWORDS.some((k) => lower.includes(k));
}

function VoiceOrb({ active, large = false }: { active: boolean; large?: boolean }) {
  const sizeClass = large ? "h-72 w-72 sm:h-96 sm:w-96" : "h-44 w-44 sm:h-56 sm:w-56";
  return (
    <div className={`relative flex items-center justify-center ${sizeClass}`}>
      <style>{`
        @keyframes orb-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes orb-wave { 0% { transform: scale(0.8); opacity: 0.75; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orb-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      `}</style>
      <div className="absolute inset-0 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.45), rgba(236,72,153,0.3) 40%, rgba(6,182,212,0.35) 70%, transparent 80%)",
          animation: `orb-breathe ${active ? 2 : 4}s ease-in-out infinite` }} />
      <div className="absolute inset-6 rounded-full opacity-60 blur-2xl"
        style={{ background: "conic-gradient(from 0deg, #a855f7, #ec4899, #06b6d4, #a855f7)",
          animation: `orb-spin ${active ? 6 : 18}s linear infinite` }} />
      <div className="absolute inset-10 rounded-full opacity-40 blur-xl"
        style={{ background: "conic-gradient(from 180deg, #06b6d4, #a855f7, #ec4899, #06b6d4)",
          animation: `orb-spin-rev ${active ? 8 : 24}s linear infinite` }} />
      {active && [0, 0.6, 1.2].map((delay, i) => (
        <div key={i} className="absolute inset-8 rounded-full border-2 border-white/40"
          style={{ animation: `orb-wave 2s ease-out ${delay}s infinite` }} />
      ))}
      <div className="relative rounded-full"
        style={{ width: "55%", height: "55%",
          background: "radial-gradient(circle at 32% 28%, #fbcfe8 0%, #c084fc 25%, #8b5cf6 55%, #4338ca 85%, #1e1b4b 100%)",
          boxShadow: "0 0 80px rgba(168,85,247,0.7), inset 0 -25px 50px rgba(0,0,0,0.45), inset 0 25px 50px rgba(255,255,255,0.2)",
          animation: `orb-breathe ${active ? 1.4 : 3.5}s ease-in-out infinite` }}>
        <div className="absolute rounded-full bg-white/50 blur-md" style={{ width: "32%", height: "28%", top: "14%", left: "20%" }} />
        <div className="absolute rounded-full bg-white/30 blur-sm" style={{ width: "12%", height: "10%", top: "20%", left: "30%" }} />
      </div>
    </div>
  );
}

export function EmptyState({ onPromptSelect }: EmptyStateProps) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const displayName = user?.name?.trim() || "Boss";
  const greetingText = isLoggedIn
    ? `Welcome ${displayName}! Kichu jiggesh korben naki next step e jabo?`
    : "Hello Boss! Kichu jiggesh korben naki next step e jabo?";

  const [phase, setPhase] = useState<Phase>("speaking");
  const [audioActive, setAudioActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const ttsEnabledRef = useRef<boolean | null>(null);
  const greetedRef = useRef(false);
  const phaseRef = useRef<Phase>("speaking");
  phaseRef.current = phase;

  function dismiss() {
    audioRef.current?.pause();
    audioRef.current = null;
    try { recogRef.current?.stop(); } catch { /* noop */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPhase("ready");
  }

  function handleAnswer(transcript: string) {
    const t = transcript.trim();
    if (!t) { setPhase("idle"); return; }
    if (isSkipIntent(t)) { dismiss(); return; }
    try { onPromptSelect(t); } catch { /* noop */ }
    dismiss();
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
          body: JSON.stringify({ text: greetingText }),
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
        const utt = new SpeechSynthesisUtterance(greetingText);
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
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      audioRef.current = null;
      try { recogRef.current?.stop(); } catch { /* noop */ }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase !== "ready") {
    const statusLabel =
      phase === "speaking" ? "Ezbo speaking…"
      : phase === "listening" ? "Listening — speak now"
      : "Tap the orb to speak again";
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-4 py-10">
        <button type="button" aria-label="Close voice" onClick={dismiss}
          className="absolute right-4 top-4 rounded-full bg-muted/40 p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          data-testid="button-close-voice">
          <X className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => { if (phase === "idle") startListening(); }}
          className="cursor-pointer focus:outline-none" aria-label="Tap to speak">
          <VoiceOrb active={audioActive || phase === "listening"} large />
        </button>
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">{statusLabel}</p>
          {phase === "listening" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <Mic className="h-3.5 w-3.5 animate-pulse text-primary" />
              <span>Say "next step" to continue, or ask a question</span>
            </div>
          )}
          {phase === "idle" && (
            <Button size="sm" variant="secondary" onClick={startListening} data-testid="button-listen-again">
              <Mic className="mr-2 h-3.5 w-3.5" /> Tap to speak
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Ready phase: minimal hint only — no example cards.
  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <p className="text-sm text-muted-foreground/60">
        Type your message below to start chatting with Ezbo.
      </p>
    </div>
  );
}
