// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
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
  it('gives each polar row its cold ground within 5 km in one short line, and the first screen keeps its 105 words', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} navigate={() => {}} coldTraps={layer} />);
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
    await waitFor(() => expect(rowOf('Shackleton rim summit').textContent).toMatch(/Modelled cold traps, where ice could last: 11\.5\skm² within 5\skm/), { timeout: 20_000 });
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/Modelled cold traps, where ice could last: all the ground within 5\skm/);
    expect(rowOf('IM-2 Athena').textContent).toMatch(/Modelled cold traps, where ice could last: none within 5\skm/);
    // A site the model does not reach, and one far from the pole, have no such line.
    expect(rowOf('Chandrayaan-3 Vikram').textContent).not.toMatch(/cold traps/);
    expect(rowOf('Apollo 11').textContent).not.toMatch(/cold traps/);
    // The first screen as the site list's own test counts it: the title band, the three steps and the map.
    const main = document.querySelector('main')!;
    const top = [...main.children].filter((el) => !el.classList.contains('wrap') || el.tagName === 'OL');
    const map = main.querySelector('section[aria-label="Map of the sites"]')!;
    for (const width of [WIDE, PHONE]) expect([...top, map].reduce((sum, el) => sum + visibleWords(el, width).length, 0)).toBeLessThanOrEqual(105);
  });
});

describe('where the cold-trap line sits in a row', () => {
  it('spans the whole row under the figures, so the narrow site column does not grow', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} navigate={() => {}} coldTraps={layer} />);
    await waitFor(() => expect(rowOf('Haworth').textContent).toMatch(/Modelled cold traps/), { timeout: 20_000 });
    const line = [...rowOf('Haworth').children].find((el) => el.textContent?.includes('Modelled cold traps'))!;
    expect(line.className).toMatch(/(^|\s)col-span-full(\s|$)/);
    expect(line.parentElement).toBe(rowOf('Haworth'));
  });
});
