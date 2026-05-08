/**
 * Normalised Levenshtein-based similarity for de-duplicating live-vision
 * commentary. Returns a value in [0, 1] where 1 = identical.
 *
 * Uses the standard two-row DP. We bail out when one string is empty.
 */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;

  const m = x.length;
  const n = y.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, cur] = [cur, prev];
  }
  const dist = prev[n];
  const maxLen = Math.max(m, n);
  return 1 - dist / maxLen;
}

/**
 * True when the new commentary is meaningfully different from the previous
 * one. Threshold tuned for short Bangla sentences — < 0.85 means "enough
 * actually changed to be worth posting".
 */
export function isMeaningfullyNew(
  prev: string | null | undefined,
  next: string,
  threshold = 0.85,
): boolean {
  if (!prev) return true;
  return similarity(prev, next) < threshold;
}
