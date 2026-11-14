// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VersionsSummary } from '@/lib/ensemble/figures';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { VersionsFold } from './VersionsFold';

const summary: VersionsSummary = {
  versions: 32,
  poweredH: [74, 79],
  firstSunsetH: [66, 69],
  noSunset: 0,
  longestNightH: [396, 402],
  poweredContactH: [0, 0],
  basis: 'verdict',
  held: 32,
  main: { poweredH: 76, allPeriod: false, firstSunsetH: 67, longestNightH: 399, poweredContactH: 0, meets: null },
};
const ready = { status: 'ready' as const, result: { summary, holdsByHour: null }, ms: 40 };

describe('VersionsFold', () => {
  it('stays two words until opened, then says how often the answer stands and each result’s range', () => {
    const { container } = render(<VersionsFold state={ready} startUtc="2027-01-01T00:00:00" days={30} />);
    const button = screen.getByRole('button', { name: 'Terrain versions' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    for (const width of [WIDE, PHONE]) expect(visibleWords(container, width).join(' ')).toBe('Terrain versions');
    fireEvent.click(button);
    expect(screen.getByText('The battery runs out in all 32 versions of the ground, as it does here.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toHaveLength(4);
    expect(screen.getByText(/not the chance that the landing works/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How the versions were made' }).getAttribute('href')).toBe('/validate#versions');
  });

  it('shows a plain waiting state while the versions are worked out', () => {
    render(<VersionsFold state={{ status: 'working' }} startUtc="2027-01-01T00:00:00" days={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terrain versions' }));
    expect(screen.getByRole('status').textContent).toBe('Working out this landing over every version of the ground…');
  });

  it('says why there are none for a point picked on the map, and shows nothing on a flat horizon', () => {
    const { rerender } = render(<VersionsFold state={{ status: 'none', reason: 'Terrain versions are drawn for the polar catalogue sites; a point picked on the map has none.' }} startUtc="2027-01-01T00:00:00" days={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terrain versions' }));
    expect(screen.getByText(/a point picked on the map has none/)).toBeTruthy();
    rerender(<VersionsFold state={{ status: 'none', reason: null }} startUtc="2027-01-01T00:00:00" days={30} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
