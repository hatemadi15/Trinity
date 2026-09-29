import { createStore, type StoreApi } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, type MaskDoc, type Site } from '../data/loaders';
import { loadHeightmap, loadTerrainManifest, windowFileFor, type Heightmap, type TerrainManifest } from '../data/terrain';
import type { Ephemeris } from '../engine/ephemeris';
import { EngineClient } from '../engine-client';
import { normalizeLon } from '../engine/geometry';
import { bestWindowAcross, contactWindows, hourlySeries, SeriesIndex, summarize, withCommsThreshold, type ContactWindow, type Series, type Summary } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '../engine/power';
import { etToIso, utcToEt } from '../engine/time';
import { parseExploreQuery } from './query';

export const WINDOW_DAYS = [14, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];
export type SceneMode = 'globe' | 'terrain';
/** Who is looking: planners see every number, Learn mode hides three tiles and adds a guided story. */
export type Audience = 'planner' | 'learn';
/** Where planner answers come from: the model when a key is set (live), or the rehearsed transcripts (?demo=1). */
export type AiMode = 'live' | 'cached';
export const AUDIENCE_KEY = 'earthrise.audience';
/** Terrain extras: idle before init, loading until the cap lands, ready, or unavailable (no loaders or a failed fetch). */
export type TerrainState = 'idle' | 'loading' | 'ready' | 'unavailable';
export type Exaggeration = 1 | 3;
export const DEFAULT_SITE = 'shackleton_center_rim_high';
export const COMPARE_MAX = 4;
export const BEST_WINDOW_SCAN_DAYS = 365;
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
   * Scans the next year from the start date and moves the window to the best span; null when none fits.
   * Scope 'compare' scores the mean over the compared sites (falls back to the selected site when none).
   */
  findBestWindow: (days: WindowDays, scope?: 'site' | 'compare') => Promise<{ startUtc: string; summary: Summary } | null>;
  /** Resolves once a pending mast debounce and any in-flight skyline recompute have settled. */
  waitForMask: () => Promise<void>;
  /** Resolves once a pending mast debounce has fired (the recompute may still be in flight). */
  waitForDebounce: () => Promise<void>;
  audience: Audience;
  setAudience: (audience: Audience) => void;
  /** Reads the stored choice after mount so server and first client render agree. */
  hydrateAudience: () => void;
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
  const raw = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
  const series = params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw;
  return { site, series, summary: summarize(series), power: powerBudget(series, params.power), contacts: contactWindows(series), mastM };
}

function storedAudience(): Audience {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(AUDIENCE_KEY) : null;
    return v === 'learn' ? 'learn' : 'planner';
  } catch {
    return 'planner';
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createExploreStore(loaders: Loaders): StoreApi<ExploreState> {
  // Masks by site id: precomputed ones are cached after their first fetch, computed ones are
  // registered by applyMask so custom sites stay selectable without a mask file.
  const masks = new Map<string, CachedMask>();
  const windows = new Map<string, Heightmap>();
  // Sequence tokens so slow loads cannot overwrite a newer selection.
  let selectSeq = 0;
  let windowSeq = 0;
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
    capHeightmap: null,
    params: DEFAULT_PARAMS,
    power: null,
    contacts: [],
    compareIds: [],
    compare: [],
    maskBusy: false,
    bestWindowNote: null,
    audience: 'planner',
    aiMode: process.env.NEXT_PUBLIC_AI_MODE === 'cached' ? 'cached' : 'live',

    async init() {
      if (get().eph) {
        if (get().status !== 'ready') set({ status: 'ready' });
        return;
      }
      set({ status: 'loading', error: null });
      try {
        const [sites, eph] = await Promise.all([loaders.loadSites(), loaders.loadEphemeris()]);
        set({ sites, eph });
        terrainPromise = loadTerrain();
        const first = sites.find((s) => s.id === DEFAULT_SITE) ?? sites.find((s) => s.polar);
        if (!first) throw new Error('no polar site in the catalog');
        await get().selectSite(first.id);
        set({ status: 'ready' });
      } catch (err) {
        set({ status: 'error', error: message(err) });
      }
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
        let cached = masks.get(id);
        if (!cached && !site.polar) {
          // Mare sites lie outside the LOLA polar grids: a flat horizon is the honest skyline there.
          cached = { mask: new Float64Array(720), meta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM: get().params.mastM } };
          masks.set(id, cached);
        }
        if (!cached) {
          const doc = await loaders.loadMask(id);
          cached = {
            mask: Float64Array.from(doc.elevation_deg),
            meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0 },
          };
          masks.set(id, cached);
        }
        if (seq !== selectSeq) return; // a newer selection won
        const { startUtc, days, params } = get(); // re-read: the window may have changed while loading
        const { mode: currentMode, modeAuto: wasAuto } = get();
        // A mare site has no polar terrain window: show the globe, and switch back for the next polar site unless the user chose the globe.
        const mode: SceneMode = !site.polar ? 'globe' : wasAuto ? 'terrain' : currentMode;
        const modeAuto = !site.polar ? wasAuto || currentMode !== 'globe' : false;
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
          cursorHour: 0,
          error: null,
          customError: null,
          maskBusy: false,
          bestWindowNote: null,
          heightmap: windows.get(id) ?? null,
        });
        void loadWindow(id);
        if ((cached.meta.mastM ?? 2) !== params.mastM) void recomputeMask();
      } catch (err) {
        if (seq === selectSeq) set({ error: message(err), maskBusy: false });
      }
    },

    setWindow(startUtc, days) {
      const { eph, site, mask, cursorHour } = get();
      if (!eph || !site || !mask) {
        set({ startUtc, days, bestWindowNote: null });
        return;
      }
      try {
        const r = recompute(eph, site, mask, startUtc, days, get().params);
        set({ startUtc, days, series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, cursorHour: Math.min(cursorHour, days * 24 - 1), error: null, bestWindowNote: null });
        recomputeCompare();
      } catch (err) {
        set({ error: message(err) });
      }
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
          cursorHour: 0,
          error: null,
          customError: null,
          heightmap: windows.get(site.id) ?? null,
        });
        void loadWindow(site.id);
        if (get().compareIds.includes(site.id)) recomputeCompare();
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setParams(patch) {
      const params: PlannerParams = { ...get().params, ...patch };
      set({ params, bestWindowNote: null });
      const { eph, site, mask, startUtc, days, cursorHour } = get();
      if (eph && site && mask) {
        try {
          const r = recompute(eph, site, mask, startUtc, days, params);
          set({ series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, cursorHour: Math.min(cursorHour, r.series.hours - 1), error: null });
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
      if (!masks.has(id)) {
        try {
          const doc = await loaders.loadMask(id);
          masks.set(id, {
            mask: Float64Array.from(doc.elevation_deg),
            meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0, mastM: doc.mast_m },
          });
        } catch (err) {
          set({ error: message(err) });
          return;
        }
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
      const scanHours = Math.min(BEST_WINDOW_SCAN_DAYS * 24 + windowHours, available);
      if (scanHours < windowHours) {
        set({ bestWindowNote: `A ${days}-day window does not fit between this start date and the end of the ephemeris table (2036-12-31).` });
        return null;
      }
      const seriesList = targets.map((t) => {
        const raw = hourlySeries(t.site, t.mask, eph, startEt, scanHours);
        return params.minEarthElDeg > 0 ? withCommsThreshold(raw, t.mask, params.minEarthElDeg) : raw;
      });
      // A lander arrives in daylight: only starts where every scored site is sunlit are candidates
      // (all hours when no such start exists, for example a permanently shadowed site).
      const best = bestWindowAcross(
        seriesList.map((s) => new SeriesIndex(s)),
        windowHours,
        6,
        undefined,
        (h) => seriesList.every((s) => s.sunFraction[h] > 0),
      );
      const newStart = etToIso(startEt + best.start * 3600).slice(0, 13) + ':00:00';
      get().setWindow(newStart, days);
      const s = best.summary;
      const prefix = targets.length > 1 ? `across ${targets.length} compared sites: ` : '';
      set({ bestWindowNote: `${prefix}${Math.round(s.illumFraction * 100)} % sun, ${Math.round(s.earthVisFraction * 100)} % Earth, longest gap ${s.longestEarthGapH} h` });
      return { startUtc: newStart, summary: s };
    },

    async waitForMask() {
      await debouncePromise;
      await maskPromise;
    },

    async waitForDebounce() {
      await debouncePromise;
    },

    hydrateAudience() {
      const stored = storedAudience();
      if (stored !== get().audience) set({ audience: stored });
    },

    async applyQuery(search) {
      const q = parseExploreQuery(search);
      if (q.startUtc || q.days) get().setWindow(q.startUtc ?? get().startUtc, q.days ?? get().days);
      if (q.site && q.site !== get().siteId && get().sites.some((s) => s.id === q.site)) await get().selectSite(q.site);
    },

    setAiMode(mode) {
      set({ aiMode: mode });
    },

    setAudience(audience) {
      set({ audience });
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(AUDIENCE_KEY, audience);
      } catch {
        // storage may be unavailable (private mode); the choice still applies to this page
      }
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
      if (store.getState().siteId === siteId) store.setState({ heightmap: null, windowLoading: false });
      return;
    }
    const seq = ++windowSeq;
    let hm = windows.get(siteId);
    if (hm) {
      // A cached window supersedes any fetch still in flight for an earlier selection.
      if (store.getState().windowLoading) store.setState({ windowLoading: false });
    } else {
      store.setState({ windowLoading: true });
      try {
        hm = await loaders.loadHeightmap(entry.file, entry.meta);
        windows.set(siteId, hm);
      } catch {
        if (seq === windowSeq) store.setState({ windowLoading: false });
        return;
      }
      if (seq === windowSeq) store.setState({ windowLoading: false });
    }
    if (seq === windowSeq && store.getState().siteId === siteId) store.setState({ heightmap: hm });
  }

  return store;
}

let engineClient: EngineClient | null = null;

const browserLoaders: Loaders = {
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
