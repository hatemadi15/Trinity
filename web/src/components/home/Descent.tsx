'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { ChunkBoundary } from '@/components/ChunkBoundary';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useLunaControls } from '@/lib/luna/controls';
import type { DescentWords } from '@/lib/viz/descent';
import { descentPose, earthSpot, firstMoon, firstFromDisc, STAGES, stageAt, stageOpacity, type Box, type StageId } from '@/lib/viz/descentPose';
import type { DescentLayout, DescentSceneProps } from './DescentScene';

// three.js comes with the picture, after the page's words: nothing on this module's import path pulls it in.
const LiveScene = dynamic(() => import('./DescentScene'), { ssr: false });

/** Screens of scroll the descent takes, the first screen included. */
const SCREENS = 6;
/** Seconds the flight Luna starts ("fly to the south pole") takes from the first screen to the answer. */
const FLY_SECONDS = 11;
/** One of the first screen's three choices: a plate with its name, one line and an arrow. */
const CHOICE =
  'relative block rounded-2xl border border-white/30 bg-[#050506]/85 px-4 py-2.5 shadow-[0_0_48px_-16px_rgba(127,169,255,0.45)] transition-[border-color,background-color,box-shadow] duration-300 hover:border-[#7fa9ff] hover:bg-[#0b1220] hover:shadow-[0_0_48px_-10px_rgba(127,169,255,0.7)] sm:px-[18px] sm:pb-9 sm:pt-4 sm:[@media(max-height:800px)]:pb-4';
const PLATE = 'rounded-2xl border border-white/12 bg-[#050506]/85 shadow-[0_0_48px_-16px_rgba(127,169,255,0.45)]';
/** With reduced motion the picture stops at each stage's own view instead of travelling between them. */
const quantize = (p: number) => STAGES.find((s) => s.id === stageAt(p))!.stop;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** The stills' discs as a share of their pictures (moon-still.jpg and earth-still.jpg, cut from the scene). */
const MOON_STILL = 0.4715;
const EARTH_STILL = 0.385;

/**
 * What the first screen says when the stills stand in for the live picture: the browser, or the pictures. Short, as it
 * stands under the three choices, within the first screen's 60 words.
 */
export function stillsNotice(why: string | null): string {
  return why && /could not load/.test(why) ? 'Still pictures: the live view’s pictures did not load.' : 'Still pictures: this browser cannot draw the live view.';
}

/** A still's place and size: its disc on `d`, the disc taking `share` of the picture's width. */
const stillStyle = (d: { cx: number; cy: number; r: number }, share: number): CSSProperties => {
  const size = d.r / share;
  return { left: d.cx - size / 2, top: d.cy - size / 2, width: size, height: size };
};

/**
 * The home page's descent (spec 23.1, after the arrival of spec 18): one picture, the Moon, from the first screen to
 * the answer. As the page scrolls the Moon turns and comes closer, down to the south pole and then to one landing
 * site; a line of words stands at each stage, one at a time, and the rail at the side names the stages and jumps to
 * any of them. Luna's "fly to the south pole" plays it (a wheel, a touch, a key or the page scrolled by any other hand
 * stops it). The first screen holds the title, one line and three choices, and nothing else: a known site, a place of
 * the visitor's own, or sites side by side. The words are page text in reading order; tabbing to the words of a stage brings its view.
 *
 * On the first screen the Moon stands where the words leave room, measured from the words themselves at every width:
 * right of them on a wide screen, under them on a tall one, never under the title, the sentence, the audience line or
 * the buttons. Without WebGL the Moon's still stands there, then the relief map and the site's picture, and a line says
 * so.
 */
export function Descent({ words, Scene = LiveScene }: { words: DescentWords; Scene?: ComponentType<DescentSceneProps> }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const opening = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  const progress = useRef(0);
  const layout = useRef<DescentLayout | null>(null);
  const pins = useRef(new Map<string, { el: HTMLElement; lat: number; lon: number }>());
  const pinBox = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const backups = useRef<{ relief: HTMLImageElement | null; site: HTMLImageElement | null; moon: HTMLImageElement | null; earth: HTMLImageElement | null }>({ relief: null, site: null, moon: null, earth: null });
  const answer = useRef<HTMLHeadingElement>(null);
  const [stage, setStage] = useState<StageId>('moon');
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  // Why the stills stand in, as the picture said it.
  const [why, setWhy] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Where the first screen's Moon and Earth stand, once the words are measured (the stills wait for it).
  const [spots, setSpots] = useState<DescentLayout | null>(null);

  /** The progress (0 to 1) of the page's scroll through the section. */
  const scrolled = () => {
    const el = section.current;
    if (!el) return 0;
    const room = el.offsetHeight - window.innerHeight;
    return room > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / room)) : 0;
  };
  /** Scrolls the page to progress `p` of the section; returns where it asked the page to be (its scrollY). */
  const goTo = (p: number, smooth = false): number | null => {
    const el = section.current;
    if (!el) return null;
    const top = window.scrollY + el.getBoundingClientRect().top + p * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: smooth && !reduced ? 'smooth' : 'instant' });
    return top;
  };

  // The first screen's room: the words measured as they stand at rest, at every size of the window and once the fonts
  // have come (they change the words' width), and the Moon and Earth fitted beside or under them.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const box = screen.current, block = opening.current;
      if (!box || !block) return;
      const frame = box.getBoundingClientRect();
      const w = box.clientWidth, h = box.clientHeight;
      if (w < 1 || h < 1) return;
      // The words' own lift as they leave is taken out: the room is for the words where they rest.
      const stageEl = block.closest<HTMLElement>('[data-stage]');
      const lift = stageEl ? stageEl.getBoundingClientRect().top - frame.top - stageEl.offsetTop : 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const child of block.children) {
        // The words' own extent (a line of the title is narrower than its box), where the browser can say it.
        const range = document.createRange();
        range.selectNodeContents(child);
        const r = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : child.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        x0 = Math.min(x0, r.left - frame.left);
        x1 = Math.max(x1, r.right - frame.left);
        y0 = Math.min(y0, r.top - frame.top - lift);
        y1 = Math.max(y1, r.bottom - frame.top - lift);
      }
      if (!Number.isFinite(x0)) return;
      const wordsBox: Box = { x0, y0, x1, y1 };
      let railBox: Box | null = null;
      for (const dot of rail.current?.querySelectorAll<HTMLElement>('[data-dot]') ?? []) {
        const r = dot.getBoundingClientRect();
        const b = { x0: r.left - frame.left, y0: r.top - frame.top, x1: r.right - frame.left, y1: r.bottom - frame.top };
        railBox = railBox ? { x0: Math.min(railBox.x0, b.x0), y0: Math.min(railBox.y0, b.y0), x1: Math.max(railBox.x1, b.x1), y1: Math.max(railBox.y1, b.y1) } : b;
      }
      // The part of the picture on screen before the page scrolls: the window under the header.
      const docTop = (section.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
      const seen = window.innerHeight - Math.max(0, docTop);
      const moon = firstMoon({ w, h, seen }, wordsBox, railBox);
      // Luna stands at the window's lower left corner: Earth keeps clear of her too.
      const luna = document.querySelector<HTMLElement>('[data-luna-dock]')?.getBoundingClientRect();
      const avoid = luna && luna.width > 0 ? [{ x0: luna.left - frame.left, y0: luna.top - frame.top, x1: luna.right - frame.left, y1: luna.bottom - frame.top }] : [];
      const next: DescentLayout = { w, h, moon, earth: earthSpot({ w, h }, moon, wordsBox, railBox, avoid) };
      layout.current = next;
      setSpots(next);
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', later);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    if (opening.current) ro?.observe(opening.current);
    if (screen.current) ro?.observe(screen.current);
    void document.fonts?.ready.then(later);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', later);
      ro?.disconnect();
    };
  }, [failed]);

  useEffect(() => {
    let raf = 0;
    const stages = STAGES.map((s) => ({ s, el: section.current?.querySelector<HTMLElement>(`[data-stage="${s.id}"]`) ?? null }));
    const update = () => {
      raf = 0;
      const p = scrolled();
      progress.current = reduced ? quantize(p) : p;
      for (const { s, el } of stages) {
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
      const view = layout.current;
      const aspect = view ? view.w / view.h : window.innerWidth / Math.max(1, window.innerHeight);
      const pose = descentPose(progress.current, aspect, { reliefHalfKm: words.hero.reliefHalfKm, windowKm: words.hero.windowKm }, view ? firstFromDisc(view.moon, view.w, view.h) : undefined);
      // The stills, where the live picture cannot draw: the Moon and Earth leave as the relief map comes in.
      if (backups.current.moon) backups.current.moon.style.opacity = String(1 - pose.relief);
      if (backups.current.earth) backups.current.earth.style.opacity = String(pose.earth);
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
  }, [reduced, failed, spots]);

  // Play: the page scrolls down through the descent by itself, eased; a wheel, a touch or a key stops it where it is,
  // and so does the page scrolling anywhere Play did not put it (the scrollbar dragged, autoscroll, a link to a section).
  useEffect(() => {
    if (!playing) return;
    const from = scrolled(), seconds = FLY_SECONDS * (1 - from), t0 = performance.now();
    // Where Play put the page on its last two frames: a scroll event may land after the next frame has moved on.
    let raf = 0, put: number | null = null, before: number | null = null;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000 / Math.max(seconds, 0.1));
      before = put;
      put = goTo(from + (1 - from) * ease(k));
      if (k >= 1) {
        setPlaying(false);
        answer.current?.focus({ preventScroll: true });
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
  const fail = (reason: string) => {
    setWhy(reason);
    setFailed(true);
  };
  // The stills show until the live picture is drawn, and stay where it cannot be.
  const stills = !live || failed;

  return (
    <section ref={section} aria-labelledby="h-hero" data-descent="" className="theme-dark relative bg-black text-[#f2f0ea]" style={{ height: `${SCREENS * 100}svh` }}>
      <div ref={screen} className="sticky top-0 h-[100svh] overflow-hidden">
        {/* The picture: the Moon's still at once, where the words leave room, the live scene over it once its pictures
            have loaded. */}
        <div aria-hidden="true" className="absolute inset-0">
          {/* The stills cross-fade with the live picture as it comes, and stay where it cannot draw. */}
          {spots && (
            <div className={`absolute inset-0 transition-opacity duration-700 ${stills ? 'opacity-100' : 'opacity-0'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={(el) => void (backups.current.earth = el)} data-still="earth" src="/hero/earth-still.jpg" alt="" className="absolute rounded-full" style={stillStyle(spots.earth, EARTH_STILL)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => void (backups.current.moon = el)}
                data-still="moon"
                src="/hero/moon-still.jpg"
                alt=""
                className="absolute rounded-full"
                style={stillStyle(spots.moon, MOON_STILL)}
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </div>
          )}
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
              <ChunkBoundary fallback={null} onError={() => fail('the picture did not load')}>
                <Scene progress={progress} reduced={reduced} hero={words.hero} pins={pins} layout={layout} onReady={() => setLive(true)} onFail={fail} />
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

        {/* The words, one stage at a time. On a wide screen the first screen's words keep to a column that leaves the
            Moon the rest; on a tall one they take the width, and the Moon stands under them. */}
        {/* Where the window is short (a phone, a laptop under 800 px tall) the first screen sets tighter, so the three
            choices end above Luna. */}
        <div data-stage="moon" className="absolute inset-x-0 top-0 pt-8 sm:pt-16 sm:[@media(max-height:800px)]:pt-8">
          <div className="wrap">
            <div ref={opening} data-opening="" className="max-w-[760px] landscape:sm:max-w-[min(640px,48vw)]">
              {/* Where the first screen is short (a phone, a landscape window under 880 px tall) the title sets in two
                  lines, so the three choices fit above Luna. Its longer line is 9.9 em wide at the letter spacing it
                  fades in with: 9vw fits a phone's column, and 4.8vw up to 64 px the landscape column (48vw, at most
                  640 px), so it never wraps to three lines as it settles. */}
              <h1
                id="h-hero"
                aria-label="See when a Moon lander has sunlight and a signal."
                className="display animate-[focus-in_1.4s_cubic-bezier(0.16,1,0.3,1)_both] text-balance text-[min(34px,8vw)] leading-[1.1] sm:text-[56px] lg:text-[64px] xl:text-[72px] 2xl:text-[84px] landscape:sm:[@media(max-height:880px)]:text-[min(64px,4.8vw)]"
              >
                See when a Moon lander has <em>sunlight</em> and a <span className="pixel text-[#a8c6ff] text-glow">signal</span>.
              </h1>
              <p className="mt-4 max-w-[30em] text-lg leading-relaxed text-[#c9cbcf] max-sm:pr-8 sm:mt-5 sm:text-[19px]">A forecast for Moon landing sites and dates, 2024 to 2036.</p>
              {/* The three ways in, and nothing else: equal in weight, each a link named for where it goes, with one
                  line of what is there. Side by side from 640 px; on a phone they stack, one to a row, short of the rail's dots. */}
              <nav aria-label="Start here" className="mt-5 grid gap-2 max-sm:pr-8 sm:mt-8 sm:grid-cols-3 sm:gap-3 sm:[@media(max-height:800px)]:mt-5">
                {[
                  { href: '/sites', title: 'Pick a known site', hint: `${words.knownSites} places on the Moon` },
                  { href: '/explore?own=1', title: 'Pick your own site', hint: 'any point near the south pole' },
                  { href: '/compare', title: 'Compare sites', hint: 'side by side: power and radio contact' },
                ].map((c) => (
                  <Link key={c.href} href={c.href} data-choice="" className={`${CHOICE} group`}>
                    <span className="block text-[19px] font-semibold leading-tight text-white max-sm:pr-8">{c.title}</span>
                    <span className="sr-only">: </span>
                    <span className="mt-1.5 block text-[15px] leading-snug text-[#c9cbcf]">{c.hint}</span>
                    <span aria-hidden="true" className="absolute right-4 top-3 text-[20px] leading-none text-[#a8c6ff] transition-transform duration-300 group-hover:translate-x-1 sm:bottom-3 sm:top-auto sm:[@media(max-height:800px)]:hidden">
                      →
                    </span>
                  </Link>
                ))}
              </nav>
              {/* When the stills stand in, a line says so and why, at every width, within the first screen's 60 words. */}
              {failed && (
                <p role="status" className="mt-5 w-fit text-[15px] text-[#c9cbcf]">
                  {stillsNotice(why)}
                </p>
              )}
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

        {/* The stages, named at the side: where the descent is, and a way to any stage. The dots stand in one column on
            the rail's line; a stage's name, on a plate so it reads over the Moon, shows from 1024 px. */}
        <nav aria-label="Stages of the descent" className="absolute right-5 top-1/2 -translate-y-1/2 sm:right-10">
          <ol ref={rail} className="relative flex flex-col items-end gap-5">
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
                    <span className={`eyebrow whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 transition-[opacity,color] duration-300 max-lg:sr-only ${here ? 'text-white opacity-100' : 'text-white/60 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{s.label}</span>
                    <span data-dot="" className={`block h-[11px] w-[11px] rounded-full border transition-all duration-300 ${here ? 'border-[#7fa9ff] bg-[#7fa9ff] shadow-[0_0_14px_rgba(127,169,255,0.9)]' : 'border-white/50 bg-black group-hover:border-white'}`} />
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
