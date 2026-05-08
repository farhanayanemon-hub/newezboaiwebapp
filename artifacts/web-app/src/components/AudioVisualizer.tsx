import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  className?: string;
  /** Bar color (CSS color string). Defaults to currentColor. */
  color?: string;
  /** Number of bars to draw. Default 24. */
  bars?: number;
}

/**
 * Lightweight bar-style waveform driven by an external AnalyserNode (provided
 * by the recorder). Pure CSS would not capture mic activity, so we use a small
 * canvas + requestAnimationFrame loop.
 */
export function AudioVisualizer({
  analyser,
  className,
  color,
  bars = 24,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const colorVal = color ?? (getComputedStyle(canvas).color || "#10b981");
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      analyser.getByteFrequencyData(buf);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = colorVal;
      const step = Math.floor(buf.length / bars);
      const gap = 2;
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        let avg = 0;
        for (let j = 0; j < step; j++) avg += buf[i * step + j] || 0;
        avg /= step || 1;
        const bh = Math.max(2, (avg / 255) * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.fillRect(x, y, bw, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, color, bars]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-6 w-24 text-emerald-500", className)}
      aria-hidden
    />
  );
}
