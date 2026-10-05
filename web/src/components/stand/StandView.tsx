'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { TimeBar } from '@/components/explore/TimeBar';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref, standHref } from '@/lib/links';
import { LANDER } from '@/lib/sky/landerShape';
import { eyeAt, lookUpTarget, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { openingYaw, standLander } from '@/lib/viz/standOpening';
import { answerFor } from '@/lib/viz/answer';
import { dateLong } from '@/lib/viz/format';
import { betterLabel, keyMoments, landerCaption, measuredNote, momentCaption, radioNext, skyLabel, standHeadline, standingLine, standQuery, statusLine, viewCaption, watchNext, whyLines, type Moment } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike } from './StandCanvas';

// The plates are near opaque, so no thin line of the sky shows through the words, and nothing is blurred.
const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/92';
// Hover lightens a button a little; the keyboard's focus gets a ring, so neither reads as a button left on.
const LOOK = 'min-h-10 rounded-lg border border-white/20 px-3.5 text-[15px] hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6d48a]';
/** The dot by the lander's line: green only with radio contact (as on the time bar), amber with power alone, red when off. */
const TONE = { radio: 'bg-[#8ddcaa]', power: 'bg-[#f6c86a]', off: 'bg-[#ff9180]' } as const;
const defaultRenderer = (canvas: HTMLCanvasElement, scene: StandScene): RendererLike => new StandRenderer(canvas, scene);
/** A tall screen: the lander stands nearer the middle and the view opens wider (lib/viz/standOpening). */
const tall = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
/** How far out from the lander's middle the near edge of its nearest foot can stand, metres: the opening keeps it in sight. */
const LANDER_FOOT_M = 2.1;

/**
 * The key moments' days on the paths, each named as its flag on the time bar names it, short, so a chip says
 * what happens where it sits: on the Sun's path where it leaves the view, "Sun behind hills, 3 Jan" when a hill
 * hides a Sun still up, else "Sunset, 3 Jan", and where it comes back, "Sun back, 20 Jan"; on Earth's where it
 * comes into view, "Earth in view, 10 Jan". The power's part of a joined moment stays on its flag: the path is
 * the Sun's.
 */
export function pathMarks(moments: Moment[]): NonNullable<StandScene['marks']> {
  return moments.flatMap((m): NonNullable<StandScene['marks']> => {
    if (m.kind === 'earth-in') return [{ hour: m.hour, body: 'earth', text: `Earth in view, ${m.day}` }];
    if (m.kind === 'sun-back' || m.kind === 'sun-power-back') return [{ hour: m.hour, body: 'sun', text: `Sun back, ${m.day}` }];
    if (m.kind === 'sunset' || m.kind === 'sunset-power-off') return [{ hour: m.hour, body: 'sun', text: `${m.label.startsWith('Sunset') ? 'Sunset' : 'Sun behind hills'}, ${m.day}` }];
    return [];
  });
}

/**
 * Stand on the Moon: the full-window view from the landing site for the site, period and hour of the
 * address (Explore's address plus `hour`). Over the view, one card that keeps its shape: the headline (with
 * how long the night lasts), one line on the lander's power, its battery's level and its radio, what to watch
 * next, the better landing day and the way back; "Why this happens" gives where the site lies, why the light
 * and the sky look as they do (the pole first), the radio story and how we know, one reason at a time or all
 * as one list. On a phone the card folds to the headline until "More". A key moment, chosen from its flag or
 * passed as the time moves on, gets a line over the view on why; the moments stay as dots when the words are
 * hidden. A lander stands beside the site for scale. Without WebGL 2 it shows the horizon chart with the same
 * words.
 */
export function StandView({ store = exploreStore, createRenderer = defaultRenderer }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike }) {
  const s = useStore(store);
  const reducedMotion = useReducedMotion();
  const [sky, setSky] = useState<SkyAssets | null>(null);
  // The hour the view opened on, once the ground has loaded: it places the lander in the first view.
  const [openHour, setOpenHour] = useState<number | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'data' | null>(null);
  // The view's shaders are built: until then "Building the ground" stays up.
  const [drawn, setDrawn] = useState(false);
  const [look, setLook] = useState<LookTarget | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [wordsHidden, setWordsHidden] = useState(false);
  // A key moment chosen from its flag on the time bar, or passed as the time moves on (onCursor): a line over
  // the view says why, for 12 seconds or until the view is turned another way.
  const [caption, setCaption] = useState<string | null>(null);
  useEffect(() => {
    if (!caption) return;
    const id = window.setTimeout(() => setCaption(null), 12000);
    return () => window.clearTimeout(id);
  }, [caption]);
  // "Why this happens": where the site lies, why the light and the sky look as they do, the radio story and how
  // we know, one reason at a time (`page`), so the card never scrolls inside itself; or all of them as one list
  // (`allReasons`), for a reader who would rather read them together.
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [allReasons, setAllReasons] = useState(false);
  // On a phone the card folds to the headline until "More", so the view keeps most of the screen.
  const [cardOpen, setCardOpen] = useState(false);
  // ?quality=fast for weaker graphics: a lower pixel ratio, no drawn detail, coarser shadow steps.
  const [quality] = useState<'full' | 'fast'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'fast' ? 'fast' : 'full'));

  useEffect(() => {
    let live = true;
    const search = window.location.search;
    const q = standQuery(search);
    void (async () => {
      await store.getState().init();
      await store.getState().applyQuery(search);
      if (q.hour !== undefined) store.getState().setCursor(q.hour);
      await store.getState().waitForTerrain();
      if (live) setOpenHour(store.getState().cursorHour);
    })();
    loadSkyAssets(dataBase()).then(
      (assets) => live && setSky(assets),
      () => live && setFailed('data'),
    );
    return () => {
      live = false;
    };
  }, [store]);

  const scene = useMemo<StandScene | null>(() => {
    if (openHour === null || !sky || !s.site || !s.series || !s.mask) return null;
    // Only a polar site stands on NASA heights; elsewhere the ground is drawn flat (and the card says so).
    const levels = s.site.polar ? shadowLevels(s.site, s.heightmap, s.contextHeightmap, s.capHeightmap) : [];
    const siteHeightM = s.heightmap?.meta.site_height_m ?? s.maskMeta?.siteHeightM ?? 0;
    const field = levels.length ? terrainField(levels, s.site.lon, siteHeightM) : flatField(s.site.lon);
    // Where it landed: placed by the period's first hour, not the hour the view opens on.
    const lander = s.power ? standLander(s.series, s.power, tall()) : undefined;
    // The key moments' days on the paths: the Sun's leaving and coming back on its path, Earth coming into view on Earth's.
    const marks = pathMarks(keyMoments(s.series, s.power, s.startUtc));
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: s.params.mastM, sky, quality, lander, marks };
  }, [openHour, sky, s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, s.power, quality]);
  // How far below level the lander's nearest foot lies from the eye, and which way: the opening view keeps
  // it in sight while the lander is in view.
  const feet = useMemo(() => {
    if (!scene?.lander) return null;
    const l = scene.lander, a = (l.azDeg * Math.PI) / 180;
    const ground = meshHeightAt(scene.field, l.distM * Math.sin(a), -l.distM * Math.cos(a));
    const eye = eyeAt(scene);
    return { el: (Math.atan2(ground - eye, l.distM - LANDER_FOOT_M) * 180) / Math.PI, az: l.azDeg };
  }, [scene]);
  const onFail = useCallback(() => setFailed('webgl'), []);
  const onReady = useCallback(() => setDrawn(true), []);
  // The time bar moves the time (Play each hour, the slider, a key): moved forward by two days or less across a
  // key moment, the line over the view says why, as the moment's flag does, but the view stays where it is. Of
  // the moments passed, the last. Done here as the time moves rather than in an effect on the hour; it reads
  // the store when called, so it never changes and Play's timer is not set again every hour.
  const onCursor = useCallback(
    (to: number) => {
      const from = store.getState().cursorHour;
      store.getState().setCursor(to);
      const st = store.getState();
      const at = st.cursorHour;
      if (!st.site || !st.series || at <= from || at - from > 48) return;
      const passed = keyMoments(st.series, st.power, st.startUtc).filter((m) => from < m.hour && m.hour <= at).at(-1);
      if (passed) setCaption(momentCaption(passed.kind, st.series, passed.hour, st.site.lat) || null);
    },
    [store],
  );

  // The time bar and the phone's look buttons change height with the width and the words: what sits above
  // them reads their measured heights (--bar-h, --look-h) instead of fixed offsets.
  const mainRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      main.style.setProperty('--bar-h', `${barRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--look-h', `${lookRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--top-h', `${(topRef.current?.offsetHeight ?? 0) + 16}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const el of [barRef.current, lookRef.current, topRef.current]) if (el) ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [s.status, wordsHidden, failed, scene, more, cardOpen]);

  if (s.status === 'error') {
    return (
      <main className="theme-dark fixed inset-0 grid place-items-center bg-black p-4 text-[#f2f0ea]">
        <p className="max-w-[520px] text-lg">
          The data for this view did not load. <Link href="/explore" className="underline underline-offset-4">Back to Explore</Link>
        </p>
      </main>
    );
  }
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary || !s.power) {
    return (
      <main className="theme-dark fixed inset-0 grid place-items-center bg-black text-[#c3bfb6]">
        <p role="status" className="text-lg">Building the ground from NASA heights…</p>
      </main>
    );
  }

  const site = s.site, series = s.series, power = s.power;
  const hour = Math.min(series.hours - 1, Math.max(0, s.cursorHour));
  const name = siteLabel(site);
  const answer = answerFor({ siteName: name, series, summary: s.summary, power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best });
  // The headline gives both verdicts the challenge asks for, power and radio contact with Earth, and how long
  // the night lasts; the site's name is in the line above it, kept on one line ("de Gerlache Rim 2", never
  // "Rim / 2").
  const title = standHeadline(answer.title, name, series, power, s.startUtc, answer.contactHours, answer.poweredHours);
  const oneLine = name.replace(/ /g, ' ');
  // Without NASA heights the ground is drawn flat, and the line above the headline says so.
  const flat = !!scene && scene.field.levels.length === 0;
  // With the battery's level while it has power, as the forecast page gives it.
  const lander = statusLine(series, power, s.startUtc, hour, s.params.power.batteryWh);
  // The better landing day opens its own view, from its first hour; the button says why it is better.
  const better =
    answer.better && s.best
      ? {
          label: betterLabel(dateLong(s.startUtc, answer.better.hour), s.best.poweredHours, s.best.poweredHours * s.best.earthFraction),
          startUtc: answer.better.startUtc,
          href: `${standHref(site.id, answer.better.startUtc, s.days, 0)}${quality === 'fast' ? '&quality=fast' : ''}`,
        }
      : null;
  // The better landing day, in place: the same lander and drawing, the new period, and the view opening again
  // from its first hour, as a fresh visit would; the address follows, so a reload or a shared link agrees.
  const land = (startUtc: string, href: string) => {
    s.setWindow(startUtc, s.days);
    s.setCursor(0);
    setOpenHour(0);
    setLook(null);
    setLookingUp(false);
    setCaption(null);
    setMore(false);
    setPage(0);
    window.history.replaceState(null, '', href);
  };
  // The note describes the view from the site: shown with it, not while the ground loads or in the fallback.
  const note = scene && !failed ? measuredNote(scene.field.levels.map((l) => l.cell), scene.sky.stars.count) : null;
  const face = (az: number, el: number, fov: number) => {
    setLookingUp(false);
    setCaption(null);
    setLook({ yaw: az, pitch: Math.max(-8, Math.min(60, el + 1.5)), fov });
  };
  // Aim at the lander's middle where it stands: the ground can fall away from the eye.
  const faceLander = () => {
    if (!scene?.lander) return;
    const l = scene.lander, a = (l.azDeg * Math.PI) / 180;
    const ground = meshHeightAt(scene.field, l.distM * Math.sin(a), -l.distM * Math.cos(a));
    const eye = eyeAt(scene);
    setLookingUp(false);
    setCaption(null);
    setLook({ yaw: l.azDeg, pitch: (Math.atan2(ground + 1.7 - eye, l.distM) * 180) / Math.PI, fov: 36 });
  };
  // Whether the view sees the back of the lander's panel: its cells face the Sun the lander was turned to.
  const cellsAz = scene?.lander?.faceAzDeg !== undefined ? scene.lander.faceAzDeg + 90 - LANDER.panel.yawDeg : null;
  const panelBackSeen = cellsAz !== null && scene?.lander ? Math.abs(((((scene.lander.azDeg + 180 - cellsAz + 540) % 360) + 360) % 360) - 180) > 90 : false;
  // The radio story: no contact while it has power from the landing, and when power and Earth meet.
  const contact = answer.poweredHours > 0 ? answer.sentences[0] : null;
  const radio = radioNext(series, power, s.startUtc);
  // "Why this happens", one reason a page or all as a list: where the site lies first, then why the light and
  // the sky look as they do (the pole first among them), then the radio story, and how we know last.
  const reasons: { title?: string; text: string }[] = [
    ...[standingLine(site, name, 'more'), ...whyLines(site.lat, series, hour), radio ?? contact].filter((t): t is string => !!t).map((text) => ({ text })),
    ...(note ? [{ title: 'How we know this', text: note }] : []),
  ];
  const shownPage = Math.min(page, reasons.length - 1);
  // The key moments, as flags on the time bar: each moves the time there, turns the view to what it is about
  // (the lander for its power, Earth for Earth, else the Sun) and says why.
  const moments = keyMoments(series, power, s.startUtc).map((m) => ({ label: `${m.label}, ${m.day}`, hour: m.hour, kind: m.kind }));
  const onMoment = (f: { label: string; hour: number }) => {
    const m = moments.find((x) => x.label === f.label && x.hour === f.hour);
    if (!m) return;
    if (m.kind === 'battery-out' || m.kind === 'power-back') faceLander();
    else if (m.kind === 'earth-in') face(series.earthAz[m.hour], series.earthEl[m.hour], 16);
    else face(series.sunAz[m.hour], series.sunEl[m.hour] - 2, 46);
    setCaption(momentCaption(m.kind, series, m.hour, site.lat) || null);
  };
  const opening = openHour === null ? hour : Math.min(series.hours - 1, Math.max(0, openHour));
  // At night with Earth up the view opens on Earth, narrower, so Earth (four times the Sun's width) shows large.
  const openOnEarth = series.sunFraction[opening] === 0 && series.earthVisible[opening] === 1;
  // After the first power cut, what needs power again holds only if the lander lives through the night.
  let ifSurvivesFrom: number | null = null;
  if (power.firstBrownoutHour !== null) {
    for (let h = power.firstBrownoutHour; h < series.hours; h++) {
      if (power.powered[h] === 1) {
        ifSurvivesFrom = h;
        break;
      }
    }
  }
  // Looking up: at the Southern Cross (else away from the Sun, 50° up), the sky alone in view, clear of
  // the ground: a slope rising beside you would curve up from a corner like the edge of a planet.
  const lookUp = () => {
    setLookingUp(true);
    setCaption(null);
    const cross = scene ? lookUpTarget(scene.sky, site.lat, site.lon, Date.parse(s.startUtc + 'Z') + hour * 3600e3) : null;
    setLook({ yaw: cross ? cross.az : (series.sunAz[hour] + 180) % 360, pitch: cross ? Math.max(42, Math.min(70, cross.el - 4)) : 50, fov: 62 });
  };
  const crossNamed = !!scene && scene.sky.names?.some((n) => n.name === 'Acrux');
  // The line over the view, two lines at most: why a key moment happens, why Earth sits where it does, what
  // looking up shows, or, at night, where the light comes from: Earth's, or, with neither the Sun nor Earth in
  // view, none (why farther hills can still be lit is left to "Why this happens").
  const overView =
    caption ??
    (lookingUp
      ? viewCaption('up', crossNamed ? site.lat : Math.abs(site.lat))
      : series.sunFraction[hour] === 0
        ? series.earthVisible[hour] === 1
          ? viewCaption('earthlight', site.lat)
          : viewCaption('dark', site.lat)
        : null);

  return (
    <main ref={mainRef} className="theme-dark fixed inset-0 overflow-hidden bg-black text-[#f2f0ea]">
      {scene && !failed && (
        <StandCanvas
          // A new period opens the view again, as a fresh visit would: from the sky, to its first hour.
          key={s.startUtc}
          scene={scene}
          hour={hour}
          look={look}
          startYaw={openingYaw(series, opening, tall(), !!scene.lander)}
          reducedMotion={reducedMotion}
          createRenderer={createRenderer}
          sunLabel={skyLabel('sun', series, hour)}
          earthLabel={skyLabel('earth', series, hour)}
          night={series.sunFraction[hour] < 0.5}
          onFail={onFail}
          onReady={onReady}
          clean={wordsHidden}
          keepInView={feet}
          startFov={openOnEarth ? (tall() ? 50 : 36) : undefined}
        />
      )}
      {failed && s.mask && (
        <div className="fixed inset-x-4 top-1/2 mx-auto max-w-[900px] -translate-y-1/3">
          <p className="mb-3 text-[15px] text-[#c3bfb6]">
            {failed === 'webgl' ? 'This browser cannot draw the view from the site, so here is the horizon chart instead.' : 'The view from the site could not be loaded, so here is the horizon chart instead.'}
          </p>
          <HorizonView mask={s.mask} series={series} cursor={hour} lat={site.lat} startUtc={s.startUtc} />
        </div>
      )}
      {!failed && (!scene || !drawn) && <p role="status" className="fixed inset-x-0 top-1/2 text-center text-lg text-[#c3bfb6]">Building the ground from NASA heights…</p>}

      {wordsHidden && (
        <button type="button" data-plate="" className={`${LOOK} fixed left-4 top-4 bg-black/75`} onClick={() => setWordsHidden(false)}>
          Show the words
        </button>
      )}
      {!wordsHidden && (
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start justify-between gap-3 md:flex-row">
          <section
            ref={topRef}
            data-plate=""
            aria-label="The answer for this site"
            className={`${PLATE} pointer-events-auto grid w-full max-w-[560px] gap-2 overflow-y-auto p-3.5 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin] md:max-h-[calc(100dvh-var(--bar-h,185px)-32px)] md:gap-2.5 md:p-5 max-md:max-h-[calc(100dvh-var(--bar-h,211px)-var(--look-h,52px)-40px)]`}
          >
            {/* The same card whatever the view does, so nothing jumps; on a phone it folds to the headline. */}
            <p className={`text-[14px] text-[#c3bfb6] md:text-[15px] ${cardOpen ? '' : 'max-md:hidden'}`}>{standingLine(site, oneLine, 'top', flat)}</p>
            <h1 className="display text-pretty text-[18px] font-bold leading-tight sm:text-[22px]">{title}</h1>
            <button type="button" className="flex min-h-10 items-center self-start text-[15px] underline underline-offset-4 md:hidden" aria-expanded={cardOpen} onClick={() => setCardOpen((o) => !o)}>
              {cardOpen ? 'Less' : 'More'}
            </button>
            <p className={`flex items-baseline gap-2 text-[15px] md:text-base ${cardOpen ? '' : 'max-md:hidden'}`}>
              <i aria-hidden="true" data-tone={lander.tone} className={`h-3 w-3 shrink-0 translate-y-px rounded-full ${TONE[lander.tone]}`} />
              <span>{lander.text}</span>
            </p>
            <p className={`text-[14px] text-[#f6d48a] md:text-[15px] ${cardOpen ? '' : 'max-md:hidden'}`}>{watchNext(series, power, s.startUtc, hour)}</p>
            {better && (
              // The better day, on a row of its own, so the links below never move.
              <div className={cardOpen ? '' : 'max-md:hidden'}>
                <a
                  href={better.href}
                  onClick={(e) => {
                    e.preventDefault();
                    land(better.startUtc, better.href);
                  }}
                  className={`${LOOK} inline-flex items-center border-[#f6d48a]/55 text-[#f6d48a]`}
                >
                  {better.label}
                </a>
              </div>
            )}
            <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${cardOpen ? '' : 'max-md:hidden'}`}>
              {/* Named for what it holds whether open or not, so the way back beside it stays put. */}
              <button
                type="button"
                className="flex min-h-10 items-center gap-1.5 text-[15px] underline underline-offset-4"
                aria-expanded={more}
                onClick={() => {
                  setMore((m) => !m);
                  setPage(0);
                }}
              >
                Why this happens
                <span aria-hidden="true" className="no-underline">
                  {more ? '▴' : '▾'}
                </span>
              </button>
              <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 items-center text-[15px] underline underline-offset-4">
                Back to the forecast
              </Link>
            </div>
            {more && reasons.length > 0 && (
              <div className="grid gap-2 border-t border-white/10 pt-3 text-[15px] text-[#e4e1da]">
                {allReasons ? (
                  // All the reasons as one list, in the same order.
                  <ul className="grid gap-2">
                    {reasons.map((r) => (
                      <li key={r.text}>
                        {r.title && <p className="font-semibold text-[#f2f0ea]">{r.title}</p>}
                        <p>{r.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div data-reason="" aria-live="polite">
                    {reasons[shownPage].title && <p className="font-semibold text-[#f2f0ea]">{reasons[shownPage].title}</p>}
                    <p>{reasons[shownPage].text}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {!allReasons && (
                    <>
                      <button type="button" className="flex min-h-10 items-center text-[15px] underline underline-offset-4 disabled:no-underline disabled:opacity-40" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>
                        Previous reason
                      </button>
                      <span className="text-[14px] text-[#c3bfb6]">
                        {shownPage + 1} of {reasons.length}
                      </span>
                      <button type="button" className="flex min-h-10 items-center text-[15px] underline underline-offset-4 disabled:no-underline disabled:opacity-40" disabled={shownPage === reasons.length - 1} onClick={() => setPage(shownPage + 1)}>
                        Next reason
                      </button>
                    </>
                  )}
                  {/* Beside the pager, the way between the page and the list. Its words say what it does, so it
                      carries no pressed state: a toggle's words must not change with its state. */}
                  <button type="button" className="flex min-h-10 items-center text-[15px] underline underline-offset-4" onClick={() => setAllReasons((all) => !all)}>
                    {allReasons ? 'One at a time' : 'Show all reasons'}
                  </button>
                </div>
              </div>
            )}
          </section>
          {!failed && (
            <div className="pointer-events-none flex w-full flex-col gap-1.5 md:w-auto md:max-w-[380px] md:items-end lg:max-w-none">
              {/* One slim row of buttons: at the top right on a wide screen, just above the time bar on a phone. */}
              <div
                ref={lookRef}
                data-plate=""
                role="group"
                aria-label="Look towards"
                className={`${PLATE} pointer-events-auto flex flex-wrap items-center gap-1.5 p-1.5 lg:flex-nowrap max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--bar-h,211px)] max-md:flex-nowrap max-md:justify-between max-md:gap-1 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:bg-[#1e1e1e] max-md:px-3 max-md:[&>button]:px-2 max-md:[&>button]:text-[14px]`}
              >
                <span className="pl-1 text-[14px] text-[#c3bfb6] md:hidden">Face</span>
                <button type="button" aria-label="Face the Sun" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
                  <Short short="Sun" long="Face the Sun" />
                </button>
                <button
                  type="button"
                  aria-label="Face Earth"
                  className={LOOK}
                  onClick={() => {
                    face(series.earthAz[hour], series.earthEl[hour], 16);
                    setCaption(viewCaption('earth', site.lat));
                  }}
                >
                  <Short short="Earth" long="Face Earth" />
                </button>
                {scene?.lander && (
                  <button
                    type="button"
                    aria-label="Face the lander"
                    className={LOOK}
                    onClick={() => {
                      faceLander();
                      setCaption(landerCaption(site.lat, panelBackSeen));
                    }}
                  >
                    <Short short="Lander" long="Face the lander" />
                  </button>
                )}
                {/* On a phone the "Face" buttons end here: what follows is not a way to face. */}
                <i aria-hidden="true" className="h-7 w-px shrink-0 bg-white/25 md:hidden" />
                {lookingUp ? (
                  <button type="button" aria-label="Look ahead" className={`${LOOK} md:min-w-[7.25rem]`} onClick={() => face(series.sunAz[hour], 0.5, 60)}>
                    <Short short="Ahead" long="Look ahead" />
                  </button>
                ) : (
                  <button type="button" aria-label="Look up" className={`${LOOK} md:min-w-[7.25rem]`} onClick={lookUp}>
                    <Short short="Look up" long="Look up" />
                  </button>
                )}
                <button type="button" aria-label="Hide the words" className={LOOK} onClick={() => setWordsHidden(true)}>
                  <Short short="Hide words" long="Hide the words" />
                </button>
              </div>
              <p className="pr-1 text-right text-[14px] text-[#c3bfb6] [text-shadow:0_0_4px_#000] max-md:hidden">Drag to look around; pinch or scroll to zoom.</p>
            </div>
          )}
        </div>
      )}
      {overView && !failed && !wordsHidden && (
        // Why a key moment happens, or what looking up shows: above the compass (on a phone, above the buttons).
        <p
          data-plate=""
          className={`${PLATE} pointer-events-none fixed bottom-[calc(var(--bar-h,129px)+80px)] left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 px-3 py-2 text-center text-[15px] max-md:bottom-[calc(var(--bar-h,211px)+var(--look-h,52px)+12px)]`}
        >
          {overView}
        </p>
      )}

      <div ref={barRef} data-plate="" className="fixed inset-x-0 bottom-0">
        {/* No chart above it here: the bar carries the dates and the hours the lander is off. */}
        <TimeBar series={series} power={power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={onCursor} dates powered={power.powered} compact bare={wordsHidden} moments={moments} onMoment={onMoment} ifSurvivesFrom={ifSurvivesFrom} clockNote=" (Earth time)" />
      </div>
    </main>
  );
}

/** A button's words: short on a phone, full elsewhere (the button's aria-label carries the full name). */
function Short({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true" className="md:hidden">
        {short}
      </span>
      <span aria-hidden="true" className="max-md:hidden">
        {long}
      </span>
    </>
  );
}

