import { create } from "zustand";

/**
 * Live state for the AI browser-agent panel. The panel is global (single
 * instance) so we keep it in zustand rather than thread props around.
 */

export interface BrowserActionEntry {
  id: string;
  ts: number;
  kind: "plan" | "action" | "tool_result" | "error" | "done" | "ready" | "thinking";
  label: string;
  detail?: string;
}

export interface PendingConfirm {
  id: string;
  question: string;
  detail?: string;
}

interface BrowserState {
  isOpen: boolean;
  sessionId: string | null;
  busy: boolean;
  /** Latest base64 JPEG screenshot from the agent. */
  screenshot: string | null;
  actions: BrowserActionEntry[];
  finalText: string | null;
  error: string | null;
  /** A confirm() tool call awaiting user approval. */
  pendingConfirm: PendingConfirm | null;

  open: () => void;
  close: () => void;
  setSession: (id: string | null) => void;
  setBusy: (b: boolean) => void;
  setScreenshot: (b64: string) => void;
  pushAction: (a: Omit<BrowserActionEntry, "id" | "ts">) => void;
  setFinalText: (t: string | null) => void;
  setError: (e: string | null) => void;
  setPendingConfirm: (c: PendingConfirm | null) => void;
  reset: () => void;
}

let counter = 0;

export const useBrowserStore = create<BrowserState>((set) => ({
  isOpen: false,
  sessionId: null,
  busy: false,
  screenshot: null,
  actions: [],
  finalText: null,
  error: null,
  pendingConfirm: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setSession: (sessionId) => set({ sessionId }),
  setBusy: (busy) => set({ busy }),
  setScreenshot: (screenshot) => set({ screenshot }),
  pushAction: (a) =>
    set((s) => ({
      actions: [
        ...s.actions.slice(-99),
        { id: `a${++counter}`, ts: Date.now(), ...a },
      ],
    })),
  setFinalText: (finalText) => set({ finalText }),
  setError: (error) => set({ error }),
  setPendingConfirm: (pendingConfirm) => set({ pendingConfirm }),
  reset: () =>
    set({
      sessionId: null,
      busy: false,
      screenshot: null,
      actions: [],
      finalText: null,
      error: null,
      pendingConfirm: null,
    }),
}));
