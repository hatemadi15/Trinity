// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ENERGY_ONLY } from '@/components/PowerScope';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { SureFold } from './SureFold';

const sure = {
  lines: ['Sunset 3 Jan 02:00 UTC, within about 2 h.', 'Battery runs out 3 Jan 12:00 UTC, within about 3.5 h.'],
  basis: 'Measured at this site: the hourly steps against one-minute steps.',
  widest: 3.5,
};

describe('SureFold', () => {
  it('says on its closed button how sure the times are, and keeps the times one tap away', () => {
    const { container } = render(<SureFold sure={sure} />);
    const button = screen.getByRole('button', { name: 'Times ±3.5 h' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    for (const width of [WIDE, PHONE]) expect(visibleWords(container, width).join(' ')).toBe('Times ±3.5 h');
    fireEvent.click(button);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(sure.lines);
    expect(screen.getByText(sure.basis)).toBeTruthy();
  });

  it('says the power figures count energy only, and links to how the margins were measured', () => {
    render(<SureFold sure={sure} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(ENERGY_ONLY)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How the margins were measured' }).getAttribute('href')).toBe('/validate#sure');
  });

  it('with no measured times still says what the figures leave out', () => {
    render(<SureFold sure={{ lines: [], basis: null, widest: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'What this leaves out' }));
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(ENERGY_ONLY)).toBeTruthy();
  });
});
