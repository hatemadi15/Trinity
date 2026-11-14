// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data/loaders';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { exploreHref, SitesView } from './SitesView';

async function ready() {
  const store = createExploreStore(fileLoaders());
  const view = render(<SitesView store={store} navigate={() => {}} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(34), { timeout: 20_000 });
  return { store, ...view };
}
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(screen.getByText(/34 places on the Moon/).textContent).toBe('34 places on the Moon, most near the south pole.');
    // What the figures count from, the lander and the order, in plain sentences rather than a list of terms (both
    // readers, part C read 1: the figures differ from Explore's, and this says why), one point away on step 2.
    fireEvent.click(screen.getByRole('button', { name: 'How these figures are counted' }));
    expect(screen.getByRole('tooltip').textContent).toBe(
      "Each site's figures are for landing on its best day of the 30 days from 1 January 2027, the day under its name, and the 30 days after it, for one lander: 4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, the hills seen from a 2 m mast. Explore and Compare start on the first day, so their figures can differ. In each group, the longest time with power comes first.",
    );
    expect(document.querySelector('main dl')).toBeNull();
    expect(screen.getByText(/three real missions, for the same days as the rest of the list/)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Shortlisted by NASA for a crewed Artemis landing',
      'Where commercial landers touched down',
      'Where commercial landers are to land next',
      'Landers from other countries',
      'Where the Apollo crews landed',
      'High points and crater floors',
      'Somewhere else',
    ]);
    expect(screen.getByText(/Each figure is for the centre of the region/)).toBeTruthy();
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(0);
  });

  it('gives each site its sunlight, its contact with Earth and its longest time with power', async () => {
    await ready();
    const row = rowOf('de Gerlache Rim 2');
    // The row opens Explore on the landing day it names, and every figure in the row is one Explore shows there:
    // the sunlight and contact with Earth are for the 30 days from that day.
    expect(row.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-20T10:00&days=30');
    expect(row.textContent).toMatch(/A ridge on a crater rim, 52 km from the pole/);
    // A number keeps its percent sign on the same line: a no-break space between them.
    expect(row.textContent).toMatch(/Sunlight 41 %/);
    expect(row.textContent).toMatch(/Earth in view 54 %/);
    // The landing day comes first, under the name: every figure to its right counts from it.
    expect(row.textContent).toMatch(/de Gerlache Rim 2, Best landing day: 20 Jan/);
    expect(row.textContent).toMatch(/Longest time with power 12 d 15 h/);
    expect(row.textContent).not.toMatch(/if it lands on/);
  });

  it('says in words when a site has no sunlight or no contact with Earth', async () => {
    await ready();
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No sunlight/);
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No power from the Sun/);
    expect(rowOf('Mons Mouton').textContent).toMatch(/No contact with Earth/);
    expect(rowOf('Shackleton rim summit').textContent).toMatch(/all 30 days/);
  });

  it('sorts each group by time with power once every figure is in, and puts places that never see Earth under a heading of their own', async () => {
    const { store } = await ready();
    const group = screen.getByRole('region', { name: 'Shortlisted by NASA for a crewed Artemis landing' });
    const [withContact, without] = within(group).getAllByRole('list');
    const hours = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('a[data-row]')].map((a) => store.getState().overview[a.dataset.row!].best?.poweredHours ?? -1);
    const a = hours(withContact);
    const b = hours(without);
    expect(a.length + b.length).toBe(9);
    expect(a).toEqual([...a].sort((x, y) => y - x));
    expect(b).toEqual([...b].sort((x, y) => y - x));
    // Mons Mouton keeps power for 13 d 7 h but never sees Earth in its first 30 days: it sits under the heading, not among the others.
    expect(within(group).getByRole('heading', { level: 3 }).textContent).toBe('No contact with Earth in the first 30 days');
    expect(group.textContent).toMatch(/These places keep power for a while but cannot reach Earth by radio then\./);
    expect(within(without).getByText('Mons Mouton')).toBeTruthy();
    expect(without.compareDocumentPosition(withContact) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('names the best place of the whole list for these days, with a link to it', async () => {
    const { store } = await ready();
    const line = screen.getByText(/^Longest time with power in these days:/);
    const link = within(line).getByRole('link');
    const id = new URL(link.getAttribute('href')!, 'http://x').searchParams.get('site')!;
    const o = store.getState().overview;
    const best = Math.max(...Object.values(o).filter((x) => x.afterEarth > 0).map((x) => x.best?.poweredHours ?? -1));
    expect(o[id].best?.poweredHours).toBe(best);
    expect(o[id].afterEarth).toBeGreaterThan(0);
    // A high point worked out from the heights is named as one, never as a checked place to land.
    if (id.endsWith('_rim_high')) expect(line.textContent).toMatch(/, a derived high point not checked as safe to land, /);
    else expect(line.textContent).not.toMatch(/derived/);
  });

  it('draws a bar for contact with Earth as it does for sunlight', async () => {
    await ready();
    const row = rowOf('de Gerlache Rim 2');
    const earth = row.querySelector<HTMLElement>('[data-bar="earth"]')!;
    expect(earth.style.width).toBe('54%');
    expect(row.querySelector('[data-bar="sun"]')).toBeTruthy();
  });

  it('pins every site that lies on the map, each a link with the site name', async () => {
    await ready();
    const map = screen.getByRole('region', { name: 'Map of the sites' });
    const pins = within(map).getAllByRole('link');
    expect(pins).toHaveLength(17);
    expect(within(map).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-20T10:00&days=30');
    expect(map.textContent).toMatch(/17 places lie farther from the pole, outside this map\./);
    expect(map.textContent).toMatch(/The south pole is at the centre of the map/);
    // The key to the pins' colours comes before the map, on the first screen.
    const key = within(map).getByText('two weeks or more with power');
    expect(key.compareDocumentPosition(within(map).getAllByRole('link')[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The pole is the map's landmark: its name is written before any other.
    expect(within(map).getByRole('link', { name: 'Lunar south pole' }).querySelector('[data-side]')!.className).not.toMatch(/\bhidden\b/);
    // Names are written on the map where they fit, the rows at the top of the list first.
    const top = document.querySelector<HTMLElement>('main ul a[data-row]')!;
    const pin = within(map).getByRole('link', { name: top.querySelector('span span')!.textContent! });
    expect(pin.querySelector('[data-side]')!.className).not.toMatch(/\bhidden\b/);
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

  it('says what the page does in three steps on the page itself, with the method one point away (spec 23)', async () => {
    await ready();
    const steps = screen.getByRole('list', { name: 'How to choose' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.querySelector('.display')!.textContent)).toEqual(['Pick the dates', 'Compare the places', 'Open one']);
    // The dates are chosen in step 1 itself.
    expect(within(steps).getByLabelText('For')).toBeTruthy();
    // No fold: the method is a tip, shown while the pointer or the focus is on its "i", or after a tap, and gone on Escape.
    expect(screen.queryByRole('button', { name: /How these figures are counted/, expanded: true })).toBeNull();
    const tip = screen.getByRole('button', { name: 'How these figures are counted' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(tip.parentElement!);
    expect(screen.getByRole('tooltip').textContent).toMatch(/^Each site's figures are for landing on its best day/);
    fireEvent.keyDown(tip, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    // Each column says what it means the same way, in each of the six groups.
    for (const name of ['What Sunlight means', 'What Earth in view means', 'What Longest time with power means']) expect(screen.getAllByRole('button', { name }).length).toBe(6);
  });

  it('keeps the first screen to 105 words before a tap, at 1440 and on a phone (spec 20.1; spec 23 says on the page in three steps what the fold hid)', async () => {
    await ready();
    // From the heading down to the map, the part a first screen shows: the title band, the three steps and the map.
    const main = document.querySelector('main')!;
    const top = [...main.children].filter((el) => !el.classList.contains('wrap') || el.tagName === 'OL');
    const map = main.querySelector('section[aria-label="Map of the sites"]')!;
    for (const width of [WIDE, PHONE]) {
      const n = [...top, map].reduce((sum, el) => sum + visibleWords(el, width).length, 0);
      expect(n, `${width} px`).toBeLessThanOrEqual(105);
    }
  });

  it('says on every row what kind of point the site is, with the radius where it is known', async () => {
    await ready();
    expect(rowOf('Apollo 11').textContent).toMatch(/Surveyed point/);
    expect(rowOf("Chang'e 4").textContent).toMatch(/Surveyed point, ±20\u00a0m/);
    expect(rowOf('Haworth').textContent).toMatch(/Centre of a region, ±5\u00a0km/);
    expect(rowOf('Luna 25 target').textContent).toMatch(/Landing target, ±15\u00a0km/);
    expect(rowOf('IM-3 Reiner Gamma').textContent).toMatch(/Landing target/);
    expect(rowOf('Lunar south pole').textContent).toMatch(/Reference point/);
    // A high point worked out from the heights is never offered as a checked place to land.
    expect(rowOf('Shackleton rim summit').textContent).toMatch(/Derived high point, not checked as safe to land/);
  });

  it('puts the far side under a heading of its own: Earth never rises there, and the relay lesson is told', async () => {
    await ready();
    const group = screen.getByRole('region', { name: 'Landers from other countries' });
    const heading = within(group).getAllByRole('heading', { level: 3 }).find((h) => /far side/.test(h.textContent ?? ''))!;
    expect(heading.textContent).toBe('On the far side: Earth never rises');
    expect(group.textContent).toMatch(/a lander there can talk to Earth only through a relay satellite, as Chang'e 4 and Chang'e 6 did through China's Queqiao satellites\./);
    const far = heading.parentElement!.querySelector('ul')!;
    expect([...far.querySelectorAll<HTMLElement>('a[data-row]')].map((a) => a.dataset.row).sort()).toEqual(['change4', 'change6']);
    expect(rowOf("Chang'e 4").textContent).toMatch(/Never: far side/);
    expect(rowOf("Chang'e 4").textContent).not.toMatch(/NaN/);
    expect(rowOf('CP-12 Schrödinger').textContent).toMatch(/Never: far side/);
  });

  it('gives the Apollo landings two weeks of sunlight and Earth in view all the time, for the days chosen above', async () => {
    const { store } = await ready();
    const group = screen.getByRole('region', { name: 'Where the Apollo crews landed' });
    expect(group.textContent).toMatch(/The six crewed landings of 1969 to 1972, near the equator\. Like every row here, the figures are for the days chosen above/);
    const o = store.getState().overview;
    for (const id of ['apollo_11', 'apollo_15']) {
      expect(o[id].afterEarth, id).toBe(1);
      // One sunrise and one sunset a lunar day: about 15 days of light in every 29.5.
      expect(o[id].afterSun, id).toBeGreaterThan(0.45);
      expect(o[id].afterSun, id).toBeLessThan(0.55);
    }
    // Landing at sunrise, the lander keeps power through the two-week day and the battery's first hours of night.
    expect(o.apollo_15.best!.poweredHours).toBeGreaterThan(15 * 24);
    expect(o.apollo_15.best!.poweredHours).toBeLessThan(15.5 * 24);
    // Almost on the equator the midday Sun stands nearly overhead, where the upright panel catches little of it.
    expect(o.apollo_11.best!.poweredHours).toBeLessThan(9 * 24);
    expect(rowOf('Apollo 11').textContent).toMatch(/Earth in view 100\u00a0%/);
  });

  it('redoes the figures for another period', async () => {
    const { store } = await ready();
    fireEvent.change(screen.getByLabelText('For'), { target: { value: '14' } });
    expect(store.getState().days).toBe(14);
    await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(34), { timeout: 20_000 });
    await waitFor(() => expect(rowOf('de Gerlache Rim 2').getAttribute('href')).toMatch(/days=14/));
    fireEvent.click(screen.getByRole('button', { name: 'How these figures are counted' }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/best day of the 14 days from 1 January 2027, the day under its name, and the 14 days after it/);
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

  it('says plainly when the height tiles are missing, and that the places in the list work without them', async () => {
    // A copy set up with the committed data alone: the engine finds no tiles to trace the hills from.
    const computeMask = vi.fn(async () => {
      throw new DataError('/data/tiles/manifest.json', 404);
    });
    const store = createExploreStore(fileLoaders({ computeMask }));
    render(<SitesView store={store} navigate={vi.fn()} />);
    await waitFor(() => expect(store.getState().status).toBe('ready'));
    fireEvent.change(screen.getByLabelText('Latitude (°)'), { target: { value: '-88.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute this place' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That place cannot be worked out here: this copy of Earthrise has no height tiles. The places in the list work without them.'));
  });

  it('names its NASA data', async () => {
    await ready();
    const row = screen.getByLabelText('Data sources');
    // The figures come from horizons on LOLA's 20 m grid near the pole and its 80 m grid farther out, with DE440. The
    // places are NASA's Artemis III regions and the CLPS landings.
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m', 'NASA LRO LOLA 240 m', 'JPL DE440', 'Artemis III regions', 'CLPS mission records', 'LROC and NSSDCA lander positions']);
    // The row is the foot of the list: after its last group, before the place to work out somewhere else.
    const last = screen.getByRole('region', { name: 'High points and crater floors' });
    expect(last.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(screen.getByRole('region', { name: 'Somewhere else' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says in plain words when the data cannot be loaded, and keeps the pipeline command for developers only', async () => {
    const missing = () =>
      createExploreStore({
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
    // Two sentences in two paragraphs, which textContent runs together.
    const plain = /The data could not be loaded\.\s*Reload the page, or try again in a minute\./;
    render(<SitesView store={missing()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // Under next dev, as in tests, the page also names the command that fills web/public/data, then the error.
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<SitesView store={missing()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});
