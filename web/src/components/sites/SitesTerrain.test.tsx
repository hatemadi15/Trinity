// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  render(<SitesView store={store} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
  return store;
}
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;
const markerOf = (name: string | RegExp) => within(screen.getByRole('region', { name: 'Map of the sites' })).getByRole('link', { name });
/** What a site's card on the map says while its marker is pointed at. */
const cardOf = (name: string | RegExp) => {
  fireEvent.mouseEnter(markerOf(name));
  const text = document.querySelector('[data-part="card"]')!.textContent!;
  fireEvent.mouseLeave(markerOf(name));
  return text;
};
const polar = sites.filter((x) => x.polar && x.category !== 'custom').length;

describe('the site list shows only figures from the chosen mast, and what limits their terrain', () => {
  it('says how many sites wait for their hills at a new mast height, and fills each row from that height', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = await list(fileLoaders({ computeMask: worker(gate) }));
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toBe(`Working out the hills seen from a 5 m mast for ${polar} sites…`));
    expect(cardOf('Haworth')).toMatch(/Working it out…/);
    // The line stands under the title, and the first screen still keeps to few words (spec 20.1; 48 without the line).
    const screenful = document.querySelector('[data-part="screen"]')!;
    for (const width of [WIDE, PHONE]) expect(visibleWords(screenful, width).length, `${width} px`).toBeLessThanOrEqual(62);
    act(() => release());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The hills behind these figures' })).toBeNull(), { timeout: 30_000 });
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 30_000 });
    for (const o of Object.values(store.getState().overview)) expect(o.mastM).toBe(5);
    // The method, behind the dates, names the height the hills are seen from.
    fireEvent.click(screen.getByRole('button', { name: /^Dates/ }));
    expect(screen.getByRole('region', { name: 'The dates the figures are for' }).textContent).toMatch(/, the hills seen from a 5 m mast\./);
    expect(cardOf(/^Blue Ghost/)).toMatch(/flat horizon assumed/);
  });

  it('marks a site whose terrain is incomplete on its card and in the list, and ranks it after the others', async () => {
    // At 2 m the de Gerlache rim summit has all 30 days with power, as the Shackleton rim summit has.
    const store = await list(fileLoaders({ computeMask: worker(Promise.resolve(), 'de_gerlache_center_rim_high') }));
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    const group = () => [...screen.getByRole('region', { name: 'High points and crater floors' }).querySelectorAll<HTMLElement>('a[data-row]')].map((a) => a.dataset.row!);
    await waitFor(() => expect(group().slice(0, 2).sort()).toEqual(['de_gerlache_center_rim_high', 'shackleton_center_rim_high']), { timeout: 30_000 });
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(store.getState().overview.de_gerlache_center_rim_high?.terrain?.quality).toBe('incomplete'), { timeout: 30_000 });
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 30_000 });
    await waitFor(() => expect(rowOf('de Gerlache rim summit').textContent).toMatch(/terrain incomplete/));
    // Its figures can only be too high: the card says so beside them, and the page names no site as the best.
    expect(cardOf('de Gerlache rim summit')).toMatch(/terrain incomplete.*Longest with power: /);
    expect(screen.getByRole('main').textContent).not.toMatch(/Longest with power: de Gerlache/);
    // After every site of its group whose figures can be trusted and that sees Earth.
    const o = store.getState().overview;
    const ids = group();
    const trusted = ids.filter((id) => o[id].afterEarth > 0 && o[id].terrain?.quality !== 'incomplete');
    expect(trusted.length).toBeGreaterThan(0);
    expect(ids.indexOf('de_gerlache_center_rim_high')).toBe(trusted.length);
    expect(ids.slice(0, trusted.length)).toEqual(trusted);
  });
});
