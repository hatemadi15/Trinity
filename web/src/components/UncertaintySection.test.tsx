// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import type { UncertaintyDoc } from '@/lib/uncertainty/budget';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { UncertaintySection } from './UncertaintySection';

const doc = readJson<UncertaintyDoc>('data', 'uncertainty', 'budget.json');

async function open(load: () => Promise<UncertaintyDoc> = async () => doc) {
  render(<UncertaintySection load={load} />);
  return waitFor(() => screen.getByRole('region', { name: 'How sure the times are' }));
}

describe('UncertaintySection', () => {
  it('leads with the four conditions the review asks for and the margin each event carries there', async () => {
    const region = await open();
    expect(region.id).toBe('sure');
    const table = within(region).getByRole('table', { name: 'Margins at four kinds of site' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual([
      'Connecting Ridge: a grazing Sun at a polar ridge',
      'Shackleton rim summit: a crater-rim high point',
      'IM-2 Athena: Earth skimming the horizon',
      'Blue Ghost Mission 1: far from the pole, flat horizon',
    ]);
    const heads = within(table).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads.slice(1)).toEqual(['Sunset', 'Sunrise', 'Earth sets', 'Earth rises', 'Battery runs out']);
    const ridge = doc.sites.find((s) => s.site_id === 'connecting_ridge')!;
    expect(within(rows[0]).getAllByRole('cell')[0].textContent).toBe(`±${ridge.events.sunset.shown_h} h`);
    // Earth never sets at Blue Ghost's site.
    expect(within(rows[3]).getAllByRole('cell')[2].textContent).toBe('none');
  });

  it('keeps each source apart one tap away: the hourly steps, the terrain data and the planets’ positions', async () => {
    const region = await open();
    const fold = within(region).getByRole('button', { name: 'Each source apart' });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fold);
    const table = within(region).getByRole('table', { name: 'Each source apart' });
    const heads = within(table).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads).toEqual(['Site', 'Event', 'Events', 'Hourly steps', 'Terrain data', 'Planets’ positions', 'Margin']);
    expect(table.textContent).toMatch(/flat horizon, 2\.5 h allowed/);
  });

  it('shows the totals with the adjusted maps, every featured site, the ground at each and how it was measured, each folded', async () => {
    const region = await open();
    for (const name of ['The totals with the adjusted maps', 'Every featured site', 'The ground at each site', 'How it was measured']) {
      const b = within(region).getByRole('button', { name });
      expect(b.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(b);
    }
    expect(within(region).getByRole('table', { name: 'Every featured site' }).querySelectorAll('tbody tr')).toHaveLength(doc.sites.length);
    expect(within(region).getByRole('table', { name: 'The ground at each site' }).textContent).toMatch(/Connecting Ridge/);
    expect(within(region).getByRole('table', { name: 'The totals with the adjusted maps' }).textContent).toMatch(/Shackleton rim summit/);
    const links = within(region).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF');
    expect(region.textContent).toMatch(/Barker et al\. 2023/);
  });

  it('keeps its first screen short, has no gold action, and keeps its text at 14 px or more', async () => {
    const region = await open();
    for (const width of [WIDE, PHONE]) expect(visibleWords(region, width).length).toBeLessThanOrEqual(150);
    expect(region.querySelectorAll('.btn-primary')).toHaveLength(0);
    for (const el of region.querySelectorAll('[class*="text-["]')) expect(el.className).not.toMatch(/text-\[(1[0-3]|[0-9])px\]/);
  });

  it('says so in plain words when the margins cannot be loaded', async () => {
    render(
      <UncertaintySection
        load={async () => {
          throw new Error('HTTP 404');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('The margins could not be loaded. Reload the page, or try again in a minute.')).toBeTruthy());
  });
});
