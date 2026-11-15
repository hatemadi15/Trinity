// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { coldTrapSite, type ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import type { Site } from '@/lib/data/loaders';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { WhereOnMoon } from './WhereOnMoon';

const site: Site = { id: 'shackleton_center_rim_high', name: 'Shackleton rim', label: 'Shackleton rim summit', blurb: 'The highest point of the rim', lat: -89.78131, lon: -156.25683, category: 'classic', polar: true, source: 's' };
const ground = { height_error_m: 0.2, effective_resolution_m: 16, slope_deg: 3, slope_error_deg: 0.4, roughness_100m_m: 0.4, nearest_psr_km: 0.06, psr_search_km: 10 };
const cold = coldTrapSite(readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json'), site.id);

describe('WhereOnMoon with the modelled cold traps', () => {
  it('gives one small line on the cold traps after the ground, worded as modelled conditions, with the way to what a cold trap is', () => {
    render(<WhereOnMoon site={site} sites={[site]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} wide ground={ground} coldTraps={cold} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    const line = within(panel).getByText(/^Modelled cold traps: within 5\skm, 11\.5\skm² stays below 110\sK/);
    expect(line.className).toMatch(/text-\[15px\]/);
    expect(line.textContent).toMatch(/conditions where ice could last; the nearest is 2\.7\skm away, with slopes up to 36° on a straight line there\. What a cold trap is$/);
    // Both wait one tap away, in a fold under the place's own line.
    expect(within(panel).getByRole('button', { name: /Ground detail and cold traps/ }).getAttribute('aria-expanded')).toBe('false');
    const ground_ = within(panel).getByText(/^The ground here/);
    expect(ground_.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(line).getByRole('link', { name: 'What a cold trap is', hidden: true }).getAttribute('href')).toBe('/learn#cold-traps');
    // The row of sources names the model the line comes from.
    const sources = within(within(panel).getByLabelText('Data sources')).getAllByRole('listitem').map((li) => li.textContent);
    expect(sources).toEqual(['NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m', 'LRO Diviner temperature model', 'JPL DE440', 'Artemis III regions', 'CLPS mission records']);
  });

  it('says nothing of cold traps without the layer, and its row of sources leaves the model out', () => {
    render(<WhereOnMoon site={site} sites={[site]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} wide ground={ground} />);
    expect(screen.queryByText(/cold traps/)).toBeNull();
    expect(screen.getByLabelText('Data sources').textContent).not.toMatch(/Diviner/);
  });
});
