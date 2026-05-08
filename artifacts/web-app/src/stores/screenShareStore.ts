import { create } from "zustand";

export type ScreenMode = "ask" | "proactive";

interface ScreenShareState {
  isOpen: boolean;
  isActive: boolean;
  mode: ScreenMode;
  /** Sampling interval (ms) for proactive mode. Configurable in overlay. */
  intervalMs: number;
  /** Frames sent in the current session — drives the cost-estimate banner. */
  framesSent: number;
  /** Authoritative pause flag for the proactive loop. Independent from
   * timer/in-flight refs so the UI never disagrees with reality. */
  isPaused: boolean;

  open: () => void;
  close: () => void;
  setActive: (b: boolean) => void;
  setMode: (m: ScreenMode) => void;
  setIntervalMs: (n: number) => void;
  incrementFrames: () => void;
  resetFrames: () => void;
  setPaused: (b: boolean) => void;
  togglePaused: () => void;
}

export const useScreenShareStore = create<ScreenShareState>((set) => ({
  isOpen: false,
  isActive: false,
  mode: "ask",
  intervalMs: 7000,
  framesSent: 0,
  isPaused: false,

  open: () => set({ isOpen: true, framesSent: 0, isPaused: false }),
  close: () =>
    set({ isOpen: false, isActive: false, framesSent: 0, isPaused: false }),
  setActive: (isActive) => set({ isActive }),
  setMode: (mode) => set({ mode, isPaused: false }),
  setIntervalMs: (intervalMs) =>
    set({ intervalMs: Math.max(3000, Math.min(30000, intervalMs)) }),
  incrementFrames: () => set((s) => ({ framesSent: s.framesSent + 1 })),
  resetFrames: () => set({ framesSent: 0 }),
  setPaused: (isPaused) => set({ isPaused }),
  togglePaused: () => set((s) => ({ isPaused: !s.isPaused })),
}));
