import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { createScenarioStore } from './scenarios';

async function stores(overrides: Parameters<typeof fileLoaders>[0] = {}) {
  const loaders = fileLoaders(overrides);
  const explore = createExploreStore(loaders);
  await explore.getState().init();
  const store = createScenarioStore(explore, loaders);
  return { explore, store };
}

const outcome = (store: Awaited<ReturnType<typeof stores>>['store'], id: string) => store.getState().runs[id]?.outcome;

describe('the scenario store', () => {
  it('makes Explore’s settings the baseline and works out its figures with its own settings', async () => {
    const { explore, store } = await stores();
    const id = store.getState().startFrom(explore.getState())!;
    await store.getState().settle();
    const s = store.getState().scenarios;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id, label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, mastM: 2, minEarthElDeg: 0, timing: 'set' });
    expect(outcome(store, id)?.poweredH).toBe(76);
    expect(store.getState().runs[id].mask?.source).toBe('featured');
  });

  it('slips a scenario by five days into a second one at the same site, worked out on its own', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    const b = store.getState().slip(a, 5 * 24)!;
    await store.getState().settle();
    expect(store.getState().scenarios.map((s) => [s.label, s.startUtc, s.from])).toEqual([
      ['Original landing', '2027-01-01T00:00:00', undefined],
      ['5 days later', '2027-01-06T00:00:00', a],
    ]);
    expect(outcome(store, a)?.poweredH).toBe(76);
    expect(outcome(store, b)?.poweredH).toBe(10);
    // Explore keeps its own settings: a comparison never moves the forecast's period.
    expect(explore.getState().startUtc).toBe('2027-01-01T00:00:00');
  });

  it('finds a nearby alternative for a scenario’s own settings and adds it as a new scenario made from it', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    const b = store.getState().slip(a, 5 * 24)!;
    await store.getState().settle();
    const c = await store.getState().findNearby(b);
    await store.getState().settle();
    const s = store.getState().scenarios.find((x) => x.id === c)!;
    expect(s).toMatchObject({ siteId: 'de_gerlache_center_rim_high', startUtc: '2027-01-06T00:00:00', label: 'Nearby: de Gerlache rim summit', from: b });
    expect(outcome(store, c!)?.poweredH).toBe(720);
    expect(store.getState().searching).toBeNull();
  });

  it('ranks the nearby alternative by the priorities chosen on Explore, and says so', async () => {
    const { explore, store } = await stores();
    explore.getState().setRankBy({ kind: 'weighed', priorities: { power: 1, contact: 5, gap: 1 } });
    const a = store.getState().startFrom(explore.getState())!;
    const b = store.getState().slip(a, 5 * 24)!;
    await store.getState().settle();
    const c = await store.getState().findNearby(b);
    expect(c).not.toBeNull();
    expect(store.getState().note).toBe('The nearby alternative is ranked by your requirements, then your priorities (power 1, Earth in view 5, shorter gaps 1), as set under Explore’s Options.');
    // Ranked the default way there is nothing to add.
    explore.getState().setRankBy({ kind: 'power' });
    await store.getState().findNearby(b);
    expect(store.getState().note).toBeNull();
  });

  it('says so when no nearby site works better, and adds nothing', async () => {
    const { explore, store } = await stores();
    explore.getState().setWindow('2027-01-06T00:00:00', 30);
    await explore.getState().selectSite('de_gerlache_center_rim_high');
    const a = store.getState().startFrom(explore.getState())!;
    await store.getState().settle();
    expect(await store.getState().findNearby(a)).toBeNull();
    expect(store.getState().scenarios).toHaveLength(1);
    expect(store.getState().note).toBe('No catalogue site within 30 km works better than “Original landing” with its settings.');
  });

  it('traces each scenario’s skyline from its own mast', async () => {
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 190, failedTiles: 0 }));
    const { explore, store } = await stores({ computeMask });
    const a = store.getState().startFrom(explore.getState())!;
    const b = store.getState().duplicate(a)!;
    store.getState().update(b, { mastM: 5 });
    await store.getState().settle();
    expect(computeMask).toHaveBeenCalledTimes(1);
    expect(computeMask).toHaveBeenCalledWith(expect.closeTo(-88.28, 2), expect.closeTo(-64.31, 2), 5);
    expect(store.getState().runs[a].mask?.source).toBe('featured');
    expect(store.getState().runs[b].mask).toMatchObject({ source: 'computed', mastM: 5 });
  });

  it('keeps the baseline and at most three more, and says so when full', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    for (const h of [24, 48, 72]) expect(store.getState().slip(a, h)).not.toBeNull();
    expect(store.getState().slip(a, 96)).toBeNull();
    expect(store.getState().note).toBe('Four scenarios is the most a comparison holds: remove one to add another.');
    store.getState().remove(a);
    expect(store.getState().scenarios[0].id).toBe(a);
  });

  it('lands a scenario at its site’s own best time in its period, marked as such', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    await store.getState().settle();
    const b = store.getState().useSiteBest(a)!;
    await store.getState().settle();
    expect(store.getState().scenarios[1]).toMatchObject({ id: b, startUtc: '2027-01-20T10:00:00', timing: 'site-best', label: 'de Gerlache Rim 2’s own best time', from: a });
    expect(outcome(store, b)?.poweredH).toBe(303);
  });

  it('takes the sites Explore, the assistant or Luna add to the comparison, with Explore’s settings, and gives back the sites it holds', async () => {
    const { explore, store } = await stores();
    await explore.getState().addToCompare('de_gerlache_rim_2');
    await explore.getState().addToCompare('malapert_massif');
    await store.getState().settle();
    expect(store.getState().scenarios.map((s) => [s.siteId, s.label, s.startUtc])).toEqual([
      ['de_gerlache_rim_2', 'de Gerlache Rim 2', '2027-01-01T00:00:00'],
      ['malapert_massif', 'Malapert Massif', '2027-01-01T00:00:00'],
    ]);
    const malapert = store.getState().scenarios[1].id;
    store.getState().remove(malapert);
    expect(explore.getState().compareIds).toEqual(['de_gerlache_rim_2']);
    // A site taken off the list elsewhere takes its scenarios with it.
    explore.getState().removeFromCompare('de_gerlache_rim_2');
    expect(store.getState().scenarios).toEqual([]);
  });

  it('replaces the comparison with one read from a link or a file, and starts again empty', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    store.getState().slip(a, 24);
    const list = store.getState().scenarios;
    store.getState().clear();
    expect(store.getState().scenarios).toEqual([]);
    store.getState().load(list, 'One scenario in this link could not be read and is left out.');
    await store.getState().settle();
    expect(store.getState().scenarios).toEqual(list);
    expect(store.getState().problem).toMatch(/could not be read/);
    expect(explore.getState().compareIds).toEqual(['de_gerlache_rim_2']);
  });

  it('says in plain words when a scenario’s period does not fit the Sun and Earth table', async () => {
    const { explore, store } = await stores();
    const a = store.getState().startFrom(explore.getState())!;
    store.getState().update(a, { startUtc: '2036-12-20T00:00:00' });
    await store.getState().settle();
    expect(store.getState().runs[a]).toMatchObject({ status: 'error', outcome: null });
    expect(store.getState().runs[a].error).toMatch(/runs past 31 December 2036/);
  });
});
