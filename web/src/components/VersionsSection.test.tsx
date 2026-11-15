// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import type { EnsembleIndex } from '@/lib/ensemble/versions';
import type { UncertaintyDoc } from '@/lib/uncertainty/budget';
import { outsideWords, VersionsSection } from './VersionsSection';

const index = readJson<EnsembleIndex>('data', 'ensemble', 'index.json');
const budget = readJson<UncertaintyDoc>('data', 'uncertainty', 'budget.json');

async function open(load: () => Promise<EnsembleIndex> = async () => index) {
  render(<VersionsSection load={load} uncertainty={async () => budget} />);
  return waitFor(() => screen.getByRole('region', { name: 'Terrain versions' }));
}

describe('VersionsSection', () => {
  it('sets how far the two generations of maps differ beside the error the newer one states, grid by grid', async () => {
    const region = await open();
    expect(region.id).toBe('versions');
    // In its fold, one tap away.
    expect(within(region).getByRole('button', { name: /The error model/ })).toBeTruthy();
    const table = within(region).getByRole('table', { name: 'The error model fitted to the two generations', hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true }).slice(1);
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['20 m', '80 m', '240 m']);
    const g80 = index.model['80'];
    expect(rows[1].textContent).toContain(`${Math.round(g80.length_m)} m`);
    expect(region.textContent).toContain(`${index.versions_per_site} versions of the ground`);
  });

  it('keeps what the versions show, what they cannot show and how they were made one tap away each', async () => {
    const region = await open();
    for (const name of ['What the versions show', 'What they cannot show', 'How they were made']) {
      const b = within(region).getByRole('button', { name });
      expect(b.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(b);
    }
    const sites = within(region).getByRole('table', { name: 'What the versions show at each site' });
    expect(sites.querySelectorAll('tbody tr')).toHaveLength(index.sites.length);
    expect(sites.textContent).toContain('Connecting Ridge');
    expect(region.textContent).toMatch(/not the chance that the landing works/);
  });

  it('names the sites whose own height the older maps put far from product 90’s', () => {
    const words = outsideWords(index, budget);
    expect(words).toMatch(/Shackleton rim summit \d\.\d m higher/);
    expect(words).toMatch(/peak near Shackleton|Peak near Shackleton/);
  });

  it('says plainly when the versions cannot be loaded', async () => {
    render(<VersionsSection load={() => Promise.reject(new Error('404'))} uncertainty={async () => budget} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy());
  });
});
