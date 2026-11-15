// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionsClient } from '@/lib/ensemble/client';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
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
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare landings' })).toBeTruthy(), { timeout: 20_000 });
  return st;
}

/** The example of the empty page, worked out: the original landing, five days later, and the nearby alternative. */
async function example(st = stores()) {
  await open(st);
  fireEvent.click(screen.getByRole('button', { name: /What if our landing is 5 days late\?/ }));
  await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(3), { timeout: 20_000 });
  await st.scenarios.getState().settle();
  await figures();
  return st;
}

/** The full table waits behind "All figures": opened once, it stays open. */
async function figures() {
  const fold = await screen.findByRole('button', { name: /^All figures/ });
  if (fold.getAttribute('aria-expanded') !== 'true') fireEvent.click(fold);
  return screen.findByRole('table');
}
const table = () => {
  const fold = screen.getByRole('button', { name: /^All figures/ });
  if (fold.getAttribute('aria-expanded') !== 'true') fireEvent.click(fold);
  return screen.getByRole('table');
};
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
    // One gold action, and the page says what to press: the example of a late landing, then “+ Add a landing”.
    expect(main.textContent).toMatch(/Press the example\. Then add a landing of your own\./);
    // The assistant's way in stands under it, as the Ask box's own example.
    expect(main.textContent).toMatch(/Compare this to every landing site/);
    expect(main.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /What if our landing is 5 days late\?/ }).className).toMatch(/\bbtn-primary\b/);
    expect(screen.getByRole('link', { name: 'Explore' }).getAttribute('href')).toBe('/explore');
  });

  it('runs the five-day slip in one press: the original landing, the same site five days later, and the nearby site that works better', async () => {
    await example();
    const heads = within(table()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Landing', 'Your landingOriginal landing', 'Landing 25 days later', 'Landing 3Nearby: de Gerlache rim summit']);
    // Each site says what kind of point it is: a region's centre, or a high point worked out from the heights.
    expect(row('Site')).toEqual(['de Gerlache Rim 2Centre of a region, ±5 km', 'de Gerlache Rim 2', 'de Gerlache rim summitDerived high point, not checked as safe to land12 km from de Gerlache Rim 2']);
    expect(row('Landing (UTC)')).toEqual(['1 Jan 2027, 00:00 UTC', '6 Jan 2027, 00:00 UTC5 days later', '6 Jan 2027, 00:00 UTC5 days later']);
    // Absolute figures, and the change from the baseline under each.
    expect(row('Time with power')).toEqual(['3 d 4 h', '10 h−2 d 18 h, worse', 'all 30 daysBest+26 d 20 h, better']);
    expect(row('Radio contact while it has power')).toEqual(['none', 'noneno change', '14 d 15 hBest+14 d 15 h, better']);
    expect(row('Sunlight')[2]).toBe('100 %Best+55 points, better');
    expect(row('First sunset after landing')).toEqual(['2 d 19 h', 'night at landing, rises after 14 d 10 hwas 2 d 19 h, worse', 'none in the periodwas 2 d 19 h, better']);
    // What changed at the original site, then which alternative works better and why, with the trade-offs.
    const story = screen.getByRole('region', { name: 'Which landing works best' });
    // One line first: which landing works best, and the figure that decides it; its card carries the mark.
    expect(story.textContent).toMatch(
      /“Nearby: de Gerlache rim summit” works best of these 3 landings: power for all 30 days, the longest here, with 14 days 15 hours of radio contact while it has power\. de Gerlache rim summit is a high point worked out from the heights, not checked for landing\./,
    );
    expect(screen.getByRole('group', { name: 'Landing 3: Nearby: de Gerlache rim summit' }).textContent).toMatch(/Works best/);
    expect(screen.getByRole('group', { name: 'Your landing: Original landing' }).textContent).not.toMatch(/Works best/);
    // The longest time without Earth is cut by the period's ends ("at least"), so no cell of it is marked.
    expect(row('Longest time without Earth').join(' ')).not.toMatch(/Best/);
    expect(story.textContent).toMatch(/Landing times differ: dates change as well as places\./);
    expect(story.textContent).toMatch(/5 days later: power for 10 hours instead of 3 days 4 hours\. The period starts at night/);
    expect(story.textContent).toMatch(/de Gerlache rim summit \(12 km, not checked for landing\) works better than “5 days later” at the same landing time: power for all 30 days instead of 10 hours\./);
    // The trade-offs repeat the table's rows in words: one tap away, in their fold.
    const why = within(story).getByRole('button', { name: /What changed and why/ });
    expect(why.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(why);
    expect(within(story).getByRole('button', { name: /The trade-offs/ }).getAttribute('aria-expanded')).toBe('false');
    expect(within(story).getAllByRole('listitem', { hidden: true }).map((li) => li.textContent)).toEqual(
      expect.arrayContaining(['Sunlight: 100 % against 41 %: better.', 'Radio contact while it has power: 14 days 15 hours against none: better.']),
    );
    // What the figures assume, and do not show, one tap away.
    expect(screen.getByRole('button', { name: /Assumptions and limits/ }).getAttribute('aria-expanded')).toBe('false');
    // The winner's card says why in a few words, with its time with power and radio contact as the table gives them.
    const winner = screen.getByRole('group', { name: 'Landing 3: Nearby: de Gerlache rim summit' });
    expect(winner.textContent).toMatch(/all 30 days\s*with power/);
    expect(winner.textContent).toMatch(/14 d 15 h\s*radio contact/);
    expect(winner.textContent).toMatch(/Longest time with power/);
    // The key figures as bars, one per landing, with the table's values and marks in words.
    const bars = within(screen.getByRole('group', { name: 'Time with power' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(bars).toEqual(['Your landing3 d 4 h', 'Landing 210 h', 'Landing 3all 30 daysBest']);
    expect(screen.getByRole('group', { name: 'Time with power' }).querySelectorAll('[data-bar]')).toHaveLength(3);
    // Each landing's stay as three lanes, with the same in words for a screen reader.
    const strips = screen.getByRole('region', { name: 'Hour by hour' });
    expect(strips.querySelectorAll('[data-strip]')).toHaveLength(3);
    expect(strips.querySelectorAll('[data-lane]')).toHaveLength(9);
    expect(strips.textContent).toMatch(/Sunlight 100\s% of the stay, Earth in view 49\s%, radio contact while it has power 14 days 15 hours\. The battery never runs out\./);
    expect(strips.textContent).toMatch(/radio contact while it has power none\. The battery first runs out after 10 hours\./);
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
    await figures();
    expect(names.map(row)).toEqual(before);
  });

  it('carries the requirements in its address and its brief, so a fresh browser checks every scenario against the same ones', async () => {
    const st = stores();
    st.explore.getState().setRequirements({ minPoweredH: 120 });
    const first = await example(st);
    const req = { ...NO_REQUIREMENTS, minPoweredH: 120 };
    const href = comparisonHref(first.scenarios.getState().scenarios, '/compare', req);
    expect(href).toMatch(/&minpower=120$/);
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(href));
    expect(screen.getByRole('link', { name: 'Printable comparison brief' }).getAttribute('href')).toBe(comparisonHref(first.scenarios.getState().scenarios, '/compare/brief', req));
    // The link copied holds them, and says so.
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy the link' }));
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Link copied. It holds every setting of every landing, and your requirements.'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${href}`);
    vi.unstubAllGlobals();
    const before = row('Your requirements');
    cleanup();
    // A colleague's browser, with requirements of its own: the link's replace them.
    window.history.replaceState(null, '', href);
    const fresh = stores();
    fresh.explore.getState().setRequirements({ maxOutageH: 72 });
    await open(fresh);
    await waitFor(() => expect(fresh.scenarios.getState().scenarios).toHaveLength(3));
    expect(fresh.explore.getState().requirements).toEqual(req);
    await fresh.scenarios.getState().settle();
    await figures();
    expect(row('Your requirements')).toEqual(before);
  });

  it('opens a scenario file with the requirements it was saved with, and says they are set', async () => {
    const first = await example();
    const req = { ...NO_REQUIREMENTS, maxOutageH: 72 };
    const cols = columnsOf(first.scenarios.getState().scenarios, first.scenarios.getState().runs, first.explore.getState().sites, req);
    const text = JSON.stringify(scenarioFile(cols, { data: null, ephemeris: null, sites: null, terrain: null }, new Date(), req));
    cleanup();
    window.history.replaceState(null, '', '/compare');
    const st = stores();
    await open(st);
    const input = screen.getByLabelText('Open a saved comparison') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([text], 'earthrise-comparison.json', { type: 'application/json' })] } });
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('The file’s 3 landings replace the ones that were on this page, and the requirements saved with it are set.'));
    expect(st.scenarios.getState().scenarios).toHaveLength(3);
    expect(st.explore.getState().requirements).toEqual(req);
    await st.scenarios.getState().settle();
    await waitFor(() => expect(within(table()).getByRole('rowheader', { name: 'Your requirements' })).toBeTruthy());
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
    const card = await screen.findByRole('group', { name: 'Your landing: Original landing' });
    // Alone, the baseline has nothing to compare with yet: the scenarios come first, with what to do next.
    expect(card).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Which landing works best' })).toBeNull();
    expect(screen.getByRole('main').textContent).toMatch(/Your landing is 1 January 2027, 00:00 UTC\. Now add a second landing to compare\./);
    // “+ Add a landing” is the one gold control, open already, with its three plain ways.
    const add = screen.getByRole('button', { name: /Add a landing Another place, another date, or both/ });
    expect(add.className).toMatch(/\bbtn-primary\b/);
    expect(add.getAttribute('aria-expanded')).toBe('true');
    const ways = screen.getByRole('region', { name: 'Add a landing to compare' });
    expect(within(ways).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Same place, later date', 'A place nearby, same date', 'Any place and date']);
    fireEvent.click(within(ways).getByRole('button', { name: 'Add a landing 5 days later' }));
    await waitFor(() => expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['Original landing', '5 days later']));
    // With two landings the ways close, behind the button that opens them; the keyboard stays on it.
    expect(screen.queryByRole('region', { name: 'Add a landing to compare' })).toBeNull();
    expect(add.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(add);
  });

  it('slips a scenario by any number of days or hours, five days later to begin with', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    await screen.findByRole('group', { name: 'Your landing: Original landing' });
    const card = screen.getByRole('form', { name: 'Same place, later date' });
    expect(within(card).getByRole('button', { name: 'Add a landing 5 days later' })).toBeTruthy();
    fireEvent.change(within(card).getByRole('spinbutton', { name: 'Move the landing by' }), { target: { value: '12' } });
    fireEvent.change(within(card).getByRole('combobox', { name: 'Days or hours' }), { target: { value: 'hours' } });
    fireEvent.change(within(card).getByRole('combobox', { name: 'Later or earlier' }), { target: { value: 'earlier' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Add a landing 12 hours earlier' }));
    await waitFor(() =>
      expect(st.scenarios.getState().scenarios.map((s) => [s.label, s.startUtc])).toEqual([
        ['Original landing', '2027-01-01T00:00:00'],
        ['12 hours earlier', '2026-12-31T12:00:00'],
      ]),
    );
  });

  it('adds a landing at any place and date from the site list, the lander and the stay kept', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    await screen.findByRole('group', { name: 'Your landing: Original landing' });
    const any = screen.getByRole('form', { name: 'Any place and date' });
    // Nothing to add until the place or the date differs from the landing copied.
    expect((within(any).getByRole('button', { name: 'Add this landing' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(any).getByRole('button', { name: /^Landing site: de Gerlache Rim 2/ }));
    fireEvent.click(within(any).getByRole('button', { name: 'Malapert Massif' }));
    fireEvent.change(within(any).getByLabelText('Landing date (UTC)'), { target: { value: '2027-02-10' } });
    fireEvent.click(within(any).getByRole('button', { name: 'Add this landing' }));
    await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(2));
    expect(st.scenarios.getState().scenarios[1]).toMatchObject({ siteId: 'malapert_massif', startUtc: '2027-02-10T00:00:00', days: 30, label: 'Malapert Massif, 10 Feb 2027', timing: 'set' });
    expect(await screen.findByRole('group', { name: 'Landing 2: Malapert Massif, 10 Feb 2027' })).toBeTruthy();
  });

  it('finds the best place nearby from the same choices, on the same date', async () => {
    const st = stores();
    await open(st);
    baselineOf(st);
    await screen.findByRole('group', { name: 'Your landing: Original landing' });
    fireEvent.click(within(screen.getByRole('group', { name: 'A place nearby, same date' })).getByRole('button', { name: 'Find the best place nearby' }));
    await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(2), { timeout: 20_000 });
    expect(st.scenarios.getState().scenarios[1].startUtc).toBe(st.scenarios.getState().scenarios[0].startUtc);
    expect(st.scenarios.getState().scenarios[1].label).toMatch(/^Nearby: /);
  });

  it('changes a scenario’s site, landing hour, stay and lander on their own, leaving the others as they were', async () => {
    const st = stores();
    await open(st);
    const a = baselineOf(st);
    const b = st.scenarios.getState().duplicate(a)!;
    const card = await screen.findByRole('group', { name: 'Landing 2: Copy of Original landing' });
    fireEvent.click(within(card).getByRole('button', { name: 'Edit “Copy of Original landing”: its place, date and lander' }));
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
    const base = await screen.findByRole('group', { name: 'Your landing: Original landing' });
    expect(within(base).queryByRole('button', { name: /^Remove/ })).toBeNull();
    const other = screen.getByRole('group', { name: 'Landing 2: 1 day later' });
    fireEvent.click(within(other).getByRole('button', { name: /^More/ }));
    fireEvent.click(within(other).getByRole('button', { name: 'Make this your landing' }));
    expect(st.scenarios.getState().scenarios.map((s) => s.label)).toEqual(['1 day later', 'Original landing']);
    const moved = await screen.findByRole('group', { name: 'Landing 2: Original landing' });
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
    const input = screen.getByLabelText('Open a saved comparison') as HTMLInputElement;
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
    await figures();
    expect(row('Best landing time at this place')[0]).toBe('20 Jan 2027, 10:00 UTCpower 12 d 15 hAdd it');
    // The row waits one tap on its name away.
    const own = within(table()).getByRole('button', { name: 'Best landing time at this place' });
    expect(own.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(own);
    fireEvent.click(within(table()).getByRole('button', { name: 'Add “Original landing” at this landing time' }));
    await st.scenarios.getState().settle();
    await waitFor(() => expect(row('Landing (UTC)')[1]).toBe('20 Jan 2027, 10:00 UTC19 days 10 hours laterthe site’s own best time'));
    expect(screen.getByRole('region', { name: 'Which landing works best' }).textContent).toMatch(
      /“de Gerlache Rim 2’s own best time” lands at de Gerlache Rim 2’s own best time in its period, not a time it shares by choice\./,
    );
  });

  it('keeps the table in its own scrolling box on a phone, its row names in view, and at most one gold action', async () => {
    await example();
    const box = screen.getByRole('region', { name: 'The landings side by side' });
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

  it('keeps each scenario’s terrain versions one tap on the row’s name away', async () => {
    const st = stores();
    // Three versions of each site's ground, each the site's own skyline: every version gives the app's own verdict.
    const mask = (id: string) => Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${id}.json`).elevation_deg);
    const versions = { load: async (id: string) => ({ siteId: id, mastM: 2, adjusted: mask(id), masks: [mask(id), mask(id), mask(id)] }), runner: new VersionsClient() };
    render(<CompareView store={st.explore} scenarios={st.scenarios} terrainVersions={versions} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare landings' })).toBeTruthy(), { timeout: 20_000 });
    fireEvent.click(screen.getByRole('button', { name: /What if our landing is 5 days late\?/ }));
    await waitFor(() => expect(st.scenarios.getState().scenarios).toHaveLength(3), { timeout: 20_000 });
    await st.scenarios.getState().settle();
    await figures();
    const cells = () => Array.from(within(table()).getByRole('rowheader', { name: 'Terrain versions' }).parentElement!.querySelectorAll('td')).map((td) => visibleWords(td, WIDE).join(' '));
    // Closed, the row gives its name only, so the comparison keeps to its words.
    expect(cells()).toEqual(['', '', '']);
    const toggle = within(table()).getByRole('button', { name: 'Terrain versions' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(cells()).toEqual(['3 of 3 keep its verdict power 3 d 4 h', '3 of 3 keep its verdict power 10 h', '3 of 3 keep its verdict power all 30 days']), { timeout: 20_000 });
    fireEvent.click(toggle);
    expect(cells()).toEqual(['', '', '']);
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
