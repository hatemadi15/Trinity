import { describe, expect, it } from 'vitest';
import { eph, fileLoaders } from '../../test/file-loaders';
import { readJson } from '../engine/__tests__/helpers';
import { periodOutcome } from '../plan/outcome';
import { createExploreStore, DEFAULT_PARAMS, recompute } from './explore';

/** The worker's skyline, faked: the featured site's own mask everywhere, or a refusal where there is no elevation data. */
function worker(opts: { refuse?: (lat: number, lon: number) => boolean; failedTiles?: number } = {}) {
  const calls: [number, number, number][] = [];
  const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
  return {
    calls,
    computeMask: async (lat: number, lon: number, mastM: number) => {
      calls.push([lat, lon, mastM]);
      if (opts.refuse?.(lat, lon)) throw new Error(`no DEM coverage at ${lat.toFixed(2)}`);
      return { mask, siteHeightM: 1, failedTiles: opts.failedTiles ?? 0 };
    },
  };
}

describe('the results round an approximate site', () => {
  it('works out the same result at 8 points within the radius the catalogue states, in the worker, after the main result', async () => {
    const w = worker();
    const store = createExploreStore(fileLoaders({ computeMask: w.computeMask }));
    await store.getState().init(); // de Gerlache Rim 2: a region centre known to about ±5 km
    expect(store.getState().neighbourhood).toBeNull();
    await store.getState().loadNeighbourhood();
    const n = store.getState().neighbourhood!;
    expect(n).toMatchObject({ siteId: 'de_gerlache_rim_2', radiusKm: 5, stated: true, busy: false, mastM: 2 });
    expect(n.points).toHaveLength(8);
    expect(w.calls).toHaveLength(8);
    expect(n.ms).toBeGreaterThanOrEqual(0);
    // Each point gets the period's figures from its own place, with the skyline the worker gave it.
    const site = store.getState().site!;
    const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
    for (const p of n.points) {
      const r = recompute(eph, { ...site, lat: p.lat, lon: p.lon }, mask, '2027-01-01T00:00:00', 30, DEFAULT_PARAMS);
      expect(p.outcome).toEqual(periodOutcome(r.series, r.power));
    }
  });

  it('asks the worker once per point: a new period reuses the skylines, and the same period does nothing', async () => {
    const w = worker();
    const store = createExploreStore(fileLoaders({ computeMask: w.computeMask }));
    await store.getState().init();
    await store.getState().loadNeighbourhood();
    await store.getState().loadNeighbourhood();
    expect(w.calls).toHaveLength(8);
    const skylines = store.getState().neighbourhood!.skylineMs;
    expect(skylines).toBeGreaterThanOrEqual(0);
    store.getState().setWindow('2027-01-20T10:00:00', 30);
    await store.getState().loadNeighbourhood();
    expect(w.calls).toHaveLength(8);
    // The time the skylines took is kept with them.
    expect(store.getState().neighbourhood!.skylineMs).toBe(skylines);
    expect(store.getState().neighbourhood!.points.every((p) => p.outcome !== null)).toBe(true);
    // Another mast sees other hills: the skylines are asked for again.
    store.getState().setParams({ mastM: 3 });
    await store.getState().loadNeighbourhood();
    expect(w.calls.filter((c) => c[2] === 3)).toHaveLength(8);
  });

  it('works out no range for a surveyed site, and drops one when the site changes', async () => {
    const w = worker();
    const store = createExploreStore(fileLoaders({ computeMask: w.computeMask }));
    await store.getState().init();
    await store.getState().loadNeighbourhood();
    await store.getState().selectSite('im1_odysseus');
    await store.getState().loadNeighbourhood();
    expect(store.getState().neighbourhood).toBeNull();
    expect(w.calls).toHaveLength(8);
  });

  it('probes a derived high point at 1 km, which states no radius, and says the radius is not a stated one', async () => {
    const w = worker();
    const store = createExploreStore(fileLoaders({ computeMask: w.computeMask }));
    await store.getState().init();
    await store.getState().selectSite('de_gerlache_center_rim_high');
    await store.getState().loadNeighbourhood();
    expect(store.getState().neighbourhood).toMatchObject({ siteId: 'de_gerlache_center_rim_high', radiusKm: 1, stated: false, busy: false });
    expect(store.getState().neighbourhood!.points.map((p) => p.km)).toEqual([0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1]);
  });

  it('says plainly which points have no elevation data, and leaves them out', async () => {
    const w = worker({ refuse: (lat) => lat < -88.3 });
    const store = createExploreStore(fileLoaders({ computeMask: w.computeMask }));
    await store.getState().init();
    await store.getState().loadNeighbourhood();
    const missing = store.getState().neighbourhood!.points.filter((p) => !p.outcome);
    expect(missing.length).toBeGreaterThan(0);
    for (const p of missing) expect(p.missing).toBe('no elevation data here');
  });

  it('leaves out a point whose elevation tiles failed to load rather than trust a skyline with holes', async () => {
    const store = createExploreStore(fileLoaders({ computeMask: worker({ failedTiles: 2 }).computeMask }));
    await store.getState().init();
    await store.getState().loadNeighbourhood();
    for (const p of store.getState().neighbourhood!.points) expect(p).toMatchObject({ outcome: null, missing: 'elevation tiles that failed to load' });
  });

  it('drops a run that a newer site overtakes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const w = worker();
    const store = createExploreStore(
      fileLoaders({
        computeMask: async (lat, lon, mastM) => {
          await gate;
          return w.computeMask(lat, lon, mastM);
        },
      }),
    );
    await store.getState().init();
    const run = store.getState().loadNeighbourhood();
    expect(store.getState().neighbourhood).toMatchObject({ busy: true, points: [] });
    await store.getState().selectSite('im1_odysseus');
    await store.getState().loadNeighbourhood();
    release();
    await run;
    expect(store.getState().neighbourhood).toBeNull();
  });
});
