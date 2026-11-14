// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comparisonHref } from '@/lib/scenario/codec';
import { scenarioFile } from '@/lib/scenario/file';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { CompareView } from './CompareView';
import { columnsOf } from './compare/columns';

function stores(overrides: Parameters<typeof fileLoaders>[0] = {}) {
  const loaders = fileLoaders(overrides);
  const explore = createExploreStore(loaders);
  return { explore, scenarios: createScenarioStore(explore, loaders) };
}

async function open(st = stores()) {
  render(<CompareView store={st.explore} scenarios={st.scenarios} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeTruthy(), { timeout: 20_000 });
  return st;
}

/** The example of the empty page, worked out: the original landing, five days later, and the nearby alternative. */
async function example(st = stores()) {
  await open(st);
  fireEvent.click(screen.getByRole('button', { name: /Our landing slipped by five days/ }));
  await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(3), { timeout: 20_000 });
  await st.scenarios.getState().settle();
  await screen.findByRole('table');
  return st;
}

const table = () => screen.getByRole('table');
/** The cells of a row of the table, by its name. */
function row(name: string): string[] {
  const th = within(table()).getByRole('rowheader', { name });
  return Array.from(th.parentElement!.querySelectorAll('td')).map((td) => td.textContent ?? '');
}
const baselineOf = (st: ReturnType<typeof stores>) => st.scenarios.getState().startFrom({ siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, params: st.explore.getState().params })!;

beforeEach(() => {
  window.history.replaceState(null, '', '/compare');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CompareView', () => {
  it('keeps the empty page to 200 words before a tap, at 1440 and on a phone (spec 20.1)', async () => {
    await open();
    const main = screen.getByRole('main');
    for (const width of [WIDE, PHONE]) expect(visibleWords(main, width).length).toBeLessThanOrEqual(200);
    // One gold action: the example of a slipped landing.
    expect(main.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Our landing slipped by five days/ }).className).toMatch(/\bbtn-primary\b/);
    expect(screen.getByRole('link', { name: 'Explore' }).getAttribute('href')).toBe('/explore');
  });

  it('runs the five-day slip in one press: the original landing, the same site five days later, and the nearby site that works better', async () => {
    await example();
    const heads = within(table()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Scenario', 'BaselineOriginal landing', 'Scenario 25 days later', 'Scenario 3Nearby: de Gerlache rim summit']);
    // Each site says what kind of point it is: a region's centre, or a high point worked out from the heights.
    expect(row('Site')).toEqual(['de Gerlache Rim 2Centre of a region, ±5 km', 'de Gerlache Rim 2Centre of a region, ±5 km', 'de Gerlache rim summitDerived high point, not checked as safe to land12 km from de Gerlache Rim 2']);
    expect(row('Landing (UTC)')).toEqual(['1 Jan 2027, 00:00 UTC', '6 Jan 2027, 00:00 UTC5 days later', '6 Jan 2027, 00:00 UTC5 days later']);
    // Absolute figures, and the change from the baseline under each.
    expect(row('Time with power')).toEqual(['3 d 4 h', '10 h−2 d 18 h, worse', 'all 30 days+26 d 20 h, better']);
    expect(row('Radio contact while it has power')).toEqual(['none', 'noneno change', '14 d 15 h+14 d 15 h, better']);
    expect(row('Sunlight')[2]).toBe('100 %+55 points, better');
    expect(row('First sunset after landing')).toEqual(['2 d 19 h', 'night at landing, rises after 14 d 10 hwas 2 d 19 h, worse', 'none in the periodwas 2 d 19 h, better']);
    // What changed at the original site, then which alternative works better and why, with the trade-offs.
    const story = screen.getByRole('region', { name: 'What changed, and what works better' });
    expect(story.textContent).toMatch(/Landing times differ: the figures compare different dates as well as places\./);
    expect(story.textContent).toMatch(/5 days later \(6 January 2027, 00:00 UTC\): power for 10 hours instead of 3 days 4 hours\. The period starts at night/);
    expect(story.textContent).toMatch(/de Gerlache rim summit, 12 km from de Gerlache Rim 2 and unchecked for landing, works better than “5 days later” at the same landing time \(6 January 2027, 00:00 UTC\): power for all 30 days instead of 10 hours\./);
    expect(within(story).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      expect.arrayContaining(['Sunlight: 100 % against 41 %: better.', 'Radio contact while it has power: 14 days 15 hours against none: better.']),
    );
    // What the figures assume, and do not show, one tap away.
    expect(within(story).getByRole('button', { name: /What these figures assume, and what they do not show/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('puts the whole comparison in the address, so a fresh browser opening it shows the same settings and figures', async () => {
    const first = await example();
    const href = comparisonHref(first.scenarios.getState().scenarios);
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(href));
    const names = ['Site', 'Landing (UTC)', 'Lander', 'Time with power', 'Sunlight', 'Earth in view', 'Radio contact while it has power', 'Longest time without Earth'];
    const before = names.map(row);
    cleanup();
    // A colleague's browser: new stores, nothing but the address.
    window.history.replaceState(null, '', href);
    const fresh = stores();
    await open(fresh);
    await waitFor(() => expect(fresh.scenarios.getState().scenarios).toHaveLength(3));
    await fresh.scenarios.getState().settle();
    await screen.findByRole('table');
    expect(names.map(row)).toEqual(before);
  });

  it('says so when a link cannot be read, and keeps an old /compare address working', async () => {
    window.history.replaceState(null, '', '/compare?v=9&s=x');
    await open();
    expect(screen.getByRole('main').textContent).toMatch(/This comparison link is from a newer version of Earthrise/);
    cleanup();
    window.history.replaceState(null, '', '/compare');
    const st = await open();
    // The sites Explore's Compare button or the assistant put on the list become scenarios with Explore's settings.
    await st.explore.getState().addToCompare('shackleton_center_rim_high');
    await waitFor(() => expect(st.scenarios.getState().scenarios.map((s) => s.siteId)).toEqual(['shackleton_center_rim_high']));
  });

  it('opens the baseline’s slip when it is alone, so five days later is one press from Compare from here', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    const card = await screen.findByRole('group', { name: 'Baseline: Original landing' });
    // Alone, the baseline has nothing to compare with yet: the scenarios come first, with what to do next.
    expect(screen.queryByRole('region', { name: 'What changed, and what works better' })).toBeNull();
    expect(screen.getByRole('main').textContent).toMatch(/The baseline lands 1 January 2027, 00:00 UTC\. Slip the landing, or find a nearby alternative, to compare it with this baseline\./);
    fireEvent.click(within(card).getByRole('button', { name: 'Add 5 days later' }));
    await waitFor(() => expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['Original landing', '5 days later']));
    // With two scenarios, each card's slip waits behind its button.
    expect(within(screen.getByRole('group', { name: 'Baseline: Original landing' })).queryByRole('button', { name: 'Add 5 days later' })).toBeNull();
  });

  it('slips a scenario by any number of days or hours, five days later to begin with', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    const card = await screen.findByRole('group', { name: 'Baseline: Original landing' });
    expect(within(card).getByRole('button', { name: 'Slip the landing…' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(card).getByRole('button', { name: 'Add 5 days later' })).toBeTruthy();
    fireEvent.change(within(card).getByRole('spinbutton', { name: 'By' }), { target: { value: '12' } });
    fireEvent.change(within(card).getByRole('combobox', { name: 'Days or hours' }), { target: { value: 'hours' } });
    fireEvent.change(within(card).getByRole('combobox', { name: 'Later or earlier' }), { target: { value: 'earlier' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Add 12 hours earlier' }));
    await waitFor(() =>
      expect(st.scenarios.getState().scenarios.map((s) => [s.label, s.startUtc])).toEqual([
        ['Original landing', '2027-01-01T00:00:00'],
        ['12 hours earlier', '2026-12-31T12:00:00'],
      ]),
    );
  });

  it('changes a scenario’s site, landing hour, stay and lander on their own, leaving the others as they were', async () => {
    const st = stores();
    await open(st);
    const a = baselineOf(st);
    const b = st.scenarios.getState().duplicate(a)!;
    const card = await screen.findByRole('group', { name: 'Scenario 2: Copy of Original landing' });
    fireEvent.click(within(card).getByRole('button', { name: 'Change “Copy of Original landing”' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Site' }), { target: { value: 'malapert_massif' } });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Landing hour (UTC)' }), { target: { value: '06:00' } });
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Stay (days)' }), { target: { value: '14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lander, mast and Earth’s height…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /Medium lander/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    const [x, y] = st.scenarios.getState().scenarios;
    expect(x).toMatchObject({ id: a, siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: { batteryWh: 2000 } });
    expect(y).toMatchObject({ id: b, siteId: 'malapert_massif', startUtc: '2027-01-01T06:00:00', days: 14, power: { batteryWh: 20000, loadW: 400 } });
  });

  it('keeps the baseline: it has no remove button, and another scenario can be made the baseline', async () => {
    const st = stores();
    await open(st);
    const a = baselineOf(st);
    st.scenarios.getState().slip(a, 24);
    const base = await screen.findByRole('group', { name: 'Baseline: Original landing' });
    expect(within(base).queryByRole('button', { name: /^Remove/ })).toBeNull();
    const other = screen.getByRole('group', { name: 'Scenario 2: 1 day later' });
    fireEvent.click(within(other).getByRole('button', { name: /^More/ }));
    fireEvent.click(within(other).getByRole('button', { name: 'Make it the baseline' }));
    expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['1 day later', 'Original landing']);
    const moved = await screen.findByRole('group', { name: 'Scenario 2: Original landing' });
    fireEvent.click(within(moved).getByRole('button', { name: /^More/ }));
    fireEvent.click(within(moved).getByRole('button', { name: 'Remove “Original landing”' }));
    expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['1 day later']);
  });

  it('opens a scenario file, replacing the comparison, and says whether the figures match the file’s', async () => {
    const first = await example();
    const cols = columnsOf(first.scenarios.getState().scenarios, first.scenarios.getState().runs, first.explore.getState().sites);
    const text = JSON.stringify(scenarioFile(cols, { data: null, ephemeris: null, sites: null, terrain: null }));
    cleanup();
    const st = stores();
    await open(st);
    const input = screen.getByLabelText('Open a scenario file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([text], 'earthrise-comparison.json', { type: 'application/json' })] } });
    await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(3));
    await st.scenarios.getState().settle();
    await waitFor(() => expect(screen.getByRole('main').textContent).toMatch(/The figures worked out here match the ones saved in the file\./));
    expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['Original landing', '5 days later', 'Nearby: de Gerlache rim summit']);
    // Once a scenario is changed, the figures are no longer the file's to check against.
    st.scenarios.getState().update(st.scenarios.getState().scenarios[1].id, { days: 14 });
    await st.scenarios.getState().settle();
    await waitFor(() => expect(row('Stay')[1]).toBe('14 dayschanged'));
    expect(screen.getByRole('main').textContent).not.toMatch(/match the ones saved|differ from the file/);
  });

  it('marks a scenario at its site’s own best time, apart from the same-time comparison', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    await st.scenarios.getState().settle();
    await screen.findByRole('table');
    expect(row('Its own best landing')[0]).toBe('20 Jan 2027, 10:00 UTCpower 12 d 15 hAdd it');
    fireEvent.click(within(table()).getByRole('button', { name: 'Add “Original landing” at this landing time' }));
    await st.scenarios.getState().settle();
    await waitFor(() => expect(row('Landing (UTC)')[1]).toBe('20 Jan 2027, 10:00 UTC19 days 10 hours laterthe site’s own best time'));
    expect(screen.getByRole('region', { name: 'What changed, and what works better' }).textContent).toMatch(
      /“de Gerlache Rim 2’s own best time” lands at de Gerlache Rim 2’s own best time in its period, not a time it shares by choice\./,
    );
  });

  it('keeps the table in its own scrolling box on a phone, its row names in view, and at most one gold action', async () => {
    await example();
    const box = screen.getByRole('region', { name: 'The scenarios side by side' });
    expect(box.className).toMatch(/\boverflow-x-auto\b/);
    // The words kept for screen readers are placed absolutely: the box holds them, or they would widen a phone's page.
    expect(box.className).toMatch(/\brelative\b/);
    expect(box.getAttribute('tabindex')).toBe('0');
    for (const th of within(table()).getAllByRole('rowheader')) expect(th.className).toMatch(/\bsticky\b.*\bleft-0\b/);
    expect(screen.getByRole('main').querySelectorAll('.btn-primary').length).toBeLessThanOrEqual(1);
  });

  it('checks every scenario against the requirements set on Explore, each met or failed with its value and margin', async () => {
    const st = stores();
    st.explore.getState().setRequirements({ minPoweredH: 120, maxOutageH: 96 });
    await example(st);
    const cells = () => Array.from(within(table()).getByRole('rowheader', { name: 'Your requirements' }).parentElement!.querySelectorAll('td'));
    const shown = () => cells().map((td) => visibleWords(td, WIDE).join(' '));
    // How many each fails, against the baseline's count; the full comparison keeps to its 750 words with the row.
    expect(shown()).toEqual(['Fails 1 of your 2 requirements.', 'Fails 1 of your 2 requirements. same', 'Fails 1 of your 2 requirements. same']);
    const main = screen.getByRole('main');
    for (const width of [WIDE, PHONE]) expect(visibleWords(main, width).length).toBeLessThanOrEqual(750);
    // One tap on the row's name opens each requirement, met or failed, with the value reached and the margin.
    const toggle = within(table()).getByRole('button', { name: 'Your requirements' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(shown()).toEqual([
      'Fails 1 of your 2 requirements. Fails Power for at least 5 d: 3 d 4 h, 1 d 20 h short Meets Longest time without Earth while powered at most 4 d: 3 d 4 h, 20 h to spare',
      'Fails 1 of your 2 requirements. same Fails Power for at least 5 d: 10 h, 4 d 14 h short Meets Longest time without Earth while powered at most 4 d: 10 h, 3 d 14 h to spare',
      'Fails 1 of your 2 requirements. same Meets Power for at least 5 d: 30 d, 25 d to spare Fails Longest time without Earth while powered at most 4 d: 11 d 10 h, 7 d 10 h too long',
    ]);
    // Set to none, the row goes, and nothing else shows in its place.
    act(() => st.explore.getState().setRequirements({ minPoweredH: null, maxOutageH: null }));
    expect(within(table()).queryByRole('rowheader', { name: 'Your requirements' })).toBeNull();
  });

  it('keeps the full comparison to 750 words before a tap, at 1440 and on a phone', async () => {
    await example();
    const main = screen.getByRole('main');
    // Three scenarios side by side, with the kind of every point and the caveat on the alternative: the rest is folded.
    for (const width of [WIDE, PHONE]) expect(visibleWords(main, width).length).toBeLessThanOrEqual(750);
  });

  it('names its NASA data', async () => {
    const st = await open();
    // An empty page compares nothing, so it names no data.
    expect(screen.queryByLabelText('Data sources')).toBeNull();
    baselineOf(st);
    const names = async () => within(await screen.findByLabelText('Data sources')).getAllByRole('listitem').map((li) => li.textContent);
    expect(await names()).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m']);
  });

  it('says in plain words when the data cannot be loaded', async () => {
    const missing = () =>
      stores({
        loadSites: async () => {
          throw new Error('could not load /data/sites.json (HTTP 404)');
        },
      });
    const plain = /The data could not be loaded\.\s*Reload the page, or try again in a minute\./;
    const a = missing();
    render(<CompareView store={a.explore} scenarios={a.scenarios} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    const b = missing();
    render(<CompareView store={b.explore} scenarios={b.scenarios} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});
