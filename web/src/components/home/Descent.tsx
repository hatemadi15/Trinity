'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { ChunkBoundary } from '@/components/ChunkBoundary';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLunaControls } from '@/lib/luna/controls';
import type { DescentWords } from '@/lib/viz/descent';
import { descentPose, STAGES, stageAt, stageOpacity, type StageId } from '@/lib/viz/descentPose';
import type { DescentSceneProps } from './DescentScene';

// three.js comes with the picture, after the page's words: nothing on this module's import path pulls it in.
const LiveScene = dynamic(() => import('./DescentScene'), { ssr: false });

/** Screens of scroll the descent takes, the first screen included. */
const SCREENS = 6;
/** Seconds "Fly to the south pole" takes from the first screen to the answer. */
const FLY_SECONDS = 11;
const PLATE = 'rounded-2xl border border-white/12 bg-[#050506]/85 shadow-[0_0_48px_-16px_rgba(127,169,255,0.45)]';
/** With reduced motion the picture stops at each stage's own view instead of travelling between them. */
const quantize = (p: number) => STAGES.find((s) => s.id === stageAt(p))!.stop;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The home page's descent (spec 23.1, after the arrival of spec 18): one picture, the Moon, from the first screen to
 * the answer. As the page scrolls the Moon turns and comes closer, down to the south pole and then to one landing
 * site; a line of words stands at each stage, one at a time, and the rail at the side names the stages and jumps to
 * any of them. "Fly to the south pole" plays it (a wheel, a touch or a key stops it). The words are page text in
 * reading order; tabbing to the words of a stage brings its view. Without WebGL the first screen's still, the relief
 * map and the site's picture stand in.
 */
export function Descent({ words, Scene = LiveScene }: { words: DescentWords; Scene?: ComponentType<DescentSceneProps> }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const pins = useRef(new Map<string, { el: HTMLElement; lat: number; lon: number }>());
  const pinBox = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const backups = useRef<{ relief: HTMLImageElement | null; site: HTMLImageElement | null }>({ relief: null, site: null });
  const answer = useRef<HTMLHeadingElement>(null);
  const [stage, setStage] = useState<StageId>('moon');
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  /** The progress (0 to 1) of the page's scroll through the section. */
  const scrolled = () => {
    const el = section.current;
    if (!el) return 0;
    const room = el.offsetHeight - window.innerHeight;
    return room > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / room)) : 0;
  };
  /** Scrolls the page to progress `p` of the section. */
  const goTo = (p: number, smooth = false) => {
    const el = section.current;
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top + p * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: smooth && !reduced ? 'smooth' : 'instant' });
  };

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const p = scrolled();
      progress.current = reduced ? quantize(p) : p;
      for (const s of STAGES) {
        const el = section.current?.querySelector<HTMLElement>(`[data-stage="${s.id}"]`);
        if (!el) continue;
        const o = stageOpacity(s, p);
        el.style.opacity = String(o);
        el.style.transform = reduced ? '' : `translateY(${((1 - o) * (p < s.from ? 18 : -18)).toFixed(1)}px)`;
        // Hidden words stay in the page for a screen reader and the keyboard (tabbing to them brings their view), but
        // take no clicks.
        el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      }
      // The map's names show over the pole; the site's ring from the pole to the answer.
      const pole = STAGES.find((s) => s.id === 'pole')!;
      if (pinBox.current) pinBox.current.style.opacity = String(stageOpacity(pole, p));
      if (marker.current) marker.current.style.opacity = String(Math.min(1, Math.max(0, (p - 0.5) / 0.08)));
      const pose = descentPose(progress.current, window.innerWidth / Math.max(1, window.innerHeight), { reliefHalfKm: words.hero.reliefHalfKm, windowKm: words.hero.windowKm });
      if (backups.current.relief) backups.current.relief.style.opacity = String(pose.relief * (1 - pose.site));
      if (backups.current.site) backups.current.site.style.opacity = String(pose.site);
      setStage(stageAt(p));
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Play: the page scrolls down through the descent by itself, eased; a wheel, a touch or a key stops it where it is.
  useEffect(() => {
    if (!playing) return;
    const from = scrolled(), seconds = FLY_SECONDS * (1 - from), t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000 / Math.max(seconds, 0.1));
      goTo(from + (1 - from) * ease(k));
      if (k >= 1) {
        setPlaying(false);
        answer.current?.focus({ preventScroll: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const land = () => {
    setPlaying(false);
    goTo(1);
    answer.current?.focus({ preventScroll: true });
  };
  const fly = () => {
    if (reduced) land();
    else setPlaying(true);
  };
  const start = (e: MouseEvent) => {
    e.preventDefault();
    fly();
  };
  useLunaControls({ fly });

  /** Tabbing into a stage's words brings its view. */
  const focusTo = (id: StageId) => () => {
    if (stageAt(scrolled()) !== id) goTo(STAGES.find((s) => s.id === id)!.stop);
  };
  const caption = (id: 'turn' | 'pole' | 'site') => (
    // At the foot of the view on a wide screen, in its middle like a film's subtitle, clear of Luna at the lower left;
    // at the top on a phone, where Luna stands at the foot.
    <div data-stage={id} onFocus={focusTo(id)} className="absolute inset-x-0 top-5 sm:bottom-14 sm:top-auto" style={{ opacity: 0, pointerEvents: 'none' }}>
      <div className="wrap">
        <div tabIndex={0} className={`${PLATE} mx-auto max-w-[620px] p-5 text-center outline-none sm:p-7`}>
          <p className="eyebrow text-[#a8c6ff]">{words[id].eyebrow}</p>
          <p className="display mt-3 text-balance text-[26px] leading-[1.12] sm:text-[34px]">{words[id].text}</p>
        </div>
      </div>
    </div>
  );

  return (
    <section ref={section} aria-labelledby="h-hero" data-descent="" className="theme-dark relative bg-black text-[#f2f0ea]" style={{ height: `${SCREENS * 100}svh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* The picture: the first screen's still at once, the live scene over it once its pictures have loaded. */}
        <div aria-hidden="true" className="absolute inset-0">
          <picture>
            <source media="(orientation: portrait)" srcSet="/hero/descent-tall.jpg" />
            <img
              src="/hero/descent-wide.jpg"
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${live ? 'opacity-0' : 'opacity-100'}`}
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          </picture>
          {failed ? (
            <>
              {/* Without WebGL: the pole's relief map and the site's picture, in turn. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={(el) => void (backups.current.relief = el)} src={words.hero.relief} alt="" className="absolute left-1/2 top-1/2 h-[min(92vh,92vw)] w-[min(92vh,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover opacity-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={(el) => void (backups.current.site = el)} src={words.hero.image} alt="" className="absolute left-1/2 top-1/2 h-[min(88vh,88vw)] w-[min(88vh,88vw)] -translate-x-1/2 -translate-y-1/2 object-cover opacity-0" />
            </>
          ) : (
            <div className={`absolute inset-0 transition-opacity duration-700 ${live ? 'opacity-100' : 'opacity-0'}`}>
              <ChunkBoundary fallback={null} onError={() => setFailed(true)}>
                <Scene progress={progress} reduced={reduced} hero={words.hero} pins={pins} onReady={() => setLive(true)} onFail={() => setFailed(true)} />
              </ChunkBoundary>
            </div>
          )}
          {/* The map's names, kept on their places by the scene. */}
          <div ref={pinBox} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }}>
            {!failed &&
              words.pins
                .filter((p) => !p.hero)
                .map((p) => (
                  <span
                    key={p.id}
                    ref={(el) => {
                      if (el) pins.current.set(p.id, { el, lat: p.lat, lon: p.lon });
                      else pins.current.delete(p.id);
                    }}
                    className="absolute left-0 top-0 will-change-transform"
                  >
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
                    <span className="mono absolute left-3 top-0 -translate-y-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-[14px] text-[#e6e7ea]">{p.label}</span>
                  </span>
                ))}
          </div>
          {/* The landing site: a ring on it from the pole down, named. */}
          {words.pins
            .filter((p) => p.hero)
            .map((p) => (
              <div
                key={p.id}
                ref={(el) => {
                  marker.current = el;
                  if (el && !failed) pins.current.set(p.id, { el, lat: p.lat, lon: p.lon });
                  else pins.current.delete(p.id);
                }}
                className={`pointer-events-none absolute will-change-transform ${failed ? 'left-1/2 top-1/2' : 'left-0 top-0'}`}
                style={{ opacity: 0 }}
              >
                <span className="absolute -left-3 -top-3 h-6 w-6 animate-[pulse-dot_2.4s_ease-in-out_infinite] rounded-full border-2 border-[#7fa9ff] shadow-[0_0_18px_rgba(127,169,255,0.9)]" />
                {/* Named on its left, away from the pole's own name to its right; under it on a phone, clear of the edge. */}
                <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap sm:left-auto sm:right-5 sm:top-0 sm:translate-x-0 sm:-translate-y-1/2 rounded border border-[#7fa9ff]/60 bg-black/75 px-2.5 py-1 text-[15px] font-semibold text-white">{p.label}</span>
              </div>
            ))}
          {/* An instrument's frame: corner marks, as on a camera's screen. */}
          <div className="pointer-events-none absolute inset-x-4 bottom-6 top-6 sm:inset-x-8 sm:bottom-10 sm:top-8">
            <span className="absolute left-0 top-0 h-6 w-6 border-l border-t border-white/40" />
            <span className="absolute right-0 top-0 h-6 w-6 border-r border-t border-white/40" />
            <span className="absolute bottom-0 left-0 h-6 w-6 border-b border-l border-white/40" />
            <span className="absolute bottom-0 right-0 h-6 w-6 border-b border-r border-white/40" />
          </div>
        </div>

        {/* The words, one stage at a time. */}
        <div data-stage="moon" className="absolute inset-x-0 top-0 pt-12 sm:pt-16">
          <div className="wrap max-sm:bg-linear-to-b max-sm:from-black/85 max-sm:via-black/70 max-sm:to-transparent max-sm:pb-10">
            <p className="eyebrow flex items-center gap-2.5 text-[#a8c6ff]">
              <span aria-hidden="true" className="inline-block h-2 w-2 animate-[pulse-dot_2.4s_ease-in-out_infinite] rounded-full bg-[#7fa9ff]" />
              South pole forecast
            </p>
            <h1 id="h-hero" aria-label="See when a Moon lander has sunlight and a signal." className="display mt-5 max-w-[760px] animate-[focus-in_1.4s_cubic-bezier(0.16,1,0.3,1)_both] text-balance text-[42px] leading-[0.95] sm:max-w-[min(760px,52vw)] sm:text-[64px] xl:text-[84px]">
              See when a Moon lander has <em>sunlight</em> and a <span className="pixel text-[0.86em] text-[#a8c6ff] text-glow">signal</span>.
            </h1>
            <p className="mt-6 max-w-[30em] text-lg leading-relaxed text-[#c9cbcf] sm:text-[19px]">
              A forecast for Moon landing sites and dates, 2024 to 2036: sunlight, radio contact with Earth, and how long a lander keeps power.
            </p>
            <div className="mt-8 flex w-fit flex-wrap gap-3">
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
        </div>
        {caption('turn')}
        {caption('pole')}
        {caption('site')}
        <div data-stage="answer" onFocus={focusTo('answer')} className="absolute inset-x-0 top-5 sm:top-[14%]" style={{ opacity: 0, pointerEvents: 'none' }}>
          <div className="wrap">
            <div className={`${PLATE} max-w-[460px] p-5 sm:p-7`}>
              <p className="eyebrow text-[#a8c6ff]">The answer</p>
              <p className="mt-3 text-[15px] text-[#c9cbcf]">{words.siteLine}</p>
              <h2 ref={answer} tabIndex={-1} className="display mt-2 text-pretty text-[26px] leading-tight focus:outline-none sm:text-[32px]">
                {words.answer}
              </h2>
              {words.better && <p className="mt-2 text-base text-[#a8c6ff]">{words.better}</p>}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={words.exploreHref} className="btn btn-primary">
                  Open the full forecast
                </Link>
                <Link href="/sites" className="btn border-white/30 text-[#f5f5f3]">
                  Choose a landing site
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* The stages, named at the side: where the descent is, and a way to any stage. */}
        <nav aria-label="Stages of the descent" className="absolute right-5 top-1/2 -translate-y-1/2 sm:right-10">
          <ol className="relative flex flex-col gap-5">
            <span aria-hidden="true" className="absolute bottom-1.5 right-[5px] top-1.5 w-px bg-white/20" />
            {STAGES.map((s) => {
              const here = s.id === stage;
              return (
                <li key={s.id} className="relative">
                  <button
                    type="button"
                    aria-current={here ? 'step' : undefined}
                    onClick={() => goTo(s.stop, true)}
                    className="group flex cursor-pointer items-center justify-end gap-3 py-1 text-right"
                  >
                    <span className={`eyebrow whitespace-nowrap transition-[opacity,color] duration-300 max-md:sr-only ${here ? 'text-white opacity-100' : 'text-white/60 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{s.label}</span>
                    <span className={`block h-[11px] w-[11px] rounded-full border transition-all duration-300 ${here ? 'border-[#7fa9ff] bg-[#7fa9ff] shadow-[0_0_14px_rgba(127,169,255,0.9)]' : 'border-white/50 bg-black group-hover:border-white'}`} />
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </section>
  );
}
