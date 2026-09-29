// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { CompareView } from './CompareView';

function storeWithFiles() {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [
    ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
    ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
  ];
  return createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  });
}

describe('CompareView', () => {
  it('shows the empty state, then one column per compared site with KPIs and a verdict', async () => {
    const store = storeWithFiles();
    render(<CompareView store={store} />);
    await waitFor(() => expect(screen.getByText(/Add up to four sites/)).toBeTruthy());
    await store.getState().addToCompare('shackleton_center_rim_high');
    await store.getState().addToCompare('shackleton_center');
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    const cols = screen.getAllByRole('article');
    expect(cols[0].textContent).toMatch(/Shackleton crater rim/);
    expect(cols[0].textContent).toMatch(/Sun above the skyline/);
    expect(cols[0].querySelector('[data-tone]')).toBeTruthy();
    expect(cols[1].textContent).toMatch(/Shackleton crater centre/);
    expect(cols[1].textContent).toMatch(/Battery empties after/);
    fireEvent.click(within(cols[1]).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(1));
  });

  it('disables adding at four sites', async () => {
    const store = storeWithFiles();
    render(<CompareView store={store} />);
    await waitFor(() => expect(screen.getByText(/Add up to four sites/)).toBeTruthy());
    for (const id of ['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena']) await store.getState().addToCompare(id);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(4));
    expect((screen.getByRole('combobox', { name: 'Add site' }) as HTMLSelectElement).disabled).toBe(true);
  });
});
