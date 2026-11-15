// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
import { comparisonHref } from '@/lib/scenario/codec';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';
import { runControl } from '@/lib/luna/controls';

/** The page with the real catalogue and sky; `search` is the address it opens with. */
async function open(search = '', navigate: (href: string) => void = () => {}) {
  window.history.replaceState({}, '', `/explore${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<ExploreView store={store} navigate={navigate} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
  return { store, ...view };
}
const heading = () => screen.getByRole('heading', { level: 1 }).textContent ?? '';
/** What a visitor reads when the data did not load: two sentences in two paragraphs, which textContent runs together. */
const PLAIN = /The data could not be loaded\.\s*Reload the page, or try again in a minute\./;

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.unstubAllEnvs();
});

describe('ExploreView', () => {
  it("shows the answer for the default site as the page's heading, with one gold action", async () => {
    await open();
    expect(heading()).toMatch(/de Gerlache Rim\s2/);
    expect(heading()).toMatch(/^Landing at de Gerlache Rim\s2 on 1 January: power for 3 days 4 hours, then night$/);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toMatch(/^Land on 20 January/);
  });

  it('says in the verdict that contact with Earth is lost, and offers the nearby rim summit once the figures are in', async () => {
    await open();
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.textContent).toMatch(/No radio contact: Earth is out of view for all 3 days 4 hours with power\./);
    await waitFor(() => expect(panel.textContent).toMatch(/Nearby: de Gerlache rim summit \(12 km, not checked for landing\) has power all 30 days\./), { timeout: 20_000 });
    expect(within(panel).getByRole('link', { name: 'Explore de Gerlache rim summit' }).getAttribute('href')).toBe('/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30');
  });

  it('shows the ground for every site, even a polar site the terrain files have no window for', async () => {
    window.history.replaceState({}, '', '/explore');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // A cap 125 km across round the pole, so de Gerlache Rim 2, 52 km out, lies on it (a site off the cap gets none).
    const cap = { site_id: 'south_cap', lat: -90, lon: 0, kind: 'cap', source: 's', level: 'L2', cell_m: 960, width: 131, height: 131, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: 65, sample_offset_px: 65, site_row_px: 65, site_col_px: 65 };
    const store = createExploreStore(
      fileLoaders({
        loadTerrainManifest: async () => ({ version: 2, windows: [{ site_id: 'shackleton_center', file: 'x.u16', meta: 'x.json' }], cap: { file: 'cap.u16', meta: 'cap.json' }, globe_texture: 'g.jpg' }) as never,
        loadHeightmap: async () => ({ meta: cap, heightsM: new Float32Array(131 * 131) }) as never,
      }),
    );
    render(<ExploreView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
    await store.getState().waitForTerrain();
    expect(store.getState().heightmap).toBeNull();
    const ground = screen.getByRole('region', { name: 'The ground' });
    await waitFor(() => expect(within(ground).getByRole('img', { name: /^Shadows at 1 Jan 2027, 00:00 UTC/ })).toBeTruthy());
    expect(screen.getByRole('region', { name: 'Where on the Moon' })).toBeTruthy();
  });

  it('gives the place the width of the page, with its map beside the words, and sets the chart and the ground side by side on a wide window', async () => {
    await open();
    const ground = screen.getByRole('region', { name: 'The ground' });
    const place = screen.getByRole('region', { name: 'Where on the Moon' });
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    expect(place.parentElement!.className).not.toMatch(/grid-cols/);
    expect(place.querySelector('[data-part="layout"]')!.className).toMatch(/md:grid-cols/);
    // Two columns from 1280 px, one above the other below it: the chart with the radio windows under it, then the ground.
    const row = ground.parentElement!;
    expect(row.className).toMatch(/(^| )grid( |$)/);
    expect(row.className).toMatch(/(^| )xl:grid-cols-2( |$)/);
    expect(row.className).not.toMatch(/(^| )(sm:|md:|lg:)?grid-cols-/);
    expect(row.contains(chart)).toBe(true);
    expect(chart.parentElement!.contains(screen.getByRole('region', { name: 'Radio windows' }))).toBe(true);
  });

  it("names the hour the ground shows: the time bar's, not the one under the pointer on the chart", async () => {
    const { store } = await open();
    act(() => store.getState().setCursor(66));
    const overlay = document.querySelector<HTMLElement>('.cursor-crosshair')!;
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 100, right: 720, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // jsdom has no PointerEvent: a mouse event of that name carries the position.
    fireEvent(overlay, new MouseEvent('pointermove', { bubbles: true, clientX: 10.5 }));
    // The time bar previews the hour under the pointer...
    await waitFor(() => expect(screen.getByRole('region', { name: 'Time' }).textContent).toMatch(/1 Jan 2027, 10:00 UTC/));
    // ...while the ground keeps the hour it is lit for.
    const ground = screen.getByRole('region', { name: 'The ground' });
    expect(ground.textContent).toMatch(/3 Jan 2027, 18:00 UTC/);
    expect(ground.textContent).not.toMatch(/1 Jan 2027, 10:00 UTC/);
  });

  it("opens the view from the site at the time bar's hour, from under the answer and from beside the ground's tabs", async () => {
    const { store } = await open();
    act(() => store.getState().setCursor(66));
    const stand = '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=66';
    expect(within(screen.getByRole('region', { name: 'The answer' })).getByRole('link', { name: 'Stand at the site' }).getAttribute('href')).toBe(stand);
    expect(within(screen.getByRole('region', { name: 'The ground' })).getByRole('link', { name: 'Stand at the site' }).getAttribute('href')).toBe(stand);
  });

  it('lands on the better date when its button is pressed, and the boxes show its hour', async () => {
    const { store } = await open();
    fireEvent.click(screen.getByRole('button', { name: /^Land on 20 January/ }));
    expect(store.getState().startUtc).toBe('2027-01-20T10:00:00');
    await waitFor(() => expect(heading()).toMatch(/12 days 15 hours/));
    expect([(screen.getByLabelText('From') as HTMLInputElement).value, (screen.getByLabelText('Landing time, UTC') as HTMLInputElement).value]).toEqual(['2027-01-20', '10:00']);
  });

  it('evaluates seven days from 17:00 UTC through the boxes, shifts it five days, and keeps it all in the address', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30#ask');
    // The address the visit came with is applied first, then follows the period, its hash kept.
    expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    fireEvent.change(screen.getByLabelText('Landing time, UTC'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('For'), { target: { value: '7' } });
    expect([store.getState().startUtc, store.getState().days, store.getState().series?.hours]).toEqual(['2027-01-01T17:00:00', 7, 7 * 24]);
    await waitFor(() => expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-01T17:00&days=7'));
    expect(window.location.hash).toBe('#ask');
    const band = screen.getByRole('region', { name: 'What this forecast is for' });
    fireEvent.click(within(band).getByRole('button', { name: 'Shift by…' }));
    fireEvent.change(within(band).getByLabelText('Shift by'), { target: { value: '5' } });
    fireEvent.click(within(band).getByRole('button', { name: '5 days later' }));
    expect([store.getState().startUtc, store.getState().days]).toEqual(['2027-01-06T17:00:00', 7]);
    await waitFor(() => expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-06T17:00&days=7'));
    // The time bar starts at the landing, in UTC.
    expect(screen.getByRole('region', { name: 'Time' }).textContent).toMatch(/6 Jan 2027, 17:00 UTC/);
  });

  it('shows every landing day of the next 12 months after the parts that move with the hour, and lands the period on a day pressed there', async () => {
    const { store } = await open();
    const year = screen.getByRole('region', { name: 'Every landing day of the next 12 months' });
    // After the hour-by-hour chart and the ground (spec 23.4): the year is the same at every hour of the time bar.
    expect(screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' }).compareDocumentPosition(year) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('region', { name: 'The ground' }).compareDocumentPosition(year) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(await within(year).findByRole('button', { name: /^Land 14 March 2027, 00:00 UTC/ }, { timeout: 20_000 }));
    expect(store.getState().startUtc).toBe('2027-03-14T00:00:00');
    await waitFor(() => expect(heading()).toMatch(/ on 14 March: /));
    // The year stays where it was, with the day now shown marked, and the page keeps its one gold action.
    expect(within(year).getByRole('button', { current: 'date' }).getAttribute('aria-label')).toMatch(/^Land 14 March 2027/);
    expect(screen.getByRole('main').querySelectorAll('.btn-primary')).toHaveLength(1);
  });

  it('offers Compare as the gold action when no date in the period does better', async () => {
    const navigate = vi.fn();
    const { store } = await open('?site=shackleton_center_rim_high', navigate);
    await waitFor(() => expect(heading()).toMatch(/on 1 January: power for all 30 days/));
    const gold = screen.getByRole('main').querySelectorAll<HTMLElement>('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toBe('Compare sites');
    fireEvent.click(gold[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/compare'));
    expect(store.getState().compareIds).toContain('shackleton_center_rim_high');
  });

  it('compares from here: the landing shown, with every setting, becomes a comparison’s baseline and Compare opens on it', async () => {
    const navigate = vi.fn();
    window.history.replaceState({}, '', '/explore');
    const loaders = fileLoaders();
    const store = createExploreStore(loaders);
    const scenarios = createScenarioStore(store, loaders);
    render(<ExploreView store={store} scenarios={scenarios} navigate={navigate} />);
    await waitFor(() => expect(heading()).toMatch(/de Gerlache Rim\s2 on 1 January/), { timeout: 20_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Compare from here' }));
    expect(scenarios.getState().scenarios).toMatchObject([{ label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, mastM: 2, minEarthElDeg: 0 }]);
    expect(navigate).toHaveBeenCalledWith(comparisonHref(scenarios.getState().scenarios));
    // With requirements set, Compare opens on a link that carries them, so its address can be sent on as it is.
    act(() => store.getState().setRequirements({ minPoweredH: 120 }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare from here' }));
    expect(navigate).toHaveBeenLastCalledWith(comparisonHref(scenarios.getState().scenarios, '/compare', { ...NO_REQUIREMENTS, minPoweredH: 120 }));
  });

  it('puts the place first, then the answer, the parts that move with the hour, the year, the assistant and the way to the checks, and names every region (spec 23.4)', async () => {
    await open();
    const names = ['Where on the Moon', 'What this forecast is for', 'The answer', 'The numbers', 'Hour by hour', 'Every landing day of the next 12 months', 'Ask in plain words', 'How sure are these numbers?'];
    const regions = names.map((name) => screen.getByRole('region', { name }));
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i - 1].compareDocumentPosition(regions[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The page ends on one white button to the Accuracy page, which is not a second gold action.
    const sure = regions[regions.length - 1];
    const checks = within(sure).getByRole('link', { name: 'See the checks' });
    expect(checks.getAttribute('href')).toBe('/validate');
    expect(checks.className).toMatch(/\bbtn\b.*\bbtn-ink\b/);
    expect(sure.textContent).toMatch(/We checked them against NASA’s own figures\./);
  });

  it('shows the time bar only with the parts that move with the hour: it is the last thing in their section, where it sticks to the window’s foot', async () => {
    await open();
    const moving = screen.getByRole('region', { name: 'Hour by hour' });
    const bar = screen.getByRole('region', { name: 'Time' });
    // The bar sticks inside its own section, so it leaves the screen with it; it is never fixed to the window.
    expect(bar.parentElement).toBe(moving);
    expect(moving.lastElementChild).toBe(bar);
    expect(bar.className).toMatch(/(^| )sticky( |$)/);
    expect(bar.className).toMatch(/(^| )bottom-0( |$)/);
    expect(bar.className).not.toMatch(/(^| )fixed( |$)/);
    for (const name of ['Why: the 30 days, hour by hour', 'Radio windows', 'The ground']) expect(moving.contains(screen.getByRole('region', { name }))).toBe(true);
    for (const name of ['Where on the Moon', 'The answer', 'Every landing day of the next 12 months', 'How sure are these numbers?']) expect(moving.contains(screen.getByRole('region', { name }))).toBe(false);
    // It stays in the reading and tab order, after the chart and the ground it moves.
    const slider = within(bar).getByRole('slider', { name: 'Time' });
    expect(screen.getByRole('region', { name: 'The ground' }).compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('changes the site in a drop-down on the page: the site loads in place, and the dates and the lander stay', async () => {
    const navigate = vi.fn();
    const { store } = await open('?start=2027-03-02T05:00&days=14&load=400', navigate);
    await waitFor(() => expect(store.getState().days).toBe(14));
    const band = screen.getByRole('region', { name: 'What this forecast is for' });
    expect(within(band).queryByRole('link', { name: /Landing site/ })).toBeNull();
    fireEvent.click(within(band).getByRole('button', { name: 'Landing site: de Gerlache Rim 2. Change site' }));
    const list = within(band).getByRole('group', { name: 'Choose a landing site' });
    // The catalogue in the Sites page's groups and order, and never a custom place.
    expect(within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Artemis crewed landing regions',
      'Commercial landers, landed',
      'Commercial landers, planned',
      'Landers of other countries',
      'Apollo landings',
      'High points and crater floors',
    ]);
    fireEvent.click(within(list).getByRole('button', { name: 'Haworth' }));
    await waitFor(() => expect(store.getState().siteId).toBe('haworth'));
    await waitFor(() => expect(heading()).toMatch(/^Landing at Haworth on 2 March/));
    expect(store.getState().startUtc).toBe('2027-03-02T05:00:00');
    expect(store.getState().days).toBe(14);
    expect(store.getState().params.power.loadW).toBe(400);
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.search).toBe('?site=haworth&start=2027-03-02T05:00&days=14&load=400'));
  });

  it('opens the own-site fields on the page from the drop-down’s "Your own site…", empty, and works the place out in place', async () => {
    window.history.replaceState({}, '', '/explore?days=14');
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 0, failedTiles: 0 }));
    const store = createExploreStore(fileLoaders({ computeMask }));
    render(<ExploreView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
    expect(screen.queryByRole('region', { name: 'Your own site' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Landing site:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Your own site…' }));
    const own = screen.getByRole('region', { name: 'Your own site' });
    expect((within(own).getByLabelText('Latitude (°)') as HTMLInputElement).value).toBe('');
    expect((within(own).getByLabelText('Longitude (°)') as HTMLInputElement).value).toBe('');
    expect(own.textContent).toMatch(/The dates and the lander stay as they are\./);
    expect(own.textContent).toMatch(/not checked for landing/);
    // Only where is asked here: the period keeps its own boxes in the band.
    expect(within(own).queryByLabelText('Landing date')).toBeNull();
    fireEvent.change(within(own).getByLabelText('Latitude (°)'), { target: { value: '-88.2' } });
    fireEvent.change(within(own).getByLabelText('Longitude (°)'), { target: { value: '40' } });
    fireEvent.click(within(own).getByRole('button', { name: 'Work it out' }));
    await waitFor(() => expect(store.getState().site?.category).toBe('custom'));
    expect(computeMask).toHaveBeenCalledWith(-88.2, 40, 2);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your own site' })).toBeNull());
    expect(store.getState().days).toBe(14);
    expect(screen.getByRole('button', { name: 'Landing site: Custom site -88.200°, 40.000°. Change site' })).toBeTruthy();
  });

  describe('a place of one’s own, at /explore?own=1', () => {
    async function ownPage(computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 0, failedTiles: 0 }))) {
      window.history.replaceState({}, '', '/explore?own=1');
      const store = createExploreStore(fileLoaders({ computeMask }));
      render(<ExploreView store={store} navigate={() => {}} />);
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your own site' })).toBeTruthy(), { timeout: 20_000 });
      return { store, computeMask };
    }
    const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

    it('fills nothing in, asks where, when and the lander in three steps, and shows none of the usual page', async () => {
      await ownPage();
      const form = screen.getByRole('form', { name: 'Your own site' });
      expect(within(form).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Where', 'When', 'Lander']);
      for (const name of ['Latitude (°)', 'Longitude (°)', 'Landing date', 'Hour (UTC)', 'Days (2–90)']) expect(field(name).value).toBe('');
      // The lander starts from today's default, and the step says so.
      expect(within(form).getByRole('button', { name: 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery. Change' })).toBeTruthy();
      expect(form.textContent).toMatch(/This is the starting lander, not yours yet\. Change it now or later\./);
      expect(form.textContent).toMatch(/Your own point is not checked for landing\./);
      expect(screen.queryByRole('region', { name: 'Time' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'The answer' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Choose a listed site instead' }).getAttribute('href')).toBe('/sites');
      // The steps keep their address: the default site's is not written over it.
      expect(window.location.search).toBe('?own=1');
    });

    it('says what is missing, step by step, before any hills are traced', async () => {
      const { store, computeMask } = await ownPage();
      const go = screen.getByRole('button', { name: 'Work it out' });
      fireEvent.click(go);
      expect(screen.getByRole('alert').textContent).toMatch(/south of 60° S/);
      fireEvent.change(field('Latitude (°)'), { target: { value: '-88.2' } });
      fireEvent.change(field('Longitude (°)'), { target: { value: '40' } });
      fireEvent.click(go);
      expect(screen.getByRole('alert').textContent).toBe('Choose the landing date and its hour.');
      fireEvent.change(field('Landing date'), { target: { value: '2028-05-04' } });
      fireEvent.change(field('Hour (UTC)'), { target: { value: '17:00' } });
      fireEvent.click(go);
      expect(screen.getByRole('alert').textContent).toBe('Choose how many days: 2 to 90.');
      fireEvent.change(field('Days (2–90)'), { target: { value: '10' } });
      expect(field('Days (2–90)').value).toBe('10');
      fireEvent.change(field('Landing date'), { target: { value: '2036-12-30' } });
      expect(field('Landing date').value).toBe('2036-12-30');
      fireEvent.click(go);
      expect(screen.getByRole('alert').textContent).toMatch(/runs past 31 December 2036/);
      // No hills were traced for the place: the worker was asked only for the points round the site the page opened with.
      expect(computeMask).not.toHaveBeenCalledWith(-88.2, 40, 2);
      expect(store.getState().site?.category).not.toBe('custom');
    });

    it('works the place out for the period given and becomes the usual Explore for it, with its own address', async () => {
      const { store, computeMask } = await ownPage();
      fireEvent.change(field('Latitude (°)'), { target: { value: '-88.2' } });
      fireEvent.change(field('Longitude (°)'), { target: { value: '40' } });
      fireEvent.change(field('Landing date'), { target: { value: '2028-05-04' } });
      fireEvent.change(field('Hour (UTC)'), { target: { value: '17:00' } });
      fireEvent.change(field('Days (2–90)'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Work it out' }));
      await waitFor(() => expect(screen.getByRole('region', { name: 'The answer' })).toBeTruthy(), { timeout: 20_000 });
      expect(computeMask).toHaveBeenCalledWith(-88.2, 40, 2);
      expect(store.getState().site?.category).toBe('custom');
      expect(store.getState().startUtc).toBe('2028-05-04T17:00:00');
      expect(store.getState().days).toBe(10);
      expect(heading()).toMatch(/^Landing at Custom site -88\.200°, 40\.000° on 4 May: /);
      expect(screen.getByRole('region', { name: 'Time' })).toBeTruthy();
      await waitFor(() => expect(window.location.search).toBe('?site=custom_-88.2000_40.0000&start=2028-05-04T17:00&days=10'));
    });

    it('takes a press on the map as the place, and marks it', async () => {
      await ownPage();
      const map = document.querySelector<HTMLElement>('[data-part="own-map"]')!;
      map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
      expect(document.querySelector('[data-part="own-mark"]')).toBeNull();
      // The centre of the picture is the pole; a point straight up from it lies on longitude 0.
      fireEvent.click(map, { clientX: 200, clientY: 200 });
      expect([field('Latitude (°)').value, field('Longitude (°)').value]).toEqual(['-90', '0']);
      fireEvent.click(map, { clientX: 200, clientY: 120 });
      expect(Number(field('Latitude (°)').value)).toBeCloseTo(-86.7, 1);
      expect(field('Longitude (°)').value).toBe('0');
      expect(document.querySelector('[data-part="own-mark"]')).toBeTruthy();
    });

    it('says plainly when the height tiles are missing, and that the places in the list work without them', async () => {
      const { DataError } = await import('@/lib/data/loaders');
      await ownPage(
        vi.fn(async () => {
          throw new DataError('/data/tiles/manifest.json', 404);
        }) as never,
      );
      fireEvent.change(field('Latitude (°)'), { target: { value: '-88.2' } });
      fireEvent.change(field('Longitude (°)'), { target: { value: '40' } });
      fireEvent.change(field('Landing date'), { target: { value: '2028-05-04' } });
      fireEvent.change(field('Hour (UTC)'), { target: { value: '17:00' } });
      fireEvent.change(field('Days (2–90)'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Work it out' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That place cannot be worked out here: this copy of Earthrise has no height tiles. The places in the list work without them.'));
      expect(screen.getByRole('heading', { level: 1, name: 'Your own site' })).toBeTruthy();
    });
  });

  it('puts the radio windows under the chart, beside the ground, following the time bar’s hour', async () => {
    const { store } = await open();
    const radio = screen.getByRole('region', { name: 'Radio windows' });
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    expect(chart.compareDocumentPosition(radio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(radio.parentElement).toBe(chart.parentElement);
    expect(within(radio).getByTestId('radio-next').textContent).toBe('Next window opens 10 Jan, 03:00 UTC, in 9 d 3 h, and lasts 13 d 12 h');
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(within(radio).getByTestId('radio-next').textContent).toBe('This window closes 23 Jan, 15:00 UTC, in 10 d 3 h'));
  });

  it('moves the time from the keyboard and says what is happening at that hour', async () => {
    const { store } = await open();
    act(() => store.getState().setCursor(66));
    const bar = screen.getByRole('region', { name: 'Time' });
    const before = bar.textContent;
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' });
    expect(store.getState().cursorHour).toBe(67);
    // Hour 67 is when the Sun goes behind the hills on 3 January.
    await waitFor(() => expect(bar.textContent).toMatch(/Sun behind a hill/));
    expect(bar.textContent).not.toBe(before);
  });

  it('puts the period’s key moments on its time bar as dots, with Next to step to them, as the stand view does (21.1)', async () => {
    const { store } = await open();
    const bar = screen.getByRole('region', { name: 'Time' });
    const dots = within(within(bar).getByRole('group', { name: 'Jump to a moment' })).getAllByRole('button');
    expect(dots.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toContain('Sunset, 3 Jan');
    // Next takes the time to the first moment, hour 67, when the Sun goes behind the hills on 3 January.
    fireEvent.click(within(bar).getByRole('button', { name: /^Next: Sunset, 3 Jan/ }));
    expect(store.getState().cursorHour).toBe(67);
    await waitFor(() => expect(bar.textContent).toMatch(/Sun behind a hill/));
  });

  it('lends Luna the better day, which lands there as the gold button does (spec 22)', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    let said: ReturnType<typeof runControl>;
    act(() => {
      said = runControl('better-day');
    });
    expect(said!.said).toBe('Land on 20 January instead');
    await waitFor(() => expect(store.getState().startUtc).toBe('2027-01-20T10:00:00'));
  });

  it('opens the lander settings from the band and applies a preset', async () => {
    const { store } = await open();
    fireEvent.click(screen.getByRole('button', { name: /^Small lander: / }));
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /20 m² panel, uses 500 W, 50 kWh battery/ }));
    expect(store.getState().params.power.batteryWh).toBe(50000);
    // The band names the lander it now has (the numbers card keeps only the hours its battery lasts).
    expect(screen.getByRole('button', { name: 'Large lander: 20 m² panel, uses 500 W, 50 kWh battery. Change' })).toBeTruthy();
  });

  it('applies the site, start and length from the address', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02&days=14');
    await waitFor(() => expect(heading()).toMatch(/Blue Ghost/));
    expect(heading()).toMatch(/on 2 March: power for all 14 days/);
  });

  it("keeps instrument and programme names out of the page's words: only the rows of data sources name them", async () => {
    await open();
    // The rows at the panels' feet name the datasets on purpose (the judges weigh NASA-data use); the words around
    // them stay plain.
    const words = screen.getByRole('main').cloneNode(true) as HTMLElement;
    const rows = words.querySelectorAll('[aria-label="Data sources"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) row.remove();
    expect(words.textContent).not.toMatch(/LOLA|DE440|Horizons|CLPS|ephemeris|skyline/);
  });

  it('says in plain words when the data files are missing, and keeps the pipeline command for developers only', async () => {
    const missing = () =>
      createExploreStore(
        fileLoaders({
          loadSites: async () => {
            throw new Error('could not load /data/sites.json (HTTP 404)');
          },
        }),
      );
    render(<ExploreView store={missing()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(PLAIN));
    // Under next dev, as in tests, the page also names the command that fills web/public/data, then the error.
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<ExploreView store={missing()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(PLAIN));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });

  it('says the same for an error it cannot explain, and shows the error itself to developers only', async () => {
    const broken = () =>
      createExploreStore(
        fileLoaders({
          loadEphemeris: async () => {
            throw new Error('the table is broken');
          },
        }),
      );
    render(<ExploreView store={broken()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(PLAIN));
    expect(screen.getByRole('alert').textContent).toMatch(/the table is broken/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<ExploreView store={broken()} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(PLAIN));
    expect(screen.getByRole('alert').textContent).not.toMatch(/the table is broken|sync-local/);
  });

  it('has no audience switch, no guided story and no cockpit', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Planner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Learn' })).toBeNull();
    expect(document.querySelector('[data-testid="cockpit"]')).toBeNull();
  });

  describe('arriving from a link to the assistant', () => {
    // jsdom has no scrollIntoView: each test puts a recorder in its place, and the original (none) comes back after.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    let scrolls: { id: string; options: unknown }[] = [];
    beforeEach(() => {
      scrolls = [];
      Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
        scrolls.push({ id: this.id, options });
      };
    });
    afterEach(() => {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it('goes to the assistant once the data is in and puts the cursor in its box, when the address ends in #ask', async () => {
      // The home page links to /explore#ask. On a first visit the page still says "Loading NASA data…" when Next
      // looks for #ask, so Next finds nothing to scroll to and drops it: the page has to go there itself.
      await open('#ask');
      await waitFor(() => expect(scrolls).toEqual([{ id: 'ask', options: { block: 'start' } }]));
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Ask the assistant' }));
    });

    it('stays at the top without it', async () => {
      await open();
      await act(async () => {});
      expect(scrolls).toEqual([]);
      expect(document.activeElement).toBe(document.body);
    });
  });
});
