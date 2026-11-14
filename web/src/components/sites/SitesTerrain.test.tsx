// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SitesView } from '@/components/sites/SitesView';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore, type Loaders } from '@/lib/store/explore';
import { fileLoaders, sites } from '@/test/file-loaders';
import { findingsWith, LOST_TILE } from '@/test/terrain';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';

/** A worker that returns each catalogue site's own skyline once `gate` opens; the march at `lostId` lost a tile. */
function worker(gate: Promise<void>, lostId?: string): NonNullable<Loaders['computeMask']> {
  return async (lat, lon) => {
    await gate;
    const site = sites.find((x) => Math.abs(x.lat - lat) < 1e-6 && Math.abs(x.lon - lon) < 1e-6)!;
    const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${site.id}.json`).elevation_deg);
    return { mask, siteHeightM: 100, failedTiles: 0, terrain: findingsWith(site.id === lostId ? LOST_TILE : {}) };
  };
}

async function list(loaders: Loaders) {
  const store = createExploreStore(loaders);
  render(<SitesView store={store} navigate={() => {}} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
  return store;
}
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;
const polar = sites.filter((x) => x.polar && x.category !== 'custom').length;

describe('the site list shows only figures from the chosen mast, and what limits their terrain', () => {
  it('says how many sites wait for their hills at a new mast height, and fills each row from that height', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = await list(fileLoaders({ computeMask: worker(gate) }));
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toBe(`Working out the hills seen from a 5 m mast for ${polar} sites…`));
    expect(rowOf('Haworth').textContent).toMatch(/working it out/);
    // The line sits over the rows that wait, so the first screen keeps to its 105 words (spec 20.1).
    const main = document.querySelector('main')!;
    // The title band, the three steps and the map: the part a first screen shows (spec 23's layout).
    const top = [...main.children].filter((el) => !el.classList.contains('wrap') || el.tagName === 'OL');
    const map = main.querySelector('section[aria-label="Map of the sites"]')!;
    for (const width of [WIDE, PHONE]) expect([...top, map].reduce((sum, el) => sum + visibleWords(el, width).length, 0)).toBeLessThanOrEqual(105);
    act(() => release());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The hills behind these figures' })).toBeNull(), { timeout: 30_000 });
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 30_000 });
    for (const o of Object.values(store.getState().overview)) expect(o.mastM).toBe(5);
    // The method, one point away, names the height the hills are seen from.
    fireEvent.click(screen.getByRole('button', { name: 'How these figures are counted' }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/, the hills seen from a 5 m mast\./);
    expect(rowOf('Blue Ghost').textContent).toMatch(/flat horizon assumed/);
  });

  it('marks a row whose terrain is incomplete, ranks it after the others, and does not name it as the longest time with power', async () => {
    // At 2 m the de Gerlache rim summit tops the list: all 30 days with power, and more Earth in view than the Shackleton rim summit.
    const store = await list(fileLoaders({ computeMask: worker(Promise.resolve(), 'de_gerlache_center_rim_high') }));
    const main = screen.getByRole('main');
    await waitFor(() => expect(main.textContent).toMatch(/Longest time with power in these days: de Gerlache rim summit/), { timeout: 30_000 });
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(store.getState().overview.de_gerlache_center_rim_high?.terrain?.quality).toBe('incomplete'), { timeout: 30_000 });
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 30_000 });
    await waitFor(() => expect(rowOf('de Gerlache rim summit').textContent).toMatch(/terrain incomplete/));
    // Its figures, too high if anything, beat the Shackleton rim summit's: so neither can be named, and the page says why.
    expect(main.textContent).not.toMatch(/Longest time with power in these days:/);
    expect(main.textContent).toMatch(/The longest time with power is not named: the terrain at de Gerlache rim summit is incomplete \(the elevation map is missing in 7 of 720 directions, from 100 km out\), so its figures may be too high\./);
    // Last of its group: the rows with figures that can be trusted come first.
    const group = rowOf('de Gerlache rim summit').closest('section')!;
    const rows = [...group.querySelector('ul')!.querySelectorAll('a[data-row]')].map((a) => (a as HTMLElement).dataset.row);
    expect(rows[rows.length - 1]).toBe('de_gerlache_center_rim_high');
  });
});
