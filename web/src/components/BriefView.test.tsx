// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { BriefView } from './BriefView';

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

describe('BriefView', () => {
  it('renders a one-page brief with the site, window, KPIs, verdict, charts, method and credits, and prints', async () => {
    const store = storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Shackleton crater rim/));
    expect(screen.getByText(/2027-01-01 00:00 UTC/)).toBeTruthy();
    expect(screen.getByText('Sun above the skyline')).toBeTruthy();
    expect(screen.getByText('Longest Earth gap')).toBeTruthy();
    expect(screen.getByText('Survives the window')).toBeTruthy();
    expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2); // timeline and sky dome
    expect(screen.getByRole('heading', { name: 'How this was computed' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Data' })).toBeTruthy();
    expect(screen.getByText(/NASA LRO LOLA polar elevation models/)).toBeTruthy();
    expect(screen.getByText(/precomputed skyline/)).toBeTruthy();
    expect(screen.getByText(/Vertical, turns to the Sun/)).toBeTruthy();
    expect(screen.getByText(/team Astroy\/Ed\)\.$/)).toBeTruthy(); // no unfilled placeholder in the footer
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /Print or save as PDF/ }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('renders a custom site with its computed provenance', async () => {
    const store = storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    act(() => {
      store.getState().applyMask(
        { id: 'custom_x', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' },
        new Float64Array(720).fill(1),
        { siteHeightM: 100, source: 'computed', failedTiles: 0 },
      );
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Custom site/));
    expect(screen.getByText(/skyline computed in your browser/)).toBeTruthy();
    expect(screen.getByText(/coordinates picked by the user/)).toBeTruthy();
  });
});
