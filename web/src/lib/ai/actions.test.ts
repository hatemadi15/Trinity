import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import type { ExploreState } from '../store/explore';
import { applyActions, siteByName, validateActions, type Action } from './actions';

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
      { type: 'set_audience', audience: 'learn' },
      { type: 'open_page', page: 'compare' },
      { type: 'explain', topic: 'longest night' },
    ];
    const r = validateActions(input, ids);
    expect(r.actions).toEqual(input);
    expect(r.dropped).toEqual([]);
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
  function fakeStore() {
    const calls: unknown[][] = [];
    const rec = (name: string) =>
      vi.fn((...args: unknown[]) => {
        calls.push([name, ...args]);
      });
    const state = {
      sites,
      startUtc: '2027-01-01T00:00:00',
      days: 30,
      bestWindowNote: null,
      selectSite: vi.fn(async (id: string) => {
        calls.push(['selectSite', id]);
      }),
      setWindow: rec('setWindow'),
      setPower: rec('setPower'),
      setParams: rec('setParams'),
      addToCompare: vi.fn(async (id: string) => {
        calls.push(['addToCompare', id]);
      }),
      removeFromCompare: rec('removeFromCompare'),
      setAudience: rec('setAudience'),
      findBestWindow: vi.fn(async (days: number, scope: string) => {
        calls.push(['findBestWindow', days, scope]);
        return { startUtc: '2027-03-04T00:00:00', summary: {} };
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
      { type: 'set_audience', audience: 'learn' },
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
      ['setAudience', 'learn'],
    ]);
    expect(navigate).toHaveBeenCalledWith('/compare');
    expect(notes.length).toBe(actions.length);
    expect(notes[0]).toMatch(/Selected Nobile Rim 2/);
    expect(notes[6]).toMatch(/best 14-day window: 2027-03-04/);
    expect(notes[9]).toMatch(/longest night/i);
  });

  it('fills a partial window from the current one and reports unknown sites', async () => {
    const { store, calls } = fakeStore();
    const notes = await applyActions(store, [{ type: 'set_window', days: 90 }, { type: 'select_site', id: 'atlantis' }], vi.fn());
    expect(calls).toEqual([['setWindow', '2027-01-01T00:00:00', 90]]);
    expect(notes[1]).toMatch(/atlantis/);
  });
});
