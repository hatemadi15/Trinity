// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
import { comparisonHref } from '@/lib/scenario/codec';
import type { Scenario } from '@/lib/scenario/scenario';
import { APP } from '@/lib/scenario/versions';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { ComparisonBrief } from './ComparisonBrief';

const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
const later: Scenario = { ...base, id: 'b', label: '5 days later', startUtc: '2027-01-06T00:00:00', from: 'a' };
const near: Scenario = { ...later, id: 'c', label: 'Nearby: de Gerlache rim summit', siteId: 'de_gerlache_center_rim_high', from: 'b' };

async function open(ready = () => screen.getByText('Earthrise comparison brief'), setup: (explore: ReturnType<typeof createExploreStore>) => void = () => {}) {
  const loaders = fileLoaders();
  const explore = createExploreStore(loaders);
  setup(explore);
  const scenarios = createScenarioStore(explore, loaders);
  render(<ComparisonBrief store={explore} scenarios={scenarios} />);
  await waitFor(() => expect(ready()).toBeTruthy(), { timeout: 20_000 });
  await scenarios.getState().settle();
  await waitFor(() => expect(screen.queryByText('Working out the figures…')).toBeNull());
  return scenarios;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/compare/brief');
});

describe('ComparisonBrief', () => {
  it('prints the comparison of its link: the settings in UTC, the comparison in words and the figures side by side', async () => {
    window.history.replaceState(null, '', comparisonHref([base, later, near], '/compare/brief'));
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Original landing and 2 more scenarios');
    const main = screen.getByRole('main');
    expect(main.classList.contains('brief')).toBe(true);
    expect(main.textContent).toMatch(/Baseline: de Gerlache Rim 2, landing 1 January 2027, 00:00 UTC, 30 days\. All times are UTC\./);
    expect(main.textContent).toMatch(/Landing times differ/);
    expect(main.textContent).toMatch(/de Gerlache rim summit, 12 km from de Gerlache Rim 2 and unchecked for landing, works better than “5 days later” at the same landing time/);
    const table = within(screen.getByRole('region', { name: 'The scenarios side by side' })).getByRole('table');
    const power = within(table).getByRole('rowheader', { name: 'Time with power' }).parentElement!;
    expect(Array.from(power.querySelectorAll('td')).map((td) => td.textContent)).toEqual(['3 d 4 h', '10 h−2 d 18 h against the baseline, worse', 'all 30 days+26 d 20 h against the baseline, better']);
  });

  it('gives each scenario’s place, times, lander and the source of its hills, and the verdict with its reasons', async () => {
    window.history.replaceState(null, '', comparisonHref([base, later, near], '/compare/brief'));
    await open();
    const each = screen.getByRole('heading', { name: 'Each scenario' }).parentElement!;
    expect(each.textContent).toMatch(/de Gerlache Rim 2 \(88\.280° S, 64\.310° W\)\. The rough centre of a wider region, give or take 5\u00a0km, not a chosen landing point\. Landing 1 January 2027, 00:00 UTC; the stay ends 31 January 2027, 00:00 UTC\./);
    // A high point worked out from the heights says it has not been checked as a place to land.
    expect(each.textContent).toMatch(/de Gerlache rim summit \(88\.664° S, 68\.406° W\)\. A derived point: .* It has not been checked as a safe place to land\./);
    expect(each.textContent).toMatch(/Small lander: 4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, battery 100 % full at landing\./);
    expect(each.textContent).toMatch(/Skyline: hills precomputed from NASA LOLA elevation grids \(20 m within 6 km, 80 m to 100 km, 240 m to 220 km\), from a 2 m mast; site height 190 m\./);
    expect(each.textContent).toMatch(/Landing at de Gerlache Rim 2 on 6 January: power for 10 hours, then night\./);
  });

  it('says what the figures assume and do not show, where the data came from, the versions, and the link that opens it again', async () => {
    const href = comparisonHref([base, later], '/compare/brief');
    window.history.replaceState(null, '', href);
    await open();
    const main = screen.getByRole('main');
    expect(main.textContent).toMatch(/It is not a working radio link: antennas, the link budget and time on a ground station are not modelled\./);
    expect(main.textContent).toMatch(/None of the figures shows landing safety/);
    expect(main.textContent).toMatch(/NASA LRO LOLA polar elevation models/);
    expect(main.textContent).toContain(`Earthrise ${APP.version}`);
    expect(main.textContent).toContain(`The same comparison opens again at ${window.location.origin}${comparisonHref([base, later])}`);
    expect(screen.getByRole('link', { name: 'Back to Compare' }).getAttribute('href')).toBe(comparisonHref([base, later]));
    expect(screen.getByRole('button', { name: 'Print or save as PDF' })).toBeTruthy();
  });

  it('prints each scenario’s requirement checks, met or failed with the value and the margin, once a requirement is set', async () => {
    window.history.replaceState(null, '', comparisonHref([base, near], '/compare/brief'));
    await open(undefined, (explore) => explore.getState().setRequirements({ minPoweredH: 120 }));
    const table = within(screen.getByRole('region', { name: 'The scenarios side by side' })).getByRole('table');
    const row = within(table).getByRole('rowheader', { name: 'Your requirements' }).parentElement!;
    expect(Array.from(row.querySelectorAll('td')).map((td) => td.textContent)).toEqual([
      'Fails your requirement.Fails Power for at least 5 d: 3 d 4 h, 1 d 20 h short',
      'Meets your requirement.1 fewer failed against the baseline, betterMeets Power for at least 5 d: 30 d, 25 d to spare',
    ]);
  });

  it('reads the requirements its link names, checks every scenario against them, and gives them to the way back', async () => {
    const req = { ...NO_REQUIREMENTS, minPoweredH: 120 };
    window.history.replaceState(null, '', comparisonHref([base, near], '/compare/brief', req));
    await open();
    const table = within(screen.getByRole('region', { name: 'The scenarios side by side' })).getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Your requirements' }).parentElement!.textContent).toContain('Fails Power for at least 5 d: 3 d 4 h, 1 d 20 h short');
    expect(screen.getByRole('link', { name: 'Back to Compare' }).getAttribute('href')).toBe(comparisonHref([base, near], '/compare', req));
    expect(screen.getByRole('main').textContent).toContain(`The same comparison opens again at ${window.location.origin}${comparisonHref([base, near], '/compare', req)}`);
  });

  it('says so when there is no comparison to print', async () => {
    await open(() => screen.getByText('There is no comparison to print yet: make one on Compare first.'));
    expect(screen.queryByRole('button', { name: 'Print or save as PDF' })).toBeNull();
  });
});
