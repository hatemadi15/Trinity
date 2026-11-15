// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { SitesView } from './SitesView';

const layer = async () => readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json');
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;

describe('the site list with the modelled cold traps', () => {
  it('gives each polar row of the list its cold ground within 5 km in one short line, and the first screen keeps its 48 words', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} coldTraps={layer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'List' }, { timeout: 20_000 }));
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
    await waitFor(() => expect(rowOf('Shackleton rim summit').textContent).toMatch(/Modelled cold traps: 11\.5\skm² within 5\skm/), { timeout: 20_000 });
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/Modelled cold traps: all the ground within 5\skm/);
    expect(rowOf('IM-2 Athena').textContent).toMatch(/Modelled cold traps: none within 5\skm/);
    // A site the model does not reach, and one far from the pole, have no such line.
    expect(rowOf('Chandrayaan-3 Vikram').textContent).not.toMatch(/cold traps/);
    expect(rowOf('Apollo 11').textContent).not.toMatch(/cold traps/);
    // The line is the list's alone: with the list put away, the first screen keeps to its 48 words.
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(document.querySelector('[data-part="screen"]')!.textContent).not.toMatch(/cold traps/);
    for (const width of [WIDE, PHONE]) expect(visibleWords(document.querySelector('[data-part="screen"]')!, width).length).toBeLessThanOrEqual(48);
  });

  it('names the model the line comes from in the row of sources under the map, below the first screen', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} coldTraps={layer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'List' }, { timeout: 20_000 }));
    await waitFor(() => expect(rowOf('Shackleton rim summit').textContent).toMatch(/Modelled cold traps/), { timeout: 20_000 });
    const row = screen.getByLabelText('Data sources');
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m', 'NASA LRO LOLA 240 m', 'LRO Diviner temperature model', 'JPL DE440', 'Artemis III regions', 'CLPS mission records', 'LROC and NSSDCA lander positions', 'NASA CGI Moon Kit']);
    expect(within(row).getByRole('link', { name: 'LRO Diviner temperature model' }).getAttribute('href')).toBe('https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/');
    // The row is not part of the first screen, which the page counts to 48 words.
    expect(document.querySelector('[data-part="screen"]')!.contains(row)).toBe(false);
  });
});

describe('where the cold-trap line sits in a row', () => {
  it('is the row\'s last line, a line of its own under the figures', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} coldTraps={layer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'List' }, { timeout: 20_000 }));
    await waitFor(() => expect(rowOf('Haworth').textContent).toMatch(/Modelled cold traps/), { timeout: 20_000 });
    const line = rowOf('Haworth').lastElementChild!;
    expect(line.textContent).toMatch(/^, Modelled cold traps/);
    expect(line.className).toMatch(/(^|\s)block(\s|$)/);
  });
});
