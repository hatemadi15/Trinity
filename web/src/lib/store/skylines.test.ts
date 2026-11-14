import { describe, expect, it } from 'vitest';
import { fileLoaders, sites } from '../../test/file-loaders';
import { findingsWith, LOST_TILE } from '../../test/terrain';
import { createExploreStore, FEATURED_MAST_M, skylineKey, type ExploreState, type Loaders } from './explore';

const findings = findingsWith;

/**
 * A worker that takes `delay(lat, mastM)` milliseconds and draws a skyline whose height says the mast it was made for
 * (one degree per metre), so a test can tell from any figure which height it came from.
 */
function slowWorker(delay: (lat: number, mastM: number) => number = () => 5) {
  const calls: { lat: number; lon: number; mastM: number }[] = [];
  const computeMask: NonNullable<Loaders['computeMask']> = async (lat, lon, mastM) => {
    calls.push({ lat, lon, mastM });
    await new Promise((r) => setTimeout(r, delay(lat, mastM)));
    return { mask: new Float64Array(720).fill(mastM), siteHeightM: 100, failedTiles: 0, terrain: findings() };
  };
  return { calls, computeMask };
}

const polarCatalogue = sites.filter((s) => s.polar && s.category !== 'custom');
const settle = async (store: ReturnType<typeof createExploreStore>) => {
  await store.getState().waitForMask();
  for (let i = 0; i < 400 && (store.getState().overviewBusy || store.getState().pendingSkylines.length > 0); i++) await new Promise((r) => setTimeout(r, 10));
};

/** The rule every state must keep: a result shown as using the chosen settings uses them, or says it is waiting. */
function honest(s: ExploreState): string | null {
  const m = s.params.mastM;
  for (const r of s.compare) if (r.mastM !== m) return `compare ${r.site.id} at ${r.mastM} m while ${m} m is chosen`;
  for (const [id, o] of Object.entries(s.overview)) if (o.mastM !== m) return `overview ${id} at ${o.mastM} m while ${m} m is chosen`;
  if (s.site && s.maskMeta && s.maskMeta.source !== 'flat') {
    const shown = s.maskMeta.mastM ?? FEATURED_MAST_M;
    if (shown !== m && !s.pendingSkylines.includes(s.site.id) && !s.skylineProblems[s.site.id]) return `the selected ${s.site.id} shows ${shown} m while ${m} m is chosen, with nothing pending`;
  }
  return null;
}

describe('skylines are kept and worked out by everything that changes them', () => {
  it('keys a skyline by the place, the mast height and the terrain source; a flat horizon by its place alone', () => {
    const rim = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
    const mare = sites.find((s) => !s.polar)!;
    expect(skylineKey(rim, 2, 'tiles@/data')).toBe('featured|de_gerlache_rim_2|2');
    expect(skylineKey(rim, 5, 'tiles@/data')).toBe('tiles@/data|-88.280000|-64.310000|5');
    expect(skylineKey(rim, 5, 'tiles@https://cdn.example/data')).not.toBe(skylineKey(rim, 5, 'tiles@/data'));
    expect(skylineKey({ ...rim, id: 'custom_x', category: 'custom' }, 2, 'tiles@/data')).toBe('tiles@/data|-88.280000|-64.310000|2');
    expect(skylineKey(mare, 2, 'tiles@/data')).toBe(skylineKey(mare, 7, 'tiles@/data'));
  });

  it('works out every shown result again at a new mast height: the selected site, the compared ones and the site list', async () => {
    const worker = slowWorker();
    const store = createExploreStore(fileLoaders({ computeMask: worker.computeMask }));
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center_rim_high');
    await store.getState().addToCompare('blue_ghost_m1');
    await store.getState().loadOverview();
    expect(worker.calls).toEqual([]); // at 2 m the featured files serve every polar site
    store.getState().setParams({ mastM: 5 });
    void store.getState().loadOverview(); // as Explore and the site list do when the lander changes
    await settle(store);
    const s = store.getState();
    expect(s.maskMeta?.mastM).toBe(5);
    expect(s.mask![0]).toBe(5);
    expect(s.compare.map((r) => [r.site.id, r.mastM])).toEqual([
      ['shackleton_center_rim_high', 5],
      ['blue_ghost_m1', 5],
    ]);
    expect(s.compare[0].series.sunEl.length).toBe(30 * 24);
    expect(Object.keys(s.overview)).toHaveLength(19);
    for (const o of Object.values(s.overview)) expect(o.mastM).toBe(5);
    // One computation per polar catalogue site at 5 m, the selected and compared ones among them; none for the mare site.
    expect(worker.calls.every((c) => c.mastM === 5)).toBe(true);
    expect(new Set(worker.calls.map((c) => `${c.lat},${c.lon}`)).size).toBe(polarCatalogue.length);
    expect(worker.calls).toHaveLength(polarCatalogue.length);
    // Back at 2 m the featured files serve again, with nothing more to work out.
    store.getState().setParams({ mastM: 2 });
    void store.getState().loadOverview();
    await settle(store);
    expect(worker.calls).toHaveLength(polarCatalogue.length);
    expect(store.getState().compare.map((r) => r.mastM)).toEqual([2, 2]);
    expect(store.getState().maskMeta?.source).toBe('featured');
  });

  it('says which sites wait for a skyline at the new height, from the first click, and shows no compared figure until its own lands', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const store = createExploreStore(
      fileLoaders({
        computeMask: async (_lat, _lon, mastM) => {
          await gate;
          return { mask: new Float64Array(720).fill(mastM), siteHeightM: 100, failedTiles: 0, terrain: findings() };
        },
      }),
    );
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center_rim_high');
    await store.getState().addToCompare('malapert_massif');
    store.getState().setParams({ mastM: 5 });
    // At once, before the clicks have settled: the selected site and both compared ones wait for 5 m.
    expect(store.getState().pendingSkylines).toEqual(['de_gerlache_rim_2', 'shackleton_center_rim_high', 'malapert_massif']);
    expect(store.getState().compare).toEqual([]);
    expect(store.getState().compareIds).toHaveLength(2);
    // The selected site keeps its 2 m figures, said to be at 2 m, while 5 m is worked out.
    expect(store.getState().maskMeta?.mastM).toBe(2);
    await store.getState().waitForDebounce();
    expect(store.getState().maskBusy).toBe(true);
    open();
    await settle(store);
    expect(store.getState().pendingSkylines).toEqual([]);
    expect(store.getState().maskBusy).toBe(false);
    expect(store.getState().compare.map((r) => r.mastM)).toEqual([5, 5]);
  });

  it('never shows a result from older settings through rapid mast edits, site changes and compare edits, with a slow worker', async () => {
    // Slow at 5 m and at the far-south sites, quick elsewhere, so computations land out of order.
    const worker = slowWorker((lat, mastM) => (mastM === 5 ? 60 : 5) + (lat < -89 ? 25 : 0));
    const store = createExploreStore(fileLoaders({ computeMask: worker.computeMask }));
    await store.getState().init();
    const broken: string[] = [];
    store.subscribe((s) => {
      const why = honest(s);
      if (why) broken.push(why);
    });
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await store.getState().addToCompare('shackleton_center_rim_high');
    void store.getState().loadOverview();
    store.getState().setParams({ mastM: 5 });
    void store.getState().loadOverview();
    await store.getState().waitForDebounce();
    await pause(20); // 5 m computations are under way
    store.getState().setParams({ mastM: 3 });
    void store.getState().loadOverview();
    void store.getState().selectSite('south_pole');
    await pause(100);
    store.getState().setParams({ mastM: 7 });
    void store.getState().addToCompare('nobile_rim_1');
    void store.getState().selectSite('malapert_massif');
    void store.getState().loadOverview();
    await pause(30);
    store.getState().removeFromCompare('shackleton_center_rim_high');
    store.getState().setParams({ mastM: 4 });
    void store.getState().loadOverview();
    await settle(store);
    expect(broken).toEqual([]);
    const s = store.getState();
    expect(s.siteId).toBe('malapert_massif');
    expect(s.maskMeta?.mastM).toBe(4);
    expect(s.mask![0]).toBe(4);
    expect(s.compare.map((r) => [r.site.id, r.mastM, r.series.sunEl.length])).toEqual([['nobile_rim_1', 4, 720]]);
    for (const o of Object.values(s.overview)) expect(o.mastM).toBe(4);
    expect(s.pendingSkylines).toEqual([]);
    // Work for heights nobody wanted any more was dropped before its turn: far fewer runs than sites times heights.
    expect(worker.calls.length).toBeLessThan(polarCatalogue.length * 3);
  });

  it('says why a skyline at the chosen height could not be had, and keeps the selected site’s figures at their own height', async () => {
    const store = createExploreStore(
      fileLoaders({
        computeMask: async () => {
          throw new Error('could not load /data/tiles/manifest.json (HTTP 404)');
        },
      }),
    );
    await store.getState().init();
    store.getState().setParams({ mastM: 6 });
    await store.getState().waitForMask();
    await new Promise((r) => setTimeout(r, 10));
    const s = store.getState();
    expect(s.skylineProblems.de_gerlache_rim_2).toBe('could not load /data/tiles/manifest.json (HTTP 404)');
    expect(s.maskMeta?.mastM).toBe(2);
    expect(s.pendingSkylines).toEqual([]);
    expect(s.maskBusy).toBe(false);
    // The pick of a custom site is not what failed: nothing says that place cannot be worked out.
    expect(s.customError).toBeNull();
    // Another height starts over.
    store.getState().setParams({ mastM: 2 });
    expect(store.getState().skylineProblems).toEqual({});
  });

  it('finds no best date from an incomplete skyline, and says why', async () => {
    const store = createExploreStore(
      fileLoaders({
        computeMask: async () => ({ mask: new Float64Array(720).fill(0), siteHeightM: 100, failedTiles: 1, terrain: findings(LOST_TILE) }),
      }),
    );
    await store.getState().init();
    store.getState().setParams({ mastM: 5 });
    await expect(store.getState().findBestWindow(30)).resolves.toBeNull();
    expect(store.getState().startUtc).toBe('2027-01-01T00:00:00');
    expect(store.getState().bestWindowNote).toBe('No best date is named: the terrain at de Gerlache Rim 2 is incomplete, so its figures may be too high.');
    expect(store.getState().maskMeta?.terrain?.quality).toBe('incomplete');
  });
});
