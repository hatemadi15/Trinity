// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bandsForSite, type Samplers } from '@/lib/engine/horizon';
import { lolaFor, SOURCE_LABELS, Sources, type SourceKey } from './Sources';

const row = () => screen.getByLabelText('Data sources');
const pills = () => within(row()).getAllByRole('listitem').map((li) => li.textContent);

describe('Sources', () => {
  it('names each dataset in a pill of its own, in the order given', () => {
    render(<Sources of={['de440', 'lola', 'artemis', 'clps']} />);
    expect(row().tagName).toBe('UL');
    expect(pills()).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m', 'Artemis III regions', 'CLPS mission records']);
  });

  it('links the check against JPL Horizons to the Accuracy page, and nothing else', () => {
    render(<Sources of={['de440', 'horizons']} />);
    const link = within(row()).getByRole('link', { name: 'checked: JPL Horizons' });
    expect(link.getAttribute('href')).toBe('/validate');
    expect(within(row()).getAllByRole('link')).toHaveLength(1);
  });

  it('draws no pill for an unknown key, one pill for a key named twice, and no row when no pill is left', () => {
    const { unmount } = render(<Sources of={['lola80', 'nasa' as SourceKey, 'toString' as SourceKey, 'lola80']} />);
    expect(pills()).toEqual(['NASA LRO LOLA 80 m']);
    unmount();
    render(<Sources of={['nasa' as SourceKey]} />);
    expect(screen.queryByLabelText('Data sources')).toBeNull();
  });

  it('keeps the row quiet: outline pills of 14 px grey words with no fill, the link underlined only on hover', () => {
    render(<Sources of={Object.keys(SOURCE_LABELS) as SourceKey[]} />);
    expect(row().className).toMatch(/(^|\s)text-\[14px\](\s|$)/);
    expect(row().className).toMatch(/(^|\s)text-ink-2(\s|$)/);
    const shown = within(row()).getAllByRole('listitem').map((li) => li.firstElementChild as HTMLElement);
    expect(shown).toHaveLength(12);
    for (const pill of shown) {
      expect(pill.className).toMatch(/(^|\s)rounded-full(\s|$)/);
      expect(pill.className).toMatch(/(^|\s)border(\s|$)/);
      expect(pill.className).not.toMatch(/(^|\s)(hover:)?bg-/);
    }
    const link = within(row()).getByRole('link');
    expect(link.className).toMatch(/(^|\s)hover:underline(\s|$)/);
    expect(link.className).not.toMatch(/(^|\s)underline(\s|$)/);
  });

  it('names the LOLA grid a site’s hills start on, as the engine reads them: 20 m near the pole, 80 m farther out, none off the polar grids', () => {
    // The engine's own bands are the reference: a pill that named another grid would claim data the site does not use.
    const samplers = { L0: 'L0', L1: 'L1', L2: 'L2' } as unknown as Samplers;
    for (const lat of [-90, -88.28, -87.55, -87.54, -86, -80.13]) {
      const fine = bandsForSite(lat, samplers)[0].sampler === samplers.L0;
      expect(lolaFor({ lat, polar: true }), `${lat}°`).toEqual([fine ? 'lola' : 'lola80']);
    }
    // North of 80° S the 80 m grid has no data: the engine marches the whole skyline again on the 240 m grid.
    for (const lat of [-79.9, -69.37, -60]) expect(lolaFor({ lat, polar: true }), `${lat}°`).toEqual(['lola240']);
    expect(lolaFor({ lat: 18.56, polar: false })).toEqual([]);
    expect(lolaFor({ lat: -86, polar: true }, { lat: 18.56, polar: false }, { lat: -88.28, polar: true })).toEqual(['lola', 'lola80']);
  });
});
