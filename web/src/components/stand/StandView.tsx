'use client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { LanderDialog } from '@/components/explore/LanderDialog';
import { PLAY_HPS, TimeBar, type Speed } from '@/components/explore/TimeBar';
import { LunaButton } from '@/components/luna/LunaButton';
import { LunaControls } from '@/components/luna/LunaControls';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { DEMO_KEY } from '@/lib/hooks/useDemoMode';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref, standHref, withSettings } from '@/lib/links';
import { useSettingsInAddress } from '@/lib/hooks/useAddressFollows';
import { NAV } from '@/lib/nav';
import { earthLitFraction } from '@/lib/sky/earth';
import { dirAzEl } from '@/lib/sky/frames';
import { LANDER } from '@/lib/sky/landerShape';
import { eyeAt, lookUpTarget, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { COMPARE_MAX, exploreStore, periodPlan, seenFrom, terrainOf, type ExploreState } from '@/lib/store/explore';
import { openingYaw, standLander } from '@/lib/viz/standOpening';
import { answerFor } from '@/lib/viz/answer';
import { trustedAnswer } from '@/lib/viz/terrain';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { betterChip, betterLabel, requirementReason, withReason, FIRST_STEP, FIRST_STEP_PHONE, FIRST_STEP_STILL, keyMoments, landerCaption, measuredNote, momentCaption, phoneHeadline, radioNext, RESIDENT_LINE, skyCountdown, skyLabel, standHeadline, standingLine, standQuery, statusLine, viewCaption, watchNext, whyLines, type Moment } from '@/lib/viz/stand';
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
/** How it works and Accuracy, as the header names them: the way to the evidence from a view with no header (19.3). */
const EVIDENCE = NAV.filter((item) => item.href === '/learn' || item.href === '/validate');

/**
 * Whether the picture opens brighter: the visitor asked for it earlier in the visit, or `?bright=1` is in the address,
 * so that a video capture, a frame harness or a rehearsal link opens the same way each time; the tab then keeps it, as
 * if the toggle had been pressed. The address is read before storage, so blocked storage cannot lose it. False wherever
 * neither says so.
 */
function readBright(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const inAddress = new URLSearchParams(window.location.search).get('bright') === '1';
    return inAddress || window.sessionStorage.getItem(BRIGHT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the view has its resident (spec 20.2): not in demo mode, the pitch's tabs, which show the forecast (`?demo=1`,
 * kept for the tab under useDemoMode's key until `?demo=0`; that hook runs in the app frame, which this page is outside,
 * so the rule is read here as it reads it), nor with `?bright=1`, which the video's capture links carry. The address is
 * read before storage, so blocked storage, which keeps no demo mode for the tab, leaves the address to say.
 */
function readResident(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get('demo') === '1' || q.get('bright') === '1') return false;
  if (q.get('demo') === '0') return true;
  try {
    return window.sessionStorage.getItem(DEMO_KEY) !== '1';
  } catch {
    return true;
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
 * Stand on the Moon: the full-window view from the landing site for the site, period and hour of the address
 * (Explore's address plus `hour`). Over the view the answer comes first (19.1): the status plate leads with the
 * headline, then from 768 px wide the next step (17.1), the better landing day in gold (else "Compare sites") and one
 * "Change" that opens "Change site", "Change date", "Change lander" and "Compare sites" in a small plate under it (20.1),
 * and last the moment's state, the lander's power and radio for the hour, with the links to Earthrise, How it works and
 * Accuracy at its end (19.3). The state sits at the plate's foot, down by the time it describes, rather than in the time
 * bar, which is Explore's too and where its 60 to 90 characters would wrap beside the date. On a phone the plate keeps
 * two lines, the headline's short form and More.
 * More opens today's card: on a phone the state first, then where you stand, the headline (the page's heading at all
 * times, with how long the night lasts), what to watch next, the better landing day, "Why this happens" (where the
 * site lies, why the light and the sky look as they do, the pole first, the radio story and how we know, one reason at
 * a time or all as one list), the ways on and the links, and the help on dragging; what to watch and the help wait
 * until the first step has gone, as they say what it says (20.1). From 768 px the card leaves the state, the headline,
 * the better day, the ways on and the links to the plate. One row of buttons faces the Sun, Earth or the lander, looks
 * up, shows the paths and hides the words; on a phone it sits above the time bar, and "Hide the words" waits in the
 * card. A key moment, chosen from its flag or passed as the time moves on, gets a line over the view on why; on
 * arrival that line gives the first step, Play and the drag (19.2), until the visitor turns the view, plays the month
 * or takes a moment. The moments stay as dots when the words are hidden. A lander stands beside the site for scale,
 * placed by the hour the view opens on. Without WebGL 2 it shows the horizon chart with the same words.
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
  // The first step (19.2), on that line from the arrival once the ground has drawn: it goes for the visit at the first
  // turn by hand, Play, a flag, Turn to or Look up, or a key moment's line, and never on the captions' timer. Set to
  // false again it changes nothing (React keeps a state set to what it is), so StandCanvas may call it on every turn.
  const [hint, setHint] = useState(true);
  const clearHint = useCallback(() => setHint(false), []);
  // Play's speed (21.1), which the view's glide between Play's steps follows.
  const [speed, setSpeed] = useState<Speed>(1);
  // Play follows the story (21.1): from a press of Play until the visitor turns the view by hand, or with Turn to or
  // Look up, each moment Play holds on turns the view to what it is about, as the moment's dot does.
  const followRef = useRef(false);
  const onPlay = useCallback(() => {
    clearHint();
    followRef.current = true;
  }, [clearHint]);
  const onHand = useCallback(() => {
    clearHint();
    followRef.current = false;
  }, [clearHint]);
  // "Why this happens": where the site lies, why the light and the sky look as they do, the radio story and how
  // we know, one reason at a time (`page`), so the card never scrolls inside itself; or all of them as one list
  // (`allReasons`), for a reader who would rather read them together.
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [allReasons, setAllReasons] = useState(false);
  // Today's card under the status plate, on every screen (16.2): the headline, what to watch, the better day, the
  // reasons and the ways on.
  const [cardOpen, setCardOpen] = useState(false);
  // "Change lander" (18.3): the forecast page's lander dialog, opened in place; the focus comes back to the button.
  const [landerOpen, setLanderOpen] = useState(false);
  // The button the focus comes back to when the dialog closes: Change from 768 px, as the list it opened from has closed
  // by then, or the one in a phone's card (the final review).
  const landerRef = useRef<HTMLButtonElement | null>(null);
  const openLander = (from: HTMLButtonElement) => {
    landerRef.current = from;
    setLanderOpen(true);
  };
  // "Brighter picture" (18.3): three times the exposure (a stop and a half, 19.4), for projectors and bright rooms, kept
  // for the visit.
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
  // The resident (20.2), unless demo mode or a capture link leaves it out.
  const [resident] = useState(readResident);

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

  // Once the address it opened with is applied, the settings in it follow a change of lander made here, and the
  // requirements with them.
  useSettingsInAddress(s.params, openHour !== null, s.requirements);
  // The period's landing times ranked with the requirements, as Explore ranks them, so the better day is Explore's.
  const times = useMemo(() => periodPlan({ series: s.series, params: s.params, requirements: s.requirements, startUtc: s.startUtc }), [s.series, s.params, s.requirements, s.startUtc]);

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
    // The eye stands at the height the skyline drawn is seen from, which lags the chosen mast while a new one is worked out.
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: seenFrom(s.maskMeta, s.params.mastM), sky, quality, lander, marks, resident };
  }, [openHour, sky, s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, s.power, quality, resident]);
  // How far below level the lander's nearest foot lies from the eye, and which way: the opening view keeps
  // it in sight while the lander is in view.
  const feet = useMemo(() => {
    if (!scene?.lander) return null;
    const l = scene.lander, a = (l.azDeg * Math.PI) / 180;
    const ground = meshHeightAt(scene.field, l.distM * Math.sin(a), -l.distM * Math.cos(a));
    const eye = eyeAt(scene);
    return { el: (Math.atan2(ground - eye, l.distM - LANDER_FOOT_M) * 180) / Math.PI, az: l.azDeg };
  }, [scene]);
  // The hour the view opened on, and whether it opens on Earth: at night with Earth up it does, narrower, so Earth (four
  // times the Sun's width) shows large: 44° high (56° on a tall screen), so Earth and the lander's feet both fit between
  // the status plate and the time bar (both readers of read D1 found the lander cut off at 36°).
  const opening = scene && openHour !== null ? Math.min(scene.series.hours - 1, Math.max(0, openHour)) : 0;
  const openOnEarth = !!scene && scene.series.sunFraction[opening] === 0 && scene.series.earthVisible[opening] === 1;
  // The opening's turn (18.4), worked out once for the scene (19.4): its walk round the skyline takes some 44,000 steps,
  // Play draws the page twelve times a second, and StandCanvas reads the turn when it mounts only.
  const startYaw = useMemo(
    () => (scene ? openingYaw(scene.series, opening, tall(), !!scene.lander, scene.mask, halfWidthDeg(openOnEarth ? (tall() ? 56 : 44) : tall() ? 80 : 60)) : 0),
    [scene, opening, openOnEarth],
  );
  const onFail = useCallback(() => setFailed('webgl'), []);
  const onReady = useCallback(() => setDrawn(true), []);
  // The resident found (20.2): its line over the view once a visit, though the view is built again for each period, and
  // the first step goes with it.
  const foundOnce = useRef(false);
  const onFound = useCallback(() => {
    if (foundOnce.current) return;
    foundOnce.current = true;
    clearHint();
    setCaption(RESIDENT_LINE);
  }, [clearHint]);
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
      if (!passed) return;
      setCaption(momentCaption(passed.kind, st.series, passed.hour, st.site.lat) || null);
      // The moment's line takes the plate from the first step, which does not come back when it goes (19.2).
      clearHint();
    },
    [store, clearHint],
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
      // The status plate's own height, which the card under it takes off the room it may fill.
      main.style.setProperty('--status-h', `${statusRef.current?.offsetHeight ?? 0}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const el of [barRef.current, lookRef.current, topRef.current, statusRef.current]) if (el) ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [s.status, wordsHidden, failed, scene, more, cardOpen]);

  // "Hide the words" and "Show the words" each take away the button pressed, so the focus goes to the one in its place:
  // "Show the words", then back to "Hide the words" in the row, or below 768 px, where the row's copy is hidden, to More.
  // A keyboard is never left on the page's body. Only after a press: the view opens with the focus where it was.
  const showRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const wordsPressed = useRef(false);
  const pressWords = (hidden: boolean) => {
    wordsPressed.current = true;
    setWordsHidden(hidden);
  };
  useEffect(() => {
    if (!wordsPressed.current) return;
    if (wordsHidden) showRef.current?.focus();
    else ((window.innerWidth >= 768 ? hideRef.current : null) ?? moreRef.current)?.focus();
  }, [wordsHidden]);

  // Loaded with no site, or with the site but no figures and a problem named, is a failure too: the site's horizon file
  // did not load, and the ground would never be built.
  if (s.status === 'error' || (s.status === 'ready' && (!s.site || (!s.series && !!s.error)))) {
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
  // No better day from an incomplete terrain, or from figures still waiting for the chosen mast, as on Explore.
  const behind = s.maskMeta !== null && s.maskMeta.source !== 'flat' && (s.maskMeta.mastM ?? 2) !== s.params.mastM;
  const answer = trustedAnswer(
    answerFor({ siteName: name, series, summary: s.summary, power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best, plan: times, farSide: s.site.far_side, panel: s.params.power.panel }),
    s.maskMeta ? terrainOf(s.maskMeta) : undefined,
    behind,
  );
  // The headline gives both verdicts the challenge asks for, power and radio contact with Earth, and how long
  // the night lasts; the site's name leads the moment's state at the plate's foot and the card's line on where you
  // stand, kept on one line ("de Gerlache Rim 2", never "Rim / 2").
  const title = standHeadline(answer.title, name, series, power, s.startUtc, answer.contactHours, answer.poweredHours);
  const oneLine = name.replace(/ /g, ' ');
  // Without NASA heights the ground is drawn flat, and the card's line on where you stand says so: at a polar site that
  // has them, flat because this copy of Earthrise lacks the terrain files ('no-terrain').
  const flat = !!scene && scene.field.levels.length === 0 && (site.polar && s.terrainState === 'unavailable' ? 'no-terrain' : true);
  // With the battery's level while it has power, as the forecast page gives it.
  const lander = statusLine(series, power, s.startUtc, hour, s.params.power.batteryWh);
  // The better landing day opens its own view, from its first hour; the button says why it is better: the power and
  // the radio from that landing, in today's card and in the next step's row alike (18.3); a phone's chip gives the
  // power alone.
  const betterOutcome = answer.better && times?.better ? times.better.outcome : null;
  // A day better for the requirements than for its power says so first: its figures alone would not say why.
  const reason = times?.better ? requirementReason(times.better, times.current) : null;
  const better =
    answer.better && betterOutcome
      ? {
          label: withReason(betterLabel(dateLong(s.startUtc, answer.better.hour), betterOutcome.poweredH, betterOutcome.poweredContactH), reason),
          chip: withReason(betterChip(dayMonth(s.startUtc, answer.better.hour), betterOutcome.poweredH), reason),
          startUtc: answer.better.startUtc,
          href: `${withSettings(standHref(site.id, answer.better.startUtc, s.days, 0), s.params, s.requirements)}${quality === 'fast' ? '&quality=fast' : ''}`,
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
    clearHint();
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
    clearHint();
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
    ...[standingLine(site, name, 'more'), ...whyLines(site.lat, series, hour, site.far_side), radio ?? contact].filter((t): t is string => !!t).map((text) => ({ text })),
    ...(note ? [{ title: 'How we know this', text: note }] : []),
  ];
  const shownPage = Math.min(page, reasons.length - 1);
  // What to watch next, in today's card: Play or Next, the time bar's two buttons at every width (21.1); with reduced
  // motion Play is off, so the line offers Next alone (20.1).
  const watch = watchNext(series, power, s.startUtc, hour, reducedMotion);
  // The first step on the line over the view, or about to be once the ground has drawn (19.2): today's card keeps its
  // line on what to watch and its help line until it has gone, as they say what it says (20.1). A view that could not
  // be drawn never shows the first step, so its card has them from the start.
  const stepShows = hint && !failed;
  // The key moments, as dots on the time bar: each, and Next, moves the time there, turns the view to what it is
  // about (the lander for its power, Earth for Earth, else the Sun) and says why.
  const moments = keyMoments(series, power, s.startUtc).map((m) => ({ label: `${m.label}, ${m.day}`, hour: m.hour, kind: m.kind }));
  const toMoment = (f: { label: string; hour: number }) => {
    const m = moments.find((x) => x.label === f.label && x.hour === f.hour);
    if (!m) return;
    if (m.kind === 'battery-out' || m.kind === 'power-back') faceLander();
    else if (m.kind === 'earth-in' || m.kind === 'earth-out') face(series.earthAz[m.hour], series.earthEl[m.hour], 16);
    else face(series.sunAz[m.hour], series.sunEl[m.hour] - 2, 46);
    setCaption(momentCaption(m.kind, series, m.hour, site.lat) || null);
  };
  // A dot or Next is a step into the view: the first step goes for the visit (19.2).
  const onMoment = (f: { label: string; hour: number }) => {
    clearHint();
    toMoment(f);
  };
  // Play holds on a moment (21.1): it turns the view there too, as long as the visitor has not turned it since Play.
  const onArrive = (f: { label: string; hour: number }) => {
    if (followRef.current) toMoment(f);
  };
  /** A turn the visitor asks for (Turn to, Look up, Look ahead): Play no longer turns the view, until it is pressed again. */
  const byHand = (turn: () => void) => () => {
    followRef.current = false;
    turn();
  };
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
    clearHint();
    setLookingUp(true);
    setCaption(null);
    const cross = scene ? lookUpTarget(scene.sky, site.lat, site.lon, Date.parse(s.startUtc + 'Z') + hour * 3600e3) : null;
    setLook({ yaw: cross ? cross.az : (series.sunAz[hour] + 180) % 360, pitch: cross ? Math.max(42, Math.min(70, cross.el - 4)) : 50, fov: 62 });
  };
  const crossNamed = !!scene && scene.sky.names?.some((n) => n.name === 'Acrux');
  // The line over the view, two lines at most: why a key moment happens, the first step until the visitor takes one
  // (19.2), why Earth sits where it does, what looking up shows, or, at night, where the light comes from: Earth's
  // (faint from a thin crescent), or, with neither the Sun nor Earth in view, none (why farther hills can still be lit
  // is left to "Why this happens").
  const overView =
    caption ??
    (hint && drawn
      ? <FirstStep reduced={reducedMotion} />
      : lookingUp
        ? viewCaption('up', crossNamed ? site.lat : Math.abs(site.lat))
        : series.sunFraction[hour] === 0
          ? series.earthVisible[hour] === 1
            ? viewCaption(earthLitFraction(dirAzEl(series.sunAz[hour], series.sunEl[hour]), dirAzEl(series.earthAz[hour], series.earthEl[hour])) < FAINT_EARTH ? 'faint' : 'earthlight', site.lat)
            : viewCaption('dark', site.lat)
          : null);

  return (
    <main ref={mainRef} className="theme-dark fixed inset-0 overflow-hidden bg-black text-[#f2f0ea]">
      {/* Luna's view (spec 22): the row's turns and switches and the better day, each as its own button does it. */}
      <LunaControls
        controls={{
          'turn-sun': byHand(() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)),
          'turn-earth': byHand(() => {
            face(series.earthAz[hour], series.earthEl[hour], 16);
            setCaption(viewCaption('earth', site.lat));
          }),
          'turn-lander': byHand(() => {
            faceLander();
            setCaption(landerCaption(site.lat, panelBackSeen));
          }),
          'look-up': byHand(lookUp),
          'look-ahead': byHand(() => face(series.sunAz[hour], 0.5, 60)),
          'paths-on': () => setGuides(true),
          'paths-off': () => setGuides(false),
          'words-off': () => pressWords(true),
          'words-on': () => pressWords(false),
          'brighter-on': () => setBright(true),
          'brighter-off': () => setBright(false),
          'better-day': () => {
            if (!better) return 'This landing day is already the best one nearby.';
            land(better.startUtc, better.href);
            return better.label;
          },
        }}
      />
      {scene && !failed && (
        <StandCanvas
          // A new period opens the view again, as a fresh visit would: from the sky, to its first hour.
          key={s.startUtc}
          scene={scene}
          hour={hour}
          look={look}
          // Turned up to 30° towards the skyline's highest point, the Sun and the lander kept in frame (18.4).
          startYaw={startYaw}
          reducedMotion={reducedMotion}
          createRenderer={createRenderer}
          sunLabel={skyLabel('sun', series, hour)}
          earthLabel={skyLabel('earth', series, hour)}
          night={series.sunFraction[hour] < 0.5}
          onFail={onFail}
          onReady={onReady}
          // The first turn by hand takes the first step (19.2).
          onExplore={onHand}
          clean={wordsHidden}
          guides={guides}
          keepInView={feet}
          // What the opening view faces stays in sight while it looks down for the lander's feet: Earth at night, else the Sun when up.
          keepSubject={openOnEarth ? series.earthEl[opening] : series.sunFraction[opening] > 0 ? series.sunEl[opening] : null}
          startFov={openOnEarth ? (tall() ? 56 : 44) : undefined}
          place={name}
          docked={!!overView}
          bright={bright}
          onFound={onFound}
          // A key moment's line or a Turn to's keeps the plate: the resident's waits until it has gone.
          lineTaken={!!caption}
          playHps={PLAY_HPS * speed}
          // Each view of a site and period opens on its landing: the first, and each better day landed on in place, which the
          // key opens again. In demo mode and with bright=1 too: it is how the view opens, as its tilt is, not a secret to keep
          // out of the pitch and the video as the resident is.
          landing
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
        <button ref={showRef} type="button" data-plate="" className={`${LOOK} fixed left-4 top-4 bg-black/75`} onClick={() => pressWords(false)}>
          Show the words
        </button>
      )}
      {!wordsHidden && (
        // Side by side from 1280 px wide; narrower, the row sits above the time bar and the status plate has the top (the
        // final review found the row over the status plate and its More from 768 px to about 1070 px).
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start gap-3 xl:flex-row xl:justify-between">
          {/* The answer first (19.1): the headline, the next step and the moment's state, with More for today's card. */}
          <section ref={topRef} aria-label="The answer for this site" className="pointer-events-none grid w-full min-w-0 justify-items-start gap-2 xl:flex-1">
            {/* The page's heading at all times, for screen readers; the plate and the card show it to the eye. */}
            <h1 className="sr-only">{title}</h1>
            <div ref={statusRef} data-plate="" className={`${PLATE} pointer-events-auto flex w-full max-w-[860px] flex-col`}>
              {/* Tighter on a phone, so the short headline's two lines leave the scene 55 % of the screen (16.5). */}
              <div className="flex items-start gap-3 px-3.5 py-1 md:px-4 md:py-1.5">
                {/* The headline as the eye reads it, first: the landing's verdict, two lines at most from 768 to 1440 px. */}
                <p aria-hidden="true" className="display min-w-0 flex-1 text-pretty py-1.5 text-[18px] font-semibold leading-snug max-md:hidden">
                  {title}
                </p>
                {/* On a phone its short form, the day, the power and the radio, in the two lines the state took, so the
                    band is as in 18.3; today's card keeps the whole headline, the night with it. */}
                <p aria-hidden="true" className="display min-w-0 flex-1 text-pretty py-1.5 text-[15px] font-semibold leading-snug md:hidden">
                  {phoneHeadline(title)}
                </p>
                <button ref={moreRef} type="button" aria-expanded={cardOpen} className="flex min-h-10 shrink-0 items-center gap-1.5 self-end whitespace-nowrap text-[15px] underline underline-offset-4" onClick={() => setCardOpen((o) => !o)}>
                  {cardOpen ? 'Less' : 'More'}
                  <span aria-hidden="true" className="no-underline">
                    {cardOpen ? '▴' : '▾'}
                  </span>
                </button>
              </div>
              {/* The next step, always in view from 768 px (17.1); on a phone it waits in today's card. Under the headline
                  and in line with it, so the better day reads beside the verdict it improves on (read D2: under More it had
                  nothing to compare against). The gold one first, then one Change for the other ways on (20.1). */}
              <div role="group" aria-label="Next step" className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-2.5 pt-0.5 max-md:hidden">
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
                <ChangeWays dateHref={withSettings(exploreHref(site.id, s.startUtc, s.days), s.params, s.requirements)} onLander={openLander} onCompare={better ? compare : undefined} />
              </div>
              {/* Last, the moment's state: the lander's power and radio for the hour, down by the time it describes at the
                  plate's foot, not in the time bar, which is Explore's too and where 60 to 90 characters beside the date would
                  wrap (19.1). A phone has it as the card's first line. */}
              <div className="flex items-start gap-3 border-t border-white/10 px-4 py-1.5 max-md:hidden">
                <i aria-hidden="true" data-tone={lander.tone} className={`mt-[7px] h-3 w-3 shrink-0 self-start rounded-full ${TONE[lander.tone]}`} />
                <p className="min-w-0 flex-1 text-balance text-[15px] leading-snug">
                  <span className="text-[#c3bfb6] max-md:hidden">{oneLine}. </span>
                  {lander.text}
                </p>
                {/* The way to the evidence at the line's end (19.3): the judge's slim header without a header, so the band
                    grows by nothing. */}
                <Sections className="ml-auto shrink-0 self-end whitespace-nowrap" />
              </div>
            </div>
            {better && !cardOpen && (
              // A phone's first screen keeps the better day in sight (18.3): one gold chip under the plate, a link to that
              // landing, 32 px tall at 14 px so the scene keeps 55 % of the screen; from 768 px the row's gold button has it,
              // and while today's card is open the card has it in full (read D3), so the chip waits. A plate itself (19.4):
              // no label of the sky sits on it, the view's room starts under it, and it grows rather than spill if it wraps.
              <a
                data-chip=""
                data-plate=""
                href={better.href}
                onClick={(e) => {
                  e.preventDefault();
                  land(better.startUtc, better.href);
                }}
                className={`${PLATE} pointer-events-auto inline-flex min-h-8 items-center gap-1 border-[#f6d48a]/55 px-2.5 text-[14px] text-[#f6d48a] md:hidden`}
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
                {/* On a phone the card opens on the moment's state with its dot (19.1); from 768 px the plate's foot has it. */}
                <p className="flex items-start gap-2.5 text-[15px] md:hidden">
                  <i aria-hidden="true" data-tone={lander.tone} className={`mt-[5px] h-3 w-3 shrink-0 rounded-full ${TONE[lander.tone]}`} />
                  <span>{lander.text}</span>
                </p>
                <p className="text-[14px] text-[#c3bfb6] md:text-[15px]">{standingLine(site, oneLine, 'top', flat)}</p>
                {/* What comes next in the sky at the hour, in Explore's time bar's words: lightly, a line of its own. */}
                <p data-countdown="" className="text-[14px] tabular-nums md:text-[15px]">
                  {skyCountdown(series, hour)}
                </p>
                {/* The whole headline on a phone, the night with it, which the plate's short form leaves out; the heading
                    above says it for screen readers. */}
                <p aria-hidden="true" className="display text-pretty text-[18px] font-bold leading-tight sm:text-[22px] md:hidden">
                  {title}
                </p>
                {/* The lead names Play and Next, the same at every width (18.2, 21.1). */}
                {!stepShows && <p className="text-[14px] text-[#f6d48a] md:text-[15px]">{watch}</p>}
                {better && (
                  // The better day, on a row of its own, so the links below never move. From 768 px the next step's
                  // row on the plate holds it, so the screen keeps one gold action (17.1).
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
                      {/* A way on, as the row's gold link from 768 px reads (19.4). */}
                      <span aria-hidden="true"> ›</span>
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
                      next step's row on the plate holds them instead. */}
                  <Link href="/sites" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Change site
                  </Link>
                  <Link href={withSettings(exploreHref(site.id, s.startUtc, s.days), s.params, s.requirements)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Change date
                  </Link>
                  <button type="button" onClick={compare} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden">
                    Compare sites
                  </button>
                  {/* On a phone the row above the time bar has no room for it: it waits here. */}
                  <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden" onClick={() => pressWords(true)}>
                    Hide the words
                  </button>
                  {/* Luna (spec 22), on a phone: her panel stands above the buttons and the time bar. */}
                  <div className="md:hidden">
                    <LunaButton
                      className={`${LOOK} ${PRESSED} flex items-center gap-2`}
                      panelClassName="fixed inset-x-4 bottom-[calc(var(--bar-h,200px)+var(--look-h,0px)+12px)] z-50 rounded-lg border border-white/20 bg-[#060607] p-4 text-left text-[15px] text-[#f2f0ea]"
                    />
                  </div>
                  {/* On a phone the next step's row is not shown: Change lander waits here (18.3). */}
                  <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden" onClick={(e) => openLander(e.currentTarget)}>
                    Change lander
                  </button>
                  {/* Three times the exposure for projectors and bright rooms (18.3, 19.4); its words never change with its state. */}
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
                {/* On a phone the way to the evidence waits here (19.3); from 768 px the plate's foot has it. */}
                <Sections className="flex-wrap gap-y-1 md:hidden" />
                {!stepShows && <p className="text-[14px] text-[#c3bfb6]">Drag to look around; pinch or scroll to zoom.</p>}
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
              <button type="button" aria-label="Face the Sun" className={LOOK} onClick={byHand(() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46))}>
                Sun
              </button>
              <button
                type="button"
                aria-label="Face Earth"
                className={LOOK}
                onClick={byHand(() => {
                  face(series.earthAz[hour], series.earthEl[hour], 16);
                  setCaption(viewCaption('earth', site.lat));
                })}
              >
                Earth
              </button>
              {scene?.lander && (
                <button
                  type="button"
                  aria-label="Face the lander"
                  className={LOOK}
                  onClick={byHand(() => {
                    faceLander();
                    setCaption(landerCaption(site.lat, panelBackSeen));
                  })}
                >
                  Lander
                </button>
              )}
              {/* The "Turn to" buttons end here: what follows is not a way to turn. */}
              <i aria-hidden="true" className="h-7 w-px shrink-0 bg-white/25" />
              {lookingUp ? (
                <button type="button" aria-label="Look ahead" className={LOOK} onClick={byHand(() => face(series.sunAz[hour], 0.5, 60))}>
                  <Short short="Ahead" long="Look ahead" />
                </button>
              ) : (
                <button type="button" aria-label="Look up" className={LOOK} onClick={byHand(lookUp)}>
                  Look up
                </button>
              )}
              {/* "Show paths" (18.2): the month's paths of the Sun and Earth with their days, the level horizon, the star names,
                  your shadow. Its words say what it does, "Hide paths" once they show, so it carries no pressed state: a
                  toggle's words must not change with its state (19.4). A phone keeps "Paths" for the row's width. */}
              <button type="button" aria-label={guides ? 'Hide paths' : 'Show paths'} className={LOOK} onClick={() => setGuides((g) => !g)}>
                <Short short="Paths" long={guides ? 'Hide paths' : 'Show paths'} />
              </button>
              {/* Its words are its name, as speech input needs (WCAG 2.5.3). */}
              <button ref={hideRef} type="button" className={`${LOOK} max-md:hidden`} onClick={() => pressWords(true)}>
                Hide the words
              </button>
              {/* Luna (spec 22): her panel opens under the row at the top right from 1280 px, above it over the bar below that. */}
              <div className="max-md:hidden">
                <LunaButton
                  className={`${LOOK} ${PRESSED} flex items-center gap-2`}
                  panelClassName="absolute right-0 z-50 w-[min(380px,calc(100vw-32px))] rounded-lg border border-white/20 bg-[#060607] p-4 text-left text-[15px] text-[#f2f0ea] xl:top-full xl:mt-2 max-xl:bottom-full max-xl:mb-2"
                />
              </div>
            </div>
          )}
        </div>
      )}
      {overView && !failed && !wordsHidden && (
        // Why a key moment happens, the first step, or what looking up shows: docked on the compass plate from 768 px, one
        // plate at the foot of the view (18.3; its foot 14 px plus the plate's 79 px, StandCanvas's STRIP_H, over the bar);
        // on a phone, which has no compass, its own plate above the buttons.
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
        <TimeBar series={series} power={power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={onCursor} onPlay={onPlay} dates powered={power.powered} compact bare={wordsHidden} moments={moments} onMoment={onMoment} ifSurvivesFrom={ifSurvivesFrom} clockNote=" (Earth time)" speed={speed} onSpeed={setSpeed} holdMs={2500} spaceToPlay onArrive={onArrive} />
      </div>
      {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
    </main>
  );
}

/**
 * The way to the evidence (19.3): the home page, How it works and Accuracy, in 14 px. From 768 px it ends the plate's
 * last line, beside the moment's state; on a phone it sits at the foot of today's card.
 */
function Sections({ className }: { className: string }) {
  return (
    <nav aria-label="Sections" className={`flex items-center gap-x-4 text-[14px] text-[#c3bfb6] ${className}`}>
      <Link href="/" className="underline underline-offset-4 hover:text-[#f2f0ea]">
        Earthrise
      </Link>
      {EVIDENCE.map((item) => (
        <Link key={item.href} href={item.href} className="underline underline-offset-4 hover:text-[#f2f0ea]">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** A way on in the list under Change: as the row's links were (17.1), and as wide as the list, so the whole line takes a press. */
const WAY = 'flex min-h-10 w-full items-center whitespace-nowrap text-[15px] underline underline-offset-4';

/**
 * The next step's other ways on from 768 px (20.1): one "Change", the judge's one menu for site, date, lander and compare
 * (18.8), in place of the row of links of 17.1, 18.3 and 19.1. It opens them in a small plate under it, in the same
 * order, by the same names and doing the same: a disclosure of links and buttons, not an ARIA menu, which would ask for
 * arrow keys and roles that four ways on do not need. Escape closes it and gives the focus back to Change, as a way
 * chosen does; a press outside it closes it, and so does the focus moving on past it, so the plate never covers what the
 * focus has gone to. With no better day the gold is Compare sites, and the list holds the other three.
 */
function ChangeWays({ dateHref, onLander, onCompare }: { dateHref: string; onLander: (from: HTMLButtonElement) => void; onCompare?: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const l = list.current, b = button.current;
    if (!open || !l || !b) return;
    // Under Change from its left edge, moved left only as far as keeps 16 px clear of the screen's right edge: from 768 px
    // a long better day can leave Change at the end of the row. Placed before the first paint, so it never jumps.
    const place = () => {
      l.style.left = `${-Math.max(0, b.getBoundingClientRect().left + l.offsetWidth - (window.innerWidth - 16))}px`;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      b.focus();
    };
    const press = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('keydown', key);
    // Caught on the way down, so a press on the view, which takes the pointer for the drag, closes it too.
    document.addEventListener('pointerdown', press, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', press, true);
    };
  }, [open]);
  // A way chosen closes the list, and the focus waits on Change rather than on a way the list has just hidden.
  const chosen = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div
      ref={wrap}
      className="relative"
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button ref={button} type="button" aria-expanded={open} aria-controls="stand-change" className="flex min-h-10 items-center gap-1.5 whitespace-nowrap text-[15px] underline underline-offset-4" onClick={() => setOpen((o) => !o)}>
        Change
        <span aria-hidden="true" className="no-underline">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {/* In the page's order, after Change; `hidden` until it opens, so a search of the page still finds the ways on. */}
      <ul ref={list} id="stand-change" data-plate="" hidden={!open} className={`${PLATE} absolute left-0 top-full z-10 mt-1 grid w-max px-4 py-1`}>
        <li>
          <Link href="/sites" className={WAY} onClick={chosen}>
            Change site
          </Link>
        </li>
        <li>
          <Link href={dateHref} className={WAY} onClick={chosen}>
            Change date
          </Link>
        </li>
        <li>
          {/* The forecast page's lander dialog, in place (18.3); it gives the focus back to Change when it closes. */}
          <button
            type="button"
            className={WAY}
            onClick={() => {
              setOpen(false);
              if (button.current) onLander(button.current);
            }}
          >
            Change lander
          </button>
        </li>
        {onCompare && (
          <li>
            <button
              type="button"
              className={WAY}
              onClick={() => {
                chosen();
                onCompare();
              }}
            >
              Compare sites
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * The first step on the line over the view (19.2): Play and the drag, short under 640 px (the line twice, one shown per
 * width, so a screen reader meets only the shown one: display: none keeps the other out), or with reduced motion the
 * drag alone, as Play is off then.
 */
function FirstStep({ reduced }: { reduced: boolean }) {
  if (reduced) return <>{FIRST_STEP_STILL}</>;
  return (
    <>
      <span className="max-sm:hidden">{FIRST_STEP}</span>
      <span className="sm:hidden">{FIRST_STEP_PHONE}</span>
    </>
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

