import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { COMPARE_MAX, createExploreStore, type ExploreState } from '../store/explore';
import { fileLoaders } from '../../test/file-loaders';
import { applyActions, COMPARE_LIMIT, siteByName, validateActions, type Action } from './actions';
import { explanationFor } from './explanations';

const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];
const ids = new Set(sites.map((s) => s.id));

describe('validateActions', () => {
  it('keeps a valid list unchanged', () => {
    const input = [
      { type: 'select_site', id: 'nobile_rim_2' },
      { type: 'set_window', startUtc: '2027-03-01T00:00:00', days: 14 },
      { type: 'find_best_window', days: 30, scope: 'compare' },
      { type: 'open_page', page: 'compare' },
      { type: 'open_page', page: 'sites' },
      { type: 'explain', topic: 'longest night' },
    ];
    const r = validateActions(input, ids);
    expect(r.actions).toEqual(input);
    expect(r.dropped).toEqual([]);
  });

  it('drops a stored answer\'s audience switch, which no longer exists, and keeps its other steps', () => {
    const r = validateActions([{ type: 'set_audience', audience: 'learn' }, { type: 'open_page', page: 'learn' }], ids);
    expect(r.actions).toEqual([{ type: 'open_page', page: 'learn' }]);
    expect(r.dropped.join(' ')).toMatch(/set_audience/);
  });

  it('drops unknown action types and reports them', () => {
    const r = validateActions([{ type: 'launch_rocket' }, { type: 'select_site', id: 'haworth' }], ids);
    expect(r.actions).toEqual([{ type: 'select_site', id: 'haworth' }]);
    expect(r.dropped.join(' ')).toMatch(/launch_rocket/);
  });

  it('drops unknown sites and fields', () => {
    const r = validateActions(
      [
        { type: 'select_site', id: 'shackleton_east_rim' },
        { type: 'add_to_compare', id: 'nobile_rim_2', extra: true },
        { type: 'set_power', patch: { loadW: 300, warpDrive: 1 } },
      ],
      ids,
    );
    expect(r.actions).toEqual([
      { type: 'add_to_compare', id: 'nobile_rim_2' },
      { type: 'set_power', patch: { loadW: 300 } },
    ]);
    expect(r.dropped.join(' ')).toMatch(/shackleton_east_rim/);
  });

  it('coerces window days from strings and rejects sizes outside 14, 30 and 90', () => {
    const r = validateActions(
      [
        { type: 'set_window', days: '30' },
        { type: 'set_window', days: 45 },
        { type: 'find_best_window', days: '14' },
        { type: 'set_window', startUtc: '2027-02-30' },
      ],
      ids,
    );
    expect(r.actions).toEqual([
      { type: 'set_window', days: 30 },
      { type: 'find_best_window', days: 14, scope: 'site' },
    ]);
    expect(r.dropped.length).toBe(2);
  });

  it('clamps power and planner patches to the panel ranges and drops empty patches', () => {
    const r = validateActions(
      [
        { type: 'set_power', patch: { loadW: 99999, areaM2: -3, panel: 'sideways', efficiency: 0.25 } },
        { type: 'set_power', patch: { panel: 'horizontal' } },
        { type: 'set_params', patch: { mastM: 40, minEarthElDeg: 'high' } },
        { type: 'set_params', patch: {} },
      ],
      ids,
    );
    expect(r.actions).toEqual([
      { type: 'set_power', patch: { loadW: 2000, areaM2: 0.5, efficiency: 0.25 } },
      { type: 'set_power', patch: { panel: 'horizontal' } },
      { type: 'set_params', patch: { mastM: 10 } },
    ]);
    expect(r.dropped.length).toBe(1);
  });

  it('returns nothing for input that is not a list', () => {
    expect(validateActions({ type: 'select_site', id: 'haworth' }, ids).actions).toEqual([]);
    expect(validateActions(null, ids).dropped.length).toBe(1);
  });
});

describe('siteByName', () => {
  it.each([
    ['nobile 2', 'nobile_rim_2'],
    ['Nobile Rim 1', 'nobile_rim_1'],
    ['shackleton rim', 'shackleton_center_rim_high'],
    ['shackleton crater', 'shackleton_center'],
    ['de gerlache rim 2', 'de_gerlache_rim_2'],
    ['blue ghost', 'blue_ghost_m1'],
    ['IM-2', 'im2_athena'],
    ['haworth', 'haworth'],
    ['the south pole', 'south_pole'],
    ['im1_odysseus', 'im1_odysseus'],
  ])('matches %s', (text, id) => {
    expect(siteByName(sites, text)?.id).toBe(id);
  });

  it('returns null when nothing matches', () => {
    expect(siteByName(sites, 'mars base')).toBeNull();
    expect(siteByName(sites, 'rim')).toBeNull();
    expect(siteByName(sites, '')).toBeNull();
  });
});

describe('applyActions', () => {
  function fakeStore(compareIds: string[] = []) {
    const calls: unknown[][] = [];
    const rec = (name: string) =>
      vi.fn((...args: unknown[]) => {
        calls.push([name, ...args]);
      });
    const state = {
      sites,
      compareIds,
      startUtc: '2027-01-01T00:00:00',
      days: 30,
      bestWindowNote: null,
      selectSite: vi.fn(async (id: string) => {
        calls.push(['selectSite', id]);
      }),
      // As the store does with a period that fits the table: the note reads the period back from it.
      setWindow: vi.fn((startUtc: string, days: number) => {
        calls.push(['setWindow', startUtc, days]);
        Object.assign(state, { startUtc, days });
      }),
      setPower: rec('setPower'),
      setParams: rec('setParams'),
      addToCompare: vi.fn(async (id: string) => {
        calls.push(['addToCompare', id]);
      }),
      removeFromCompare: rec('removeFromCompare'),
      findBestWindow: vi.fn(async (days: number, scope: string) => {
        calls.push(['findBestWindow', days, scope]);
        return { startUtc: '2027-03-04T00:00:00', poweredHours: 300, earthFraction: 0.5 };
      }),
    };
    return { store: { getState: () => state } as unknown as StoreApi<ExploreState>, calls };
  }

  it('drives the store and the router and returns one note per action', async () => {
    const { store, calls } = fakeStore();
    const navigate = vi.fn();
    const actions: Action[] = [
      { type: 'select_site', id: 'nobile_rim_2' },
      { type: 'set_window', startUtc: '2027-03-01T00:00:00', days: 14 },
      { type: 'set_power', patch: { loadW: 300 } },
      { type: 'set_params', patch: { mastM: 5 } },
      { type: 'add_to_compare', id: 'de_gerlache_rim_2' },
      { type: 'remove_from_compare', id: 'haworth' },
      { type: 'find_best_window', days: 14 },
      { type: 'open_page', page: 'compare' },
      { type: 'explain', topic: 'longest night' },
    ];
    const notes = await applyActions(store, actions, navigate);
    expect(calls).toEqual([
      ['selectSite', 'nobile_rim_2'],
      ['setWindow', '2027-03-01T00:00:00', 14],
      ['setPower', { loadW: 300 }],
      ['setParams', { mastM: 5 }],
      ['addToCompare', 'de_gerlache_rim_2'],
      ['removeFromCompare', 'haworth'],
      ['findBestWindow', 14, 'site'],
    ]);
    expect(navigate).toHaveBeenCalledWith('/compare');
    expect(notes.length).toBe(actions.length);
    expect(notes[0]).toMatch(/Selected Nobile Rim 2/);
    expect(notes[1]).toBe('Period: from 1 March 2027 for 14 days.');
    expect(notes[3]).toBe('Lander settings: mast 5 m.');
    expect(notes[6]).toBe('Moved to the best landing date for 14 days: 2027-03-04.');
    expect(notes[7]).toBe('Opened Compare sites.');
    expect(notes[8]).toMatch(/longest night/i);
  });

  it('names, for a topic it cannot explain, only topics it can, in the words the pages use', async () => {
    const { store } = fakeStore();
    const [note] = await applyActions(store, [{ type: 'explain', topic: 'dark matter' }], vi.fn());
    expect(note).not.toMatch(/skyline|verdict|window/i);
    const suggested = note.split('; try ')[1].replace(/\.$/, '').split(/, | or /);
    expect(suggested.length).toBe(5);
    for (const topic of suggested) expect(explanationFor(topic), topic).not.toBeNull();
  });

  it('a full Compare is reported, not claimed', async () => {
    const { store } = fakeStore(['de_gerlache_rim_2', 'nobile_rim_2', 'haworth', 'malapert_massif']);
    const [note] = await applyActions(store, [{ type: 'add_to_compare', id: 'shackleton_center' }], vi.fn());
    expect(note).toBe('Compare is full: four sites. Remove one to add Shackleton crater centre.');
    // A site already in the four is no fifth one.
    const [again] = await applyActions(store, [{ type: 'add_to_compare', id: 'haworth' }], vi.fn());
    expect(again).not.toMatch(/full/);
    // The note's limit is the store's, and its words say four.
    expect(COMPARE_LIMIT).toBe(COMPARE_MAX);
    expect(COMPARE_LIMIT).toBe(4);
  });

  it('reports a period the store refused, in its words, instead of claiming it was set', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const notes = await applyActions(store, [{ type: 'set_window', startUtc: '2036-12-20T00:00:00' }, { type: 'set_window', startUtc: '2036-12-01T00:00:00' }], vi.fn());
    expect(notes[0]).toBe('A 30-day period from 20 December 2036 runs past 31 December 2036, where the Sun and Earth table ends. Choose an earlier date or a shorter period.');
    // One that fits is set and said as before.
    expect(notes[1]).toBe('Period: from 1 December 2036 for 30 days.');
    expect(store.getState().startUtc).toBe('2036-12-01T00:00:00');
  });

  it('fills a partial window from the current one and reports unknown sites', async () => {
    const { store, calls } = fakeStore();
    const notes = await applyActions(store, [{ type: 'set_window', days: 90 }, { type: 'select_site', id: 'atlantis' }], vi.fn());
    expect(calls).toEqual([['setWindow', '2027-01-01T00:00:00', 90]]);
    expect(notes[1]).toMatch(/atlantis/);
  });
});

describe('siteByName digits', () => {
  it('needs a word next to a digit, so "show me 2" matches nothing while "nobile 2" still does', () => {
    expect(siteByName(sites, 'show me 2')).toBeNull();
    expect(siteByName(sites, '2')).toBeNull();
    expect(siteByName(sites, 'nobile 2')?.id).toBe('nobile_rim_2');
    expect(siteByName(sites, 'rim 2')).toBeNull(); // a generic word and a digit are not enough either
    expect(siteByName(sites, 'IM-2')?.id).toBe('im2_athena');
  });
});

describe('siteByName for the Apollo landings, other countries’ landers and the coming landings', () => {
  it.each([
    ['Apollo 11', 'apollo_11'],
    ['apollo 17', 'apollo_17'],
    ['Apollo 12 landing site', 'apollo_12'],
    ['Chandrayaan-3', 'chandrayaan3_vikram'],
    ['chandrayaan 3', 'chandrayaan3_vikram'],
    ['Vikram', 'chandrayaan3_vikram'],
    ["Chang'e 4", 'change4'],
    ['Chang’e 6', 'change6'],
    ['change 5', 'change5'],
    ['chang e 3', 'change3'],
    ['SLIM', 'slim'],
    ['Luna 25', 'luna25_target'],
    ['IM-3', 'im3_reiner_gamma'],
    ['Reiner Gamma', 'im3_reiner_gamma'],
    ['CP-12', 'cp12_schrodinger'],
    ['Schrödinger basin', 'cp12_schrodinger'],
    ['schrodinger', 'cp12_schrodinger'],
    ['schroedinger', 'cp12_schrodinger'],
    ['the Apollo basin', 'change6'],
  ])('matches %s', (text, id) => {
    expect(siteByName(sites, text)?.id).toBe(id);
  });

  it('keeps the older names to their own sites', () => {
    expect(siteByName(sites, 'IM-2')?.id).toBe('im2_athena');
    expect(siteByName(sites, 'IM-1')?.id).toBe('im1_odysseus');
    expect(siteByName(sites, 'the south pole')?.id).toBe('south_pole');
    expect(siteByName(sites, 'lunar south pole')?.id).toBe('south_pole');
  });
});
