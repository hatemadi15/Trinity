// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompareView } from '@/components/CompareView';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { DEFAULT_POWER } from '@/lib/engine/power';
import type { Scenario } from '@/lib/scenario/scenario';
import { createExploreStore, type Loaders } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { findingsWith, LOST_TILE } from '@/test/terrain';

const maskOf = (id: string) => Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${id}.json`).elevation_deg);
const RIM = { lat: -88.28, id: 'de_gerlache_rim_2' };
const SUMMIT = { lat: -88.66401, id: 'de_gerlache_center_rim_high' };

/** A worker that returns each site's own skyline once `gate` opens; the summit's march lost a tile when `lose`. */
function worker(gate: Promise<void>, lose = false): NonNullable<Loaders['computeMask']> {
  return async (lat) => {
    await gate;
    const site = Math.abs(lat - SUMMIT.lat) < 1e-6 ? SUMMIT : RIM;
    return { mask: maskOf(site.id), siteHeightM: 100, failedTiles: 0, terrain: findingsWith(lose && site === SUMMIT ? LOST_TILE : {}) };
  };
}

/** The five-day slip and the summit nearby, each scenario seen from a 5 m mast: every skyline is traced in the worker. */
async function compare(loaders: Loaders) {
  const explore = createExploreStore(loaders);
  const scenarios = createScenarioStore(explore, loaders);
  render(<CompareView store={explore} scenarios={scenarios} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeTruthy(), { timeout: 20_000 });
  const base: Scenario = { id: 'a', label: 'Original landing', siteId: RIM.id, startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 5, minEarthElDeg: 0, timing: 'set' };
  const later: Scenario = { ...base, id: 'b', label: '5 days later', startUtc: '2027-01-06T00:00:00', from: 'a' };
  const near: Scenario = { ...later, id: 'c', label: 'Nearby: de Gerlache rim summit', siteId: SUMMIT.id, from: 'b' };
  act(() => scenarios.getState().load([base, later, near]));
  return scenarios;
}

describe('Compare shows each scenario’s figures from its own mast, and what limits their terrain', () => {
  it('keeps every scenario while its hills from its own mast are worked out, and names no alternative until all are in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const scenarios = await compare(fileLoaders({ computeMask: worker(gate) }));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).getAllByText('working out…').length).toBeGreaterThan(0);
    expect(screen.getByRole('main').textContent).not.toMatch(/works better than/);
    act(() => release());
    await act(async () => scenarios.getState().settle());
    await waitFor(() => expect(screen.getByRole('main').textContent).toMatch(/de Gerlache rim summit \(12 km, not checked for landing\) works better than “5 days later”/));
    expect(Object.values(scenarios.getState().runs).map((r) => [r.mask?.source, r.mask?.mastM])).toEqual([
      ['computed', 5],
      ['computed', 5],
      ['computed', 5],
    ]);
  });

  it('marks a scenario whose terrain is incomplete, says what is missing, and never names it as working better', async () => {
    const scenarios = await compare(fileLoaders({ computeMask: worker(Promise.resolve(), true) }));
    await act(async () => scenarios.getState().settle());
    const card = await screen.findByRole('group', { name: 'Scenario 3: Nearby: de Gerlache rim summit' });
    await waitFor(() => expect(card.textContent).toMatch(/Terrain incomplete: the elevation map is missing in 7 of 720 directions, from 100 km out\./));
    const main = screen.getByRole('main');
    // The summit would keep power all 30 days: an incomplete terrain can only make its figures too high, so it is not named.
    expect(main.textContent).toMatch(/The terrain at de Gerlache rim summit is incomplete, so it is not named as working better than “5 days later”: its figures may be too high\./);
    expect(main.textContent).not.toMatch(/works better than/);
    // Its column keeps its figures.
    expect(within(screen.getByRole('table')).getByText('all 30 days')).toBeTruthy();
  });
});
