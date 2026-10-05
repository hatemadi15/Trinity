// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOME } from '@/lib/data/home';
import Home from './page';

// The arrival's live stage needs WebGL; the page's words and stills render without it.
vi.mock('@/components/home/ArrivalCanvas', () => ({ default: () => null }));

const HEADLINE = 'See when a Moon lander has sunlight and a signal.';
const pct = (n: number) => `${n} %`;

describe('home page', () => {
  it('says what the product does in the headline, offers one gold action there and says who it is for', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HEADLINE);
    const hero = screen.getByRole('region', { name: HEADLINE });
    // The arrival's first screen and its last each hold one gold action, each named for where it goes: the flight
    // down to the site, then the site's full forecast.
    const gold = hero.querySelectorAll('.btn-primary');
    expect([...gold].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Fly to the south pole', '/sites'],
      ['Open the full forecast', '/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30'],
    ]);
    for (const beat of hero.querySelectorAll('[data-beat]')) expect(beat.querySelectorAll('.btn-primary').length).toBeLessThanOrEqual(1);
    expect(within(hero).getByText("For planners of NASA's commercial Moon landers, educators and anyone curious.")).toBeTruthy();
    // The promise in the words of the answer it leads to.
    expect(hero.textContent).toMatch(/how long a solar lander keeps power there\./);
    expect(hero.textContent).not.toMatch(/survives the night/);
  });

  it('opens on a real forecast: the Sun and Earth over one month at the site, each with the hidden stretch in words', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    const sun = within(band).getByRole('img', { name: /^The Sun at de Gerlache Rim 2, January 2027/ });
    const earth = within(band).getByRole('img', { name: /^Earth from de Gerlache Rim 2, January 2027/ });
    expect(sun.getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(earth.getAttribute('aria-label')).toMatch(/Earth is hidden from the start until 10 Jan, 9 days 3 hours/);
    expect(sun.textContent).toMatch(/^Sunlight/);
    expect(earth.textContent).toMatch(/^Contact with Earth/);
    expect(sun.textContent).toMatch(/Night for 16 days 15 hours: the hills stand higher than the Sun/);
    expect(earth.textContent).toMatch(/No contact for 9 days 3 hours: Earth is below the horizon/);
    // Earth hides twice: the second stretch has its words and its date too.
    expect(earth.textContent).toMatch(/No contact for 7 days 9 hours/);
    expect(earth.textContent).toMatch(/Earth sets 23 Jan/);
    // One height scale for both rows: a degree takes as many pixels in each.
    const spacing = (row: HTMLElement) => {
      const y = [...row.querySelectorAll('line[data-height]')].map((l) => Number(l.getAttribute('y1'))).sort((a, b) => b - a);
      return y[0] - y[1];
    };
    expect(spacing(sun)).toBeCloseTo(spacing(earth), 5);
    // The whole of the hills is drawn, with height lines up to their top.
    expect(sun.textContent).toMatch(/15° up/);
    expect(sun.querySelector('mask')).toBeNull();
    // One time scale only: the compass row belongs to Explore.
    expect(band.textContent).not.toMatch(/Direction of the Sun|north|south-/);
    expect(sun.querySelector('.reveal-line')).toBeNull();
    expect(earth.querySelector('.reveal-line')).toBeNull();
  });

  it('says under the forecast what the battery does there, and the better landing day', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toContain(
      'A small lander (4 m² of solar panels, 2 kWh battery) landing on 1 January keeps power for 3 days 4 hours; landing on 20 January, for 12 days 15 hours.',
    );
  });

  it('sends a teacher to the science behind the three facts', () => {
    render(<Home />);
    expect(screen.getByText(/^Teaching this\?/).textContent).toBe('Teaching this? How it works gives the science behind these three facts, with sums a class can check.');
  });

  it("keeps the forecast's explanation to a readable line length", () => {
    render(<Home />);
    expect(screen.getByText(/^A ridge NASA shortlisted for astronauts\. Read it from left to right/).className).toMatch(/\bmax-w-\[42em\]/);
  });

  it('explains how to read the forecast before it starts', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(
      /A ridge NASA shortlisted for astronauts\. Read it from left to right, one day at a time\. Heights are angles above the horizon: 5° is about the width of three fingers held at arm's length\. The grey is not one mountain: it is how high the hills stand in the direction of the Sun, or of Earth, that day\./,
    );
    expect(within(band).getAllByRole('listitem').map((li) => li.textContent)).toEqual(["the Sun's height", "Earth's height", 'dotted while hidden', 'the hills in its direction at that time']);
  });

  it('says under the forecast where the numbers come from, and links to the site', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(/NASA's elevation map of the Moon and NASA's positions of the Sun and Earth/);
    const link = within(band).getByRole('link', { name: 'Open the full forecast' });
    expect(link.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2');
    // The band is a picture panel: its focus ring is the bright gold that shows on black.
    expect(band.hasAttribute('data-stage')).toBe(true);
  });

  it('explains why the south pole is hard in three steps, naming the forecast site in the real pair, with a way in for a class', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    expect(within(why).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The Sun never climbs', 'The hills decide', 'Earth sets too']);
    expect(why.textContent).toContain(`de Gerlache Rim 2, the site in the forecast above, ${Math.round(HOME.pair.distance_km)} km away, has it ${pct(Math.round(HOME.pair.site_sun_pct))} of the time`);
    expect(why.textContent).toMatch(/the summit of de Gerlache crater's rim has sunlight all month/);
    expect(within(why).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/learn');
    // There is no magnetic compass on the Moon.
    expect(why.textContent).not.toMatch(/compass/);
    expect(why.textContent).toMatch(/Earth hangs in nearly the same direction in the sky/);
  });

  it('starts from a real place: the computed shadow picture beside three places, each with a button to explore it', () => {
    render(<Home />);
    const places = screen.getByRole('region', { name: 'Start from a real place' });
    expect(places.textContent).toMatch(/A ridge NASA has shortlisted for astronauts, and two landers that reached the Moon in March 2025\. Explore any of them hour by hour\./);
    const img = within(places).getByRole('img', { name: /shadows/i });
    expect(img.getAttribute('src')).toMatch(/de-gerlache-rim-2/);
    expect(within(places).getByText('in shadow')).toBeTruthy();
    expect(within(places).getByText('in sunlight')).toBeTruthy();
    expect(within(places).getByText('de Gerlache Rim 2: shadows computed for 2 January 2027')).toBeTruthy();
    expect(places.textContent).toMatch(/Computed from NASA elevation data, not a photograph/);
    // The faint stripes in the picture are explained where they are seen.
    expect(places.querySelector('figcaption')!.textContent).toMatch(/Faint stripes are seams in the elevation data, not real ground\./);
    expect(within(places).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['de Gerlache Rim 2', 'Athena lander, March 2025', 'Blue Ghost lander, March 2025']);
    // Every programme and company is named in plain words.
    expect(places.textContent).toMatch(/the first crewed landing of its Artemis programme/);
    expect(places.textContent).toMatch(/Intuitive Machines' Athena/);
    expect(places.textContent).toMatch(/Firefly Aerospace's Blue Ghost/);
    expect(places.textContent).not.toMatch(/IM-2/);
    // The shadow tag sits well away from the level of the landing site pin, so the site does not look dark.
    const shadowTop = Number(/top-\[(\d+)%\]/.exec(within(places).getByText('in shadow').className)?.[1]);
    expect(Math.abs(shadowTop - 50)).toBeGreaterThanOrEqual(15);
    expect(within(places).getAllByRole('listitem')).toHaveLength(3);
    expect(within(places).getByText('Ended after one day')).toBeTruthy();
    expect(within(places).getByText('Worked all 14 days')).toBeTruthy();
    const links = within(places).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Open the forecast: de Gerlache Rim 2', 'Open the forecast: Athena lander, March 2025', 'Open the forecast: Blue Ghost lander, March 2025']);
    expect(links.map((a) => a.textContent)).toEqual(['Open the forecast', 'Open the forecast', 'Open the forecast']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/explore?site=de_gerlache_rim_2', '/explore?site=im2_athena&start=2025-03-06T18:00', '/explore?site=blue_ghost_m1&start=2025-03-02T09:00']);
    for (const a of links) expect(a.className).toMatch(/(^| )btn( |$)/);
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
    expect(rows[1].textContent).toContain(`Where NASA's map says ${pct(60)}, ours typically says ${60 - typical} to ${pct(60 + typical)}.`);
    expect(rows[2].textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(rows[2].textContent).toContain('The mission ran for 14 days.');
    expect(within(proof).getByRole('link', { name: /See every check/ }).getAttribute('href')).toBe('/validate');
  });

  it('ends with a gold action to choose a landing site, named as the page it opens', () => {
    render(<Home />);
    const end = screen.getByRole('region', { name: 'Try it on a landing site' });
    const cta = within(end).getByRole('link', { name: 'Choose a landing site' });
    expect(cta.getAttribute('href')).toBe('/sites');
    expect(cta.className).toMatch(/btn-primary/);
    // Three gold buttons on the page, never two on one screen: the first screen, the arrival's last, the end.
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(3);
  });

  it('underlines the links that stand alone, so they do not read as plain text', () => {
    render(<Home />);
    for (const name of [/See every check/, 'How it works']) {
      expect(within(screen.getByRole('main')).getByRole('link', { name }).className).toMatch(/(^| )underline( |$)/);
    }
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(within(band).getByRole('link', { name: 'Open the full forecast' }).className).toMatch(/(^| )underline( |$)/);
  });

  it('uses no faint grey text, so captions and table heads read on a projector', () => {
    render(<Home />);
    expect(screen.getByRole('main').querySelectorAll('.text-ink-3')).toHaveLength(0);
  });

  it('keeps instrument and programme names out of the main copy', () => {
    render(<Home />);
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });
});
