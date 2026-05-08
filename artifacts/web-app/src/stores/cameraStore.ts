import { create } from "zustand";

export type CameraMode = "snap" | "live";
export type FacingMode = "user" | "environment";

interface CameraState {
  /** Overlay visible. */
  isOpen: boolean;
  /** True when the actual MediaStream is active (drives privacy indicator). */
  isActive: boolean;
  mode: CameraMode;
  facing: FacingMode;
  /** Live mode running the 4-sec capture loop. */
  isLive: boolean;

  open: () => void;
  close: () => void;
  setActive: (b: boolean) => void;
  setMode: (m: CameraMode) => void;
  setFacing: (f: FacingMode) => void;
  toggleFacing: () => void;
  setLive: (b: boolean) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  isOpen: false,
  isActive: false,
  mode: "snap",
  facing: "environment",
  isLive: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, isLive: false }),
  setActive: (isActive) => set({ isActive }),
  setMode: (mode) => set({ mode }),
  setFacing: (facing) => set({ facing }),
  toggleFacing: () =>
    set((s) => ({ facing: s.facing === "user" ? "environment" : "user" })),
  setLive: (isLive) => set({ isLive }),
}));
