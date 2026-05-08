/**
 * Capture a single frame from a <video> element, downscale to a max width,
 * and encode as JPEG. Returns a Blob suitable for multipart upload.
 *
 * - JPEG quality 0.7
 * - Max width 1280px (preserves aspect ratio)
 * - Returns null if the video has no usable frame yet (avoids 0×0 captures
 *   that produce broken JPEGs and waste tokens).
 */
export async function captureFrame(
  video: HTMLVideoElement,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Blob | null> {
  const maxWidth = opts.maxWidth ?? 1280;
  const quality = opts.quality ?? 0.7;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(1, maxWidth / vw);
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}
