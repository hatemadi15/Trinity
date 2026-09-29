// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
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

describe('CompareView rows', () => {
  it('shows "Both at once" instead of repeating the brownout hours the verdict chip already carries', async () => {
    const store = storeWithFiles();
    await store.getState().init();
    await store.getState().addToCompare('nobile_rim_2');
    render(<CompareView store={store} />);
    const column = await screen.findByRole('article', { name: /Nobile Rim 2/ });
    await waitFor(() => expect(within(column).getByText('Both at once')).toBeTruthy());
    expect(within(column).queryByText('Hours without full power')).toBeNull();
    expect(within(column).getByText('Lowest battery')).toBeTruthy();
  });
});
