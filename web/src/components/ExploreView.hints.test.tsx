// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { ExploreView } from './ExploreView';

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

describe('ExploreView hints', () => {
  it('says when the skyline is being recomputed for a new mast, and describes a flat mare skyline', async () => {
    const store = storeWithFiles();
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.queryByText(/recomputing the skyline/)).toBeNull();
    act(() => store.setState({ maskBusy: true }));
    expect(screen.getByText(/recomputing the skyline for a 2 m mast/)).toBeTruthy();
    act(() => store.setState({ maskBusy: false }));
    await act(() => store.getState().selectSite('blue_ghost_m1'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Blue Ghost/));
    expect(screen.getByText(/flat horizon \(no LOLA polar coverage\)/)).toBeTruthy();
  });

  it('applies the URL query once the data is loaded', async () => {
    window.history.pushState({}, '', '/explore?site=haworth&days=14');
    const store = storeWithFiles();
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Haworth/));
    expect(store.getState().days).toBe(14);
    window.history.pushState({}, '', '/explore');
  });
});
