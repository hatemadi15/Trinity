// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ENERGY_ONLY, POWER_SCOPE_LINE } from '@/components/PowerScope';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import type { UncertaintyDoc } from '@/lib/uncertainty/budget';
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
const budget = async () => readJson<UncertaintyDoc>('data', 'uncertainty', 'budget.json');

describe('BriefView with the uncertainty budget', () => {
  it('prints each time with its supported margin and where the margins come from', async () => {
    render(<BriefView store={await storeAt('de_gerlache_rim_2')} uncertainty={budget} />);
    const sure = await waitFor(() => screen.getByRole('region', { name: 'How sure these times are' }));
    const lines = within(sure).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^(Sunset|Sunrise|Earth rises|Earth sets|Battery runs out|Power back) \d{1,2} [A-Z][a-z]{2} \d\d:\d\d UTC, within about [\d.]+ (h|min)\.$/);
    expect(sure.textContent).toMatch(/Measured at this site/);
    // Printed, not folded: nothing in it waits behind a button.
    expect(within(sure).queryByRole('button')).toBeNull();
  });

  it('states the power model’s scope with the lander, and the ground with the method', async () => {
    render(<BriefView store={await storeAt('de_gerlache_rim_2')} uncertainty={budget} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'How sure these times are' })).toBeTruthy());
    const lander = screen.getByRole('heading', { name: 'The lander' }).parentElement!;
    expect(lander.textContent).toContain(POWER_SCOPE_LINE);
    expect(lander.textContent).toContain(ENERGY_ONLY);
    const method = screen.getByRole('heading', { name: 'How this was computed' }).parentElement!;
    expect(method.textContent).toMatch(/The ground here, from NASA’s adjusted south-pole maps: slope/);
    expect(method.textContent).not.toMatch(/times within 15 to 60 minutes/);
    const data = screen.getByRole('heading', { name: 'Data' }).parentElement!;
    expect(data.textContent).toMatch(/NASA PGDA product 90 \(Barker et al\. 2023\)/);
  });

  it('without the budget still states the scope, and claims no margin', async () => {
    render(
      <BriefView
        store={await storeAt('de_gerlache_rim_2')}
        uncertainty={async () => {
          throw new Error('HTTP 404');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The lander' })).toBeTruthy());
    expect(screen.queryByRole('region', { name: 'How sure these times are' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'The lander' }).parentElement!.textContent).toContain(ENERGY_ONLY);
  });
});
