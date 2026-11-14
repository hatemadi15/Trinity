import type { Site } from '../data/loaders';
import type { Loaders, MaskMeta } from '../store/explore';

/**
 * The skyline a scenario is worked out with: its site's, traced from its own mast. Every scenario goes through
 * `MaskSource.get`, so the app's mask cache by mast height and terrain source can take this adapter's place in one line.
 * Today: a mare site has a flat horizon; a catalogue site at the precomputed file's mast height reads that file; any
 * other mast, and any clicked point, is traced in the browser's skyline worker.
 */
export interface MaskSource {
  get: (site: Site, mastM: number) => Promise<{ mask: Float64Array; meta: MaskMeta }>;
}

export type MaskLoaders = Pick<Loaders, 'loadMask' | 'computeMask'>;

export function createMaskSource(loaders: MaskLoaders): MaskSource {
  const cache = new Map<string, Promise<{ mask: Float64Array; meta: MaskMeta }>>();

  async function load(site: Site, mastM: number): Promise<{ mask: Float64Array; meta: MaskMeta }> {
    // Mare sites lie outside the LOLA polar grids: a flat horizon is the honest skyline there, from any mast.
    if (!site.polar) return { mask: new Float64Array(720), meta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM } };
    if (site.category !== 'custom') {
      const doc = await loaders.loadMask(site.id);
      if ((doc.mast_m ?? 2) === mastM) return { mask: Float64Array.from(doc.elevation_deg), meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0, mastM } };
    }
    if (!loaders.computeMask) throw new Error(`The skyline from a ${mastM} m mast is traced in the browser, which is not available here.`);
    const r = await loaders.computeMask(site.lat, site.lon, mastM);
    return { mask: r.mask, meta: { siteHeightM: r.siteHeightM, source: 'computed', failedTiles: r.failedTiles, mastM } };
  }

  return {
    get(site, mastM) {
      const key = `${site.id}@${mastM}`;
      let p = cache.get(key);
      if (!p) {
        p = load(site, mastM);
        cache.set(key, p);
        // A failed load is tried again next time rather than remembered.
        p.catch(() => cache.delete(key));
      }
      return p;
    },
  };
}
