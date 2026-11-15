// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { exploreHref, OWN_SITE_HREF, SitesView } from './SitesView';

async function ready() {
  const store = createExploreStore(fileLoaders());
  const view = render(<SitesView store={store} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(34), { timeout: 20_000 });
  return { store, ...view };
}
const map = () => screen.getByRole('region', { name: 'Map of the sites' });
/** A site's marker on the map: a link with the site's full name. */
const markerOf = (name: string) => within(map()).getByRole('link', { name });
const card = () => document.querySelector<HTMLElement>('[data-part="card"]');
/** A pointer going down, as a finger or a mouse (jsdom's own event carries no pointer type). */
const pointerDown = (el: Element, pointerType: 'touch' | 'mouse') => {
  const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  fireEvent(el, e);
};
/** Text with its no-break spaces as plain ones. */
const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');
const openList = () => fireEvent.click(screen.getByRole('button', { name: 'List' }));
/** A site's row in the list, once the list is open. */
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
  it('titles the page in few words: the map, a key to its three groups and one way to a site of your own', async () => {
    await ready();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose a landing site');
    // One line of help, in the words of the screen it is read on.
    expect(visibleWords(document.querySelector('[data-part="title"] p')!, WIDE).join(' ')).toBe('Point at a marker for its name, and click to open it.');
    expect(visibleWords(document.querySelector('[data-part="title"] p')!, PHONE).join(' ')).toBe('Tap a marker, then its name to open it.');
    for (const key of screen.getAllByRole('list', { name: 'Key to the markers' }))
      expect(within(key).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NASA’s Artemis shortlist', 'Landers, flown or planned', 'High points and crater floors']);
    // The one primary button is the way to a site of one's own, which Explore asks for: no place is worked out here.
    const primary = document.querySelectorAll<HTMLAnchorElement>('main .btn-primary');
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toBe('Choose your own site');
    expect(primary[0].getAttribute('href')).toBe('/explore?own=1');
    expect(OWN_SITE_HREF).toBe('/explore?own=1');
    expect(screen.queryByLabelText('Latitude (°)')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Somewhere else' })).toBeNull();
    // The list and the dates wait behind their buttons.
    expect(document.querySelector('a[data-row]')).toBeNull();
    expect(screen.queryByLabelText('For')).toBeNull();
  });

  it('marks every site on the map, each a link with the site name that opens Explore filled in for it', async () => {
    await ready();
    const markers = within(map()).getAllByRole('link');
    expect(markers).toHaveLength(34);
    // The sites near the pole on its relief; every other one on the inset of the whole Moon.
    expect(markers.filter((a) => a.dataset.on === 'relief')).toHaveLength(17);
    expect(markers.filter((a) => a.dataset.on === 'inset')).toHaveLength(17);
    expect(markerOf('Apollo 11').dataset.on).toBe('inset');
    expect(markerOf('Lunar south pole').dataset.on).toBe('relief');
    // The marker opens Explore on the landing day its figures name, where every one of them is a figure Explore shows.
    expect(markerOf('de Gerlache Rim 2').getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-20T10:00&days=30');
    // Each marker says its group by its mark.
    expect(markerOf('Haworth').dataset.group).toBe('artemis');
    expect(markerOf('IM-2 Athena').dataset.group).toBe('lander');
    expect(markerOf('Apollo 17').dataset.group).toBe('lander');
    expect(markerOf('Shackleton rim summit').dataset.group).toBe('other');
    expect(markerOf('Haworth').querySelector('[data-mark="artemis"]')).toBeTruthy();
    // No name is written on the map until a marker is pointed at.
    for (const a of markers) expect(a.textContent).toBe('');
    expect(card()).toBeNull();
    expect(map().textContent).not.toMatch(/Haworth/);
  });

  it('names the marker under the pointer with its figures, and greys out every other one', async () => {
    await ready();
    const marker = markerOf('de Gerlache Rim 2');
    fireEvent.mouseEnter(marker);
    // The name, what kind of point it is, then the figures: a number keeps its percent sign on the same line.
    expect([...card()!.children].map((el) => plain(el.textContent))).toEqual(['de Gerlache Rim 2', 'Centre of a region, ±5 km', 'Sunlight 41 % · Earth in view 54 %', 'Longest with power: 12 d 15 h, landing 20 Jan']);
    expect(card()!.textContent).toMatch(/41\u00a0%/);
    expect(marker.getAttribute('data-active')).toBe('true');
    expect(marker.getAttribute('aria-describedby')).toBe(card()!.id);
    const others = within(map()).getAllByRole('link').filter((a) => a !== marker);
    expect(others.every((a) => a.dataset.dim === 'true' && /\bgrayscale\b/.test(a.className))).toBe(true);
    expect(marker.dataset.dim).toBeUndefined();
    fireEvent.mouseLeave(marker);
    expect(card()).toBeNull();
    expect(within(map()).getAllByRole('link').some((a) => a.dataset.dim)).toBe(false);
  });

  it('does the same for the marker with the keyboard focus', async () => {
    await ready();
    const marker = markerOf('Slater Plain');
    fireEvent.focus(marker);
    expect(card()!.firstElementChild!.textContent).toBe('Slater Plain');
    expect(markerOf('Haworth').dataset.dim).toBe('true');
    fireEvent.blur(marker);
    expect(card()).toBeNull();
  });

  it("names the site on a finger's first tap, and opens it on the next: the card or the marker", async () => {
    await ready();
    const marker = markerOf('Haworth');
    const tap = (el: HTMLElement) => {
      pointerDown(el, 'touch');
      const click = createEvent.click(el);
      fireEvent(el, click);
      return click.defaultPrevented;
    };
    // The first tap does not follow the link: it shows the card, which is the way in, and dims the rest.
    expect(tap(marker)).toBe(true);
    expect(card()!.tagName).toBe('A');
    expect(card()!.getAttribute('href')).toBe(marker.getAttribute('href'));
    expect(card()!.getAttribute('aria-label')).toBe('Open Haworth');
    expect(card()!.textContent).toMatch(/^HaworthCentre of a region.*Open this site/);
    expect(markerOf('Slater Plain').dataset.dim).toBe('true');
    // A second tap on the marker opens it too.
    expect(tap(marker)).toBe(false);
    // A tap on another marker moves the card there; a tap on the map puts it away.
    expect(tap(markerOf('Slater Plain'))).toBe(true);
    expect(card()!.getAttribute('aria-label')).toBe('Open Slater Plain');
    pointerDown(document.querySelector('[data-part="map"]')!, 'touch');
    expect(card()).toBeNull();
    // A mouse click opens the site at once.
    pointerDown(marker, 'mouse');
    const click = createEvent.click(marker);
    fireEvent(marker, click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('says in words when a site has no sunlight or no contact with Earth', async () => {
    await ready();
    const facts = (name: string) => {
      fireEvent.mouseEnter(markerOf(name));
      const text = card()!.textContent!;
      fireEvent.mouseLeave(markerOf(name));
      return text;
    };
    expect(facts('Shackleton crater floor')).toMatch(/No sunlight/);
    expect(facts('Shackleton crater floor')).toMatch(/No power from the Sun/);
    expect(facts('Mons Mouton')).toMatch(/No contact with Earth/);
    expect(facts('Shackleton rim summit')).toMatch(/Longest with power: all 30 days/);
    // On the far side Earth never rises, whatever the dates.
    expect(facts("Chang'e 4")).toMatch(/Earth never in view: far side/);
    expect(facts("Chang'e 4")).not.toMatch(/NaN/);
    expect(facts('CP-12 Schrödinger')).toMatch(/Earth never in view: far side/);
  });

  it('says what kind of point each site is, with the radius where it is known, on its card and in the list', async () => {
    await ready();
    fireEvent.mouseEnter(markerOf('Shackleton rim summit'));
    // A high point worked out from the heights is never offered as a checked place to land.
    expect(card()!.textContent).toMatch(/Derived high point, not checked as safe to land/);
    fireEvent.mouseLeave(markerOf('Shackleton rim summit'));
    openList();
    expect(rowOf('Apollo 11').textContent).toMatch(/Surveyed point/);
    expect(rowOf("Chang'e 4").textContent).toMatch(/Surveyed point, ±20\u00a0m/);
    expect(rowOf('Haworth').textContent).toMatch(/Centre of a region, ±5\u00a0km/);
    expect(rowOf('Luna 25 target').textContent).toMatch(/Landing target, ±15\u00a0km/);
    expect(rowOf('IM-3 Reiner Gamma').textContent).toMatch(/Landing target/);
    expect(rowOf('Lunar south pole').textContent).toMatch(/Reference point/);
    expect(rowOf('Shackleton rim summit').textContent).toMatch(/Derived high point, not checked as safe to land/);
  });

  it('offers the same sites as a list, for anyone who cannot use the map', async () => {
    const { store } = await ready();
    const button = screen.getByRole('button', { name: 'List' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    openList();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(button.getAttribute('aria-controls')!)!;
    // It opens with the focus on its heading, and comes before the markers for the keyboard.
    expect(within(list).getByRole('heading', { level: 2 }).textContent).toBe('All 34 sites');
    expect(document.activeElement).toBe(within(list).getByRole('heading', { level: 2 }));
    expect(list.compareDocumentPosition(markerOf('Haworth')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The map's three groups, in the key's words.
    expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['NASA’s Artemis shortlist', 'Landers, flown or planned', 'High points and crater floors']);
    expect(list.querySelectorAll('a[data-row]')).toHaveLength(34);
    // A row has what the card has, and opens the same address.
    const row = rowOf('de Gerlache Rim 2');
    expect(row.getAttribute('href')).toBe(markerOf('de Gerlache Rim 2').getAttribute('href'));
    expect(row.getAttribute('title')).toMatch(/A ridge on a crater rim, 52 km from the pole/);
    expect(plain(row.textContent)).toBe('de Gerlache Rim 2, Centre of a region, ±5 km, Sunlight 41 % · Earth in view 54 %, Longest with power: 12 d 15 h, landing 20 Jan');
    // Each group has the longest time with power first, then the places with no contact with Earth in these days.
    const group = within(list).getByRole('region', { name: 'NASA’s Artemis shortlist' });
    const ids = [...group.querySelectorAll<HTMLElement>('a[data-row]')].map((a) => a.dataset.row!);
    expect(ids).toHaveLength(9);
    const o = store.getState().overview;
    const seen = ids.filter((id) => o[id].afterEarth > 0);
    expect(ids.slice(0, seen.length)).toEqual(seen);
    const hours = (list: string[]) => list.map((id) => o[id].best?.poweredHours ?? -1);
    expect(hours(seen)).toEqual([...hours(seen)].sort((x, y) => y - x));
    // Mons Mouton keeps power for 13 d 7 h but never sees Earth in its first 30 days: it comes after the others.
    expect(ids.slice(seen.length)).toContain('mons_mouton');
    // The far side, where Earth never rises, closes its group.
    const landers = [...within(list).getByRole('region', { name: 'Landers, flown or planned' }).querySelectorAll<HTMLElement>('a[data-row]')].map((a) => a.dataset.row!);
    expect(landers.slice(-3).sort()).toEqual(['change4', 'change6', 'cp12_schrodinger']);
    // Escape, Close or the button again puts it away.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('a[data-row]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    openList();
    fireEvent.click(within(document.getElementById(button.getAttribute('aria-controls')!)!).getByRole('button', { name: 'Close' }));
    expect(document.querySelector('a[data-row]')).toBeNull();
  });

  it('keeps the first screen to 48 words before a tap, at 1440 and on a phone (spec 20.1; spec 23: the map is the page)', async () => {
    await ready();
    // The window under the header: the title, its line of help, the key, the map and the bar.
    const screenful = document.querySelector('[data-part="screen"]')!;
    for (const width of [WIDE, PHONE]) expect(visibleWords(screenful, width).length, `${width} px`).toBeLessThanOrEqual(48);
    expect(document.querySelector('main dl')).toBeNull();
  });

  it('gives the Apollo landings two weeks of sunlight and Earth in view all the time, for the days chosen', async () => {
    const { store } = await ready();
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
    fireEvent.mouseEnter(markerOf('Apollo 11'));
    expect(card()!.textContent).toMatch(/Earth in view 100\u00a0%/);
  });

  it('keeps the dates behind one button, says what the figures count from, and redoes them for another period', async () => {
    const { store } = await ready();
    const button = screen.getByRole('button', { name: /^Dates/ });
    // The button says the period the figures are for, long on a wide screen and short on a phone.
    expect(visibleWords(button, WIDE).join(' ')).toBe('Dates 1 January 2027 , 30 days');
    expect(visibleWords(button, PHONE).join(' ')).toBe('1 Jan 2027 , 30 days');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    const panel = screen.getByRole('region', { name: 'The dates the figures are for' });
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    // What the figures count from, the lander and why they differ from Explore's, in plain sentences (both readers, part C read 1).
    expect(panel.querySelector('p:last-child')!.textContent).toBe(
      "Each site's figures are for landing on its best day of the 30 days from 1 January 2027 and the 30 days after it, for one lander: 4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, the hills seen from a 2 m mast. Explore and Compare start on the first day, so their figures can differ.",
    );
    fireEvent.change(within(panel).getByLabelText('For'), { target: { value: '14' } });
    expect(store.getState().days).toBe(14);
    await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(34), { timeout: 20_000 });
    await waitFor(() => expect(markerOf('de Gerlache Rim 2').getAttribute('href')).toMatch(/days=14/));
    expect(panel.querySelector('p:last-child')!.textContent).toMatch(/best day of the 14 days from 1 January 2027 and the 14 days after it/);
    expect(visibleWords(button, WIDE).join(' ')).toBe('Dates 1 January 2027 , 14 days');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('For')).toBeNull();
  });

  it('shows the markers before the figures arrive', async () => {
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
    render(<SitesView store={store} />);
    await waitFor(() => expect(within(map()).getAllByRole('link')).toHaveLength(34));
    fireEvent.mouseEnter(markerOf('Haworth'));
    expect(card()!.textContent).toMatch(/Working it out…/);
    release();
    await waitFor(() => expect(card()!.textContent).toMatch(/Sunlight \d+\u00a0%/), { timeout: 20_000 });
  });

  it('names its NASA data under the map', async () => {
    await ready();
    const row = screen.getByLabelText('Data sources');
    // The figures come from horizons on LOLA's 20 m grid near the pole and its 80 m grid farther out, with DE440. The
    // places are NASA's Artemis III regions and the CLPS landings; the inset is the CGI Moon Kit's map.
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m', 'NASA LRO LOLA 240 m', 'JPL DE440', 'Artemis III regions', 'CLPS mission records', 'LROC and NSSDCA lander positions', 'NASA CGI Moon Kit']);
    expect(map().compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(map().contains(row)).toBe(false);
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
    render(<SitesView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // Under next dev, as in tests, the page also names the command that fills web/public/data, then the error.
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<SitesView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});
