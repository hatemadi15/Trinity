import { useCallback, useEffect, useState } from 'react';

/**
 * The rendered width of an element in CSS pixels, from a ResizeObserver, so an SVG drawn in a
 * viewBox can size its text for the space it really has. `fallback` is used before the first
 * measurement and wherever ResizeObserver does not exist (tests, old browsers).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number): { ref: (node: T | null) => void; width: number } {
  const [width, setWidth] = useState(fallback);
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref, width };
}
