// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degreesText, HOME } from '@/lib/data/home';
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
    // The challenge in plain words on the first screen: a forecast for landing sites and dates (spec 18.2), for more than two landers.
    expect(hero.textContent).toMatch(/Earthrise is a forecast for Moon landing sites and dates, 2024 to 2036: sunlight, radio contact with Earth and how long a lander keeps power, for ready-made landers or your own\./);
    // Who it is for, with the teachers' way in on the same line.
    const audience = within(hero).getByText(/^For planners of NASA's commercial Moon landers, teachers/);
    expect(audience.textContent).toBe("For planners of NASA's commercial Moon landers, teachers (start with How it works) and anyone curious.");
    expect(within(audience).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/learn');
    expect(hero.textContent).not.toMatch(/survives the night/);
  });

  it('names the data and the check on the first screen with the figure the table of checks gives, so the page never disagrees with itself', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: HEADLINE });
    const proof = within(hero).getByText(/^Built on NASA LRO LOLA terrain and JPL DE440;/);
    expect(proof.textContent).toBe(`Built on NASA LRO LOLA terrain and JPL DE440; checked against JPL Horizons to ${degreesText(HOME.facts.horizons_worst_el_deg)} and LOLA sunlight maps. See the checks`);
    expect(within(proof).getByRole('link', { name: 'See the checks' }).getAttribute('href')).toBe('/validate');
    // The first row of "Checked against NASA" gives the same figure, from the same field.
    const row = within(screen.getByRole('region', { name: 'Checked against NASA' })).getAllByRole('row')[1];
    expect(row.textContent).toContain(degreesText(HOME.facts.horizons_worst_el_deg));
  });

  it('names the first screen’s second action for the section it opens, the three drawings of why the south pole is hard', () => {
    render(<Home />);
    const jump = screen.getByRole('link', { name: 'See why the pole is hard' });
    const target = document.getElementById(jump.getAttribute('href')!.slice(1))!;
    expect(within(target).getByRole('heading', { level: 2 }).textContent).toBe('Why the south pole is hard');
    expect(within(target).getAllByRole('heading', { level: 3 })).toHaveLength(3);
    // Only the pages of How it works say so: no second name for the one thing.
    expect(screen.queryByRole('link', { name: /see how it works/i })).toBeNull();
  });

  it('opens on a real forecast: the Sun and Earth over one month at the site, each with the hidden stretch in words', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    const sun = within(band).getByRole('img', { name: /^The Sun at de Gerlache Rim 2, January 2027/ });
    const earth = within(band).getByRole('img', { name: /^Earth from de Gerlache Rim 2, January 2027/ });
    expect(sun.getAttribute('aria-label')).toMatch(/is set from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(earth.getAttribute('aria-label')).toMatch(/Earth is set from the start until 10 Jan, 9 days 3 hours/);
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
      'An example lander, not a planned mission: 4 m² of solar panels and a 2 kWh battery. Landing on 1 January, it keeps power for 3 days 4 hours; landing on 20 January, for 12 days 15 hours.',
    );
  });

  it('sends a teacher to the science at the top of the three facts, and gives the cause: the Moon’s small tilt and its month-long day', () => {
    render(<Home />);
    const why = document.getElementById('why')!;
    const teach = within(why).getByText(/^Teaching this\?/);
    expect(teach.textContent).toBe('Teaching this? How it works gives the science behind these three facts, with sums a class can check.');
    // Before the three facts, not after them.
    expect(teach.compareDocumentPosition(within(why).getByText('The Sun never climbs')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.textContent).toMatch(/The Moon’s axis is tilted only 1\.5°, and the Moon turns once a month: a day there lasts a month/);
  });

  it("keeps the forecast's explanation to a readable line length", () => {
    render(<Home />);
    expect(screen.getByText(/^Read it from left to right/).className).toMatch(/\bmax-w-\[42em\]/);
  });

  it('explains how to read the forecast before it starts', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(/A ridge NASA shortlisted for astronauts\./);
    expect(band.textContent).toMatch(
      /Read it from left to right, one day at a time\. Heights are angles above the horizon: 5° is about the width of three fingers held at arm's length\. The grey is not one mountain: it is how high the hills stand in the direction of the Sun, or of Earth, that day\./,
    );
    expect(within(band).getAllByRole('listitem').map((li) => li.textContent)).toEqual(["the Sun's height", "Earth's height", 'dotted while set', 'the hills in its direction at that time']);
  });

  it('says under the forecast where the numbers come from, and links to the site', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(/NASA's elevation map of the Moon and NASA's positions of the Sun and Earth/);
    const link = within(band).getByRole('link', { name: 'Open the full forecast' });
    expect(link.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
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
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30', '/explore?site=im2_athena&start=2025-03-06T18:00&days=30', '/explore?site=blue_ghost_m1&start=2025-03-02T09:00&days=30']);
    for (const a of links) expect(a.className).toMatch(/(^| )btn( |$)/);
  });

  it('gives two checks against NASA and one real mission for context as a table: the gap, what it is measured against and a yardstick', () => {
    render(<Home />);
    const proof = screen.getByRole('region', { name: 'Checked against NASA' });
    expect(within(proof).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['What we check', 'Gap', 'Against', 'For scale']);
    expect(within(proof).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'When night falls on a real mission']);
    expect(proof.textContent).toMatch(/Two steps are compared with independent NASA sources, and a real mission gives context\./);
    const rows = within(proof).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('0.00003°');
    expect(rows[0].textContent).toContain(`${HOME.facts.horizons_rows} test cases`);
    expect(rows[0].textContent).toContain('20,000 times wider');
    expect(rows[1].textContent).toContain(`${HOME.facts.mazarico_median_points.toFixed(1)} points`);
    expect(rows[1].textContent).toContain('in percentage points');
    // The map's own averaging period, not the app's span of years.
    expect(rows[1].textContent).toContain("NASA's sunlight map, an 18.6-year average,");
    expect(rows[1].textContent).not.toMatch(/13 years/);
    const typical = Math.round(HOME.facts.mazarico_median_points);
    expect(rows[1].textContent).toContain(`Where NASA's map says ${pct(60)}, ours typically says ${60 - typical} to ${pct(60 + typical)}.`);
    expect(rows[2].textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(rows[2].textContent).toContain('The mission ran for 14 days.');
    // A reported end is context, not a check: its row has no check mark.
    expect(rows[2].textContent).toContain('context, not a test');
    expect(rows.map((r) => r.querySelectorAll('svg').length)).toEqual([1, 1, 0]);
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

  it('points to Compare, the assistant, the brief and offline use from the places section', () => {
    render(<Home />);
    const end = screen.getByRole('region', { name: 'Try it on a landing site' });
    // One sentence after the section's intro, and before the gold action.
    const next = within(end).getByText(/^Then /);
    expect(next.textContent).toBe('Then compare sites, ask in plain words, print the brief, or run it offline on a laptop.');
    const intro = within(end).getByText(/^Pick a site near the south pole/);
    expect(intro.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(next.compareDocumentPosition(within(end).getByRole('link', { name: 'Choose a landing site' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const links = within(next).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['compare sites', '/compare'],
      ['ask in plain words', '/explore#ask'],
      ['print the brief', '/brief'],
      ['run it offline', '/learn#offline'],
    ]);
    for (const a of links) expect(a.className).toMatch(/(^| )underline( |$)/);
  });

  it('underlines the links that stand alone, so they do not read as plain text', () => {
    render(<Home />);
    // How it works is linked twice: from the first screen's audience line and from the three facts.
    for (const name of [/See every check/, 'See the checks', 'How it works', 'compare sites', 'ask in plain words', 'print the brief', 'run it offline']) {
      for (const link of within(screen.getByRole('main')).getAllByRole('link', { name })) expect(link.className).toMatch(/(^| )underline( |$)/);
    }
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(within(band).getByRole('link', { name: 'Open the full forecast' }).className).toMatch(/(^| )underline( |$)/);
  });

  it('uses no faint grey text, so captions and table heads read on a projector', () => {
    render(<Home />);
    expect(screen.getByRole('main').querySelectorAll('.text-ink-3')).toHaveLength(0);
  });

  it('keeps instrument and programme names out of the main copy, but for the one line on the first screen that names the data and the check', () => {
    render(<Home />);
    const main = screen.getByRole('main');
    // That line names the terrain, the positions and the check, for a reader who weighs a forecast by its sources; every other line keeps to plain words.
    const proof = within(main).getByText(/^Built on NASA LRO LOLA terrain and JPL DE440;/);
    expect(proof.textContent).toMatch(/LOLA.*DE440.*Horizons/);
    expect((main.textContent ?? '').replace(proof.textContent ?? '', '')).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });

  it('folds the guide to reading the band behind "How to read this", one tap away', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    const toggle = within(band).getByRole('button', { name: /^How to read this/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const guide = within(band).getByText(/Read it from left to right, one day at a time/, { selector: 'p' });
    expect(guide.closest('[hidden]')).not.toBeNull();
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)!.contains(guide)).toBe(true);
    expect(guide.textContent).toMatch(/5° is about the width of three fingers/);
    fireEvent.click(toggle);
    expect(guide.closest('[hidden]')).toBeNull();
  });

  it('every Explore link on the home page carries its start and its days, so a visit never opens on the period the last one used', () => {
    render(<Home />);
    const hrefs = [...document.querySelectorAll('a[href^="/explore?"]')].map((a) => a.getAttribute('href')!);
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) {
      const q = new URLSearchParams(href.split('?')[1]);
      expect(q.get('start'), href).toBeTruthy();
      expect(q.get('days'), href).toBe('30');
    }
  });
});
