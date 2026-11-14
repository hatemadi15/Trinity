// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { CompareView } from './CompareView';

async function open() {
  const store = createExploreStore(fileLoaders());
  render(<CompareView store={store} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeTruthy(), { timeout: 20_000 });
  return store;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CompareView', () => {
  it('keeps the empty page to 200 words before a tap, at 1440 and on a phone (spec 20.1)', async () => {
    await open();
    const main = screen.getByRole('main');
    expect(main.textContent).not.toMatch(/one by one/);
    for (const width of [WIDE, PHONE]) {
      const n = visibleWords(main, width).length;
      expect(n).toBeLessThanOrEqual(200);
    }
  });

  it('starts empty with two ready pairs; pressing one compares both sites in a table', async () => {
    await open();
    expect(screen.queryByRole('table')).toBeNull();
    const pair = screen.getByRole('button', { name: /A ridge and the summit 12 km away/ });
    fireEvent.click(pair);
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    // What happens to the lander is one phrase, in colour, under "Time with power": no separate verdict repeating it.
    expect(heads).toEqual(['Site', 'Sun and Earth', 'Sunlight', 'Earth in view', 'Longest night', 'Time with power', 'Radio contact while it has power', 'Longest without Earth', 'Remove']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toMatch(/de Gerlache Rim 2/);
    expect(rows[1].textContent).toMatch(/de Gerlache rim summit/);
    expect(within(rows[0]).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(within(rows[0]).getByRole('img', { name: /^The Sun and Earth at de Gerlache Rim 2 over the 30 days/ })).toBeTruthy();
    // The strips' colours are explained under the table.
    expect(screen.getByRole('main').textContent).toMatch(/In each strip, gold marks the hours with the Sun up and blue the hours with Earth in view, from left to right over the 30 days\./);
    expect(screen.getByRole('main').textContent).toMatch(/Time with power counts from landing on the first day until the battery first runs out; Earth in view counts every hour of the period\./);
    expect(rows[0].textContent).toMatch(/3 d 4 h, then off until 20 Jan/);
    expect(within(rows[0]).getByText('3 d 4 h, then off until 20 Jan').className).toMatch(/\btext-bad\b/);
    expect(within(rows[1]).getByText('all 30 days').className).toMatch(/\btext-good\b/);
    // Radio contact in the time with power, and the longest time without Earth, as Explore's radio windows give them: the
    // ridge's battery runs out before Earth rises; at both sites the period starts without Earth, so at least that long.
    const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-label="${label}"]`)!.textContent;
    expect([cell(rows[0], 'Radio contact while it has power'), cell(rows[0], 'Longest without Earth')]).toEqual(['none', 'at least 9 d 3 h']);
    expect([cell(rows[1], 'Radio contact while it has power'), cell(rows[1], 'Longest without Earth')]).toEqual(['14 d 15 h', 'at least 8 d 23 h']);
    expect(screen.getByRole('main').textContent).toMatch(/Radio contact counts the hours with Earth in view in that time with power; the longest time without Earth is at least as long where the period’s start or end cuts it\./);
  });

  it('says under each name what kind of point the site is, and groups the sites to add by kind of place', async () => {
    const store = await open();
    await store.getState().addToCompare('apollo_11');
    await store.getState().addToCompare('shackleton_center_rim_high');
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const [apollo, rim] = within(table).getAllByRole('row').slice(1);
    expect(within(apollo).getByRole('rowheader').textContent).toBe('Apollo 11Surveyed point');
    expect(within(rim).getByRole('rowheader').textContent).toBe('Shackleton rim summitDerived high point, not checked as safe to land');
    const groups = [...document.querySelectorAll<HTMLOptGroupElement>('#compare-add optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Artemis III regions', 'Commercial landers', 'Coming commercial landings', "Other countries' landers", 'Apollo landings', 'High points and crater floors']);
    expect(document.querySelectorAll('#compare-add option[value]:not([value=""])')).toHaveLength(32);
  });

  it('says above the table which site is best for each measure', async () => {
    const store = await open();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('de_gerlache_center_rim_high');
    await waitFor(() => expect(screen.getByRole('main').textContent).toMatch(/Landing on 1 January, de Gerlache rim summit has the longest time with power \(all 30 days\)/));
    // The year search is a button that looks like one, at least 40 px tall like every control.
    expect(screen.getByRole('button', { name: 'Find the best landing day for these sites in the next 12 months' }).className).toMatch(/\bbtn\b/);
    // The brief is for one site: the link says which.
    expect(screen.getByRole('link', { name: `Printable brief for ${store.getState().site!.label}` }).getAttribute('href')).toBe('/brief');
  });

  it('lets its long buttons wrap, so none runs off a phone screen', async () => {
    const store = await open();
    for (const pair of screen.getAllByRole('button', { name: /A ridge and the summit|A rim in sunlight/ })) expect(pair.className).toMatch(/\bwhitespace-normal\b.*\bh-auto\b|\bh-auto\b.*\bwhitespace-normal\b/);
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('de_gerlache_center_rim_high');
    const search = await screen.findByRole('button', { name: 'Find the best landing day for these sites in the next 12 months' }, { timeout: 20_000 });
    expect(search.className).toMatch(/\bwhitespace-normal\b/);
    expect(search.className).toMatch(/\bh-auto\b/);
  });

  it('on a phone shows each site as a block of labelled figures instead of a table to scroll sideways', async () => {
    const store = await open();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('de_gerlache_center_rim_high');
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    expect(table.className).toMatch(/\bmax-sm:block\b/);
    expect(table.className).not.toMatch(/(^|\s)min-w-\[/);
    expect(table.querySelector('thead')!.className).toMatch(/\bmax-sm:sr-only\b/);
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    for (const row of within(table).getAllByRole('row').slice(1)) {
      const cells = Array.from(row.querySelectorAll('td'));
      expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(heads.slice(1).map((h) => (h === 'Remove' ? '' : h)));
      expect(cells[1].className).toMatch(/max-sm:before:content-\[attr\(data-label\)\]/);
    }
  });

  it('adds a site from its list and removes one with its own button', async () => {
    const store = await open();
    await store.getState().addToCompare('shackleton_center_rim_high');
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a site' }), { target: { value: 'shackleton_center' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(store.getState().compareIds).toEqual(['shackleton_center_rim_high', 'shackleton_center']));
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Shackleton crater floor' }));
    await waitFor(() => expect(store.getState().compareIds).toEqual(['shackleton_center_rim_high']));
  });

  it('keeps the period and the lander, and offers no more than four sites', async () => {
    const store = await open();
    expect(screen.getByRole('radiogroup', { name: 'For' })).toBeTruthy();
    expect(screen.getByRole('main').textContent).toMatch(/Up to four sites side by side, for the same days and the same lander\./);
    const lander = screen.getByRole('button', { name: 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery. Change' });
    const nameSpan = lander.querySelector('span')!;
    // As in Explore's band, the name wraps rather than being cut, and a no-break space keeps each number with its unit; the accessible name keeps plain spaces.
    expect(lander.className.split(' ')).toEqual(expect.arrayContaining(['h-auto', 'min-h-[52px]', 'py-2']));
    expect(nameSpan.className.split(' ')).not.toContain('truncate');
    expect([nameSpan.textContent, lander.getAttribute('aria-label')]).toEqual(['Small lander: 4\u00a0m² panel, uses 200\u00a0W, 2\u00a0kWh battery', 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery. Change']);
    for (const id of ['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena']) await store.getState().addToCompare(id);
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Add a site' }) as HTMLSelectElement).disabled).toBe(true));
    expect(screen.getByRole('main').textContent).toMatch(/Four sites is the most this page compares/);
  });

  it('has at most one gold action and none of the old cards', async () => {
    const store = await open();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('shackleton_center_rim_high');
    await screen.findByRole('table');
    expect(screen.getByRole('main').querySelectorAll('.btn-primary').length).toBeLessThanOrEqual(1);
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('main').textContent).not.toMatch(/skyline|Sun above|Both at once|Learn/);
  });

  it('gives every column header of the table a name, the remove column included', async () => {
    const store = await open();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('malapert_massif');
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect((h.textContent ?? '').trim()).not.toBe('');
  });

  it('names its NASA data', async () => {
    const store = await open();
    // An empty page compares nothing, so it names no data.
    expect(screen.queryByLabelText('Data sources')).toBeNull();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('malapert_massif');
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const names = () => within(screen.getByLabelText('Data sources')).getAllByRole('listitem').map((li) => li.textContent);
    // DE440 gives every figure. The hills come from LOLA: the 20 m grid for de Gerlache Rim 2, near the pole, and the 80 m grid for Malapert Massif.
    expect(names()).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m']);
    // The row is the foot of the table's panel.
    expect(table.closest('section')!.lastElementChild).toBe(screen.getByLabelText('Data sources'));
    store.getState().removeFromCompare('malapert_massif');
    await waitFor(() => expect(names()).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m']));
  });

  it('says in plain words when the data cannot be loaded', async () => {
    const missing = () =>
      createExploreStore(
        fileLoaders({
          loadSites: async () => {
            throw new Error('could not load /data/sites.json (HTTP 404)');
          },
        }),
      );
    // Two sentences in two paragraphs, which textContent runs together.
    const plain = /The data could not be loaded\.\s*Reload the page, or try again in a minute\./;
    render(<CompareView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // Under next dev, as in tests, the page also names the command that fills web/public/data, then the error.
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<CompareView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});
