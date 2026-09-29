import { createStore, type StoreApi } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, type MaskDoc, type Site } from '../data/loaders';
import { loadHeightmap, loadTerrainManifest, windowFileFor, type Heightmap, type TerrainManifest } from '../data/terrain';
import type { Ephemeris } from '../engine/ephemeris';
import { hourlySeries, summarize, type Series, type Summary } from '../engine/metrics';
import { utcToEt } from '../engine/time';

export const WINDOW_DAYS = [14, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];
export type SceneMode = 'globe' | 'terrain';
/** Terrain extras: idle before init, loading until the cap lands, ready, or unavailable (no loaders or a failed fetch). */
export type TerrainState = 'idle' | 'loading' | 'ready' | 'unavailable';
export type Exaggeration = 1 | 3;
export const DEFAULT_SITE = 'shackleton_center_rim_high';
export const DEFAULT_START = '2027-01-01T00:00:00';

export interface Loaders {
  loadSites: () => Promise<Site[]>;
  loadEphemeris: () => Promise<Ephemeris>;
  loadMask: (siteId: string) => Promise<MaskDoc>;
  /** Optional: when absent the 3D terrain stays empty (globe still works). */
  loadTerrainManifest?: () => Promise<TerrainManifest>;
  loadHeightmap?: (file: string, metaFile: string) => Promise<Heightmap>;
}

export interface MaskMeta {
  siteHeightM: number;
  source: 'featured' | 'computed';
  /** Tiles that failed to load while computing (0 for precomputed masks). */
  failedTiles: number;
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
}

export function recompute(
  eph: Ephemeris,
  site: Site,
  mask: Float64Array,
  startUtc: string,
  days: number,
): { series: Series; summary: Summary } {
  const series = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
  return { series, summary: summarize(series) };
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
    exaggeration: 1,
    terrainState: 'idle',
    windowLoading: false,
    terrainManifest: null,
    heightmap: null,
    capHeightmap: null,

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
        if (!cached) {
          const doc = await loaders.loadMask(id);
          cached = {
            mask: Float64Array.from(doc.elevation_deg),
            meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0 },
          };
          masks.set(id, cached);
        }
        if (seq !== selectSeq) return; // a newer selection won
        const { startUtc, days } = get(); // re-read: the window may have changed while loading
        const { series, summary } = recompute(eph, site, cached.mask, startUtc, days);
        set({
          siteId: id,
          site,
          mask: cached.mask,
          maskMeta: cached.meta,
          series,
          summary,
          cursorHour: 0,
          error: null,
          customError: null,
          heightmap: windows.get(id) ?? null,
        });
        void loadWindow(id);
      } catch (err) {
        if (seq === selectSeq) set({ error: message(err) });
      }
    },

    setWindow(startUtc, days) {
      const { eph, site, mask, cursorHour } = get();
      if (!eph || !site || !mask) {
        set({ startUtc, days });
        return;
      }
      try {
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
        set({ startUtc, days, series, summary, cursorHour: Math.min(cursorHour, days * 24 - 1), error: null });
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
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
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
          series,
          summary,
          cursorHour: 0,
          error: null,
          customError: null,
          heightmap: windows.get(site.id) ?? null,
        });
        void loadWindow(site.id);
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setCustomError(customError) {
      set({ customError });
    },

    setMode(mode) {
      set({ mode });
    },

    setExaggeration(exaggeration) {
      set({ exaggeration });
    },

    async waitForTerrain() {
      await terrainPromise;
      await windowPromise;
    },
  }));

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
      if (store.getState().siteId === siteId) store.setState({ heightmap: null });
      return;
    }
    const seq = ++windowSeq;
    let hm = windows.get(siteId);
    if (!hm) {
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

const browserLoaders: Loaders = {
  loadSites: () => loadSites(dataBase()),
  loadEphemeris: () => loadEphemerisFromUrl(dataBase()),
  loadMask: (id) => loadMask(dataBase(), id),
  loadTerrainManifest: () => loadTerrainManifest(dataBase()),
  loadHeightmap: (file, metaFile) => loadHeightmap(dataBase(), file, metaFile),
};

export const exploreStore = createExploreStore(browserLoaders);
