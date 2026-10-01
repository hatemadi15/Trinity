// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import Home from './page';

describe('home page', () => {
  it('says what the product does in the headline, offers one gold action and says who it is for', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See when a Moon lander has sunlight and a signal.');
    const cta = screen.getByRole('link', { name: 'Explore a landing site' });
    expect(cta.getAttribute('href')).toBe('/explore');
    expect(cta.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('main .btn-primary').length).toBe(1);
    expect(screen.getByText('For mission planners, educators and anyone curious.')).toBeTruthy();
  });

  it('opens on a real forecast: the month at the site as a chart with its title, its key and the night in words', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: 'See when a Moon lander has sunlight and a signal.' });
    const chart = within(hero).getByRole('img', { name: /The Sun at de Gerlache Rim 2, January 2027/ });
    expect(chart.getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(hero.textContent).toContain('A real forecast: the Sun at de Gerlache Rim 2, January 2027');
    expect(within(hero).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['height of the Sun', 'Sun hidden', "hills in the Sun's direction"]);
    expect(chart.textContent).toMatch(/Night for 16 days 15 hours/);
    expect(chart.textContent).toMatch(/5° up/);
    expect(chart.textContent).toMatch(/level ground/);
    // One time scale only: the compass row belongs to Explore.
    expect(chart.textContent).not.toMatch(/Direction of the Sun|north|south/);
    expect(chart.querySelector('.reveal-line')).toBeTruthy();
  });

  it('marks the black hero as a stage, so its buttons and links get the focus ring that shows on black', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: 'See when a Moon lander has sunlight and a signal.' });
    expect(hero.hasAttribute('data-stage')).toBe(true);
    expect(hero.contains(screen.getByRole('link', { name: 'Explore a landing site' }))).toBe(true);
  });

  it('says under the forecast what the site is and where the numbers come from, and links to the site', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: 'See when a Moon lander has sunlight and a signal.' });
    expect(hero.textContent).toMatch(/de Gerlache Rim 2 is a ridge NASA shortlisted for a crewed landing/);
    expect(hero.textContent).toMatch(/NASA's elevation map of the Moon and NASA's positions of the Sun and Earth/);
    expect(within(hero).getByRole('link', { name: /play the month/ }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2');
  });

  it('explains why the south pole is hard in three steps, with the real pair of sites', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    expect(within(why).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The Sun never climbs', 'The hills decide', 'Earth sets too']);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.distance_km)} km away`);
    expect(why.textContent).toContain(`${Math.round(HOME.pair.site_sun_pct)} %`);
  });

  it('starts from a real place: the computed shadow picture beside three places, in the order the sentence names them', () => {
    render(<Home />);
    const places = screen.getByRole('region', { name: 'Start from a real place' });
    expect(places.textContent).toMatch(/A ridge NASA has shortlisted for astronauts, and two landers that reached the Moon in March 2025/);
    const img = within(places).getByRole('img', { name: /shadows/i });
    expect(img.getAttribute('src')).toMatch(/de-gerlache-rim-2/);
    expect(within(places).getByText('in shadow')).toBeTruthy();
    expect(within(places).getByText('in sunlight')).toBeTruthy();
    expect(within(places).getByText('de Gerlache Rim 2: shadows computed for 2 January 2027')).toBeTruthy();
    expect(places.textContent).toMatch(/Computed from NASA elevation data, not a photograph/);
    expect(within(places).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['de Gerlache Rim 2', 'Athena lander (IM-2), March 2025', 'Blue Ghost lander, March 2025']);
    expect(within(places).getAllByRole('listitem')).toHaveLength(3);
    expect(within(places).getByText('Ended after one day')).toBeTruthy();
    expect(within(places).getByText('Worked all 14 days')).toBeTruthy();
    expect(within(places).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/explore?site=de_gerlache_rim_2', '/explore?site=im2_athena&start=2025-03-06', '/explore?site=blue_ghost_m1&start=2025-03-02']);
  });

  it('gives three checks against NASA as a table: the gap, what it is measured against and a yardstick', () => {
    render(<Home />);
    const proof = screen.getByRole('region', { name: 'Checked against NASA' });
    expect(within(proof).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['What we check', 'Gap', 'Against', 'For scale']);
    expect(within(proof).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'When night falls on a real mission']);
    const rows = within(proof).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('0.00003°');
    expect(rows[0].textContent).toContain(`${HOME.facts.horizons_rows} test cases`);
    expect(rows[0].textContent).toContain('20,000 times wider');
    expect(rows[1].textContent).toContain(`${HOME.facts.mazarico_median_points.toFixed(1)} points`);
    expect(rows[1].textContent).toContain('in percentage points');
    const typical = Math.round(HOME.facts.mazarico_median_points);
    expect(rows[1].textContent).toContain(`Where NASA's map says 60 %, ours typically says ${60 - typical} to ${60 + typical} %.`);
    expect(rows[2].textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(rows[2].textContent).toContain('The mission ran for 14 days.');
    expect(within(proof).getByRole('link', { name: /See every check/ }).getAttribute('href')).toBe('/validate');
  });

  it('underlines the links that stand alone, so they do not read as plain text', () => {
    render(<Home />);
    for (const name of [/play the month/, /Open this forecast: de Gerlache Rim 2/, /See every check/]) {
      expect(screen.getByRole('link', { name }).className).toMatch(/(^| )underline( |$)/);
    }
  });

  it('keeps instrument and programme names out of the main copy', () => {
    render(<Home />);
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });
});
