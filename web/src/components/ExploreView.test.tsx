// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { DataError, type Site } from '@/lib/data/loaders';
import type { Heightmap, HeightmapMeta } from '@/lib/data/terrain';
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
    // jsdom has no WebGL: the 3D panel shows its fallback, proving the scene mounted with the site.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/));
    expect(screen.getByRole('button', { name: 'Globe' })).toBeTruthy();
    expect(screen.getByTestId('readout').textContent).toMatch(/2027-01-01 00:00 UTC: Sun .* the skyline/);
    store.getState().applyMask(
      { id: 'custom', name: 'Custom', lat: -89.5, lon: 1, category: 'custom', polar: true, source: 'user' },
      new Float64Array(720),
      { siteHeightM: 0, source: 'computed', failedTiles: 3 },
    );
    await waitFor(() => expect(screen.getByText(/3 terrain tiles could not be loaded/)).toBeTruthy());
    expect(screen.getByText(/Terrain data is not loaded/)).toBeTruthy();
  });

  it('carries the planner settings, the verdict, the best-window button and add-to-compare', async () => {
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
    expect(screen.getByRole('button', { name: /Planner settings/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Best 30-day window from here/ })).toBeTruthy();
    expect(screen.getByText('Survives the window')).toBeTruthy(); // 4 m² vertical tracking on the rim
    expect(screen.getByText('Lowest battery')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add to compare' }));
    await waitFor(() => expect(screen.getByText('Compared sites (1)')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'In compare' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('link', { name: 'Export brief' })).toBeTruthy();
  });

  it('in Learn mode shows the guided story, whose terrain step notes the missing WebGL', async () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const sites = readJson<{ sites: Site[] }>('data', 'sites.json').sites;
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id) => {
        const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
        return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
      },
    });
    store.getState().setAudience('learn');
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('list', { name: 'Guided story' })).toBeTruthy());
    const story = screen.getByRole('region', { name: 'Guided story' });
    fireEvent.click(within(story).getByRole('button', { name: 'Next' }));
    expect(within(story).getByText(/needs WebGL/)).toBeTruthy();
    expect(screen.queryByText('Both at once')).toBeNull();
    store.getState().setAudience('planner');
  });

  it('captions the terrain while it loads, then the cap fallback, and shows a refused globe pick', async () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const sites = readJson<{ sites: Site[] }>('data', 'sites.json').sites;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const capMeta: HeightmapMeta = {
      site_id: 'south_cap', lat: -90, lon: 0, kind: 'cap', source: 'synthetic', level: 'L2', cell_m: 960,
      width: 5, height: 5, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1,
      site_height_m: 0, line_offset_px: 2, sample_offset_px: 2, site_row_px: 2, site_col_px: 2, fill_source: null,
    };
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id) => {
        const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
        return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
      },
      loadTerrainManifest: async () => ({ version: 1, windows: [], cap: { file: 'cap.u16', meta: 'cap.json' }, globe_texture: 'moon.jpg' }),
      loadHeightmap: async (): Promise<Heightmap> => {
        await gate;
        return { meta: capMeta, heightsM: new Float32Array(25) };
      },
    });
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByText('Loading terrain…')).toBeTruthy());
    release();
    await waitFor(() => expect(screen.getByText(/showing the 960 m south-cap model/)).toBeTruthy());
    act(() => {
      store.getState().setMode('globe');
      store.getState().setCustomError('no DEM coverage north of 60S (lat 12.00)');
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'no DEM coverage north of 60S (lat 12.00). Custom sites need LOLA coverage south of 60°S.',
    );
  });
});
