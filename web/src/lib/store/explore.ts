import { createStore, type StoreApi } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, siteLabel, type MaskDoc, type Site } from '../data/loaders';
import { contextFileFor, loadHeightmap, loadTerrainManifest, windowFileFor, type Heightmap, type TerrainManifest } from '../data/terrain';
import { indexForEt, type Ephemeris } from '../engine/ephemeris';
import { EngineClient } from '../engine-client';
import { normalizeLon } from '../engine/geometry';
import { bestLanding, bestLandingAcross, landingScores, timeWithPower, YEAR_HOURS, type Landing } from '../engine/landing';
import { contactWindows, headSeries, hourlySeries, sliceSeries, summarize, withCommsThreshold, type ContactWindow, type Series, type Summary } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '../engine/power';
import { etToIso, utcToEt } from '../engine/time';
import { dateLong, dayMonth, pct0, spanShort } from '../viz/format';
import { checkPick } from '../viz/pick';
import { customPoint, parseExploreQuery } from './query';

export const WINDOW_DAYS = [14, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];
export type SceneMode = 'globe' | 'terrain';
/** Who is looking: planners see every number, Learn mode hides three tiles and adds a guided story. */
/** Where planner answers come from: the model when a key is set (live), or the rehearsed transcripts (?demo=1). */
export type AiMode = 'live' | 'cached';
/** Terrain extras: idle before init, loading until the cap lands, ready, or unavailable (no loaders or a failed fetch). */
export type TerrainState = 'idle' | 'loading' | 'ready' | 'unavailable';
export type Exaggeration = 1 | 3;
export const DEFAULT_SITE = 'de_gerlache_rim_2';
export const COMPARE_MAX = 4;
/** Mast spinner clicks are coalesced for this long before the worker recomputes the skyline. */
export const MAST_DEBOUNCE_MS = 300;

export interface PlannerParams {
  power: PowerConfig;
  /** Earth counts as in view only this far above the skyline (degrees). */
  minEarthElDeg: number;
  /** Antenna/mast height used for the skyline (featured masks: 2 m). */
  mastM: number;
}
export const DEFAULT_PARAMS: PlannerParams = { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 };

/** Everything derived for one site over the current window and parameters. */
export interface SiteResult {
  site: Site;
  series: Series;
  summary: Summary;
  power: PowerResult;
  contacts: ContactWindow[];
  /** Mast height the site's skyline was computed with (m). */
  mastM: number;
  /** The best landing hour inside the period (hours from its start), or null when no hour is sunlit. */
  best: Landing | null;
  /** The summary of as many days from the best landing hour: what Explore shows when it opens there (the period's own summary when that hour is the start). */
  after: Summary;
}

/** What the site list shows for one site over the chosen period. */
export interface SiteOverview {
  sunFraction: number;
  earthFraction: number;
  /** Hours with power when the lander arrives at the period start. */
  nowHours: number;
  best: Landing | null;
  /** Sunlight and contact with Earth over as many days from the best landing hour (the period's own when there is none, or it is the start). */
  afterSun: number;
  afterEarth: number;
}
export const DEFAULT_START = '2027-01-01T00:00:00';

export interface Loaders {
  loadSites: () => Promise<Site[]>;
  loadEphemeris: () => Promise<Ephemeris>;
  loadMask: (siteId: string) => Promise<MaskDoc>;
  /** Optional: when absent the 3D terrain stays empty (globe still works). */
  loadTerrainManifest?: () => Promise<TerrainManifest>;
  loadHeightmap?: (file: string, metaFile: string) => Promise<Heightmap>;
  /** Optional: worker-backed skyline for custom sites and mast changes. */
  computeMask?: (lat: number, lon: number, mastM: number) => Promise<{ mask: Float64Array; siteHeightM: number; failedTiles: number }>;
}

export interface MaskMeta {
  siteHeightM: number;
  /** featured: precomputed 5 m mask; computed: worker skyline; flat: a mare site outside the polar grids (all zeros). */
  source: 'featured' | 'computed' | 'flat';
  /** Tiles that failed to load while computing (0 for precomputed masks). */
  failedTiles: number;
  /** Mast height the skyline was computed with; absent means the featured 2 m. */
  mastM?: number;
}

interface CachedMask {
  mask: Float64Array;
  meta: MaskMeta;
}

export interface ExploreState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  customError: string | null;
  sites: Site[];
  eph: Ephemeris | null;
  siteId: string | null;
  site: Site | null;
  mask: Float64Array | null;
  maskMeta: MaskMeta | null;
  startUtc: string;
  days: WindowDays;
  cursorHour: number;
  series: Series | null;
  summary: Summary | null;
  mode: SceneMode;
  /** True while the globe is shown only because a mare site was selected; the next polar site switches back. */
  modeAuto: boolean;
  exaggeration: Exaggeration;
  terrainState: TerrainState;
  /** True while the selected site's detailed window is being fetched (not cached yet). */
  windowLoading: boolean;
  terrainManifest: TerrainManifest | null;
  /** Detailed heightmap window for the selected site (null for custom sites or without terrain data). */
  heightmap: Heightmap | null;
  /** The 80 m grid around a 20 m window (null for an 80 m window or before it loads). */
  contextHeightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  init: () => Promise<void>;
  selectSite: (id: string) => Promise<void>;
  setWindow: (startUtc: string, days: WindowDays) => void;
  setCursor: (hour: number) => void;
  applyMask: (site: Site, mask: Float64Array, meta: MaskMeta) => void;
  setCustomError: (message: string | null) => void;
  setMode: (mode: SceneMode) => void;
  setExaggeration: (x: Exaggeration) => void;
  /** Resolves once the optional terrain manifest, cap and the current site's window have settled. */
  waitForTerrain: () => Promise<void>;
  params: PlannerParams;
  power: PowerResult | null;
  contacts: ContactWindow[];
  /** The best landing hour inside the period for the selected site. */
  best: Landing | null;
  /** One entry per catalogue site once `loadOverview` has reached it. */
  overview: Record<string, SiteOverview>;
  overviewBusy: boolean;
  /** Computes the overview site by site for the current period and lander; a no-op when it is already there. */
  loadOverview: () => Promise<void>;
  compareIds: string[];
  compare: SiteResult[];
  /** True while the worker computes a skyline (custom site or mast change). */
  maskBusy: boolean;
  bestWindowNote: string | null;
  setParams: (patch: Partial<PlannerParams>) => void;
  setPower: (patch: Partial<PowerConfig>) => void;
  /** Computes a custom site's skyline in the worker and selects it. */
  selectCustom: (lat: number, lon: number) => Promise<void>;
  addToCompare: (id: string) => Promise<void>;
  removeFromCompare: (id: string) => void;
  /**
   * Searches the next 12 months from the start date for the landing hour with the longest time with
   * power and moves the period there; null when none fits. Scope 'compare' takes the mean over the
   * compared sites (and falls back to the selected site when there are none).
   */
  findBestWindow: (days: WindowDays, scope?: 'site' | 'compare') => Promise<{ startUtc: string; poweredHours: number; earthFraction: number } | null>;
  /** Resolves once a pending mast debounce and any in-flight skyline recompute have settled. */
  waitForMask: () => Promise<void>;
  /** Resolves once a pending mast debounce has fired (the recompute may still be in flight). */
  waitForDebounce: () => Promise<void>;
  aiMode: AiMode;
  setAiMode: (mode: AiMode) => void;
  /** Applies ?site=&start=&days= from a URL once the store is ready; unknown ids and bad dates are ignored. */
  applyQuery: (search: string | URLSearchParams) => Promise<void>;
}

export function recompute(
  eph: Ephemeris,
  site: Site,
  mask: Float64Array,
  startUtc: string,
  days: number,
  params: PlannerParams = DEFAULT_PARAMS,
  mastM = 2,
): SiteResult {
  const hours = days * 24;
  const startEt = utcToEt(startUtc);
  // One pass serves the period and the landing-date search, which looks up to a period past its end
  // (less near the end of the table; a period that does not fit at all still throws below).
  const reach = Math.max(hours, Math.min(2 * hours, eph.n - indexForEt(eph, startEt)));
  const raw = hourlySeries(site, mask, eph, startEt, reach);
  const scan = params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw;
  const series = headSeries(scan, hours);
  const summary = summarize(series);
  const best = bestLanding(scan, params.power, { from: 0, to: hours, step: 1, capHours: hours });
  return {
    site,
    series,
    summary,
    power: powerBudget(series, params.power),
    contacts: contactWindows(series),
    mastM,
    best,
    after: best && best.hour > 0 ? summarize(sliceSeries(scan, best.hour, hours)) : summary,
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A date for sentences, with its year: "20 December 2036". */
const dateWithYear = (iso: string) => `${dateLong(iso, 0)} ${iso.slice(0, 4)}`;

/**
 * Why a period does not fit the Sun and Earth table, in plain words, worked out from the request and the table
 * itself; null when it fits, so a failure of another kind keeps its own message. The engine's words (rows and
 * table indices) are for developers, and a visitor reaches this simply by choosing a late date.
 */
function periodRefusal(eph: Ephemeris, startUtc: string, days: number): string | null {
  const i0 = indexForEt(eph, utcToEt(startUtc));
  const period = `A ${days}-day period from ${dateWithYear(startUtc)}`;
  if (i0 + days * 24 > eph.n) {
    return `${period} runs past ${dateWithYear(etToIso(eph.t0Et + (eph.n - 1) * eph.stepS))}, where the Sun and Earth table ends. Choose an earlier date or a shorter period.`;
  }
  if (i0 < 0) return `${period} starts before ${dateWithYear(etToIso(eph.t0Et))}, where the Sun and Earth table begins. Choose a later date.`;
  return null;
}

export function createExploreStore(loaders: Loaders): StoreApi<ExploreState> {
  // Masks by site id: precomputed ones are cached after their first fetch, computed ones are
  // registered by applyMask so custom sites stay selectable without a mask file.
  const masks = new Map<string, CachedMask>();
  const windows = new Map<string, Heightmap>();
  /** 80 m context grids by site; null records a site whose window has none. */
  const contexts = new Map<string, Heightmap | null>();
  // Sequence tokens so slow loads cannot overwrite a newer selection.
  let selectSeq = 0;
  let windowSeq = 0;
  let overviewSeq = 0;
  let overviewKey: string | null = null;
  let initPromise: Promise<void> | null = null;
  let terrainPromise: Promise<void> = Promise.resolve();
  let windowPromise: Promise<void> = Promise.resolve();
  let maskPromise: Promise<void> = Promise.resolve();
  let debouncePromise: Promise<void> = Promise.resolve();
  let mastTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<ExploreState>((set, get) => ({
    status: 'idle',
    error: null,
    customError: null,
    sites: [],
    eph: null,
    siteId: null,
    site: null,
    mask: null,
    maskMeta: null,
    startUtc: DEFAULT_START,
    days: 30,
    cursorHour: 0,
    series: null,
    summary: null,
    mode: 'terrain',
    modeAuto: false,
    exaggeration: 1,
    terrainState: 'idle',
    windowLoading: false,
    terrainManifest: null,
    heightmap: null,
    contextHeightmap: null,
    capHeightmap: null,
    params: DEFAULT_PARAMS,
    power: null,
    contacts: [],
    best: null,
    overview: {},
    overviewBusy: false,
    compareIds: [],
    compare: [],
    maskBusy: false,
    bestWindowNote: null,
    aiMode: process.env.NEXT_PUBLIC_AI_MODE === 'cached' ? 'cached' : 'live',

    init() {
      // A second call while the data loads joins that load instead of fetching every file again: React runs a page's
      // effects twice in development. The load is let go once it settles, so a call after a failure tries again.
      initPromise ??= loadAll().finally(() => {
        initPromise = null;
      });
      return initPromise;
    },

    async selectSite(id) {
      const { sites, eph } = get();
      const site = sites.find((s) => s.id === id);
      if (!site || !eph) {
        set({ error: `unknown site ${id}` });
        return;
      }
      const seq = ++selectSeq;
      try {
        const cached = await ensureMask(site);
        if (seq !== selectSeq) return; // a newer selection won
        const { startUtc, days, params } = get(); // re-read: the window may have changed while loading
        const { mode, modeAuto } = viewFor(site, get().terrainManifest, get().mode, get().modeAuto);
        const r = recompute(eph, site, cached.mask, startUtc, days, params);
        set({
          siteId: id,
          site,
          mode,
          modeAuto,
          mask: cached.mask,
          maskMeta: cached.meta,
          series: r.series,
          summary: r.summary,
          power: r.power,
          contacts: r.contacts,
          best: r.best,
          cursorHour: 0,
          error: null,
          customError: null,
          maskBusy: false,
          bestWindowNote: null,
          heightmap: windows.get(id) ?? null,
          contextHeightmap: contexts.get(id) ?? null,
        });
        void loadWindow(id);
        if ((cached.meta.mastM ?? 2) !== params.mastM) void recomputeMask();
      } catch (err) {
        if (seq === selectSeq) set({ error: message(err), maskBusy: false });
      }
    },

    setWindow(startUtc, days) {
      // The window it already has changes nothing: dropping the overview here would cancel one on its way, with nothing to start it again.
      if (startUtc === get().startUtc && days === get().days) return;
      const { eph, site, mask, cursorHour } = get();
      if (!eph || !site || !mask) {
        dropOverview();
        set({ startUtc, days, bestWindowNote: null });
        return;
      }
      let r: SiteResult;
      try {
        r = recompute(eph, site, mask, startUtc, days, get().params);
      } catch (err) {
        // A refused period changes nothing: the figures, the date box and the overview (the site list, the nearby
        // line) all keep the period still shown. Only the hourly series throws a RangeError, and only for a span
        // outside the table, which a visitor reaches by choosing a late date: that one is said in plain words.
        set({ error: (err instanceof RangeError && periodRefusal(eph, startUtc, days)) || message(err) });
        return;
      }
      dropOverview();
      set({ startUtc, days, series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, best: r.best, cursorHour: Math.min(cursorHour, days * 24 - 1), error: null, bestWindowNote: null });
      recomputeCompare();
    },

    setCursor(hour) {
      const { series } = get();
      const max = series ? series.hours - 1 : 0;
      set({ cursorHour: Math.max(0, Math.min(max, Math.round(hour))) });
    },

    applyMask(site, mask, meta) {
      const { eph, startUtc, days, sites } = get();
      if (!eph) return;
      try {
        const r = recompute(eph, site, mask, startUtc, days, get().params);
        masks.set(site.id, { mask, meta });
        selectSeq++; // invalidate any in-flight selectSite
        windowSeq++; // and any in-flight window load
        const known = sites.some((s) => s.id === site.id) ? sites : [...sites, site];
        set({
          sites: known,
          siteId: site.id,
          site,
          mask,
          maskMeta: meta,
          series: r.series,
          summary: r.summary,
          power: r.power,
          contacts: r.contacts,
          best: r.best,
          cursorHour: 0,
          error: null,
          customError: null,
          heightmap: windows.get(site.id) ?? null,
          contextHeightmap: contexts.get(site.id) ?? null,
        });
        void loadWindow(site.id);
        if (get().compareIds.includes(site.id)) recomputeCompare();
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setParams(patch) {
      dropOverview();
      const params: PlannerParams = { ...get().params, ...patch };
      set({ params, bestWindowNote: null });
      const { eph, site, mask, startUtc, days, cursorHour } = get();
      if (eph && site && mask) {
        try {
          const r = recompute(eph, site, mask, startUtc, days, params);
          set({ series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, best: r.best, cursorHour: Math.min(cursorHour, r.series.hours - 1), error: null });
        } catch (err) {
          set({ error: message(err) });
        }
      }
      recomputeCompare();
      if (patch.mastM !== undefined) scheduleMaskRecompute();
    },

    setPower(patch) {
      get().setParams({ power: { ...get().params.power, ...patch } });
    },

    async selectCustom(lat, lon) {
      if (!loaders.computeMask) {
        set({ customError: 'custom sites need the skyline worker' });
        return;
      }
      const lonN = normalizeLon(lon);
      const seq = ++selectSeq;
      const mastM = get().params.mastM;
      set({ maskBusy: true, customError: null });
      let superseded = false;
      try {
        const res = await loaders.computeMask(lat, lonN, mastM);
        superseded = seq !== selectSeq;
        if (superseded) return; // the user moved on while the worker was busy
        get().applyMask(
          {
            id: `custom_${lat.toFixed(4)}_${lonN.toFixed(4)}`,
            name: `Custom site ${lat.toFixed(3)}°, ${lonN.toFixed(3)}°`,
            lat,
            lon: lonN,
            category: 'custom',
            polar: true,
            source: 'user',
          },
          res.mask,
          { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles, mastM },
        );
      } catch (err) {
        superseded = seq !== selectSeq;
        if (!superseded) set({ customError: message(err) });
      } finally {
        if (!superseded) set({ maskBusy: false });
      }
    },

    async addToCompare(id) {
      const { compareIds, sites } = get();
      if (compareIds.includes(id) || compareIds.length >= COMPARE_MAX) return;
      const site = sites.find((s) => s.id === id);
      if (!site) return;
      try {
        await ensureMask(site);
      } catch (err) {
        set({ error: message(err) });
        return;
      }
      if (get().compareIds.includes(id) || get().compareIds.length >= COMPARE_MAX) return;
      set({ compareIds: [...get().compareIds, id] });
      recomputeCompare();
    },

    removeFromCompare(id) {
      set({ compareIds: get().compareIds.filter((x) => x !== id) });
      recomputeCompare();
    },

    async findBestWindow(days, scope = 'site') {
      const { eph, site, mask, startUtc, params, compareIds, sites } = get();
      if (!eph) return null;
      const compared = compareIds.flatMap((id) => {
        const s = sites.find((x) => x.id === id);
        const c = masks.get(id);
        return s && c ? [{ site: s, mask: c.mask }] : [];
      });
      const targets = scope === 'compare' && compared.length > 0 ? compared : site && mask ? [{ site, mask }] : [];
      if (targets.length === 0) return null;
      const windowHours = days * 24;
      const startEt = utcToEt(startUtc);
      const lastEt = eph.t0Et + (eph.n - 1) * eph.stepS;
      const available = Math.floor((lastEt - startEt) / 3600) - 3; // Catmull-Rom guard rows at the table end
      const scanHours = Math.min(YEAR_HOURS + windowHours, available);
      if (scanHours < windowHours) {
        set({ bestWindowNote: `A ${days}-day period does not fit between this start date and the end of the Sun and Earth table (2036-12-31).` });
        return null;
      }
      // Only landing hours that leave room for the whole period are candidates.
      const scan = { from: 0, to: Math.min(YEAR_HOURS, scanHours - windowHours + 1), step: 6, capHours: windowHours };
      const scores = targets.map((t) => {
        const raw = hourlySeries(t.site, t.mask, eph, startEt, scanHours);
        return landingScores(params.minEarthElDeg > 0 ? withCommsThreshold(raw, t.mask, params.minEarthElDeg) : raw, params.power, scan);
      });
      const best = bestLandingAcross(scores);
      if (!best) {
        set({ bestWindowNote: targets.length > 1 ? 'No hour in the next 12 months has sunlight at every compared site.' : 'No hour in the next 12 months has sunlight here.' });
        return null;
      }
      const newStart = etToIso(startEt + best.hour * 3600).slice(0, 13) + ':00:00';
      get().setWindow(newStart, days);
      const when = `${dayMonth(newStart, 0)} ${newStart.slice(0, 4)}`;
      const lasting = spanShort(Math.round(best.poweredHours));
      // A mean hides the site that does worst: the note gives each site's own time with power from that landing too.
      const k = scores[0].hours.indexOf(best.hour);
      const each = targets.map((t, i) => `${siteLabel(t.site)} ${scores[i].powered[k] >= windowHours ? `all ${days} days` : spanShort(scores[i].powered[k])}`).join(', ');
      set({
        bestWindowNote:
          targets.length > 1
            ? `Across ${targets.length} compared sites: best landing in the next 12 months: ${when}, power for ${lasting} on average; at each site: ${each}.`
            : `Best landing in the next 12 months: ${when}, power for ${lasting}, Earth in view ${pct0(best.earthFraction)} of that time.`,
      });
      return { startUtc: newStart, poweredHours: best.poweredHours, earthFraction: best.earthFraction };
    },

    async loadOverview() {
      const { eph, sites, startUtc, days, params } = get();
      if (!eph) return;
      const key = JSON.stringify([startUtc, days, params]);
      if (key === overviewKey) return; // already there, or on its way, for this period and lander
      overviewKey = key;
      const seq = ++overviewSeq;
      set({ overview: {}, overviewBusy: true });
      for (const site of sites) {
        if (site.category === 'custom') continue;
        try {
          const cached = await ensureMask(site);
          if (seq !== overviewSeq) return;
          const r = recompute(eph, site, cached.mask, startUtc, days, params);
          set({
            overview: {
              ...get().overview,
              [site.id]: {
                sunFraction: r.summary.illumFraction,
                earthFraction: r.summary.earthVisFraction,
                nowHours: timeWithPower(r.power),
                best: r.best,
                afterSun: r.after.illumFraction,
                afterEarth: r.after.earthVisFraction,
              },
            },
          });
        } catch {
          // a skyline that fails to load, or a period outside the table, leaves this row empty
        }
        await new Promise((resolve) => setTimeout(resolve, 0)); // let the page paint between sites
        if (seq !== overviewSeq) return;
      }
      set({ overviewBusy: false });
    },

    async waitForMask() {
      await debouncePromise;
      await maskPromise;
    },

    async waitForDebounce() {
      await debouncePromise;
    },

    async applyQuery(search) {
      const q = parseExploreQuery(search);
      if (q.startUtc || q.days) get().setWindow(q.startUtc ?? get().startUtc, q.days ?? get().days);
      if (!q.site || q.site === get().siteId) return;
      if (get().sites.some((s) => s.id === q.site)) {
        await get().selectSite(q.site);
        return;
      }
      // A clicked point is in no catalogue, so a reload or a shared link (the view from the site writes one too)
      // names it by its latitude and longitude. It opens as a click there would, through the same check, and
      // selectCustom rebuilds the same id; a point a click could not pick keeps the site already shown.
      const point = customPoint(q.site);
      const pick = point ? checkPick(point.lat, point.lon) : null;
      if (pick?.ok) await get().selectCustom(pick.lat, pick.lon);
    },

    setAiMode(mode) {
      set({ aiMode: mode });
    },


    setCustomError(customError) {
      set({ customError });
    },

    setMode(mode) {
      set({ mode, modeAuto: false });
    },

    setExaggeration(exaggeration) {
      set({ exaggeration });
    },

    async waitForTerrain() {
      await terrainPromise;
      await windowPromise;
    },
  }));

  /** The catalogue, the Sun and Earth table and the first site's figures; once loaded, only the status is set again. */
  async function loadAll(): Promise<void> {
    if (store.getState().eph) {
      if (store.getState().status !== 'ready') store.setState({ status: 'ready' });
      return;
    }
    store.setState({ status: 'loading', error: null });
    try {
      const [sites, eph] = await Promise.all([loaders.loadSites(), loaders.loadEphemeris()]);
      store.setState({ sites, eph });
      terrainPromise = loadTerrain();
      const first = sites.find((s) => s.id === DEFAULT_SITE) ?? sites.find((s) => s.polar);
      if (!first) throw new Error('no polar site in the catalog');
      await store.getState().selectSite(first.id);
      store.setState({ status: 'ready' });
    } catch (err) {
      store.setState({ status: 'error', error: message(err) });
    }
  }

  /** The skyline of a catalogue site: from the cache, flat for a mare site, or fetched once. */
  async function ensureMask(site: Site): Promise<CachedMask> {
    let cached = masks.get(site.id);
    if (cached) return cached;
    if (!site.polar) {
      // Mare sites lie outside the LOLA polar grids: a flat horizon is the honest skyline there.
      cached = { mask: new Float64Array(720), meta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM: store.getState().params.mastM } };
    } else {
      const doc = await loaders.loadMask(site.id);
      cached = { mask: Float64Array.from(doc.elevation_deg), meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0, mastM: doc.mast_m } };
    }
    masks.set(site.id, cached);
    return cached;
  }

  /** The overview belongs to one period and one lander: forget it, and stop a run still in flight. */
  function dropOverview(): void {
    overviewKey = null;
    overviewSeq++;
    const { overview, overviewBusy } = store.getState();
    if (overviewBusy || Object.keys(overview).length > 0) store.setState({ overview: {}, overviewBusy: false });
  }

  /** Recomputes every compared site for the current window and parameters from the mask cache. */
  function recomputeCompare(): void {
    const { eph, compareIds, startUtc, days, params, sites } = store.getState();
    if (!eph) return;
    const compare: SiteResult[] = [];
    for (const id of compareIds) {
      const cached = masks.get(id);
      const site = sites.find((s) => s.id === id);
      if (!cached || !site) continue;
      try {
        compare.push(recompute(eph, site, cached.mask, startUtc, days, params, cached.meta.mastM ?? 2));
      } catch {
        // window outside the table: leave this site out until the window moves back
      }
    }
    store.setState({ compare });
  }

  /** Coalesces mast changes; when the timer fires and the cached skyline's mast differs, recomputes once. */
  function scheduleMaskRecompute(): void {
    if (mastTimer) clearTimeout(mastTimer);
    let fired!: () => void;
    debouncePromise = new Promise<void>((r) => {
      fired = r;
    });
    mastTimer = setTimeout(() => {
      mastTimer = null;
      const { site, params, maskMeta } = store.getState();
      if (site && maskMeta && (maskMeta.mastM ?? 2) !== params.mastM) void recomputeMask();
      fired();
    }, MAST_DEBOUNCE_MS);
  }

  /** Recomputes the selected site's skyline with the current mast height through the worker loader. */
  function recomputeMask(): Promise<void> {
    maskPromise = recomputeMaskNow();
    return maskPromise;
  }

  async function recomputeMaskNow(): Promise<void> {
    const { site, params, maskMeta } = store.getState();
    if (!site || !loaders.computeMask) return;
    if (!site.polar) {
      // A flat horizon is flat from any mast; only the label changes.
      if (maskMeta) store.setState({ maskMeta: { ...maskMeta, mastM: params.mastM } });
      return;
    }
    const seq = ++selectSeq;
    store.setState({ maskBusy: true });
    let superseded = false;
    try {
      const res = await loaders.computeMask(site.lat, site.lon, params.mastM);
      superseded = seq !== selectSeq || store.getState().params.mastM !== params.mastM;
      if (superseded) return;
      store.getState().applyMask(site, res.mask, { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles, mastM: params.mastM });
    } catch (err) {
      superseded = seq !== selectSeq;
      if (!superseded) store.setState({ customError: message(err) });
    } finally {
      if (!superseded) store.setState({ maskBusy: false });
    }
  }

  /**
   * The view a site opens on. A site without detailed terrain (a mare site, or a polar site the terrain
   * files have no window for) opens on the globe, which then counts as switched on automatically; the
   * next site with detailed terrain goes back to the terrain unless the user chose the globe. Without a
   * manifest nothing is known about windows, and a polar site keeps the view it has.
   */
  function viewFor(site: Site, manifest: TerrainManifest | null, current: SceneMode, wasAuto: boolean): { mode: SceneMode; modeAuto: boolean } {
    const detailed = site.polar && (manifest === null || windowFileFor(manifest, site.id) !== null);
    if (!detailed) return { mode: 'globe', modeAuto: wasAuto || current !== 'globe' };
    return { mode: wasAuto ? 'terrain' : current, modeAuto: false };
  }

  /** Terrain manifest and south cap are optional extras; failures leave the 3D view without terrain. */
  async function loadTerrain(): Promise<void> {
    if (!loaders.loadTerrainManifest || !loaders.loadHeightmap) {
      store.setState({ terrainState: 'unavailable' });
      return;
    }
    store.setState({ terrainState: 'loading' });
    try {
      const manifest = await loaders.loadTerrainManifest();
      store.setState({ terrainManifest: manifest });
      // The site chosen before the manifest arrived may have no detailed window after all.
      const { site, mode, modeAuto } = store.getState();
      if (site) store.setState(viewFor(site, manifest, mode, modeAuto));
      const cap = await loaders.loadHeightmap(manifest.cap.file, manifest.cap.meta);
      store.setState({ capHeightmap: cap, terrainState: 'ready' });
      const { siteId } = store.getState();
      if (siteId) await loadWindow(siteId);
    } catch {
      store.setState({ terrainManifest: null, capHeightmap: null, terrainState: 'unavailable' });
    }
  }

  /** Loads (and caches) the detailed window for a site when the manifest lists one. */
  function loadWindow(siteId: string): Promise<void> {
    windowPromise = loadWindowNow(siteId);
    return windowPromise;
  }

  async function loadWindowNow(siteId: string): Promise<void> {
    const { terrainManifest } = store.getState();
    if (!terrainManifest || !loaders.loadHeightmap) return;
    const entry = windowFileFor(terrainManifest, siteId);
    if (!entry) {
      if (store.getState().siteId === siteId) store.setState({ heightmap: null, contextHeightmap: null, windowLoading: false });
      return;
    }
    const contextEntry = contextFileFor(terrainManifest, siteId);
    const seq = ++windowSeq;
    let hm = windows.get(siteId);
    let cm = contexts.get(siteId);
    if (hm && cm !== undefined) {
      // A cached window supersedes any fetch still in flight for an earlier selection.
      if (store.getState().windowLoading) store.setState({ windowLoading: false });
    } else {
      store.setState({ windowLoading: true });
      try {
        // The context is an extra: a failed fetch leaves the window without it.
        const [window, context] = await Promise.all([
          hm ? Promise.resolve(hm) : loaders.loadHeightmap(entry.file, entry.meta),
          contextEntry ? loaders.loadHeightmap(contextEntry.file, contextEntry.meta).catch(() => null) : Promise.resolve(null),
        ]);
        hm = window;
        cm = context;
        windows.set(siteId, hm);
        contexts.set(siteId, cm);
      } catch {
        if (seq === windowSeq) store.setState({ windowLoading: false });
        return;
      }
      if (seq === windowSeq) store.setState({ windowLoading: false });
    }
    if (seq === windowSeq && store.getState().siteId === siteId) store.setState({ heightmap: hm, contextHeightmap: cm ?? null });
  }

  return store;
}

let engineClient: EngineClient | null = null;

export const browserLoaders: Loaders = {
  loadSites: () => loadSites(dataBase()),
  loadEphemeris: () => loadEphemerisFromUrl(dataBase()),
  loadMask: (id) => loadMask(dataBase(), id),
  loadTerrainManifest: () => loadTerrainManifest(dataBase()),
  loadHeightmap: (file, metaFile) => loadHeightmap(dataBase(), file, metaFile),
  computeMask: async (lat, lon, mastM) => {
    if (typeof window === 'undefined') throw new Error('the skyline worker only runs in the browser');
    engineClient ??= new EngineClient(dataBase());
    const r = await engineClient.computeMask(lat, lon, { mastM });
    return { mask: r.mask, siteHeightM: r.siteHeightM, failedTiles: r.failedTiles.length };
  },
};

export const exploreStore = createExploreStore(browserLoaders);
