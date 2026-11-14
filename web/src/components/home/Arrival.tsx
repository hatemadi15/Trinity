'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type MouseEvent } from 'react';
import { ChunkBoundary } from '@/components/ChunkBoundary';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLunaControls } from '@/lib/luna/controls';
import { BEAT_STOPS, LANDED, LAST, playProgress, playSeconds, progressFromScroll, scrollFromProgress } from '@/lib/sky/arrivalTiming';
import type { ArrivalWords } from '@/lib/viz/arrival';
import type { StageProps } from './ArrivalCanvas';
import type { EarthriseProps } from './EarthriseScene';

// three.js comes with the stage, after the page's words: nothing on this module's import path pulls it in.
const LiveStage = dynamic(() => import('./ArrivalCanvas'), { ssr: false });
// The title card's Earth and Moon (spec 23), on the same terms.
const LiveCard = dynamic(() => import('./EarthriseScene'), { ssr: false });
/** Screens in the arrival, a beat each: the Moon, the pole, the cap, the ridge, standing, the month at the site, the answer. */
const BEATS = BEAT_STOPS.length;
const PLATE = 'rounded-2xl border border-white/12 bg-[#050506]/88 shadow-[0_0_48px_-16px_rgba(127,169,255,0.45)]';
const SENTENCE = 'display text-balance text-[30px] leading-[1.08] sm:text-[40px]';
/**
 * The title card fades as the first screen scrolls away: whole until a twentieth of a screen, gone at 0.55 (spec 23).
 * Exported for the tests.
 */
export const cardOpacity = (screens: number) => 1 - Math.min(1, Math.max(0, (screens - 0.05) / 0.5));
const still = (k: number, shape: 'wide' | 'tall') => `/arrival/beat-${k}-${shape}.jpg`;
/**
 * A beat's words fade as they scroll up: whole until `over` px above `gone` px from the top, gone there. Before
 * landing they fade at the top. Once landed the stage's date bar stands at the top (16 px down, about 140 px tall):
 * they are gone at its foot, so the bar never gives way to them (both readers, part C read 1).
 */
const FADE = { before: { gone: 72, over: 64 }, landed: { gone: 160, over: 96 } } as const;
/** Whether a beat's screen comes once landed, with the date bar at its top: standing, and the month at the site. */
const landedAt = (beat: number) => BEAT_STOPS[beat] > LANDED;
/**
 * A screen of the arrival: its stage's height (100svh, the small viewport), not the window's, which grows by the
 * address bar's height once a phone's bar hides.
 */
const screenOf = (el: HTMLElement | null) => (el ? el.offsetHeight / BEATS : 0) || window.innerHeight || 1;
/** Screens scrolled past the arrival's top, 0 to the last. */
const screensIn = (el: HTMLElement | null) => (el ? Math.min(BEATS - 1, Math.max(0, -el.getBoundingClientRect().top / screenOf(el))) : 0);
/** Scrolls the page to `s` screens into the arrival; returns where it asked the page to be (its scrollY), if anywhere. */
function scrollInto(el: HTMLElement | null, s: number): number | null {
  if (!el) return null;
  const top = window.scrollY + el.getBoundingClientRect().top + s * screenOf(el);
  window.scrollTo({ top, behavior: 'instant' });
  return top;
}
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
export function Arrival({ words, Stage = LiveStage, Card = LiveCard }: { words: ArrivalWords; Stage?: ComponentType<StageProps>; Card?: ComponentType<EarthriseProps> }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // How far the title card has scrolled away, in screens, read by its scene every frame.
  const cardProgress = useRef(0);
  const [cardLive, setCardLive] = useState(false);
  const [cardFailed, setCardFailed] = useState(false);
  const standing = useRef<HTMLHeadingElement>(null);
  const progress = useRef(0);
  const [beat, setBeat] = useState(0);
  // Whether the first screen, with the intro's words, has scrolled away whole: on a phone Skip waits for that (18.3).
  const [pastFirst, setPastFirst] = useState(false);
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

  const screens = () => screensIn(section.current);
  const goTo = (s: number) => scrollInto(section.current, s);

  useEffect(() => {
    if (capture) return;
    const onScroll = () => {
      const s = screens();
      for (const plate of section.current?.querySelectorAll<HTMLElement>('[data-plate]') ?? []) {
        const beat = plate.closest<HTMLElement>('[data-beat]'), top = plate.getBoundingClientRect().top;
        const f = landedAt(Number(beat?.dataset.beat)) ? FADE.landed : FADE.before;
        // Whole where it rests at its beat's stop: on a short window that is nearer the top than `over` allows.
        const rest = beat ? top - beat.getBoundingClientRect().top : Infinity;
        plate.style.opacity = String(Math.min(1, Math.max(0, (top - f.gone) / Math.max(1, Math.min(f.over, rest - f.gone)))));
      }
      progress.current = reduced ? BEAT_STOPS[Math.round(s)] : progressFromScroll(s);
      cardProgress.current = s;
      if (card.current) {
        const o = cardOpacity(s);
        card.current.style.opacity = String(o);
        card.current.style.visibility = o > 0 ? 'visible' : 'hidden';
        // It lifts away and comes closer as it goes, as if flown through.
        if (!reduced) card.current.style.transform = `translateY(${-Math.min(s, 1) * 6}%) scale(${1 + Math.min(s, 1) * 0.12})`;
      }
      setBeat(Math.round(s));
      setPastFirst(s >= 1);
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

  // Play: the page scrolls through the arrival by itself; a wheel, a touch or a key stops it where it is, and so does
  // the page scrolling anywhere Play did not put it (the scrollbar dragged, autoscroll, a link to a section).
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now(), from = playSeconds(progressFromScroll(screens()));
    // Where Play put the page on its last two frames: a scroll event may land after the next frame has moved on.
    let raf = 0, put: number | null = null, before: number | null = null;
    const tick = (now: number) => {
      const p = playProgress(from + (now - t0) / 1000);
      before = put;
      put = goTo(scrollFromProgress(p));
      if (p >= LAST) {
        // At the site: the answer takes the focus, as with Skip, so a screen reader reads it next.
        setPlaying(false);
        standing.current?.focus({ preventScroll: true });
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => setPlaying(false);
    const near = (y: number | null) => y !== null && Math.abs(window.scrollY - y) <= 2;
    const moved = () => {
      if (put !== null && !near(put) && !near(before)) stop();
    };
    const kinds = ['wheel', 'touchstart', 'keydown'] as const;
    for (const k of kinds) window.addEventListener(k, stop, { passive: true });
    window.addEventListener('scroll', moved, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const k of kinds) window.removeEventListener(k, stop);
      window.removeEventListener('scroll', moved);
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
  // Luna's flight (spec 22): as "Fly to the south pole" plays it.
  useLunaControls({
    fly: () => {
      if (reduced) land();
      else setPlaying(true);
    },
  });
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
            {/* If the stage's code fails to load, the stills stand in for every beat and the page's words stay. */}
            <ChunkBoundary fallback={null} onError={() => setFailed(true)}>
              <Stage progress={progress} reduced={reduced} capture={!!capture} onLive={() => setLive(true)} onFail={() => setFailed(true)} />
            </ChunkBoundary>
          </div>
        )}
        {/* The title card: Earth rising over the Moon's limb, over the flight's first screen, fading as it scrolls away.
            Its still shows at once; the live scene comes in over it once its pictures have loaded. Stills and the
            recorded walk (?arrival=) leave it out, so they show the flight itself. */}
        {!capture && (
          <div ref={card} data-card="" className="absolute inset-0 bg-black">
            <picture>
              <source media="(orientation: portrait)" srcSet="/hero/earthrise-tall.jpg" />
              <img
                src="/hero/earthrise-wide.jpg"
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </picture>
            {!cardFailed && (
              <div className={`absolute inset-0 transition-opacity duration-1000 ${cardLive ? 'opacity-100' : 'opacity-0'}`}>
                <ChunkBoundary fallback={null} onError={() => setCardFailed(true)}>
                  <Card progress={cardProgress} reduced={reduced} onReady={() => setCardLive(true)} onFail={() => setCardFailed(true)} />
                </ChunkBoundary>
              </div>
            )}
            {/* An instrument's frame: corner marks, as on a camera's screen. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 bottom-6 top-6 sm:inset-x-8 sm:bottom-10 sm:top-8">
              <span className="absolute left-0 top-0 h-6 w-6 border-l border-t border-white/40" />
              <span className="absolute right-0 top-0 h-6 w-6 border-r border-t border-white/40" />
              <span className="absolute bottom-0 left-0 h-6 w-6 border-b border-l border-white/40" />
              <span className="absolute bottom-0 right-0 h-6 w-6 border-b border-r border-white/40" />
            </div>
          </div>
        )}
      </div>
      {(moving || playing) && !capture && (
        // On a phone Skip waits until the first screen has scrolled away whole, so it never covers its words (18.3; at three
        // quarters of a screen the intro's last lines were still under it, read D3); then it sits at the top right, clear
        // of the beats' cards at the foot, and under the date bar once landed. It is named for where it goes (19.4): the label
        // gives a screen reader that at every width, and the eye reads it from 640 px, with the short word below so the
        // phone's button stays small. It is not a plate (data-plate), which the section fades as it scrolls up.
        <button type="button" aria-label="Skip to the answer" onClick={land} className={`btn fixed bottom-6 right-6 z-20 border-white/30 bg-black/70 max-sm:bottom-auto ${pastFirst ? '' : 'max-sm:hidden '}${landedAt(beat) ? 'max-sm:top-[160px]' : 'max-sm:top-4'}`}>
          <span aria-hidden="true" className="max-sm:hidden">Skip to the answer</span>
          <span aria-hidden="true" className="sm:hidden">Skip</span>
        </button>
      )}
      <div className="relative z-10 -mt-[100svh]" hidden={bare}>
        <div data-beat="0" className="flex h-[100svh] flex-col justify-between pb-14 pt-12 sm:pb-16 sm:pt-16">
          {/* The first screen, as a title card (spec 23): a readout, the promise, one sentence, two ways on. On a phone a
              shade behind the words keeps them easy to read over the Moon. */}
          <div className="wrap w-full max-sm:bg-linear-to-b max-sm:from-black/85 max-sm:via-black/70 max-sm:to-transparent max-sm:pb-10">
            <p data-words="" className="eyebrow flex items-center gap-2.5 text-[#a8c6ff]">
              <span aria-hidden="true" className="inline-block h-2 w-2 animate-[pulse-dot_2.4s_ease-in-out_infinite] rounded-full bg-[#7fa9ff]" />
              South pole forecast
            </p>
            <h1 id="h-hero" data-words="" aria-label="See when a Moon lander has sunlight and a signal." className="display mt-5 max-w-[820px] animate-[focus-in_1.4s_cubic-bezier(0.16,1,0.3,1)_both] text-balance text-[42px] leading-[0.95] sm:text-[68px] xl:text-[88px]">
              See when a Moon lander has <em>sunlight</em> and a <span className="pixel text-[0.86em] text-[#a8c6ff] text-glow">signal</span>.
            </h1>
            {/* One sentence says what this is and what it gives; the flight just below says why the pole is hard. */}
            <p data-words="" className="mt-6 max-w-[34em] text-lg leading-relaxed text-[#c9cbcf] sm:text-[19px]">
              A forecast for Moon landing sites and dates, 2024 to 2036: sunlight, radio contact with Earth, and how long a lander keeps power.
            </p>
            <div data-words="" className="mt-8 flex w-fit flex-wrap gap-3">
              <Link href="/sites" onClick={start} className="btn btn-primary h-[52px] px-[22px] text-[17px]">
                Fly to the south pole
                <span aria-hidden="true" className="arrow">
                  →
                </span>
              </Link>
              {/* Named for the section it jumps to, whose heading is "Why the south pole is hard". */}
              <a href="#why" className="btn h-[52px] border-white/30 px-[22px] text-[17px] text-[#f5f5f3]">
                See why the pole is hard
              </a>
            </div>
          </div>
          {/* With the opening words, so it shows on the first screen and leaves with them. */}
          <p data-words="" className="flex justify-center max-sm:hidden">
            <span className="eyebrow flex items-center gap-3 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-[#e6e7ea]">
              Scroll to fly down to the Moon&apos;s south pole
              <span aria-hidden="true">↓</span>
            </span>
          </p>
        </div>
        {/* Once landed the date bar stands at the top: on a wide screen the words are centred in the room under it, so
            on a short window (a laptop at 150 %) they rest clear of it and whole. On a phone they stand at the foot. */}
        {words.beats.map((text, k) => (
          <div key={text} data-beat={k + 1} className={`flex h-[100svh] items-end pb-24 sm:pb-0 ${landedAt(k + 1) ? 'sm:items-center-safe sm:pt-[176px]' : 'sm:items-center'}`}>
            <div className="wrap w-full">
              {/* On a wide screen the column ends just short of the middle: the lander stands right of it. */}
              <p data-words="" data-plate="" className={`${PLATE} ${SENTENCE} max-w-[600px] p-5 sm:max-w-[min(600px,46vw)] sm:p-6`}>{text}</p>
            </div>
          </div>
        ))}
        {/* Under the date bar (16 px from the top, about 140 px tall): the beats' column is centred with the page, so
            its card reaches under the centred bar at every width, and the date and the sky stay in view. */}
        <div data-beat={BEATS - 1} className="flex h-[100svh] items-start pt-[168px]">
          {/* At the top left, in the beats' column (its left edge where theirs is), and narrower: the lander stands right
              of it. */}
          <div className="wrap w-full">
            <div data-words="" className={`${PLATE} max-w-[440px] p-5 sm:p-6`}>
              <p className="text-[15px] text-[#c6c5c0]">{words.siteLine}</p>
              <h2 ref={standing} tabIndex={-1} className="display mt-2 text-pretty text-[24px] leading-tight focus:outline-none sm:text-[30px]">
                {words.answer}
              </h2>
              {words.better && <p className="mt-2 text-base text-[#a8c6ff]">{words.better}</p>}
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
