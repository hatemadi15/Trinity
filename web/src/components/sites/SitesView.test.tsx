// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { exploreHref, SitesView } from './SitesView';

async function ready() {
  const store = createExploreStore(fileLoaders());
  const view = render(<SitesView store={store} navigate={() => {}} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
  return { store, ...view };
}
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;

describe('exploreHref', () => {
  it('carries the site and the period, with the hour only when it is not midnight', () => {
    expect(exploreHref('nobile_rim_1', '2027-01-01T00:00:00', 30)).toBe('/explore?site=nobile_rim_1&start=2027-01-01&days=30');
    expect(exploreHref('nobile_rim_1', '2027-01-20T10:00:00', 14)).toBe('/explore?site=nobile_rim_1&start=2027-01-20T10:00&days=14');
  });
});

describe('SitesView', () => {
  it('titles the page, says what the figures assume and groups the catalogue in plain words', async () => {
    await ready();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose a landing site');
    expect(screen.getByText(/19 places on the Moon/).textContent).toMatch(/4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery.*in the 30 days from 1 January 2027/);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Shortlisted by NASA for a crewed Artemis landing',
      'Where commercial landers touched down',
      'High points and crater floors',
      'Somewhere else',
    ]);
    expect(screen.getByText(/Each figure is for the centre of the region/)).toBeTruthy();
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(0);
  });

  it('gives each site its sunlight, its contact with Earth and its longest time with power', async () => {
    await ready();
    const row = rowOf('de Gerlache Rim 2');
    expect(row.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(row.textContent).toMatch(/A ridge on a crater rim, 52 km from the pole/);
    // A number keeps its percent sign on the same line: a no-break space between them.
    expect(row.textContent).toMatch(/Sunlight 45 %/);
    expect(row.textContent).toMatch(/Earth in view 45 %/);
    expect(row.textContent).toMatch(/Longest time with power 12 d 15 h, landing 20 Jan/);
  });

  it('says in words when a site has no sunlight or no contact with Earth', async () => {
    await ready();
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No sunlight/);
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No power from the Sun/);
    expect(rowOf('Mons Mouton').textContent).toMatch(/No contact with Earth/);
    expect(rowOf('Shackleton rim summit').textContent).toMatch(/all 30 days/);
  });

  it('sorts each group by time with power once every figure is in', async () => {
    const { store } = await ready();
    const first = screen.getAllByRole('list')[0];
    const hours = [...first.querySelectorAll<HTMLElement>('a[data-row]')].map((a) => store.getState().overview[a.dataset.row!].best?.poweredHours ?? -1);
    expect(hours).toHaveLength(9);
    expect(hours).toEqual([...hours].sort((a, b) => b - a));
  });

  it('pins every site that lies on the map, each a link with the site name', async () => {
    await ready();
    const map = screen.getByRole('region', { name: 'Map of the sites' });
    const pins = within(map).getAllByRole('link');
    expect(pins).toHaveLength(17);
    expect(within(map).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(map.textContent).toMatch(/IM-1 Odysseus and Blue Ghost Mission 1 lie outside this map/);
  });

  it('lights the pin of the row under the pointer, and the row of the pin', async () => {
    await ready();
    const map = screen.getByRole('region', { name: 'Map of the sites' });
    fireEvent.mouseEnter(rowOf('Haworth'));
    expect(within(map).getByRole('link', { name: 'Haworth' }).getAttribute('data-active')).toBe('true');
    fireEvent.mouseLeave(rowOf('Haworth'));
    fireEvent.mouseEnter(within(map).getByRole('link', { name: 'Slater Plain' }));
    expect(rowOf('Slater Plain').getAttribute('data-active')).toBe('true');
  });

  it('redoes the figures for another period', async () => {
    const { store } = await ready();
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(store.getState().days).toBe(14);
    await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
    await waitFor(() => expect(rowOf('de Gerlache Rim 2').getAttribute('href')).toMatch(/days=14/));
    expect(screen.getByText(/19 places on the Moon/).textContent).toMatch(/in the 14 days from 1 January 2027/);
  });

  it('shows the rows before the figures arrive', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const base = fileLoaders();
    const store = createExploreStore({
      ...base,
      loadMask: async (id) => {
        if (id !== 'de_gerlache_rim_2') await gate;
        return base.loadMask(id);
      },
    });
    render(<SitesView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('link').some((a) => a.dataset.row === 'haworth')).toBe(true));
    expect(rowOf('Haworth').textContent).toMatch(/working it out/);
    release();
    await waitFor(() => expect(rowOf('Haworth').textContent).toMatch(/Sunlight \d+ %/), { timeout: 20_000 });
  });

  it('computes a place that is not in the list and opens it', async () => {
    const navigate = vi.fn();
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 0, failedTiles: 0 }));
    const store = createExploreStore(fileLoaders({ computeMask }));
    render(<SitesView store={store} navigate={navigate} />);
    await waitFor(() => expect(store.getState().status).toBe('ready'));
    fireEvent.change(screen.getByLabelText('Latitude (°)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute this place' }));
    expect(screen.getByRole('alert').textContent).toMatch(/south of 60° S/);
    expect(computeMask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Latitude (°)'), { target: { value: '-88.2' } });
    fireEvent.change(screen.getByLabelText('Longitude (°)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute this place' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/explore'));
    expect(computeMask).toHaveBeenCalledWith(-88.2, 40, 2);
    expect(store.getState().site?.category).toBe('custom');
  });

  it('says what to do when the data files are missing', async () => {
    const store = createExploreStore({
      loadSites: async () => {
        throw new Error('could not load /data/sites.json (HTTP 404)');
      },
      loadEphemeris: async () => {
        throw new Error('could not load /data/ephemeris/x (HTTP 404)');
      },
      loadMask: async () => {
        throw new Error('could not load /data/masks/x (HTTP 404)');
      },
    });
    render(<SitesView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/sync-local/));
  });
});
