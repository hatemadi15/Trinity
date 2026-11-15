import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { siteLabel, type Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { COMPARE_MAX, createExploreStore, type ExploreState } from '../store/explore';
import { fileLoaders } from '../../test/file-loaders';
import { answerOf, applyActions, COMPARE_LIMIT, siteByName, validateActions, type Action } from './actions';
import { matchIntent } from './intents';
import { nameableSites, rankSites } from './site-rank';
import { createScenarioStore } from '../store/scenarios';
import { explanationFor } from './explanations';
import { spanWords } from '../viz/format';

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

  it('coerces window days from strings and keeps any whole number from 2 to 90, dropping any other', () => {
    const r = validateActions(
      [
        { type: 'set_window', days: '30' },
        { type: 'set_window', days: 45 },
        { type: 'set_window', days: 7 },
        { type: 'find_best_window', days: '14' },
        { type: 'find_best_window', days: 7 },
        { type: 'set_window', days: 120 },
        { type: 'set_window', days: 1 },
        { type: 'set_window', days: 7.5 },
        { type: 'find_best_window', days: 91 },
        { type: 'set_window', startUtc: '2027-02-30' },
      ],
      ids,
    );
    expect(r.actions).toEqual([
      { type: 'set_window', days: 30 },
      { type: 'set_window', days: 45 },
      { type: 'set_window', days: 7 },
      { type: 'find_best_window', days: 14, scope: 'site' },
      { type: 'find_best_window', days: 7, scope: 'site' },
    ]);
    expect(r.dropped).toEqual([
      'set_window: days must be a whole number from 2 to 90 (got 120)',
      'set_window: days must be a whole number from 2 to 90 (got 1)',
      'set_window: days must be a whole number from 2 to 90 (got 7.5)',
      'find_best_window: days must be a whole number from 2 to 90 (got 91)',
      'set_window: bad start date "2027-02-30"',
    ]);
  });

  it('keeps a landing hour, reads minutes at the nearest whole hour, and checks a time and a shift', () => {
    const r = validateActions(
      [
        { type: 'set_window', startUtc: '2027-01-20T17:00:00', days: 7 },
        { type: 'set_window', startUtc: '2027-01-20T17:40' },
        { type: 'set_window', timeUtc: '17:00' },
        { type: 'shift_window', hours: 120 },
        { type: 'shift_window', hours: '-6' },
        { type: 'set_window', timeUtc: '24:00' },
        { type: 'set_window', timeUtc: '5 pm' },
        { type: 'shift_window', hours: 0 },
        { type: 'shift_window', hours: 2.5 },
        { type: 'shift_window' },
      ],
      ids,
    );
    expect(r.actions).toEqual([
      { type: 'set_window', startUtc: '2027-01-20T17:00:00', days: 7 },
      { type: 'set_window', startUtc: '2027-01-20T18:00:00' },
      { type: 'set_window', timeUtc: '17:00' },
      { type: 'shift_window', hours: 120 },
      { type: 'shift_window', hours: -6 },
    ]);
    expect(r.dropped).toEqual([
      'set_window: bad time "24:00"',
      'set_window: bad time "5 pm"',
      'shift_window: hours must be a whole number other than 0 (got 0)',
      'shift_window: hours must be a whole number other than 0 (got 2.5)',
      'shift_window: hours must be a whole number other than 0 (got undefined)',
    ]);
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
    expect(notes[1]).toBe('Period: from 1 March 2027, 00:00 UTC, for 14 days.');
    expect(notes[3]).toBe('Lander settings: mast 5 m.');
    expect(notes[6]).toBe('Moved to the best landing for 14 days: 4 March 2027, 00:00 UTC.');
    expect(notes[7]).toBe('Opened Compare sites.');
    expect(notes[8]).toMatch(/longest night/i);
  });

  it('compares the landing shown with the same one moved: the baseline and the moved landing, then Compare', async () => {
    const loaders = fileLoaders();
    const store = createExploreStore(loaders);
    await store.getState().init();
    const scenarios = createScenarioStore(store, loaders);
    const navigate = vi.fn();
    const [note] = await applyActions(store, [{ type: 'compare_shift', hours: 120 }], navigate, scenarios);
    expect(scenarios.getState().scenarios.map((s) => [s.label, s.siteId, s.startUtc])).toEqual([
      ['Original landing', 'de_gerlache_rim_2', '2027-01-01T00:00:00'],
      ['5 days later', 'de_gerlache_rim_2', '2027-01-06T00:00:00'],
    ]);
    expect(navigate).toHaveBeenCalledWith('/compare');
    expect(note).toBe('Comparing the landing at de Gerlache Rim 2 on 1 January 2027, 00:00 UTC with the same landing 5 days later.');
    // Without the comparison to hand, the note says so rather than claim it.
    const [none] = await applyActions(store, [{ type: 'compare_shift', hours: 120 }], vi.fn());
    expect(none).toBe('A comparison can be made on Compare: open it and slip the landing there.');
  });

  it('keeps a moved landing to whole hours, other than none, within the table', () => {
    const ids = new Set(sites.map((s) => s.id));
    expect(validateActions([{ type: 'compare_shift', hours: 120 }], ids).actions).toEqual([{ type: 'compare_shift', hours: 120 }]);
    expect(validateActions([{ type: 'compare_shift', hours: '-6' }], ids).actions).toEqual([{ type: 'compare_shift', hours: -6 }]);
    for (const hours of [0, 1.5, 200_000, 'soon']) expect(validateActions([{ type: 'compare_shift', hours }], ids).actions).toEqual([]);
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
    expect(notes[0]).toBe('A 30-day period from 20 December 2036, 00:00 UTC runs past 31 December 2036, where the Sun and Earth table ends. The latest landing for 30 days is 2 December 2036, 00:00 UTC.');
    // One that fits is set and said as before.
    expect(notes[1]).toBe('Period: from 1 December 2036, 00:00 UTC, for 30 days.');
    expect(store.getState().startUtc).toBe('2036-12-01T00:00:00');
  });

  it('lands at a UTC hour on the date chosen, for any length, and says the period as the controls show it', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const notes = await applyActions(store, [{ type: 'set_window', startUtc: '2027-01-20T00:00:00', days: 7 }, { type: 'set_window', timeUtc: '17:00' }], vi.fn());
    expect(notes).toEqual(['Period: from 20 January 2027, 00:00 UTC, for 7 days.', 'Period: from 20 January 2027, 17:00 UTC, for 7 days.']);
    expect([store.getState().startUtc, store.getState().days]).toEqual(['2027-01-20T17:00:00', 7]);
  });

  it('moves a slipped landing by days or hours, keeping the length, and stops at the end of the table with a plain sentence', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setWindow('2027-01-20T17:00:00', 7);
    expect(await applyActions(store, [{ type: 'shift_window', hours: 120 }], vi.fn())).toEqual(['Landing 5 days later. Period: from 25 January 2027, 17:00 UTC, for 7 days.']);
    expect(await applyActions(store, [{ type: 'shift_window', hours: -6 }], vi.fn())).toEqual(['Landing 6 hours earlier. Period: from 25 January 2027, 11:00 UTC, for 7 days.']);
    expect([store.getState().startUtc, store.getState().days]).toEqual(['2027-01-25T11:00:00', 7]);
    store.getState().setWindow('2036-12-20T00:00:00', 7);
    expect(await applyActions(store, [{ type: 'shift_window', hours: 240 }], vi.fn())).toEqual([
      'Period: from 25 December 2036, 00:00 UTC, for 7 days. The Sun and Earth table ends on 31 December 2036, so a 7-day period can start no later than 25 December 2036, 00:00 UTC: the landing moved there.',
    ]);
    expect(store.getState().startUtc).toBe('2036-12-25T00:00:00');
  });

  it('fills a partial window from the current one and reports unknown sites', async () => {
    const { store, calls } = fakeStore();
    const notes = await applyActions(store, [{ type: 'set_window', days: 90 }, { type: 'select_site', id: 'atlantis' }], vi.fn());
    expect(calls).toEqual([['setWindow', '2027-01-01T00:00:00', 90]]);
    expect(notes[1]).toMatch(/atlantis/);
  });
});

describe('comparing sites by name, the site shown with one, and the site shown with every other', () => {
  it('keeps a comparison of catalogue sites, each once, within four, and drops one that names an unknown site', () => {
    expect(validateActions([{ type: 'compare_sites', ids: ['haworth', 'nobile_rim_1'] }], ids).actions).toEqual([{ type: 'compare_sites', ids: ['haworth', 'nobile_rim_1'] }]);
    expect(validateActions([{ type: 'compare_sites', ids: ['nobile_rim_1', ' nobile_rim_1 '], shown: true }], ids).actions).toEqual([{ type: 'compare_sites', ids: ['nobile_rim_1'], shown: true }]);
    // The site shown takes one of the four places.
    const five = ['haworth', 'nobile_rim_1', 'nobile_rim_2', 'malapert_massif', 'shackleton_center'];
    expect(validateActions([{ type: 'compare_sites', ids: five }], ids).actions[0]).toEqual({ type: 'compare_sites', ids: five.slice(0, COMPARE_LIMIT) });
    expect(validateActions([{ type: 'compare_sites', ids: five, shown: true }], ids).actions[0]).toEqual({ type: 'compare_sites', ids: five.slice(0, COMPARE_LIMIT - 1), shown: true });
    const unknown = validateActions([{ type: 'compare_sites', ids: ['haworth', 'atlantis'] }], ids);
    expect(unknown.actions).toEqual([]);
    expect(unknown.dropped).toEqual(['compare_sites: unknown site "atlantis"']);
    expect(validateActions([{ type: 'compare_sites', ids: ['haworth'] }], ids).dropped[0]).toMatch(/needs two sites/);
    expect(validateActions([{ type: 'compare_sites', ids: 'haworth' }], ids).actions).toEqual([]);
    expect(validateActions([{ type: 'compare_best' }, { type: 'compare_best', extra: 1 }], ids).actions).toEqual([{ type: 'compare_best' }, { type: 'compare_best' }]);
  });

  async function ready() {
    const loaders = fileLoaders();
    const store = createExploreStore(loaders);
    await store.getState().init();
    await store.getState().selectSite('de_gerlache_rim_2');
    store.getState().setWindow('2027-01-01T00:00:00', 30);
    const scenarios = createScenarioStore(store, loaders);
    return { store, scenarios, navigate: vi.fn() };
  }
  const ran = async (prompt: string, r: Awaited<ReturnType<typeof ready>>) => {
    const a = matchIntent(prompt, sites)!;
    const valid = validateActions(a.actions, ids).actions;
    const notes = await applyActions(r.store, valid, r.navigate, r.scenarios, prompt);
    return answerOf(valid, a.reply, notes);
  };

  it('opens Compare with two named sites, a new comparison with the dates and lander chosen', async () => {
    const r = await ready();
    // What Compare held before goes, a slipped landing with it.
    await r.store.getState().addToCompare('haworth');
    const { reply, notes } = await ran('compare de Gerlache Rim 2 to Nobile Rim 1', r);
    expect(r.store.getState().compareIds).toEqual(['de_gerlache_rim_2', 'nobile_rim_1']);
    expect(r.scenarios.getState().scenarios.map((x) => [x.siteId, x.startUtc, x.days])).toEqual([
      ['de_gerlache_rim_2', '2027-01-01T00:00:00', 30],
      ['nobile_rim_1', '2027-01-01T00:00:00', 30],
    ]);
    expect(r.navigate).toHaveBeenCalledWith('/compare');
    expect(reply).toBe(
      'Compare: de Gerlache Rim 2 and Nobile Rim 1, for 30 days from 1 January 2027 and this lander (4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, 2 m mast). The sites compared before (Haworth) came off it.',
    );
    expect(notes).toEqual([]);
  });

  it('opens Compare with the site shown and a named one, the site shown first', async () => {
    const r = await ready();
    await r.store.getState().selectSite('haworth');
    const { reply } = await ran('how does this compare to Nobile Rim 1?', r);
    expect(r.store.getState().compareIds).toEqual(['haworth', 'nobile_rim_1']);
    expect(r.scenarios.getState().scenarios[0].siteId).toBe('haworth');
    expect(reply).toMatch(/^Compare: Haworth and Nobile Rim 1, for 30 days from 1 January 2027 and this lander/);
    // The site shown against itself is no comparison: nothing changes and Compare stays shut.
    r.navigate.mockClear();
    const same = await ran('compare this to haworth', r);
    expect(same.reply).toBe('Haworth is the site shown: name another site to compare it with.');
    expect(r.navigate).not.toHaveBeenCalled();
    expect(r.store.getState().compareIds).toEqual(['haworth', 'nobile_rim_1']);
  });

  it('ranks every site as the site list does and puts the best three others beside the site shown', async () => {
    const r = await ready();
    const { reply } = await ran('compare this to every landing site', r);
    const s = r.store.getState();
    const o = s.overview;
    expect(Object.keys(o)).toHaveLength(34);
    const named = nameableSites(s.sites, o, s.params.mastM);
    const top = named.filter((x) => x.id !== 'de_gerlache_rim_2').slice(0, 3);
    expect(s.compareIds).toEqual(['de_gerlache_rim_2', ...top.map((x) => x.id)]);
    expect(r.scenarios.getState().scenarios.map((x) => x.siteId)).toEqual(s.compareIds);
    expect(r.navigate).toHaveBeenCalledWith('/compare');
    // Never a site with incomplete terrain, nor one without power from the Sun, among them.
    for (const x of top) {
      expect(o[x.id]!.terrain?.quality).not.toBe('incomplete');
      expect(o[x.id]!.best).not.toBeNull();
    }
    // Two sentences: the dates and lander, the best site and its figure from the app, the one here, then what Compare holds.
    const best = named[0];
    const hours = (id: string) => o[id]!.best!.poweredHours;
    const words = (h: number) => (h >= 30 * 24 ? 'all 30 days' : spanWords(h));
    expect(reply.startsWith('For 30 days from 1 January 2027 and this lander (4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, 2 m mast), ')).toBe(true);
    expect(reply).toContain(`, ${siteLabel(best)} `);
    expect(reply).toContain(`of the 34 sites`);
    expect(reply).toContain(words(hours(best.id)));
    expect(reply).toContain(`(here: ${words(hours('de_gerlache_rim_2'))})`);
    expect(reply).toMatch(/ I've put the top three beside yours on Compare, each at its own best landing time\.$/);
    expect(reply.split(/(?<=\.) /)).toHaveLength(2);
    expect(reply).not.toMatch(/surviv|guarantee|safe/i);
    // Each lands on Compare at its own best time in the period, as the site list's links open it, for the same length and lander.
    const isoAtHour = (h: number) => new Date(Date.parse('2027-01-01T00:00:00Z') + h * 3_600_000).toISOString().slice(0, 19);
    expect(r.scenarios.getState().scenarios.map((x) => [x.siteId, x.startUtc, x.days, x.timing])).toEqual(
      s.compareIds.map((id) => [id, o[id]!.best!.hour > 0 ? isoAtHour(o[id]!.best!.hour) : '2027-01-01T00:00:00', 30, 'site-best']),
    );
    // So Compare's figures are the ones the reply and the site list give: the time with power from that landing.
    await r.scenarios.getState().settle();
    const runs = r.scenarios.getState().runs;
    for (const x of r.scenarios.getState().scenarios) expect(runs[x.id]?.outcome?.poweredH, x.siteId).toBe(Math.min(30 * 24, o[x.siteId]!.best!.poweredHours));
  });

  it('says so when the site shown is itself the best, and puts the next three beside it', async () => {
    const r = await ready();
    const s0 = r.store.getState();
    await s0.loadOverview();
    const best = nameableSites(s0.sites, r.store.getState().overview, s0.params.mastM)[0];
    await r.store.getState().selectSite(best.id);
    const { reply } = await ran('is there a better site?', r);
    expect(reply).toContain(`the site shown, ${siteLabel(best)},`);
    expect(reply).not.toContain('(here:');
    expect(reply).toMatch(/ I've put the next three beside it on Compare, each at its own best landing time\.$/);
    expect(r.store.getState().compareIds[0]).toBe(best.id);
    expect(r.store.getState().compareIds).toHaveLength(4);
  });

  it('never names a site with incomplete terrain best, and names none when no site can be', async () => {
    const r = await ready();
    await r.store.getState().loadOverview();
    const s = r.store.getState();
    const first = nameableSites(s.sites, s.overview, s.params.mastM)[0];
    // The leader's terrain, marked incomplete: the ranking passes over it.
    const o = s.overview[first.id]!;
    r.store.setState({ overview: { ...s.overview, [first.id]: { ...o, terrain: { ...o.terrain!, quality: 'incomplete' } } } });
    const { reply } = await ran('which site is best for these dates', r);
    expect(reply).not.toContain(`${siteLabel(first)} keeps`);
    expect(reply).not.toContain(`${siteLabel(first)} ranks`);
    expect(r.store.getState().compareIds).not.toContain(first.id);
    // Every site incomplete: none is named, and Compare is not opened.
    const all = Object.fromEntries(Object.entries(r.store.getState().overview).map(([id, x]) => [id, { ...x, terrain: { ...x.terrain!, quality: 'incomplete' as const } }]));
    r.store.setState({ overview: all });
    r.navigate.mockClear();
    const none = await ran('compare this to any landing site', r);
    expect(none.reply).toBe('For 30 days from 1 January 2027 and this lander (4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, 2 m mast), none of the 34 sites can be named best: none has both complete terrain and time with power from the Sun.');
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('ranks the catalogue in the site list’s order: sites that see Earth first, then the longest with power, then sunlight', async () => {
    const r = await ready();
    await r.store.getState().loadOverview();
    const s = r.store.getState();
    const ranked = rankSites(s.sites, s.overview);
    expect(ranked).toHaveLength(34);
    const score = (id: string) => (s.overview[id]!.best?.poweredHours ?? -1) * 10 + s.overview[id]!.afterSun;
    const seen = ranked.filter((x) => x.far_side !== true && s.overview[x.id]!.afterEarth > 0);
    expect(ranked.slice(0, seen.length)).toEqual(seen);
    const complete = seen.filter((x) => s.overview[x.id]!.terrain?.quality !== 'incomplete');
    expect(complete.map((x) => score(x.id))).toEqual(complete.map((x) => score(x.id)).sort((a, b) => b - a));
    // Mons Mouton never sees Earth in these days, and the far side closes the list.
    expect(ranked.findIndex((x) => x.id === 'mons_mouton')).toBeGreaterThanOrEqual(seen.length);
    expect(ranked.slice(-3).map((x) => x.id).sort()).toEqual(['change4', 'change6', 'cp12_schrodinger']);
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
