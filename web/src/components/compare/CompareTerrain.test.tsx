// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompareView } from '@/components/CompareView';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore, type Loaders } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { findingsWith, LOST_TILE } from '@/test/terrain';

const NBSP = ' ';
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

async function compare(loaders: Loaders) {
  const store = createExploreStore(loaders);
  render(<CompareView store={store} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeTruthy(), { timeout: 20_000 });
  await act(async () => {
    await store.getState().addToCompare(RIM.id);
    await store.getState().addToCompare(SUMMIT.id);
  });
  return store;
}

describe('Compare shows only figures from the chosen mast, and what limits their terrain', () => {
  it('keeps every compared site in the table while its hills for a new mast are worked out, and names no best site until all are in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = await compare(fileLoaders({ computeMask: worker(gate) }));
    const main = screen.getByRole('main');
    expect(main.textContent).toMatch(/The hills are seen from a 2 m mast at every site\./);
    act(() => store.getState().setParams({ mastM: 5 }));
    expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toBe('Working out the hills seen from a 5 m mast for 2 sites…');
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.textContent).toMatch(/working it out…/);
    expect(main.textContent).not.toMatch(/Landing on 1 January, /);
    act(() => release());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The hills behind these figures' })).toBeNull(), { timeout: 20_000 });
    await waitFor(() => expect(main.textContent).toMatch(/Landing on 1 January, de Gerlache rim summit has the longest time with power/));
    expect(main.textContent).toMatch(/The hills are seen from a 5 m mast at every site\./);
    expect(store.getState().compare.map((r) => r.mastM)).toEqual([5, 5]);
  });

  it('marks a site whose terrain is incomplete, says what is missing, and names no site for a measure it would win', async () => {
    const store = await compare(fileLoaders({ computeMask: worker(Promise.resolve(), true) }));
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(store.getState().compare).toHaveLength(2), { timeout: 20_000 });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const summit = rows.find((r) => /rim summit/.test(r.textContent ?? ''))!;
    expect(within(summit).getByText('terrain incomplete')).toBeTruthy();
    const main = screen.getByRole('main');
    expect(main.textContent).toMatch(/de Gerlache rim summit: Terrain incomplete: the elevation map is missing in 7 of 720 directions, from 100 km out\./);
    // The summit would win every measure (all 30 days with power, 100 % sunlight, 49 % against 45 % of Earth in
    // view): none is named, and the sentence says why.
    expect(main.textContent).toMatch(
      /The terrain at de Gerlache rim summit is incomplete, so no site is named for the longest time with power, the most sunlight or the most contact with Earth: its figures may be too high\./,
    );
    expect(main.textContent).not.toMatch(/Landing on 1 January, /);
    // Its row keeps its figures, marked, and the rim's row is as it was.
    expect(summit.textContent).toContain(`100${NBSP}%`);
  });
});
