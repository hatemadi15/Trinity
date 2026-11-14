'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Brings its content up into place once, as it scrolls into view (spec 23): it comes into focus and rises 18 px.
 * Content already on screen when the page opens, and every page without script or with reduced motion, simply
 * shows: the hiding is done after hydration, and only below the fold.
 */
export function Reveal({ className = '', children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = 'hidden';
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = 'shown';
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-reveal="shown" className={className} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
