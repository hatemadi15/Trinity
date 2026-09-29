import { create, createStore, type StoreApi } from 'zustand';
import { useStore } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, type MaskDoc, type Site } from '../data/loaders';
import type { Ephemeris } from '../engine/ephemeris';
import { hourlySeries, summarize, type Series, type Summary } from '../engine/metrics';
import { utcToEt } from '../engine/time';

export const WINDOW_DAYS = [14, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];
export const DEFAULT_SITE = 'shackleton_center_rim_high';
export const DEFAULT_START = '2027-01-01T00:00:00';

export interface Loaders {
  loadSites: () => Promise<Site[]>;
  loadEphemeris: () => Promise<Ephemeris>;
  loadMask: (siteId: string) => Promise<MaskDoc>;
}

export interface MaskMeta {
  siteHeightM: number;
  source: 'featured' | 'computed';
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
  init: () => Promise<void>;
  selectSite: (id: string) => Promise<void>;
  setWindow: (startUtc: string, days: WindowDays) => void;
  setCursor: (hour: number) => void;
  applyMask: (site: Site, mask: Float64Array, meta: MaskMeta) => void;
  setCustomError: (message: string | null) => void;
}

export function recompute(eph: Ephemeris, site: Site, mask: Float64Array, startUtc: string, days: number): { series: Series; summary: Summary } {
  const series = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
  return { series, summary: summarize(series) };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createExploreStore(loaders: Loaders): StoreApi<ExploreState> {
  return createStore<ExploreState>((set, get) => ({
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

    async init() {
      set({ status: 'loading', error: null });
      try {
        const [sites, eph] = await Promise.all([loaders.loadSites(), loaders.loadEphemeris()]);
        set({ sites, eph });
        await get().selectSite(DEFAULT_SITE);
        set({ status: 'ready' });
      } catch (err) {
        set({ status: 'error', error: message(err) });
      }
    },

    async selectSite(id) {
      const { sites, eph, startUtc, days } = get();
      const site = sites.find((s) => s.id === id);
      if (!site || !eph) {
        set({ error: `unknown site ${id}` });
        return;
      }
      try {
        const doc = await loaders.loadMask(id);
        const mask = Float64Array.from(doc.elevation_deg);
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
        set({ siteId: id, site, mask, maskMeta: { siteHeightM: doc.site_height_m, source: 'featured' }, series, summary, cursorHour: 0, error: null, customError: null });
      } catch (err) {
        set({ error: message(err) });
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
        const known = sites.some((s) => s.id === site.id) ? sites : [...sites, site];
        set({ sites: known, siteId: site.id, site, mask, maskMeta: meta, series, summary, cursorHour: 0, error: null, customError: null });
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setCustomError(customError) {
      set({ customError });
    },
  }));
}

const browserLoaders: Loaders = {
  loadSites: () => loadSites(dataBase()),
  loadEphemeris: () => loadEphemerisFromUrl(dataBase()),
  loadMask: (id) => loadMask(dataBase(), id),
};

export const exploreStore = createExploreStore(browserLoaders);

export function useExploreStore<T>(selector: (s: ExploreState) => T): T {
  return useStore(exploreStore, selector);
}

// `create` is re-exported for consumers that want a hook-bound store in tests.
export { create };
