'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The guided arrival from the "Choose a site" map (spec 23.4): Explore opened with `tour=1` shows one part at a time,
 * and the visitor brings the next one in with "Next" or by scrolling on past the end of the page. Parts already shown
 * stay, so the page builds up into the full page; "Show everything" skips to it.
 */
export const TOUR_STEPS = [
  { name: 'Where on the Moon', next: 'the answer' },
  { name: 'The answer', next: 'hour by hour' },
  { name: 'Hour by hour', next: 'the year' },
  { name: 'The year', next: 'questions and checks' },
  { name: 'Questions and checks', next: null },
] as const;
const LAST = TOUR_STEPS.length;

/** Whether the address asks for the guided arrival; a place of the visitor's own has its own three steps instead. */
export function tourAsked(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.get('tour') === '1' && q.get('own') !== '1';
}

export type Tour = {
  /** The page was opened with the guided arrival. */
  on: boolean;
  /** The last part shown, from 1. */
  step: number;
  /** Parts are still waiting. */
  active: boolean;
  /** Whether newly shown parts fade and rise. */
  animate: boolean;
  shown: (n: number) => boolean;
  next: () => void;
  showAll: () => void;
  /** What a screen reader hears after each step. */
  said: string;
  register: (n: number, el: HTMLElement | null) => void;
};

/** How long the page must have been at its end, and how far the wheel must push on, before scrolling brings the next part. */
const REST_MS = 500;
const PUSH_PX = 100;

export function useTour(reducedMotion: boolean): Tour {
  const [on] = useState(() => typeof window !== 'undefined' && tourAsked(window.location.search));
  const [step, setStep] = useState(on ? 1 : LAST);
  const [arrive, setArrive] = useState<{ n: number; scroll: boolean } | null>(null);
  const [said, setSaid] = useState('');
  const parts = useRef(new Map<number, HTMLElement>());
  const active = on && step < LAST;

  const register = useCallback((n: number, el: HTMLElement | null) => {
    if (el) parts.current.set(n, el);
    else parts.current.delete(n);
  }, []);
  const next = useCallback(() => {
    if (step >= LAST) return;
    const n = step + 1;
    setStep(n);
    setArrive({ n, scroll: true });
    setSaid(n === LAST ? `Step ${n} of ${LAST}: ${TOUR_STEPS[n - 1].name}. The full page is now shown.` : `Step ${n} of ${LAST}: ${TOUR_STEPS[n - 1].name}.`);
  }, [step]);
  const showAll = useCallback(() => {
    if (step >= LAST) return;
    setStep(LAST);
    setArrive({ n: step + 1, scroll: false });
    setSaid('The full page is now shown.');
  }, [step]);

  // The new part's heading takes the focus, and the window goes to it: smoothly, or at once under reduced motion.
  useEffect(() => {
    if (!arrive) return;
    const el = parts.current.get(arrive.n);
    if (!el) return;
    const heading = el.querySelector<HTMLElement>('h1, h2, h3');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    // Called only where the browser has it: jsdom, for one, does not.
    if (arrive.scroll) el.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [arrive, reducedMotion]);

  // Scrolling on past the end of the page brings the next part, as the button does: a wheel pushed on, or a finger
  // dragged up, once the page has rested at its end (so the scroll that reached the end does not also move on).
  useEffect(() => {
    if (!active) return;
    let since = 0;
    let pushed = 0;
    let touchY: number | null = null;
    const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const mark = () => {
      if (!atEnd()) {
        since = 0;
        pushed = 0;
      } else if (!since) since = performance.now();
      return since > 0 && performance.now() - since >= REST_MS;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0 || !mark()) return;
      pushed += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (pushed >= PUSH_PX) next();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = mark() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const y = e.changedTouches[0]?.clientY;
      if (touchY !== null && y !== undefined && touchY - y >= 48 && atEnd()) next();
      touchY = null;
    };
    mark();
    window.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('scroll', mark);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [active, next]);

  return { on, step, active, animate: on && !reducedMotion, shown: (n) => !on || n <= step, next, showAll, said, register };
}

/** One part of the page: not there until its step, then brought in with a short fade and rise (none under reduced motion). */
export function TourStep({ n, tour, className = '', children }: { n: number; tour: Tour; className?: string; children: ReactNode }) {
  const { register } = tour;
  const ref = useCallback((el: HTMLDivElement | null) => register(n, el), [register, n]);
  if (!tour.shown(n)) return null;
  const moving = tour.animate && n > 1;
  return (
    <div ref={ref} data-tour-step={n} data-tour-motion={tour.on ? (moving ? 'rise' : 'none') : undefined} className={`scroll-mt-14 ${moving ? 'animate-[step-in_400ms_var(--ease-out-expo)] ' : ''}${className}`}>
      {children}
    </div>
  );
}

/** The quiet line at the top while parts are waiting: where the visitor is, and the way to the full page. */
export function TourBar({ tour }: { tour: Tour }) {
  return (
    <>
      {/* Heard after each step; it stays once the tour is over so its last words are read. */}
      {tour.on && (
        <p role="status" aria-live="polite" className="sr-only">
          {tour.said}
        </p>
      )}
      {tour.active && (
        <div data-part="tour-bar" className="sticky top-0 z-20 border-b border-line bg-page">
          <div className="wrap flex min-h-[44px] items-center justify-between gap-4 text-[15px] text-ink-2">
            <p>
              Step {tour.step} of {LAST}
              <span className="max-sm:hidden"> · {TOUR_STEPS[tour.step - 1].name}</span>
            </p>
            <button type="button" onClick={tour.showAll} className="min-h-[44px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Show everything
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The end of step `n`: the one button that brings the next part in; on a phone it keeps to the right, clear of Luna in the corner. */
export function TourNext({ n, tour }: { n: number; tour: Tour }) {
  if (!tour.active || tour.step !== n) return null;
  const next = TOUR_STEPS[n - 1].next;
  return (
    <div data-part="tour-next" className="wrap flex w-full flex-col items-center gap-2 pb-12 pt-2 text-center max-sm:items-end max-sm:text-right">
      <button type="button" onClick={tour.next} className="btn btn-ink">
        Next: {next} <span aria-hidden="true">↓</span>
      </button>
      <p className="text-[15px] text-ink-2">
        Step {n} of {LAST}. Or keep scrolling.
      </p>
    </div>
  );
}
