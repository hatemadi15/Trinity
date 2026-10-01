// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import Home from './page';

describe('home page', () => {
  it('says what the product does in the headline and offers one gold action', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See when a Moon lander has sunlight and a signal.');
    const cta = screen.getByRole('link', { name: 'Explore a landing site' });
    expect(cta.getAttribute('href')).toBe('/explore');
    expect(cta.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('main .btn-primary').length).toBe(1);
  });

  it('shows the computed shadow picture with its two labels and says what it is', () => {
    render(<Home />);
    const img = screen.getByRole('img', { name: /shadows/i });
    expect(img.getAttribute('src')).toMatch(/de-gerlache-rim-2/);
    expect(screen.getByText('in shadow')).toBeTruthy();
    expect(screen.getByText('in sunlight')).toBeTruthy();
    expect(screen.getByText(/computed from NASA elevation data/)).toBeTruthy();
  });

  it('explains why the south pole is hard in three steps, with the real pair of sites', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    expect(within(why).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The Sun never climbs', 'The hills decide', 'Earth sets too']);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.distance_km)} km away`);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.site_sun_pct)} %`);
  });

  it('shows the real month at the site as a chart with the night in words', () => {
    render(<Home />);
    const real = screen.getByRole('region', { name: 'See it at a real site' });
    expect(within(real).getByRole('img').getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(within(real).getByRole('link', { name: /play the month/ }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2');
  });

  it('opens three real missions with their outcomes', () => {
    render(<Home />);
    const cards = screen.getByRole('region', { name: 'Start from a real mission' });
    expect(within(cards).getByText('Ended after one day')).toBeTruthy();
    expect(within(cards).getByText('Worked all 14 days')).toBeTruthy();
    expect(within(cards).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/explore?site=im2_athena&start=2025-03-06', '/explore?site=blue_ghost_m1&start=2025-03-02', '/explore?site=de_gerlache_rim_2']);
  });

  it('gives three checks against NASA with a yardstick, from the validation figures', () => {
    render(<Home />);
    const proof = screen.getByRole('region', { name: 'Checked against NASA' });
    expect(proof.textContent).toContain('0.00003°');
    expect(proof.textContent).toContain('20,000 times wider');
    expect(proof.textContent).toContain(`${HOME.facts.mazarico_median_points.toFixed(1)} points`);
    expect(proof.textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(within(proof).getByRole('link', { name: /See every check/ }).getAttribute('href')).toBe('/validate');
  });

  it('keeps instrument and programme names out of the main copy', () => {
    render(<Home />);
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });
});
