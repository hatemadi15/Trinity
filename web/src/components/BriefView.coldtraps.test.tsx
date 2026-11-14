// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { BriefView } from './BriefView';

async function storeAt(siteId: string) {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
  const store = createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  });
  await store.getState().init();
  await store.getState().selectSite(siteId);
  return store;
}
const layer = async () => readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json');
const noBudget = async () => {
  throw new Error('HTTP 404');
};

describe('BriefView with the modelled cold traps', () => {
  it('prints the cold traps with the method, in full, as modelled conditions, and names Diviner among the data', async () => {
    render(<BriefView store={await storeAt('connecting_ridge')} uncertainty={noBudget} coldTraps={layer} />);
    const method = screen.getByRole('heading', { name: 'How this was computed' }).parentElement!;
    await waitFor(() => expect(method.textContent).toMatch(/Modelled cold traps: within 5\skm, 1\.2\skm² stays below 110\sK/));
    expect(method.textContent).toMatch(/the nearest is 2\.5\skm away, with slopes up to 20° on a straight line there\. On 24\.7\skm² within 5\skm, ice could last at the surface or within half a metre below it\. These are modelled conditions where ice could last, not a finding that any is there, how much or how deep\./);
    const data = screen.getByRole('heading', { name: 'Data' }).parentElement!;
    expect(data.textContent).toMatch(/NASA LRO Diviner Polar Resource Product \(Paige et al\. 2010\)/);
  });

  it('leaves the cold traps out without the layer', async () => {
    render(<BriefView store={await storeAt('connecting_ridge')} uncertainty={noBudget} coldTraps={noBudget} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).not.toMatch(/cold traps|Diviner/);
  });
});
