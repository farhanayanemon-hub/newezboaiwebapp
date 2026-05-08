/**
 * Perceptual hash (dHash variant) for cheap "did the screen actually change?"
 * detection. We downscale the frame to 9×8 grayscale and produce a 64-bit
 * fingerprint by comparing each pixel to its right neighbour. Two frames are
 * "different enough" when their Hamming distance exceeds a threshold.
 *
 * dHash is ~10× cheaper than uploading the frame to the AI and is robust to
 * tiny mouse jitter, animated cursors, and clock-tick changes.
 */

const W = 9; // hash width (one extra column for the comparison)
const H = 8;
const BITS = (W - 1) * H; // 64

/** Returns a 64-bit hash as a BigInt (so xor + popcount stay simple). */
export function dHash(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): bigint | null {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, W, H);
  } catch {
    // DRM-protected video → drawImage throws SecurityError. Caller should
    // treat null as "can't analyse — assume changed".
    return null;
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  let hash = 0n;
  let bit = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      const j = (y * W + (x + 1)) * 4;
      // Rec.601 luma — same kernel canvas/SVG use.
      const lumaA =
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const lumaB =
        0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
      if (lumaA > lumaB) hash |= 1n << BigInt(bit);
      bit++;
    }
  }
  return hash;
}

/** Population count for a 64-bit BigInt. */
function popcount(x: bigint): number {
  let n = 0;
  let v = x;
  while (v) {
    v &= v - 1n;
    n++;
  }
  return n;
}

export function hammingDistance(a: bigint, b: bigint): number {
  return popcount(a ^ b);
}

/**
 * Returns true when `next` is meaningfully different from `prev`. Threshold
 * tuned for 64-bit dHash: ≤6 different bits is essentially the same scene
 * (jitter, cursor, clock); >6 bits = real activity.
 *
 * `prev = null` always counts as changed (first frame).
 * `next = null` (e.g. DRM blackout) also counts as changed so we don't get
 * stuck silent.
 */
export function isFrameChanged(
  prev: bigint | null | undefined,
  next: bigint | null | undefined,
  threshold = 6,
): boolean {
  if (prev == null || next == null) return true;
  return hammingDistance(prev, next) > threshold;
}
