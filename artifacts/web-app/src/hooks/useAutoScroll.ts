import { useEffect, useRef, useCallback, type RefObject } from "react";

interface UseAutoScrollOptions {
  threshold?: number;
  smooth?: boolean;
}

/**
 * Auto-scrolls a container to the bottom when `deps` change,
 * but only if the user is already near the bottom (within `threshold`px).
 */
export function useAutoScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: unknown[],
  options: UseAutoScrollOptions = {},
) {
  const { threshold = 120, smooth = true } = options;
  const wasNearBottomRef = useRef(true);

  // Track scroll position
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      wasNearBottomRef.current = distanceFromBottom < threshold;
    };
    el.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, [ref, threshold]);

  // Scroll on deps change if user was near bottom
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(
    (force = false) => {
      const el = ref.current;
      if (!el) return;
      if (force || wasNearBottomRef.current) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
      }
    },
    [ref, smooth],
  );

  return { scrollToBottom, isNearBottom: () => wasNearBottomRef.current };
}
