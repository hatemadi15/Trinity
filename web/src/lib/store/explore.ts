import { createStore, type StoreApi } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, type MaskDoc, type Site } from '../data/loaders';
import { contextFileFor, loadHeightmap, loadTerrainManifest, windowFileFor, type Heightmap, type TerrainManifest } from '../data/terrain';
import { indexForEt, type Ephemeris } from '../engine/ephemeris';
import { EngineClient } from '../engine-client';
import type { MaskResult } from '../engine/worker-handler';
import { normalizeLon } from '../engine/geometry';
import { bestLanding, bestLandingAcross, landingScores, timeWithPower, YEAR_HOURS, type Landing } from '../engine/landing';
import { contactWindows, headSeries, hourlySeries, sliceSeries, summarize, withCommsThreshold, type ContactWindow, type Series, type Summary } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '../engine/power';
import { etToIso, utcToEt } from '../engine/time';
import { dateLong, dayMonth, pct0, spanShort } from '../viz/format';
import { checkPick } from '../viz/pick';
import { computedReport, featuredReport, flatReport, unreportedReport, type TerrainFindings, type TerrainReport } from '../engine/completeness';
import { missingWords } from '../viz/terrain';
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
/** The mast height featured skylines are made for: a featured file stands for this height only. */
export const FEATURED_MAST_M = 2;

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
  /** Mast height the site's skyline is seen from (m): its own for a skyline from the tiles or a file, the chosen one for a flat horizon. */
  mastM: number;
  /** The best landing hour inside the period (hours from its start), or null when no hour is sunlit. */
  best: Landing | null;
  /** The summary of as many days from the best landing hour: what Explore shows when it opens there (the period's own summary when that hour is the start). */
  after: Summary;
  /** Where the skyline comes from, what of the terrain was found, and how far the result can be trusted. */
  terrain: TerrainReport;
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
  /** Mast height the row's skyline is seen from (m), and the terrain behind it (the store always sets both). */
  mastM?: number;
  terrain?: TerrainReport;
}
export const DEFAULT_START = '2027-01-01T00:00:00';

export interface Loaders {
  loadSites: () => Promise<Site[]>;
  loadEphemeris: () => Promise<Ephemeris>;
  loadMask: (siteId: string) => Promise<MaskDoc>;
  /** Optional: when absent the 3D terrain stays empty (globe still works). */
  loadTerrainManifest?: () => Promise<TerrainManifest>;
  loadHeightmap?: (file: string, metaFile: string) => Promise<Heightmap>;
  /** Optional: worker-backed skyline for custom sites and any mast height but the featured one. */
  computeMask?: (lat: number, lon: number, mastM: number) => Promise<ComputedSkyline>;
  /** Names the terrain the worker traces skylines through: a skyline is kept per place, mast height and terrain source. */
  terrainId?: string;
}

/** What the worker gives back for one skyline. Without `terrain`, the march's own record, the skyline is never called complete. */
export interface ComputedSkyline {
  mask: Float64Array;
  siteHeightM: number;
  /** Tiles that failed to load or were absent, as a count. */
  failedTiles: number;
  terrain?: TerrainFindings;
}

export interface MaskMeta {
  siteHeightM: number;
  /** featured: a precomputed 2 m file; computed: a worker skyline; flat: a mare site outside the polar grids (all zeros). */
  source: 'featured' | 'computed' | 'flat';
  /** Tiles that failed to load or were absent while computing (0 for precomputed masks). */
  failedTiles: number;
  /** Mast height the skyline was computed with; absent for a flat horizon, which no height changes. */
  mastM?: number;
  /** Provenance, coverage and quality of the terrain behind the skyline: the store always sets it (see terrainOf). */
  terrain?: TerrainReport;
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
  /** True while the worker computes the selected site's skyline (custom site or mast change). */
  maskBusy: boolean;
  /** Sites whose skyline at the chosen mast height is being worked out, waiting or running in the worker. */
  pendingSkylines: string[];
  /** Why a site's skyline at the chosen mast height could not be had, by site id (the engine's or the loader's message). */
  skylineProblems: Record<string, string>;
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
  mastM = FEATURED_MAST_M,
  terrain: TerrainReport = unreportedReport(mastM),
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
    terrain,
  };
}

/** Raised for a queued skyline that nobody shown needs any more: the mast height or the site moved on before its turn. */
class SkylineSuperseded extends Error {
  constructor() {
    super('superseded by newer settings');
  }
}

/**
 * The key a skyline is kept under: everything that changes it. A flat horizon is the same from any mast; a featured
 * file stands for its own site at the featured height only; anything else is traced through the tiles of
 * `terrainId` from the site's position at that mast height.
 */
export function skylineKey(site: Pick<Site, 'id' | 'lat' | 'lon' | 'polar' | 'category'>, mastM: number, terrainId: string): string {
  if (!site.polar) return `flat|${site.id}`;
  if (site.category !== 'custom' && mastM === FEATURED_MAST_M) return `featured|${site.id}|${mastM}`;
  return `${terrainId}|${site.lat.toFixed(6)}|${site.lon.toFixed(6)}|${mastM}`;
}

/** The mast height a skyline is seen from: its own, or the chosen one for a flat horizon, which no height changes. */
function heightOf(meta: MaskMeta, chosenM: number): number {
  return meta.source === 'flat' ? chosenM : (meta.mastM ?? FEATURED_MAST_M);
}

/** The height the figures shown are seen from: the skyline's own, which lags the chosen one while a new one is worked out. */
export function seenFrom(meta: MaskMeta | null, chosenM: number): number {
  return meta ? heightOf(meta, chosenM) : chosenM;
}

/**
 * The terrain report behind a mask: its own, or what its source implies when a caller gave none (a featured file is
 * complete; a computed skyline without the march's record is never called complete; a flat horizon is assumed).
 */
export function terrainOf(meta: MaskMeta): TerrainReport {
  if (meta.terrain) return meta.terrain;
  if (meta.source === 'flat') return flatReport();
  if (meta.source === 'featured') return featuredReport({ site_id: 'unknown', mast_m: meta.mastM ?? FEATURED_MAST_M, fallback_bands: [] });
  return unreportedReport(meta.mastM ?? FEATURED_MAST_M);
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
  // Skylines by skylineKey: every parameter that changes one (place, mast height, terrain source) is in its key, so a
  // skyline made for one height is never used for another. `loading` holds the fetches and computations on their way.
  const skylines = new Map<string, CachedMask>();
  const loading = new Map<string, Promise<CachedMask>>();
  const terrainId = loaders.terrainId ?? 'tiles';
  // Worker computations, one wanted at a time, the most urgent first (0: the selected site and the year search,
  // 1: the compared sites, 2: the site list). A job for a height or a site nobody shows any more is dropped before its
  // turn; one already running is let finish (its skyline is kept for later) and no longer holds up the others.
  interface Job {
    key: string;
    site: Site;
    mastM: number;
    rank: number;
    resolve: (c: CachedMask) => void;
    reject: (e: unknown) => void;
  }
  const queued = new Map<string, Job>();
  const running = new Set<Job>();
  /** Featured files on their way, so a selected site waiting for one counts as pending too. */
  const fetching = new Map<string, { site: Site; mastM: number }>();
  /** Skylines that could not be had, by key: not asked for again until the mast height changes or the site is asked for anew. */
  const failures = new Map<string, unknown>();
  let committing = false;
  let held = false; // true while mast clicks are being coalesced
  let pumpQueued = false;
  let idleWaiters: (() => void)[] = [];
  /** A custom site on its way to being selected, and the sites the year search is waiting for. */
  let selecting: Site | null = null;
  const searching = new Set<string>();
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
    pendingSkylines: [],
    skylineProblems: {},
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
      selecting = null;
      forgetFailures(site);
      try {
        // The skyline for the chosen settings when it is at hand; else the quickest stand-in, shown with its own
        // height while the right one is worked out.
        const cached = skylines.get(keyOf(site, get().params.mastM)) ?? (await standIn(site));
        if (seq !== selectSeq) return; // a newer selection won
        const { startUtc, days, params } = get(); // re-read: the window may have changed while loading
        const { mode, modeAuto } = viewFor(site, get().terrainManifest, get().mode, get().modeAuto);
        const r = recompute(eph, site, cached.mask, startUtc, days, params, heightOf(cached.meta, params.mastM), terrainOf(cached.meta));
        commit({
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
          bestWindowNote: null,
          heightmap: windows.get(id) ?? null,
          contextHeightmap: contexts.get(id) ?? null,
        });
        void loadWindow(id);
      } catch (err) {
        if (seq === selectSeq) commit({ error: message(err) });
      }
    },

    setWindow(startUtc, days) {
      // The window it already has changes nothing: dropping the overview here would cancel one on its way, with nothing to start it again.
      if (startUtc === get().startUtc && days === get().days) return;
      const { eph, site, mask, maskMeta, cursorHour, params } = get();
      if (!eph || !site || !mask || !maskMeta) {
        dropOverview();
        set({ startUtc, days, bestWindowNote: null });
        return;
      }
      let r: SiteResult;
      try {
        r = recompute(eph, site, mask, startUtc, days, params, heightOf(maskMeta, params.mastM), terrainOf(maskMeta));
      } catch (err) {
        // A refused period changes nothing: the figures, the date box and the overview (the site list, the nearby
        // line) all keep the period still shown. Only the hourly series throws a RangeError, and only for a span
        // outside the table, which a visitor reaches by choosing a late date: that one is said in plain words.
        set({ error: (err instanceof RangeError && periodRefusal(eph, startUtc, days)) || message(err) });
        return;
      }
      dropOverview();
      commit({ startUtc, days, series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, best: r.best, cursorHour: Math.min(cursorHour, days * 24 - 1), error: null, bestWindowNote: null }, { compare: true });
    },

    setCursor(hour) {
      const { series } = get();
      const max = series ? series.hours - 1 : 0;
      set({ cursorHour: Math.max(0, Math.min(max, Math.round(hour))) });
    },

    applyMask(site, mask, metaIn) {
      const { eph, startUtc, days, sites, params } = get();
      if (!eph) return;
      const meta: MaskMeta = { ...metaIn, terrain: terrainOf(metaIn) };
      try {
        const r = recompute(eph, site, mask, startUtc, days, params, heightOf(meta, params.mastM), terrainOf(meta));
        const cached = { mask, meta };
        skylines.set(keyOf(site, heightOf(meta, params.mastM)), cached);
        selectSeq++; // invalidate any in-flight selectSite
        windowSeq++; // and any in-flight window load
        selecting = null;
        const known = sites.some((s) => s.id === site.id) ? sites : [...sites, site];
        commit({
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
        }, { compare: get().compareIds.includes(site.id) });
        void loadWindow(site.id);
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setParams(patch) {
      dropOverview();
      const before = get().params;
      const params: PlannerParams = { ...before, ...patch };
      const mastChanged = params.mastM !== before.mastM;
      if (mastChanged) {
        failures.clear();
        holdForMast();
      }
      // A new mast height starts over: the problems of the old height say nothing about the new one.
      let change: Partial<ExploreState> = { params, bestWindowNote: null, ...(mastChanged ? { skylineProblems: {} } : {}) };
      const { eph, site, mask, maskMeta, startUtc, days, cursorHour } = get();
      if (eph && site && mask && maskMeta) {
        try {
          // The skyline shown keeps its own height until the one for the new height lands; the lander's figures change now.
          const r = recompute(eph, site, mask, startUtc, days, params, heightOf(maskMeta, params.mastM), terrainOf(maskMeta));
          change = { ...change, series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, best: r.best, cursorHour: Math.min(cursorHour, r.series.hours - 1), error: null };
        } catch (err) {
          change = { ...change, error: message(err) };
        }
      }
      commit(change, { compare: true });
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
      const site: Site = {
        id: `custom_${lat.toFixed(4)}_${lonN.toFixed(4)}`,
        name: `Custom site ${lat.toFixed(3)}°, ${lonN.toFixed(3)}°`,
        lat,
        lon: lonN,
        category: 'custom',
        polar: true,
        source: 'user',
      };
      selecting = site;
      forgetFailures(site);
      commit({ customError: null });
      try {
        const cached = await skylineFor(site, mastM, 0);
        if (seq !== selectSeq) return; // the user moved on while the worker was busy
        selecting = null;
        get().applyMask(site, cached.mask, cached.meta);
      } catch (err) {
        if (seq !== selectSeq) return;
        selecting = null;
        if (!(err instanceof SkylineSuperseded)) set({ customError: message(err) });
      } finally {
        updatePending();
      }
    },

    async addToCompare(id) {
      const { compareIds, sites } = get();
      if (compareIds.includes(id) || compareIds.length >= COMPARE_MAX) return;
      const site = sites.find((s) => s.id === id);
      if (!site) return;
      // The row is there at once; its figures come when its skyline for the chosen settings does.
      forgetFailures(site);
      commit({ compareIds: [...compareIds, id] }, { compare: true });
      try {
        await skylineFor(site, get().params.mastM, 1);
      } catch (err) {
        if (err instanceof SkylineSuperseded || !get().compareIds.includes(id)) return;
        // A skyline that cannot be had leaves the site out, as before, and says why.
        commit({ compareIds: get().compareIds.filter((x) => x !== id), error: message(err) }, { compare: true });
      }
    },

    removeFromCompare(id) {
      commit({ compareIds: get().compareIds.filter((x) => x !== id) }, { compare: true });
    },

    async findBestWindow(days, scope = 'site') {
      const { eph, site, startUtc, params, compareIds, sites } = get();
      if (!eph) return null;
      const compared = compareIds.flatMap((id) => sites.filter((x) => x.id === id));
      const targets = scope === 'compare' && compared.length > 0 ? compared : site ? [site] : [];
      if (targets.length === 0) return null;
      // Every target's skyline for the chosen settings, worked out first when it is not at hand.
      for (const t of targets) searching.add(t.id);
      let masks: CachedMask[];
      try {
        masks = await Promise.all(targets.map((t) => skylineFor(t, params.mastM, 0)));
      } catch (err) {
        if (!(err instanceof SkylineSuperseded)) set({ bestWindowNote: `No best date can be named: ${message(err)}.` });
        return null;
      } finally {
        for (const t of targets) searching.delete(t.id);
        schedulePump();
      }
      // Settings that moved on while the skylines were worked out: the newer request is the one to answer.
      const now = get();
      if (now.params !== params || now.startUtc !== startUtc || (scope === 'site' && now.site !== site) || now.compareIds !== compareIds) return null;
      const incomplete = targets.flatMap((t, i) => (terrainOf(masks[i].meta).quality === 'incomplete' ? [{ name: t.label ?? t.name, missing: missingWords(terrainOf(masks[i].meta)) }] : []));
      if (incomplete.length > 0) {
        // A missing step can only lower a skyline, so an incomplete one can only overstate the power: no date is named.
        const at = incomplete.map((t) => (t.missing ? `${t.name} is incomplete (${t.missing})` : `${t.name} is incomplete`)).join(' and the terrain at ');
        set({ bestWindowNote: `No best date is named: the terrain at ${at}, so ${incomplete.length > 1 ? 'their' : 'its'} figures may be too high.` });
        return null;
      }
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
      const best = bestLandingAcross(
        targets.map((t, i) => {
          const mask = masks[i].mask;
          const raw = hourlySeries(t, mask, eph, startEt, scanHours);
          return landingScores(params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw, params.power, scan);
        }),
      );
      if (!best) {
        set({ bestWindowNote: targets.length > 1 ? 'No hour in the next 12 months has sunlight at every compared site.' : 'No hour in the next 12 months has sunlight here.' });
        return null;
      }
      const newStart = etToIso(startEt + best.hour * 3600).slice(0, 13) + ':00:00';
      get().setWindow(newStart, days);
      const when = `${dayMonth(newStart, 0)} ${newStart.slice(0, 4)}`;
      const lasting = spanShort(Math.round(best.poweredHours));
      set({
        bestWindowNote:
          targets.length > 1
            ? `Across ${targets.length} compared sites: best landing in the next 12 months: ${when}, power for ${lasting} on average.`
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
      // Every skyline is asked for at once, so the pending line counts them all; the worker still takes them one at a time.
      store.setState({ overview: {}, overviewBusy: true });
      const asks = sites.filter((site) => site.category !== 'custom').map((site) => ({ site, ask: skylineFor(site, params.mastM, 2) }));
      commit({});
      for (const { site, ask } of asks) {
        try {
          const cached = await ask;
          if (seq !== overviewSeq) return;
          const r = recompute(eph, site, cached.mask, startUtc, days, params, heightOf(cached.meta, params.mastM), terrainOf(cached.meta));
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
                mastM: r.mastM,
                terrain: r.terrain,
              },
            },
          });
        } catch {
          // a skyline that cannot be had (its reason is in skylineProblems), or a period outside the table, leaves this row empty
          if (seq !== overviewSeq) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0)); // let the page paint between sites
        if (seq !== overviewSeq) return;
      }
      commit({ overviewBusy: false });
    },

    async waitForMask() {
      await debouncePromise;
      if (!busyWithWanted()) return;
      await new Promise<void>((resolve) => idleWaiters.push(resolve));
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

  const keyOf = (site: Site, mastM: number) => skylineKey(site, mastM, terrainId);

  /**
   * The skyline of a site seen from `mastM`: from the cache, flat for a mare site, the featured file at the featured
   * height, or worked out in the worker. Asking again for one on its way joins it (and makes it as urgent as the
   * most urgent asker). Rejects with SkylineSuperseded when the settings move on before its turn.
   */
  function skylineFor(site: Site, mastM: number, rank: number): Promise<CachedMask> {
    const key = keyOf(site, mastM);
    const done = skylines.get(key);
    if (done) return Promise.resolve(done);
    const job = queued.get(key);
    if (job) job.rank = Math.min(job.rank, rank);
    const onWay = loading.get(key);
    if (onWay) return onWay;
    if (failures.has(key)) {
      const known = Promise.reject(failures.get(key));
      known.catch(() => {});
      return known;
    }
    if (!site.polar) {
      // Mare sites lie outside the LOLA polar grids: a flat horizon, assumed and said to be, is the skyline there.
      const flat = { mask: new Float64Array(720), meta: { siteHeightM: 0, source: 'flat' as const, failedTiles: 0, terrain: flatReport() } };
      skylines.set(key, flat);
      return Promise.resolve(flat);
    }
    let ask: Promise<CachedMask>;
    if (key.startsWith('featured|')) {
      fetching.set(key, { site, mastM });
      ask = loaders.loadMask(site.id).then(
        (doc) => {
          fetching.delete(key);
          const cached = {
            mask: Float64Array.from(doc.elevation_deg),
            meta: { siteHeightM: doc.site_height_m, source: 'featured' as const, failedTiles: 0, mastM: doc.mast_m, terrain: featuredReport(doc) },
          };
          settle(key, site, mastM, cached);
          return cached;
        },
        (err: unknown) => {
          fetching.delete(key);
          unsettle(key, site, mastM, err);
          throw err;
        },
      );
    } else if (loaders.computeMask) {
      ask = new Promise<CachedMask>((resolve, reject) => {
        queued.set(key, { key, site, mastM, rank, resolve, reject });
      });
      if (!committing) updatePending(); // a commit publishes the pending sites itself, with the rest of its change
      schedulePump();
    } else {
      ask = Promise.reject(new Error(`the skyline at ${mastM} m is worked out in the browser, which is not available here`));
      ask.catch((err: unknown) => unsettle(key, site, mastM, err));
    }
    ask.catch(() => {}); // every asker handles the outcome its own way; none must go unheard
    loading.set(key, ask);
    return ask;
  }

  /** A skyline arrived: kept under its key, and shown at once wherever it is the one for the chosen settings. */
  function settle(key: string, site: Site, mastM: number, cached: CachedMask): void {
    loading.delete(key);
    skylines.set(key, cached);
    landed(site, mastM);
  }

  /** A skyline that could not be had: its reason is noted and kept, so nothing asks for it again in a loop. */
  function unsettle(key: string, site: Site, mastM: number, err: unknown): void {
    loading.delete(key);
    if (!(err instanceof SkylineSuperseded)) failures.set(key, err);
    noteProblem(site, mastM, err);
  }

  /** An explicit ask for a site (selecting it, comparing it) tries again what failed before. */
  function forgetFailures(site: Site): void {
    failures.delete(keyOf(site, store.getState().params.mastM));
    const problems = store.getState().skylineProblems;
    if (problems[site.id]) {
      const rest = { ...problems };
      delete rest[site.id];
      store.setState({ skylineProblems: rest });
    }
  }

  /** The quickest skyline to show a site with while the one for the chosen settings is worked out. */
  function standIn(site: Site): Promise<CachedMask> {
    const mastM = store.getState().params.mastM;
    const key = keyOf(site, mastM);
    if (!key.startsWith(`${terrainId}|`)) return skylineFor(site, mastM, 0);
    // A catalogue site has its featured file; a custom site, any height it was already worked out for.
    if (site.category !== 'custom') return skylineFor(site, FEATURED_MAST_M, 0);
    const prefix = key.slice(0, key.lastIndexOf('|') + 1);
    for (const [k, c] of skylines) if (k.startsWith(prefix)) return Promise.resolve(c);
    return skylineFor(site, mastM, 0);
  }

  /** Whether anything shown in `s` still needs a job: the selected site, a compared one, the year search, or the site list. */
  function wantedIn(job: { site: Site; mastM: number }, s: ExploreState): boolean {
    if (job.mastM !== s.params.mastM) return false;
    const id = job.site.id;
    if (s.site?.id === id || selecting?.id === id || searching.has(id) || s.compareIds.includes(id)) return true;
    return overviewKey !== null && s.overviewBusy && job.site.category !== 'custom';
  }

  function busyWithWanted(): boolean {
    const s = store.getState();
    for (const j of running) if (wantedIn(j, s)) return true;
    for (const j of queued.values()) if (wantedIn(j, s)) return true;
    return held && queued.size > 0;
  }

  /** Runs the queue once the current change is committed, so it judges what is wanted by the new state. */
  function schedulePump(): void {
    if (pumpQueued) return;
    pumpQueued = true;
    queueMicrotask(() => {
      pumpQueued = false;
      pump();
    });
  }

  /** Starts the most urgent wanted job when no wanted one is running; drops the jobs nobody wants. */
  function pump(): void {
    const s = store.getState();
    for (const [key, job] of queued) {
      if (wantedIn(job, s)) continue;
      queued.delete(key);
      loading.delete(key);
      job.reject(new SkylineSuperseded());
    }
    if (!held && ![...running].some((j) => wantedIn(j, s)) && queued.size > 0 && loaders.computeMask) {
      const job = [...queued.values()].sort((a, b) => a.rank - b.rank)[0];
      queued.delete(job.key);
      running.add(job);
      loaders.computeMask(job.site.lat, job.site.lon, job.mastM).then(
        (res) => {
          running.delete(job);
          const terrain = res.terrain ? computedReport(res.terrain, job.mastM) : unreportedReport(job.mastM);
          const cached: CachedMask = { mask: res.mask, meta: { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles, mastM: job.mastM, terrain } };
          settle(job.key, job.site, job.mastM, cached);
          job.resolve(cached);
          pump();
        },
        (err: unknown) => {
          running.delete(job);
          unsettle(job.key, job.site, job.mastM, err);
          job.reject(err);
          pump();
        },
      );
    }
    updatePending();
    if (!busyWithWanted()) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** Coalesces mast clicks: jobs wait until the height has held still for MAST_DEBOUNCE_MS. */
  function holdForMast(): void {
    held = true;
    if (mastTimer) clearTimeout(mastTimer);
    let fired!: () => void;
    debouncePromise = new Promise<void>((r) => {
      fired = r;
    });
    mastTimer = setTimeout(() => {
      mastTimer = null;
      held = false;
      pump();
      fired();
    }, MAST_DEBOUNCE_MS);
  }

  /** The sites in `s` still waiting for a skyline at its chosen height, the most urgent first, and whether the selected one is among them. */
  function pendingIn(s: ExploreState): Pick<ExploreState, 'pendingSkylines' | 'maskBusy'> {
    const waiting = [...running, ...queued.values()].filter((j) => wantedIn(j, s)).sort((a, b) => a.rank - b.rank);
    const ids: string[] = [];
    for (const j of waiting) if (!ids.includes(j.site.id)) ids.push(j.site.id);
    const busy = (s.site !== null && ids.includes(s.site.id)) || (selecting !== null && ids.includes(selecting.id));
    // A featured file on its way for the selected site: quick, but the site waits for it all the same.
    for (const f of fetching.values()) if (f.site.id === s.site?.id && f.mastM === s.params.mastM && !ids.includes(f.site.id)) ids.unshift(f.site.id);
    const same = ids.length === s.pendingSkylines.length && ids.every((id, i) => s.pendingSkylines[i] === id);
    return { pendingSkylines: same ? s.pendingSkylines : ids, maskBusy: busy };
  }

  function updatePending(): void {
    const s = store.getState();
    const p = pendingIn(s);
    if (p.pendingSkylines !== s.pendingSkylines || p.maskBusy !== s.maskBusy) store.setState(p);
  }

  /**
   * Sets `change` and, in the same update, what follows from it: the selected site's skyline for the chosen settings
   * when it is at hand (asked for when it is not), the compared results when `compare` (recomputed from the skylines
   * for the chosen settings; a site still waiting is asked for and left out), and the sites still pending. One update,
   * so no state, however brief, shows a result from other settings than the ones it holds.
   */
  function commit(change: Partial<ExploreState>, opts: { compare?: boolean } = {}): void {
    committing = true;
    try {
      let next: ExploreState = { ...store.getState(), ...change };
      const patch: Partial<ExploreState> = { ...change, ...selectedIn(next) };
      next = { ...next, ...patch };
      if (opts.compare) {
        patch.compare = compareIn(next);
        next = { ...next, compare: patch.compare };
      }
      Object.assign(patch, pendingIn(next));
      store.setState(patch);
    } finally {
      committing = false;
    }
    schedulePump();
  }

  /** A skyline arrived: it changes what is shown only where it is the one for the chosen settings. */
  function landed(site: Site, mastM: number): void {
    const s = store.getState();
    if (keyOf(site, s.params.mastM) !== keyOf(site, mastM)) {
      updatePending(); // made for another height: kept for later
      return;
    }
    const change: Partial<ExploreState> = {};
    if (s.skylineProblems[site.id]) {
      const rest = { ...s.skylineProblems };
      delete rest[site.id];
      change.skylineProblems = rest;
    }
    commit(change, { compare: s.compareIds.includes(site.id) });
  }

  /** Records why a skyline for the chosen settings could not be had; work dropped for newer settings is no problem. */
  function noteProblem(site: Site, mastM: number, err: unknown): void {
    const s = store.getState();
    if (!(err instanceof SkylineSuperseded) && keyOf(site, s.params.mastM) === keyOf(site, mastM)) commit({ skylineProblems: { ...s.skylineProblems, [site.id]: message(err) } });
    else updatePending();
  }

  /** The overview belongs to one period and one lander: forget it, and stop a run still in flight. */
  function dropOverview(): void {
    overviewKey = null;
    overviewSeq++;
    const { overview, overviewBusy } = store.getState();
    if (overviewBusy || Object.keys(overview).length > 0) store.setState({ overview: {}, overviewBusy: false });
  }

  /** What shows the selected site with its skyline for the chosen settings, once that is at hand; asks for it when it is not. */
  function selectedIn(s: ExploreState): Partial<ExploreState> {
    const { eph, site, mask, params, startUtc, days, cursorHour } = s;
    if (!eph || !site || !mask) return {};
    const cached = skylines.get(keyOf(site, params.mastM));
    if (!cached) {
      if (site.polar) skylineFor(site, params.mastM, 0).catch(() => {}); // settle() shows it; noteProblem says why not
      return {};
    }
    if (cached.mask === mask) return {};
    try {
      const r = recompute(eph, site, cached.mask, startUtc, days, params, heightOf(cached.meta, params.mastM), terrainOf(cached.meta));
      return { mask: cached.mask, maskMeta: cached.meta, series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, best: r.best, cursorHour: Math.min(cursorHour, r.series.hours - 1), error: null };
    } catch (err) {
      return { error: message(err) };
    }
  }

  /** Every compared site in `s`, from its skyline for the chosen settings; a site still waiting is asked for and left out. */
  function compareIn(s: ExploreState): SiteResult[] {
    const { eph, compareIds, startUtc, days, params, sites } = s;
    if (!eph) return [];
    const compare: SiteResult[] = [];
    for (const id of compareIds) {
      const site = sites.find((x) => x.id === id);
      if (!site) continue;
      const cached = skylines.get(keyOf(site, params.mastM));
      if (!cached) {
        skylineFor(site, params.mastM, 1).catch(() => {});
        continue;
      }
      try {
        compare.push(recompute(eph, site, cached.mask, startUtc, days, params, heightOf(cached.meta, params.mastM), terrainOf(cached.meta)));
      } catch {
        // window outside the table: leave this site out until the window moves back
      }
    }
    return compare;
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

/** The worker's answer as the store keeps it: the skyline and the march's record of what it found. */
export function skylineFromWorker(r: MaskResult): ComputedSkyline {
  return {
    mask: r.mask,
    siteHeightM: r.siteHeightM,
    failedTiles: r.failedTiles.length + r.absentTiles.length,
    terrain: { coverage: r.coverage, fallbackBands: r.fallbackBands, siteGrid: r.siteGrid, plannedSiteGrid: r.bands[0]?.grid ?? r.siteGrid, terrain: r.terrain },
  };
}

const browserLoaders: Loaders = {
  loadSites: () => loadSites(dataBase()),
  loadEphemeris: () => loadEphemerisFromUrl(dataBase()),
  loadMask: (id) => loadMask(dataBase(), id),
  loadTerrainManifest: () => loadTerrainManifest(dataBase()),
  loadHeightmap: (file, metaFile) => loadHeightmap(dataBase(), file, metaFile),
  computeMask: async (lat, lon, mastM) => {
    if (typeof window === 'undefined') throw new Error('the skyline worker only runs in the browser');
    engineClient ??= new EngineClient(dataBase());
    return skylineFromWorker(await engineClient.computeMask(lat, lon, { mastM }));
  },
  // One page reads one tile set, from the data base: the skylines it works out are kept for that set.
  get terrainId() {
    return `tiles@${dataBase()}`;
  },
};

export const exploreStore = createExploreStore(browserLoaders);
