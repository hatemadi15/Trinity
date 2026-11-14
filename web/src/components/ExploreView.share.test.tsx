// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';

/** The page with the real catalogue and sky; `search` is the address it opens with. */
async function open(search = '') {
  window.history.replaceState({}, '', `/explore${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<ExploreView store={store} navigate={() => {}} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
  return { store, ...view };
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe("Explore's own address", () => {
  it('follows the site, the period and the settings, so a reload or a copied address opens the same figures', async () => {
    const { store } = await open('?site=haworth&start=2027-02-01&days=14&load=400');
    // The address it opened with is read before the page writes its own.
    await waitFor(() => expect(store.getState().siteId).toBe('haworth'));
    expect(store.getState().params.power.loadW).toBe(400);
    await waitFor(() => expect(window.location.search).toBe('?site=haworth&start=2027-02-01&days=14&load=400'));
    act(() => store.getState().setPower({ batteryWh: 9000 }));
    await waitFor(() => expect(window.location.search).toBe('?site=haworth&start=2027-02-01&days=14&load=400&battery=9000'));
    // Back to the defaults, the link is short again.
    act(() => store.getState().setPower({ loadW: 200, batteryWh: 2000 }));
    await waitFor(() => expect(window.location.search).toBe('?site=haworth&start=2027-02-01&days=14'));
    expect(window.location.pathname).toBe('/explore');
  });

  it('writes the full address for a plain visit, and keeps demo mode, the theme and the place on the page', async () => {
    await open('?demo=1&theme=dark#ask');
    await waitFor(() => expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30&demo=1&theme=dark'));
    expect(window.location.hash).toBe('#ask');
  });

  it('gives the view from the site and the brief the same settings', async () => {
    const { store } = await open('?site=haworth&load=400&earthmin=2');
    await waitFor(() => expect(store.getState().siteId).toBe('haworth'));
    act(() => store.getState().setCursor(66));
    const stand = '/explore/stand?site=haworth&start=2027-01-01&days=30&hour=66&load=400&earthmin=2';
    expect(within(screen.getByRole('region', { name: 'The answer' })).getByRole('link', { name: 'Stand at the site' }).getAttribute('href')).toBe(stand);
    expect(within(screen.getByRole('region', { name: 'The ground' })).getByRole('link', { name: 'Stand at the site' }).getAttribute('href')).toBe(stand);
    expect(screen.getByRole('link', { name: 'Printable brief' }).getAttribute('href')).toBe('/brief?site=haworth&start=2027-01-01&days=30&load=400&earthmin=2');
  });
});
