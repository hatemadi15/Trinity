'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type MouseEvent } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { BEAT_STOPS, LAST, playProgress, playSeconds, progressFromScroll, scrollFromProgress } from '@/lib/sky/arrivalTiming';
import type { ArrivalWords } from '@/lib/viz/arrival';
import type { StageProps } from './ArrivalCanvas';

// three.js comes with the stage, after the page's words: nothing on this module's import path pulls it in.
const LiveStage = dynamic(() => import('./ArrivalCanvas'), { ssr: false });
/** Screens in the arrival, a beat each: the Moon, the pole, the cap, the ridge, standing, the month at the site, the answer. */
const BEATS = BEAT_STOPS.length;
const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/85 backdrop-blur-sm';
const SENTENCE = 'display text-balance text-[28px] leading-[1.08] sm:text-[36px]';
const still = (k: number, shape: 'wide' | 'tall') => `/arrival/beat-${k}-${shape}.jpg`;
/** The page's address does not change under the section, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * The home page's arrival: the Moon from space, then four beats down to standing at the hero site, as the
 * page scrolls (a screen a beat) or as "Fly to the south pole" plays it (21 seconds). The sentences are
 * page text in reading order; the pictures are a live stage, with stills beat by beat before it draws, when
 * it cannot, and as the first paint. Skip, while the arrival is part-way, lands on standing. With reduced
 * motion the flight holds on the beats and "Fly to the south pole" lands at once. Each action is named for where
 * it goes: the flight, the site's full forecast, the list of sites.
 */
export function Arrival({ words, Stage = LiveStage }: { words: ArrivalWords; Stage?: ComponentType<StageProps> }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const standing = useRef<HTMLHeadingElement>(null);
  const progress = useRef(0);
  const [beat, setBeat] = useState(0);
  const [moving, setMoving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  // ?arrival=<progress> holds the flight there for stills and the recorded walk; &bare=1 leaves the words out.
  // Read after hydration (the server has no address), so the page's first paint matches the server's HTML.
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => '');
  const capture = useMemo(() => {
    const q = new URLSearchParams(search), at = q.get('arrival');
    return at === null || !Number.isFinite(Number(at)) ? null : { at: Math.min(LAST, Math.max(0, Number(at))), bare: q.get('bare') === '1' };
  }, [search]);
  useEffect(() => {
    if (capture) progress.current = capture.at;
  }, [capture]);

  /** Screens scrolled past the arrival's top, 0 to 4. */
  const screens = () => {
    const el = section.current;
    return el ? Math.min(BEATS - 1, Math.max(0, -el.getBoundingClientRect().top / (window.innerHeight || 1))) : 0;
  };
  /** Scrolls the page to `s` screens into the arrival. */
  const goTo = (s: number) => {
    const el = section.current;
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + s * window.innerHeight, behavior: 'instant' });
  };

  useEffect(() => {
    if (capture) return;
    const onScroll = () => {
      const s = screens();
      progress.current = reduced ? BEAT_STOPS[Math.round(s)] : progressFromScroll(s);
      setBeat(Math.round(s));
      setMoving(s > 0.05 && s < BEATS - 1.05);
    };
    const id = requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, capture]);

  // Play: the page scrolls through the arrival by itself; a wheel, a touch or a key stops it where it is.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now(), from = playSeconds(progressFromScroll(screens()));
    let raf = 0;
    const tick = (now: number) => {
      const p = playProgress(from + (now - t0) / 1000);
      goTo(scrollFromProgress(p));
      if (p >= LAST) {
        // At the site: the answer takes the focus, as with Skip, so a screen reader reads it next.
        setPlaying(false);
        standing.current?.focus({ preventScroll: true });
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => setPlaying(false);
    const kinds = ['wheel', 'touchstart', 'keydown'] as const;
    for (const k of kinds) window.addEventListener(k, stop, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const k of kinds) window.removeEventListener(k, stop);
    };
  }, [playing]);

  const land = () => {
    setPlaying(false);
    goTo(BEATS - 1);
    standing.current?.focus({ preventScroll: true });
  };
  const start = (e: MouseEvent) => {
    e.preventDefault();
    if (reduced) land();
    else setPlaying(true);
  };
  const bare = capture?.bare ?? false;

  return (
    <section ref={section} aria-labelledby="h-hero" data-arrival="" className="theme-dark relative bg-black text-[#f2f0ea]" style={{ height: `${BEATS * 100}svh` }}>
      <div aria-hidden="true" className="sticky top-0 h-[100svh] overflow-hidden">
        {Array.from({ length: BEATS }, (_, k) => {
          const shown = k === beat && (!live || failed);
          return (
            <picture key={k} data-still={k} data-shown={shown ? '1' : '0'} className={`absolute inset-0 transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`}>
              <source media="(orientation: portrait)" srcSet={still(k, 'tall')} />
              <img
                src={still(k, 'wide')}
                alt=""
                loading={k === 0 ? 'eager' : 'lazy'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </picture>
          );
        })}
        {!failed && (
          <div className={`absolute inset-0 transition-opacity duration-500 ${live ? 'opacity-100' : 'opacity-0'}`}>
            <Stage progress={progress} reduced={reduced} capture={!!capture} onLive={() => setLive(true)} onFail={() => setFailed(true)} />
          </div>
        )}
      </div>
      {(moving || playing) && !capture && (
        <button type="button" onClick={land} className="btn fixed bottom-6 right-6 z-20 border-white/30 bg-black/70">
          Skip
        </button>
      )}
      <div className="relative z-10 -mt-[100svh]" hidden={bare}>
        <div data-beat="0" className="flex h-[100svh] flex-col justify-between pb-8 pt-8 sm:pt-12">
          {/* On a phone the words stand over the Moon: a shade behind them keeps them easy to read. */}
          <div className="wrap w-full max-sm:bg-linear-to-b max-sm:from-black/85 max-sm:from-60% max-sm:to-transparent max-sm:pb-16">
            <h1 id="h-hero" data-words="" className="display max-w-[760px] text-balance text-[44px] leading-[0.98] sm:text-[56px] xl:text-[72px]">
              See when a Moon lander has sunlight and a signal.
            </h1>
            <p data-words="" className="mt-6 max-w-[33em] text-lg leading-relaxed text-[#c6c5c0] sm:text-[19px]">
              At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a date:
              Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and how long a solar lander keeps power there.
            </p>
            <div data-words="" className="mt-7 flex w-fit flex-wrap gap-3">
              <Link href="/sites" onClick={start} className="btn btn-primary h-[52px] px-[22px] text-[17px]">
                Fly to the south pole
              </Link>
              <a href="#why" className="btn h-[52px] px-[22px] text-[17px]">
                See how it works
              </a>
            </div>
            <p data-words="" className="mt-3 w-fit text-base text-[#c6c5c0]">
              For planners of NASA&apos;s commercial Moon landers, educators and anyone curious.
            </p>
            {/* With the opening words, so it shows on the first screen and leaves with them, never over the Moon. */}
            <p data-words="" className="mt-5 w-fit text-[15px] text-[#c6c5c0]">
              Scroll to fly down to the Moon&apos;s south pole <span aria-hidden="true">↓</span>
            </p>
          </div>
        </div>
        {words.beats.map((text, k) => (
          <div key={text} data-beat={k + 1} className="flex h-[100svh] items-end pb-24 sm:items-center sm:pb-0">
            <div className="wrap w-full">
              <p data-words="" className={`${PLATE} ${SENTENCE} max-w-[600px] p-5 sm:p-6`}>{text}</p>
            </div>
          </div>
        ))}
        <div data-beat={BEATS - 1} className="flex h-[100svh] items-start pt-4 sm:pt-6">
          {/* At the top left, as the stand view keeps its card, and narrower, so the lander stands clear of it as the
              camera comes down beside it. */}
          <div className="w-full px-4">
            <div data-words="" className={`${PLATE} max-w-[440px] p-5 sm:p-6`}>
              <p className="text-[15px] text-[#c6c5c0]">{words.siteLine}</p>
              <h2 ref={standing} tabIndex={-1} className="display mt-2 text-pretty text-[24px] leading-tight focus:outline-none sm:text-[30px]">
                {words.answer}
              </h2>
              {words.better && <p className="mt-2 text-base text-[#f6d48a]">{words.better}</p>}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={words.exploreHref} className="btn btn-primary">
                  Open the full forecast
                </Link>
                <Link href="/sites" className="btn">
                  Choose a landing site
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
