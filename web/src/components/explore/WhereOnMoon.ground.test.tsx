// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { WhereOnMoon } from './WhereOnMoon';

const site: Site = { id: 'connecting_ridge', name: 'Connecting Ridge', label: 'Connecting Ridge', blurb: 'The ridge between Shackleton and de Gerlache craters', lat: -89.53432, lon: -150.05233, category: 'classic', polar: true, source: 's' };
const ground = { height_error_m: 0.189, effective_resolution_m: 15.96, slope_deg: 0.489, slope_error_deg: 0.394, roughness_100m_m: 0.404, nearest_psr_km: 0.1, psr_search_km: 10 };

describe('WhereOnMoon with the ground', () => {
  it('describes the ground under the line about the place, small', () => {
    render(<WhereOnMoon site={site} sites={[site]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} wide ground={ground} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    const line = screen.getByText(/^The ground here, from NASA’s adjusted south-pole maps: slope 0\.5°/);
    expect(panel.contains(line)).toBe(true);
    expect(line.className).toMatch(/text-\[15px\]/);
    expect(panel.textContent).toMatch(/Connecting Ridge\. The ridge between Shackleton and de Gerlache craters\./);
  });

  it('says nothing of the ground without a measurement', () => {
    render(<WhereOnMoon site={site} sites={[site]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} wide />);
    expect(screen.queryByText(/^The ground here/)).toBeNull();
  });
});
