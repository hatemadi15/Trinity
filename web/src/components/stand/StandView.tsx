'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { LanderDialog } from '@/components/explore/LanderDialog';
import { TimeBar } from '@/components/explore/TimeBar';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref, standHref } from '@/lib/links';
import { earthLitFraction } from '@/lib/sky/earth';
import { dirAzEl } from '@/lib/sky/frames';
import { LANDER } from '@/lib/sky/landerShape';
import { eyeAt, lookUpTarget, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { COMPARE_MAX, exploreStore, type ExploreState } from '@/lib/store/explore';
import { openingYaw, standLander } from '@/lib/viz/standOpening';
import { answerFor } from '@/lib/viz/answer';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { betterChip, betterLabel, keyMoments, landerCaption, measuredNote, momentCaption, radioNext, skyLabel, standHeadline, standingLine, standQuery, statusLine, viewCaption, WATCH_LEAD, WATCH_LEAD_DOTS, watchNext, whyLines, type Moment } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike } from './StandCanvas';

// The plates are opaque, so no line of the sky (a path, the level horizon) shows through the words (read D1), and
// nothing is blurred.
const PLATE = 'rounded-lg border border-white/15 bg-[#060607]';
// Hover lightens a button a little; the keyboard's focus gets a ring, so neither reads as a button left on.
const LOOK = 'min-h-10 whitespace-nowrap rounded-lg border border-white/20 px-3.5 text-[15px] hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6d48a]';
/** A toggle pressed: light, as the mockup has it; its words never change with its state (aria-pressed says it). */
const PRESSED = 'aria-pressed:border-[#f2f0ea] aria-pressed:bg-[#f2f0ea] aria-pressed:text-[#07080a] aria-pressed:hover:bg-[#f2f0ea]';
/** The dot by the lander's line: green only with radio contact (as on the time bar), amber with power alone, red when off. */
const TONE = { radio: 'bg-[#8ddcaa]', power: 'bg-[#f6c86a]', off: 'bg-[#ff9180]' } as const;
const defaultRenderer = (canvas: HTMLCanvasElement, scene: StandScene): RendererLike => new StandRenderer(canvas, scene);
/**
 * Under this share of Earth's disc lit, its light on the ground is faint and the ground looks grey: the caption says a
 * thin crescent gives little light rather than that it tints the ground blue (both readers of read D1).
 */
const FAINT_EARTH = 0.25;
/** A tall screen: the lander stands nearer the middle and the view opens wider (lib/viz/standOpening). */
const tall = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
/** How far out from the lander's middle the near edge of its nearest foot can stand, metres: the opening keeps it in sight. */
const LANDER_FOOT_M = 2.1;
/** The session's key for "Brighter picture" (18.3): kept for the visit, not across visits. */
const BRIGHT_KEY = 'earthrise-bright';

/** Whether the visitor asked for a brighter picture earlier in the visit; false wherever storage is missing or blocked. */
function readBright(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(BRIGHT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Half the view's width in degrees for a vertical field of view, from the window's shape (16:10 before there is a window). */
function halfWidthDeg(fovDeg: number): number {
  const aspect = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 10;
  return (Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
}

/**
 * The key moments' days on the paths, each named as its flag on the time bar names it, short, so a chip says
 * what happens where it sits: on the Sun's path where it sets, below the horizon or behind the hills, "Sunset,
 * 3 Jan", and where it rises, "Sunrise, 20 Jan"; on Earth's where it rises, "Earth rises, 10 Jan". The power's
 * part of a joined moment stays on its flag: the path is the Sun's.
 */
export function pathMarks(moments: Moment[]): NonNullable<StandScene['marks']> {
  return moments.flatMap((m): NonNullable<StandScene['marks']> => {
    if (m.kind === 'earth-out') return [{ hour: m.hour, body: 'earth', text: `Earth sets, ${m.day}` }];
    if (m.kind === 'earth-in') return [{ hour: m.hour, body: 'earth', text: `Earth rises, ${m.day}` }];
    if (m.kind === 'sun-back' || m.kind === 'sun-power-back') return [{ hour: m.hour, body: 'sun', text: `Sunrise, ${m.day}` }];
    if (m.kind === 'sunset' || m.kind === 'sunset-power-off') return [{ hour: m.hour, body: 'sun', text: `Sunset, ${m.day}` }];
    return [];
  });
}

/**
 * Stand on the Moon: the full-window view from the landing site for the site, period and hour of the
 * address (Explore's address plus `hour`). Over the view (16.2), one line on the lander's power and radio with
 * More, which opens today's card: where you stand, the headline (the page's heading at all times, with how long
 * the night lasts), what to watch next, the better landing day, "Why this happens" (where the site lies, why the
 * light and the sky look as they do, the pole first, the radio story and how we know, one reason at a time or all
 * as one list) and the way back. From 768 px wide a second row under that line keeps the next step in view (17.1):
 * the better landing day in gold (else "Compare sites"), "Change site", "Change date" and "Compare sites", and the
 * card leaves out its better day and way back. One row of buttons faces the Sun, Earth or the lander, looks up,
 * shows the guides and hides the words; on a phone it sits above the time bar, and "Hide the words" waits in the
 * card. A key moment, chosen from its flag or passed as the time moves on, gets a line over the view on why; the
 * moments stay as dots when the words are hidden. A lander stands beside the site for scale, placed by the hour the
 * view opens on. Without WebGL 2 it shows the horizon chart with the same words.
 */
export function StandView({ store = exploreStore, createRenderer = defaultRenderer }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike }) {
  const s = useStore(store);
  const reducedMotion = useReducedMotion();
  // A plain change of page without a router (tests, static previews), as Explore's.
  const go = useNavigate();
  const [sky, setSky] = useState<SkyAssets | null>(null);
  // The hour the view opened on, once the ground has loaded: it places the lander in the first view.
  const [openHour, setOpenHour] = useState<number | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'data' | null>(null);
  // The view's shaders are built: until then "Building the ground" stays up.
  const [drawn, setDrawn] = useState(false);
  const [look, setLook] = useState<LookTarget | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [wordsHidden, setWordsHidden] = useState(false);
  // The guides (16.2): off when the view opens; the month's paths, their days, the level horizon, the star names at
  // night and your shadow.
  const [guides, setGuides] = useState(false);
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
  // Today's card under the status line, on every screen (16.2): the headline, what to watch, the better day, the
  // reasons and the ways on.
  const [cardOpen, setCardOpen] = useState(false);
  // "Change lander" (18.3): the forecast page's lander dialog, opened in place; the focus comes back to the button.
  const [landerOpen, setLanderOpen] = useState(false);
  // The button that opened the dialog, in the row or in a phone's card: the focus comes back to it (the final review).
  const landerRef = useRef<HTMLButtonElement | null>(null);
  const openLander = (e: MouseEvent<HTMLButtonElement>) => {
    landerRef.current = e.currentTarget;
    setLanderOpen(true);
  };
  // "Brighter picture" (18.3): twice the exposure, for projectors and bright rooms, kept for the visit.
  const [bright, setBright] = useState(() => readBright());
  useEffect(() => {
    try {
      window.sessionStorage.setItem(BRIGHT_KEY, bright ? '1' : '0');
    } catch {
      // A private window or blocked storage: the setting holds for this page.
    }
  }, [bright]);
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
    // Where it landed, placed by the hour the view opens on, so the opening view holds it (16.3).
    const lander = s.power ? standLander(s.series, s.power, tall(), openHour) : undefined;
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
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      main.style.setProperty('--bar-h', `${barRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--look-h', `${lookRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--top-h', `${(topRef.current?.offsetHeight ?? 0) + 16}px`);
      // The status line's own height, which the card under it takes off the room it may fill.
      main.style.setProperty('--status-h', `${statusRef.current?.offsetHeight ?? 0}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const el of [barRef.current, lookRef.current, topRef.current, statusRef.current]) if (el) ro.observe(el);
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
  // The better landing day opens its own view, from its first hour; the button says why it is better: the power and
  // the radio, in today's card and in the row under the status line alike (18.3); a phone's chip gives the power alone.
  const better =
    answer.better && s.best
      ? {
          label: betterLabel(dateLong(s.startUtc, answer.better.hour), s.best.poweredHours, s.best.poweredHours * s.best.earthFraction),
          chip: betterChip(dayMonth(s.startUtc, answer.better.hour), s.best.poweredHours),
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
    setCardOpen(false);
    window.history.replaceState(null, '', href);
  };
  // "Compare sites" adds this site to the comparison first, as Explore's does (17.1), then opens it.
  const compare = () => {
    const st = store.getState();
    if (!st.compareIds.includes(site.id) && st.compareIds.length < COMPARE_MAX) void st.addToCompare(site.id).then(() => go('/compare'));
    else go('/compare');
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
    // The view fits the lander's feet above the bar, as the opening does (18.3).
    setLook({ yaw: l.azDeg, pitch: (Math.atan2(ground + 1.7 - eye, l.distM) * 180) / Math.PI, fov: 36, fit: true });
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
  const watch = watchNext(series, power, s.startUtc, hour);
  const moments = keyMoments(series, power, s.startUtc).map((m) => ({ label: `${m.label}, ${m.day}`, hour: m.hour, kind: m.kind }));
  const onMoment = (f: { label: string; hour: number }) => {
    const m = moments.find((x) => x.label === f.label && x.hour === f.hour);
    if (!m) return;
    if (m.kind === 'battery-out' || m.kind === 'power-back') faceLander();
    else if (m.kind === 'earth-in' || m.kind === 'earth-out') face(series.earthAz[m.hour], series.earthEl[m.hour], 16);
    else face(series.sunAz[m.hour], series.sunEl[m.hour] - 2, 46);
    setCaption(momentCaption(m.kind, series, m.hour, site.lat) || null);
  };
  const opening = openHour === null ? hour : Math.min(series.hours - 1, Math.max(0, openHour));
  // At night with Earth up the view opens on Earth, narrower, so Earth (four times the Sun's width) shows large: 44°
  // high (56° on a tall screen), so Earth and the lander's feet both fit between the status line and the time bar
  // (both readers of read D1 found the lander cut off at 36°).
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
  // looking up shows, or, at night, where the light comes from: Earth's (faint from a thin crescent), or, with neither the Sun nor Earth in
  // view, none (why farther hills can still be lit is left to "Why this happens").
  const overView =
    caption ??
    (lookingUp
      ? viewCaption('up', crossNamed ? site.lat : Math.abs(site.lat))
      : series.sunFraction[hour] === 0
        ? series.earthVisible[hour] === 1
          ? viewCaption(earthLitFraction(dirAzEl(series.sunAz[hour], series.sunEl[hour]), dirAzEl(series.earthAz[hour], series.earthEl[hour])) < FAINT_EARTH ? 'faint' : 'earthlight', site.lat)
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
          // Turned up to 30° towards the skyline's highest point, the Sun and the lander kept in frame (18.4).
          startYaw={openingYaw(series, opening, tall(), !!scene.lander, scene.mask, halfWidthDeg(openOnEarth ? (tall() ? 56 : 44) : tall() ? 80 : 60))}
          reducedMotion={reducedMotion}
          createRenderer={createRenderer}
          sunLabel={skyLabel('sun', series, hour)}
          earthLabel={skyLabel('earth', series, hour)}
          night={series.sunFraction[hour] < 0.5}
          onFail={onFail}
          onReady={onReady}
          clean={wordsHidden}
          guides={guides}
          keepInView={feet}
          // What the opening view faces stays in sight while it looks down for the lander's feet: Earth at night, else the Sun when up.
          keepSubject={openOnEarth ? series.earthEl[opening] : series.sunFraction[opening] > 0 ? series.sunEl[opening] : null}
          startFov={openOnEarth ? (tall() ? 56 : 44) : undefined}
          place={name}
          docked={!!overView}
          bright={bright}
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
        // Side by side from 1280 px wide; narrower, the row sits above the time bar and the status line has the top (the
        // final review found the row over the status line and its More from 768 px to about 1070 px).
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start gap-3 xl:flex-row xl:justify-between">
          {/* One line on the lander's power and radio, with More for today's card (16.2). */}
          <section ref={topRef} aria-label="The answer for this site" className="pointer-events-none grid w-full min-w-0 justify-items-start gap-2 xl:flex-1">
            {/* The page's heading at all times, for screen readers; the card shows it when it is open. */}
            {/* Tighter on a phone, so its longest state (four lines) leaves the scene 55 % of the screen (16.5). */}
            <h1 className="sr-only">{title}</h1>
            <div ref={statusRef} data-plate="" className={`${PLATE} pointer-events-auto flex w-full max-w-[860px] flex-col`}>
              <div className="flex items-start gap-3 px-3.5 py-1 md:px-4 md:py-1.5">
                <i aria-hidden="true" data-tone={lander.tone} className={`mt-[11px] h-3 w-3 shrink-0 self-start rounded-full md:mt-[13px] ${TONE[lander.tone]}`} />
                <p className="min-w-0 flex-1 text-balance py-1.5 text-[15px] leading-snug md:py-2 md:text-base">
                  <span className="text-[#c3bfb6] max-md:hidden">{oneLine}. </span>
                  {lander.text}
                </p>
                <button type="button" aria-expanded={cardOpen} className="flex min-h-10 shrink-0 items-center gap-1.5 self-end whitespace-nowrap text-[15px] underline underline-offset-4" onClick={() => setCardOpen((o) => !o)}>
                  {cardOpen ? 'Less' : 'More'}
                  <span aria-hidden="true" className="no-underline">
                    {cardOpen ? '▴' : '▾'}
                  </span>
                </button>
              </div>
              {/* The next step, always in view from 768 px (17.1); on a phone it waits in today's card. It starts under
                  the status's words (the plate's 16 px, the dot's 12 and the gap's 12), as the mockup has it. */}
              {/* The answer, in view from 768 px (read D2: the better day had nothing to compare against under More); a phone's card keeps it. */}
              <p aria-hidden="true" className="display text-pretty px-4 pb-1 pl-10 text-[16px] font-semibold leading-snug max-md:hidden">
                {title}
              </p>
              <div role="group" aria-label="Next step" className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5 pl-10 pr-4 pt-0.5 max-md:hidden">
                {better ? (
                  <a
                    href={better.href}
                    onClick={(e) => {
                      e.preventDefault();
                      land(better.startUtc, better.href);
                    }}
                    className={`${LOOK.replace('whitespace-nowrap ', '')} inline-flex items-center border-[#f6d48a]/55 text-[#f6d48a]`}
                  >
                    {better.label}
                    <span aria-hidden="true"> ›</span>
                  </a>
                ) : (
                  <button type="button" onClick={compare} className={`${LOOK} border-[#f6d48a]/55 text-[#f6d48a]`}>
                    Compare sites
                  </button>
                )}
                <Link href="/sites" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                  Change site
                </Link>
                <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                  Change date
                </Link>
                {/* The forecast page's lander dialog, in place (18.3): "your own lander" from here too. */}
                <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4" onClick={openLander}>
                  Change lander
                </button>
                {better && (
                  <button type="button" onClick={compare} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                    Compare sites
                  </button>
                )}
              </div>
            </div>
            {better && !cardOpen && (
              // A phone's first screen keeps the better day in sight (18.3): one gold chip under the plate, a link to that
              // landing, 32 px tall at 14 px so the scene keeps 55 % of the screen; from 768 px the row's gold button has it,
              // and while today's card is open the card has it in full (read D3), so the chip waits.
              <a
                data-chip=""
                href={better.href}
                onClick={(e) => {
                  e.preventDefault();
                  land(better.startUtc, better.href);
                }}
                className={`${PLATE} pointer-events-auto inline-flex h-8 items-center gap-1 border-[#f6d48a]/55 px-2.5 text-[14px] text-[#f6d48a] md:hidden`}
              >
                {better.chip}
                <span aria-hidden="true">›</span>
              </a>
            )}
            {cardOpen && (
              <div
                id="stand-card"
                data-plate=""
                className={`${PLATE} pointer-events-auto grid w-full max-w-[560px] gap-2 overflow-y-auto p-3.5 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin] md:gap-2.5 md:p-5 xl:max-h-[calc(100dvh-var(--bar-h,185px)-var(--status-h,64px)-56px)] max-xl:max-h-[calc(100dvh-var(--bar-h,211px)-var(--look-h,52px)-var(--status-h,72px)-56px)]`}
              >
                <p className="text-[14px] text-[#c3bfb6] md:text-[15px]">{standingLine(site, oneLine, 'top', flat)}</p>
                {/* The headline as the eye reads it; the heading above says it for screen readers. */}
                <p aria-hidden="true" className="display text-pretty text-[18px] font-bold leading-tight sm:text-[22px] md:hidden">
                  {title}
                </p>
                {/* The lead names the flags, or the dots a phone has (18.2): the line twice, one shown per width, so a screen
                    reader meets only the shown one (display: none keeps the other out of the accessibility tree). */}
                <p className="text-[14px] text-[#f6d48a] md:text-[15px]">
                  {watch.startsWith(WATCH_LEAD) ? (
                    <>
                      <span className="sm:hidden">{`${WATCH_LEAD_DOTS}${watch.slice(WATCH_LEAD.length)}`}</span>
                      <span className="max-sm:hidden">{watch}</span>
                    </>
                  ) : (
                    watch
                  )}
                </p>
                {better && (
                  // The better day, on a row of its own, so the links below never move. From 768 px the row under
                  // the status line holds it, so the screen keeps one gold action (17.1).
                  <div className="md:hidden">
                    <a
                      href={better.href}
                      onClick={(e) => {
                        e.preventDefault();
                        land(better.startUtc, better.href);
                      }}
                      className={`${LOOK.replace('whitespace-nowrap ', '')} inline-flex items-center border-[#f6d48a]/55 text-[#f6d48a]`}
                    >
                      {better.label}
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  {/* Named for what it holds whether open or not, so the way back beside it stays put. */}
                  <button
                    type="button"
                    className="flex min-h-10 items-center gap-1.5 whitespace-nowrap text-[15px] underline underline-offset-4"
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
                  {/* On a phone the next step waits here (17.1), by the names the readers looked for (read D3): from 768 px the
                      row under the status line holds them instead. */}
                  <Link href="/sites" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Change site
                  </Link>
                  <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Change date
                  </Link>
                  <button type="button" onClick={compare} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Compare sites
                  </button>
                  {/* On a phone the row above the time bar has no room for it: it waits here. */}
                  <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden" onClick={() => setWordsHidden(true)}>
                    Hide the words
                  </button>
                  {/* On a phone the row under the status line is not shown: Change lander waits here (18.3). */}
                  <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden" onClick={openLander}>
                    Change lander
                  </button>
                  {/* Twice the exposure for projectors and bright rooms (18.3); its words never change with its state. */}
                  <button type="button" aria-pressed={bright} className={`${LOOK} ${PRESSED}`} onClick={() => setBright((b) => !b)}>
                    Brighter picture
                  </button>
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
                <p className="text-[14px] text-[#c3bfb6]">Drag to look around; pinch or scroll to zoom.</p>
              </div>
            )}
          </section>
          {!failed && (
            // One compact row: at the top right from 1280 px wide, just above the time bar below that; on a phone "Hide
            // the words" waits in the card.
            <div
              ref={lookRef}
              data-plate=""
              role="group"
              aria-label="Look towards"
              className={`${PLATE} pointer-events-auto flex shrink-0 items-center gap-1.5 p-1.5 max-xl:fixed max-xl:inset-x-0 max-xl:bottom-[var(--bar-h,211px)] max-xl:justify-between max-xl:gap-1 max-xl:rounded-none max-xl:border-x-0 max-xl:border-b-0 max-xl:bg-[#1e1e1e] max-xl:px-3 max-md:[&>button]:px-2 max-md:[&>button]:text-[14px]`}
            >
              <span className="pl-1 pr-0.5 text-[14px] text-[#c3bfb6] md:text-[15px]">Turn to</span>
              <button type="button" aria-label="Face the Sun" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
                Sun
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
                Earth
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
                  Lander
                </button>
              )}
              {/* The "Turn to" buttons end here: what follows is not a way to turn. */}
              <i aria-hidden="true" className="h-7 w-px shrink-0 bg-white/25" />
              {lookingUp ? (
                <button type="button" aria-label="Look ahead" className={LOOK} onClick={() => face(series.sunAz[hour], 0.5, 60)}>
                  <Short short="Ahead" long="Look ahead" />
                </button>
              ) : (
                <button type="button" aria-label="Look up" className={LOOK} onClick={lookUp}>
                  Look up
                </button>
              )}
              {/* "Paths" (18.2): the month's paths of the Sun and Earth with their days, the level horizon, the star names, your shadow. */}
              <button type="button" aria-pressed={guides} className={`${LOOK} ${PRESSED}`} onClick={() => setGuides((g) => !g)}>
                Paths
              </button>
              {/* Its words are its name, as speech input needs (WCAG 2.5.3). */}
              <button type="button" className={`${LOOK} max-md:hidden`} onClick={() => setWordsHidden(true)}>
                Hide the words
              </button>
            </div>
          )}
        </div>
      )}
      {overView && !failed && !wordsHidden && (
        // Why a key moment happens, or what looking up shows: docked on the compass plate from 768 px, one plate at the
        // foot of the view (18.3; its foot 14 px plus the plate's 79 px, StandCanvas's STRIP_H, over the bar); on a phone,
        // which has no compass, its own plate above the buttons.
        <p
          data-plate=""
          data-caption=""
          className={`${PLATE} pointer-events-none fixed bottom-[calc(var(--bar-h,129px)+93px)] left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 px-3 py-2 text-center text-[15px] md:rounded-b-none md:border-b-0 max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+93px)] max-md:bottom-[calc(var(--bar-h,211px)+var(--look-h,52px)+12px)]`}
        >
          {overView}
        </p>
      )}

      <div ref={barRef} data-plate="" className="fixed inset-x-0 bottom-0">
        {/* No chart above it here: the bar carries the dates and the hours the lander is off. */}
        <TimeBar series={series} power={power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={onCursor} dates powered={power.powered} compact bare={wordsHidden} moments={moments} onMoment={onMoment} ifSurvivesFrom={ifSurvivesFrom} clockNote=" (Earth time)" />
      </div>
      {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
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

