// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { ExploreView } from '../ExploreView';

/** The worker's skyline, faked with the centre's own: each point round the site still sees the Sun and Earth from where it is. */
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const computeMask = async () => ({ mask, siteHeightM: 1, failedTiles: 0 });

async function open() {
  window.history.replaceState({}, '', '/explore');
  const store = createExploreStore(fileLoaders({ computeMask }));
  render(<ExploreView store={store} navigate={() => {}} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
  return store;
}
const panel = () => screen.getByRole('region', { name: 'The answer' });

afterEach(() => window.history.replaceState({}, '', '/'));

describe('Explore’s recommendations, with the requirements and the range round an approximate point', () => {
  it('gives the range round de Gerlache Rim 2, a region centre known to about 5 km, next to the result once its points are worked out', async () => {
    const store = await open();
    await waitFor(() => expect(within(panel()).getByText(/^Within 5 km \(9 points\): power \d/)).toBeTruthy(), { timeout: 20_000 });
    expect(store.getState().neighbourhood?.points).toHaveLength(8);
    // The first screen keeps to its 110 words with the range on it.
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel(), width).length).toBeLessThanOrEqual(110);
  });

  it('ranks the better date with the requirements set in the panel, and says what it meets and fails', async () => {
    const store = await open();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Options' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Power for at least (days)' }), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Longest time without Earth while powered at most (days)' }), { target: { value: '3' } });
    expect(store.getState().requirements).toMatchObject({ minPoweredH: 120, maxOutageH: 72 });
    const gold = panel().querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toBe('Land on 20 January instead');
    const text = () => panel().textContent!.replace(/\s+/g, ' ');
    await waitFor(() => expect(text()).toContain('It fails fewer requirements than landing at the period start: 1 against 2.'));
    expect(text()).toContain('Landing at the period start, 1 January, 00:00 UTC: Fails 2 of your 2 requirements.');
    expect(text()).toContain('Meets Power for at least 5 d: 12 d 15 h, 7 d 15 h to spare');
    expect(text()).toContain('Fails Longest time without Earth while powered at most 3 d: 9 d 10 h, 6 d 10 h too long');
    expect(text()).toContain('Ranked by the longest continuous time with power from landing');
    expect(text()).toContain('Landing times tried every hour of these 30 days (UTC), each for a 30-day stay.');
  });

  it('lists the places nearby, the rim summit among them, with their trade-offs against this site', async () => {
    await open();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Options' }));
    const places = within(panel()).getByRole('region', { name: 'Places nearby' });
    await waitFor(() => expect(within(places).getByRole('listitem', { name: 'de Gerlache rim summit, 12 km away' })).toBeTruthy(), { timeout: 20_000 });
    expect(within(places).getByRole('listitem', { name: 'de Gerlache rim summit, 12 km away' }).textContent).toContain('Against this site: Power +26 d 20 h');
  });

  it('lists the 12-month search’s landing times in the panel once it has run, each with its trade-offs', async () => {
    const store = await open();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Find the best date in the next 12 months' }));
    await waitFor(() => expect(store.getState().yearPlan).not.toBeNull());
    fireEvent.click(within(panel()).getByRole('button', { name: 'Options' }));
    const year = within(panel()).getByRole('region', { name: 'Over the next 12 months' });
    expect(year.textContent).toContain('Landing times tried every 6 hours over the next 12 months (UTC), each for a 30-day stay.');
    expect(within(year).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    expect(year.textContent).toContain('Against the date the search started from: Power +10 d 17 h');
  });
});
