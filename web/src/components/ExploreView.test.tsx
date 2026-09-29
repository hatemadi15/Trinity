// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { DataError, type Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { ExploreView } from './ExploreView';

describe('ExploreView', () => {
  it('renders the data-missing state', async () => {
    const store = createExploreStore({
      loadSites: async () => {
        throw new DataError('/data/sites.json', 404);
      },
      loadEphemeris: async () => {
        throw new DataError('/data/ephemeris/x', 404);
      },
      loadMask: async () => {
        throw new DataError('/data/masks/x', 404);
      },
    });
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles/));
  });

  it('renders the ready state with the site, tiles, readout and a failed-tiles note', async () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const sites = [
      ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
      ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
    ];
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id) => {
        const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
        return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
      },
    });
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Shackleton/));
    expect(screen.getByText('Sun above the skyline')).toBeTruthy();
    expect(screen.getByTestId('readout').textContent).toMatch(/2027-01-01 00:00 UTC: Sun .* the skyline/);
    store.getState().applyMask(
      { id: 'custom', name: 'Custom', lat: -89.5, lon: 1, category: 'custom', polar: true, source: 'user' },
      new Float64Array(720),
      { siteHeightM: 0, source: 'computed', failedTiles: 3 },
    );
    await waitFor(() => expect(screen.getByText(/3 terrain tiles could not be loaded/)).toBeTruthy());
  });
});
