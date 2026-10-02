// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { CompareView } from './CompareView';

async function open() {
  const store = createExploreStore(fileLoaders());
  render(<CompareView store={store} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Compare sites' })).toBeTruthy(), { timeout: 20_000 });
  return store;
}

describe('CompareView', () => {
  it('starts empty with two ready pairs; pressing one compares both sites in a table', async () => {
    await open();
    expect(screen.queryByRole('table')).toBeNull();
    const pair = screen.getByRole('button', { name: /A ridge and the summit 12 km away/ });
    fireEvent.click(pair);
    const table = await screen.findByRole('table', {}, { timeout: 20_000 });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Site', 'Sun and Earth', 'Sunlight', 'Earth in view', 'Longest night', 'Time with power', 'Verdict', '']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toMatch(/de Gerlache Rim 2/);
    expect(rows[1].textContent).toMatch(/de Gerlache rim summit/);
    expect(within(rows[0]).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(within(rows[0]).getByRole('img', { name: /^The Sun and Earth at de Gerlache Rim 2 over the 30 days/ })).toBeTruthy();
  });

  it('says above the table which site is best for each measure', async () => {
    const store = await open();
    await store.getState().addToCompare('de_gerlache_rim_2');
    await store.getState().addToCompare('de_gerlache_center_rim_high');
    await waitFor(() => expect(screen.getByRole('main').textContent).toMatch(/Landing on 1 January, de Gerlache rim summit has the longest time with power \(all 30 days\)/));
    // The year search is a button that looks like one, at least 40 px tall like every control.
    expect(screen.getByRole('button', { name: 'Find the best landing day for these sites in the next 12 months' }).className).toMatch(/\bbtn\b/);
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
      expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(heads.slice(1));
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
    expect(screen.getByRole('button', { name: /Lander/ })).toBeTruthy();
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
});
