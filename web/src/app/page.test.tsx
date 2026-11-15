// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degreesText, HOME } from '@/lib/data/home';
import Home from './page';

// The descent's picture needs WebGL; the page's words and its still render without it.
vi.mock('@/components/home/DescentScene', () => ({ default: () => null }));

const HEADLINE = 'See when a Moon lander has sunlight and a signal.';
const pct = (n: number) => `${n} %`;

describe('home page', () => {
  it('says what the product does in the headline, offers one primary action there, named for where it goes, and says who it is for', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HEADLINE);
    const hero = screen.getByRole('region', { name: HEADLINE });
    // The arrival's first screen and its last each hold one gold action, each named for where it goes: the flight
    // down to the site, then the site's full forecast.
    const gold = hero.querySelectorAll('.btn-primary');
    expect([...gold].map((a) => [a.textContent!.replace('→', '').trim(), a.getAttribute('href')])).toEqual([
      ['Fly to the south pole', '/sites'],
      ['Open the full forecast', '/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30'],
    ]);
    for (const beat of hero.querySelectorAll('[data-beat]')) expect(beat.querySelectorAll('.btn-primary').length).toBeLessThanOrEqual(1);
    // The challenge in plain words on the first screen: a forecast for landing sites and dates (spec 18.2), for more than two landers.
    expect(hero.textContent).toMatch(/A forecast for Moon landing sites and dates, 2024 to 2036: sunlight, radio contact with Earth, and how long a lander keeps power\./);
    expect(hero.textContent).not.toMatch(/survives the night/);
    // Who it is for, with the teachers' way in on the same line.
    const audience = within(hero).getByText(/^For planners of NASA's commercial Moon landers, teachers/);
    expect(audience.textContent).toBe("For planners of NASA's commercial Moon landers, teachers (start with How it works) and anyone curious.");
    expect(within(audience).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/learn');
    // The first screen is a title card (spec 23): no proof line to read before the Moon.
    expect(hero.textContent).not.toMatch(/Built on NASA/);
  });

  it('gives the check against NASA’s positions in the table of checks, from the same field the data has', () => {
    render(<Home />);
    const row = within(screen.getByRole('region', { name: 'Checked against NASA' })).getAllByRole('row')[1];
    expect(row.textContent).toContain(degreesText(HOME.facts.horizons_worst_el_deg));
  });

  it('opens the section of questions from the first screen’s second action: why the south pole, and why it is hard', () => {
    render(<Home />);
    const jump = screen.getByRole('link', { name: 'See why the pole is hard' });
    const target = document.getElementById(jump.getAttribute('href')!.slice(1))!;
    expect(within(target).getByRole('heading', { level: 2 }).textContent).toBe('Why the south pole?');
    expect(within(target).getByRole('heading', { level: 3, name: 'Why is landing there hard?' })).toBeTruthy();
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
    // The Earth row is Earth in view only: contact needs power too, so the row never says "contact".
    expect(earth.textContent).toMatch(/^Earth in view/);
    expect(earth.textContent).not.toMatch(/contact/i);
    expect(sun.textContent).toMatch(/Night for 16 days 15 hours: the hills stand higher than the Sun/);
    expect(earth.textContent).toMatch(/Out of view for 9 days 3 hours: Earth is below the horizon/);
    // Earth hides twice: the second stretch has its words and its date too.
    expect(earth.textContent).toMatch(/Out of view for 7 days 9 hours/);
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

  it('says under the forecast what the battery does there, the better landing day, and the radio contact each landing gets', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toContain(
      'An example lander, not a planned mission: 4 m² of solar panels and a 2 kWh battery. Landing on 1 January, it keeps power for 3 days 4 hours, with no radio contact: Earth is out of view; landing on 20 January, for 12 days 15 hours, with 3 days 5 hours of radio contact.',
    );
    expect(band.textContent).toContain('Radio contact: none; Earth is out of view.');
    expect(band.textContent).toContain('Radio contact: 3 d 5 h, until Earth sets, 23 Jan.');
  });

  it('shows radio contact only for the hours with power and Earth in view at once, and says what every other hour lacks (spec 23.2)', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(/Radio contact needs power and Earth in view at once\. This month: 3 days 5 hours\./);
    expect(band.textContent).toMatch(/Earth in view is not yet radio contact: that needs power too\./);
    const strip = band.querySelector('[data-contact-strip]')!;
    // One stretch of contact, 20 to 23 January: 77 of the month's 720 hours.
    const on = strip.querySelectorAll<HTMLElement>('[data-contact]');
    expect(on).toHaveLength(1);
    expect(parseFloat(on[0].style.width)).toBeCloseTo((77 / 720) * 100, 1);
    expect(strip.textContent).toContain('3 d 5 h20 Jan to 23 Jan');
    // The rest of the month, in order: Earth out of view, then Earth in view through ten days of night, then out of view again.
    expect([...strip.querySelectorAll('[data-no-contact]')].map((el) => [el.getAttribute('data-no-contact'), el.textContent])).toEqual([
      ['earth', 'Earth out of view'],
      ['power', 'Earth in view, but no power: night'],
      ['earth', 'Earth out of view'],
    ]);
    expect(strip.querySelector('.sr-only')!.textContent).toBe(
      'Radio contact needs power and Earth in view at once: 20 Jan to 23 Jan, 3 days 5 hours. 1 Jan to 10 Jan: no contact, Earth out of view. 10 Jan to 20 Jan: no contact, Earth in view, but no power: night. 23 Jan to 30 Jan: no contact, Earth out of view.',
    );
    // Reading an hour, Earth is "in view", never "in view for radio".
    expect(band.textContent).not.toMatch(/for radio/);
  });

  it('answers five questions a child could ask, each a heading, in short sentences and everyday words (spec 23.3)', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole?' });
    const asked = within(why).getAllByRole('heading', { level: 3 });
    expect(asked.map((h) => h.textContent)).toEqual([
      "Why is NASA looking at the Moon's south pole?",
      'Why is landing there hard?',
      'Why do the hills matter so much?',
      'Why does Earth matter?',
      'So what does Earthrise do?',
    ]);
    const answers = asked.map((h) => h.nextElementSibling!.textContent!);
    expect(answers).toEqual([
      'Ice has been found in its darkest, coldest craters. One day that frozen water could give astronauts water, air and rocket fuel. And some hilltops there stay in sunlight for a whole month, which a lander needs for power.',
      'The Sun never climbs high. It slides round the sky close to the ground, so hills throw very long shadows. A lander runs on sunlight: in shadow it has no power.',
      'Two places close together can get very different light. In January 2027 one hilltop has sunlight all month. A ridge 12 km away is dark from 3 to 20 January.',
      'The lander talks to us by radio. It can only do that while Earth is in its sky, above the hills, and it has power.',
      'It works out, hour by hour, when a spot has sunlight and when it can call home. Then planners can pick the place and the day. How it works has the science.',
    ]);
    // The figures are the month's own: the rim's summit is sunlit every hour, the ridge dark from sunset to sunrise.
    expect(HOME.pair.rim_sun_pct).toBe(100);
    expect(Math.round(HOME.pair.distance_km)).toBe(12);
    expect(HOME.sky.night).toEqual({ sunset_hour: 67, sunrise_hour: 466, hours: 399 });
    // Everyday words only, in what is read and in what a screen reader hears of the drawings: no units of angle, no
    // science terms, and nothing promised of the ice or of a mission.
    const said = why.textContent! + within(why).getAllByRole('img').map((d) => d.getAttribute('aria-label')).join(' ');
    expect(said).not.toMatch(/°|degree|azimuth|elevation|terrain|illuminat|horizon|DEM\b|skyline|latitude|\bwill\b|surviv|\bdie|dead/i);
    // No sentence is long.
    for (const a of answers) for (const sentence of a.split(/(?<=\.) /)) expect(sentence.split(' ').length, sentence).toBeLessThanOrEqual(24);
    expect(within(why).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/learn');
  });

  it("keeps the forecast's explanation to a readable line length", () => {
    render(<Home />);
    expect(screen.getByText(/^A ridge NASA shortlisted for astronauts\./).className).toMatch(/\bmax-w-\[38em\]/);
    const steps = document.querySelectorAll('[data-step-words]');
    expect(steps).toHaveLength(2);
    for (const p of steps) expect(p.className).toMatch(/\bmax-w-\[40em\]/);
  });

  it('reads the forecast in three steps with room between them: the Sun, Earth, then what they mean for a lander (spec 23)', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    const steps = [...band.querySelectorAll('.display.text-\\[32px\\]')].map((el) => el.textContent);
    expect(steps).toEqual(['The Sun', 'Earth', 'The lander']);
    // Each chart says where the viewer stands: at the landing site, facing the Sun, then Earth.
    expect(band.textContent).toMatch(/You stand at the landing site, facing the Sun\. White is its height; grey, the hills\. Behind the grey: night\./);
    expect(band.textContent).toMatch(/Now face Earth: blue is its height\. Earth in view is not yet radio contact/);
  });

  it('sets the forecast apart as figures and says where the viewer is: a locator on the Moon, and a drawing of the view beside each chart (owner review)', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    // Three framed panels, a step lighter than the black band; the chart inside takes the panel's colour.
    const figures = [...band.querySelectorAll<HTMLElement>('[data-figure]')];
    expect(figures.map((f) => f.getAttribute('data-figure'))).toEqual(['sun', 'earth', 'lander']);
    for (const f of figures) for (const c of ['rounded-2xl', 'border', 'border-stage-raised-line', 'bg-stage-raised', '[--stage:var(--stage-raised)]']) expect(f.classList.contains(c), c).toBe(true);
    expect(figures[0].querySelector('[data-forecast-hover]')).not.toBeNull();
    expect(figures[2].querySelector('[data-contact-strip]')).not.toBeNull();
    // Where on the Moon.
    expect(within(band).getByRole('img', { name: "Where this is: de Gerlache Rim 2 is at the Moon's south pole, at the bottom edge of the Moon as seen from Earth." }).textContent).toMatch(/this landing site/);
    // Where the viewer stands: a lander on the ridge, the hills, and the Sun (or Earth) above them and behind them.
    const sun = within(figures[0]).getByRole('img', { name: /^The view from the landing site, not to scale\. A lander stands on a ridge and looks toward the Sun across the hills\./ });
    expect(sun.textContent).toBe('you are hereabove the hills: daylightbehind the hills: night');
    const earth = within(figures[1]).getByRole('img', { name: /looks toward Earth across the hills\. When Earth is above the hills, it is in view\. When it is behind the hills, it is out of view\.$/ });
    expect(earth.textContent).toBe('you are hereabove the hills: in viewbehind the hills: out of view');
    // The lanes have the colours of the view from the site's key: warm white, blue, and green for contact; the words on them are dark on the colour.
    const lane = (name: string) => band.querySelector<HTMLElement>(`[data-lane="${name}"]`)!;
    expect([...lane('power').children].map((el) => el.textContent)).toEqual(['night: no power', 'sunlight', 'sunlight']);
    expect([...lane('earth').children].map((el) => el.textContent)).toEqual(['out of view', 'out of view', 'Earth in view']);
    expect(lane('power').querySelector('.bg-stage-sun')!.className).toMatch(/text-\[#0b0c0f\]/);
    expect(lane('earth').querySelector('.bg-stage-earth')).not.toBeNull();
    expect(lane('contact').querySelector('[data-contact]')!.className).toMatch(/(^| )bg-stage-good( |$)/);
    // The strip has the charts' dates under it.
    expect([...band.querySelectorAll('[data-strip-dates] span')].map((el) => el.textContent)).toEqual(['1 Jan', '6 Jan', '11 Jan', '16 Jan', '21 Jan', '26 Jan']);
  });

  it('alternates the numbered sections in both themes, black then paper: 01, 03 and 05 black, 02 and 04 paper, each with the same room either side of a clean edge', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.className).toMatch(/(^| )bg-stage-band( |$)/);
    // No line along the edge: black meets paper.
    expect(band.className).not.toMatch(/(^| )border-(y|b)( |$)/);
    expect(band.className).toMatch(/(^| )pb-24( |$)/);
    const bands = [...document.querySelectorAll<HTMLElement>('main [data-band]')];
    expect(bands.map((b) => b.getAttribute('data-band'))).toEqual(['paper', 'black', 'paper', 'black']);
    const names = ['Why the south pole?', 'Start from a real place', 'Checked against NASA', 'Try it on a landing site'];
    bands.forEach((b, i) => {
      const paper = b.getAttribute('data-band') === 'paper';
      // The scope gives the band its colours whatever the page's theme.
      for (const c of [paper ? 'theme-light' : 'theme-dark', 'bg-page', 'text-ink']) expect(b.classList.contains(c), `${names[i]}: ${c}`).toBe(true);
      expect(b.className).not.toMatch(/(^| )border/);
      const region = screen.getByRole('region', { name: names[i] });
      expect(b === region || b.contains(region), names[i]).toBe(true);
    });
    // 02 to 04 have the same room above and below; 05 is the sky itself.
    for (const b of bands.slice(0, 3)) for (const c of ['py-24', 'sm:py-32']) expect(b.classList.contains(c), c).toBe(true);
    // In the order of the page, one after another.
    expect(band.nextElementSibling).toBe(bands[0]);
    for (let i = 1; i < bands.length; i++) expect(bands[i - 1].nextElementSibling).toBe(bands[i]);
  });

  it('says under the forecast where the numbers come from, and links to the site', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(band.textContent).toMatch(/Computed from NASA's elevation map and positions of the Sun and Earth\./);
    const link = within(band).getByRole('link', { name: 'Open the full forecast' });
    expect(link.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    // The band is a picture panel: its focus ring is the bright gold that shows on black.
    expect(band.hasAttribute('data-stage')).toBe(true);
  });

  it('pairs three of the questions with a drawing read at a glance: one idea each, a label or two, no axes (spec 23.3)', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole?' });
    const drawings = within(why).getAllByRole('img');
    expect(drawings).toHaveLength(3);
    // A low Sun beside a high one; a hilltop in the light beside ground in shadow; Earth over the hills.
    expect(drawings.map((d) => [...d.querySelectorAll('text')].map((t) => t.textContent))).toEqual([
      ['the Sun where Apollo 15 landed', 'the Sun at the south pole'],
      ['sunlight all month', '12 km away: dark 3 to 20 January'],
      ['Earth, peeking over the hills'],
    ]);
    // Each stands beside its question.
    expect(drawings.map((d) => d.parentElement!.querySelector('h3')!.textContent)).toEqual(['Why is landing there hard?', 'Why do the hills matter so much?', 'Why does Earth matter?']);
    for (const d of drawings) expect(d.getAttribute('aria-label')!.length).toBeGreaterThan(60);
    // The low Sun is drawn at its true height, the month's highest.
    expect(Math.max(...HOME.sky.sun_el)).toBeCloseTo(2.5, 1);
    // No buttons to play: the charts are on How it works.
    expect(within(why).queryByRole('button')).toBeNull();
  });

  it('starts from a real place: the computed shadow picture beside three places, each one link to explore it', () => {
    render(<Home />);
    const places = screen.getByRole('region', { name: 'Start from a real place' });
    const img = within(places).getByRole('img', { name: /shadows/i });
    expect(img.getAttribute('src')).toMatch(/de-gerlache-rim-2/);
    expect(within(places).getByText('in shadow')).toBeTruthy();
    expect(within(places).getByText('in sunlight')).toBeTruthy();
    expect(within(places).getByText('Shadows computed for 2 January 2027')).toBeTruthy();
    // The faint stripes in the picture are explained where they are seen.
    expect(places.querySelector('figcaption')!.textContent).toMatch(/^de Gerlache Rim 2, 20 km across: computed from NASA elevation data, not a photograph\. Faint stripes are seams in the data\.$/);
    expect(within(places).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['de Gerlache Rim 2', 'Athena lander, March 2025', 'Blue Ghost lander, March 2025']);
    // Every programme and company is named in plain words.
    expect(places.textContent).toMatch(/its first crewed Artemis landing/);
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
    // The whole row is the link: its name says where it goes, and an arrow stands for it on the row.
    for (const a of links) expect(a.querySelector('svg')).toBeTruthy();
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30', '/explore?site=im2_athena&start=2025-03-06T18:00&days=30', '/explore?site=blue_ghost_m1&start=2025-03-02T09:00&days=30']);
    for (const a of links) expect(a.className).toMatch(/(^| )group( |$)/);
  });

  it('gives two checks against NASA and one real mission for context as a table: the gap, what it is measured against and a yardstick', () => {
    render(<Home />);
    const proof = screen.getByRole('region', { name: 'Checked against NASA' });
    expect(within(proof).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['What we check', 'Gap', 'Against', 'For scale']);
    expect(within(proof).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Where the Sun and Earth stand', 'How much sunlight a site gets', 'When night falls on a real mission']);
    expect(proof.textContent).toMatch(/Two steps match independent NASA sources\./);
    // The check that misses its own mark is named, not left to the Accuracy page alone.
    expect(proof.textContent).toMatch(/A third, shadows in pictures from orbit, misses its own mark; Accuracy shows where\./);
    const rows = within(proof).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('0.00003°');
    expect(rows[0].textContent).toContain(`${HOME.facts.horizons_rows} cases`);
    expect(rows[0].textContent).toContain('20,000 times wider');
    expect(rows[1].textContent).toContain(`${HOME.facts.mazarico_median_points.toFixed(1)} points`);
    expect(rows[1].textContent).toContain('in percentage points');
    // The map's own averaging period, not the app's span of years.
    expect(rows[1].textContent).toContain("NASA's 18.6-year sunlight map at");
    expect(rows[1].textContent).not.toMatch(/13 years/);
    const typical = Math.round(HOME.facts.mazarico_median_points);
    expect(rows[1].textContent).toContain(`Where NASA says ${pct(60)}, ours says ${60 - typical} to ${pct(60 + typical)}.`);
    expect(rows[2].textContent).toContain(`${HOME.facts.blue_ghost_end_minus_sunset_h.toFixed(1)} hours`);
    expect(rows[2].textContent).toContain('The mission ran 14 days.');
    // A reported end is context, not a check: its row has no check mark.
    expect(rows[2].textContent).toContain('context, not a test');
    expect(rows.map((r) => r.querySelectorAll('svg').length)).toEqual([1, 1, 0]);
    expect(within(proof).getByRole('link', { name: /See every check/ }).getAttribute('href')).toBe('/validate');
  });

  it('ends with a primary action to choose a landing site, named as the page it opens', () => {
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
    expect(next.textContent).toBe('Then compare sites, ask in plain words, print the brief, or run it offline.');
    const intro = within(end).getByText(/^Pick a site and a date:/);
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
    for (const name of [/See every check/, 'How it works', 'compare sites', 'ask in plain words', 'print the brief', 'run it offline']) {
      for (const link of within(screen.getByRole('main')).getAllByRole('link', { name })) expect(link.className).toMatch(/(^| )underline( |$)/);
    }
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(within(band).getByRole('link', { name: 'Open the full forecast' }).className).toMatch(/(^| )underline( |$)/);
  });

  it('uses no faint grey text, so captions and table heads read on a projector', () => {
    render(<Home />);
    expect(screen.getByRole('main').querySelectorAll('.text-ink-3')).toHaveLength(0);
  });

  it('keeps instrument and programme names out of the main copy: the footer names them', () => {
    render(<Home />);
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|CLPS|Horizons|ephemeris|skyline/);
  });

  it('reads the forecast hour by hour, with no fold to open: by pointer or by the arrow keys, out loud to a screen reader (spec 23)', () => {
    render(<Home />);
    const band = screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' });
    expect(within(band).queryByRole('button', { name: /How to read this/ })).toBeNull();
    const chart = within(band).getAllByRole('group', { name: /hour by hour/ })[0];
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const card = band.querySelector('[data-hour-card]')!;
    expect(card.textContent).toMatch(/^1 Jan 2027, 01:00 UTC/);
    expect(card.textContent).toMatch(/Sun .*up, (shining on the site|behind the hills|below the horizon)/);
    expect(card.textContent).toMatch(/Earth .*up, (in view for radio|hidden by the hills|below the horizon)/);
    // Shift steps a day.
    fireEvent.keyDown(chart, { key: 'ArrowRight', shiftKey: true });
    expect(band.querySelector('[data-hour-card]')!.textContent).toMatch(/^2 Jan 2027, 01:00 UTC/);
    expect(within(band).getByText(/^2 Jan 2027, 01:00 UTC\. Sun/).getAttribute('aria-live') ?? within(band).getByText(/^2 Jan 2027, 01:00 UTC\. Sun/).closest('[aria-live]')).toBeTruthy();
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(band.querySelector('[data-hour-card]')).toBeNull();
  });

  it('keeps the page short: the words under the descent stay within their caps, charts and drawings left out (owner review: far fewer words)', () => {
    render(<Home />);
    // The words a visitor reads as text: not a chart's own labels, a drawing's, or what only a screen reader hears.
    const words = (el: Element) => {
      const copy = el.cloneNode(true) as Element;
      for (const x of copy.querySelectorAll('.sr-only, svg, [role="img"], [data-forecast-hover], [data-contact-strip]')) x.remove();
      // Block ends are word breaks.
      for (const x of copy.querySelectorAll('p, li, h2, h3, th, td, figcaption, span, a')) x.append(' ');
      return (copy.textContent ?? '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    };
    const count = {
      forecast: words(screen.getByRole('figure', { name: 'A real forecast: de Gerlache Rim 2, January 2027' })),
      why: words(screen.getByRole('region', { name: 'Why the south pole?' })),
      places: words(screen.getByRole('region', { name: 'Start from a real place' })),
      proof: words(screen.getByRole('region', { name: 'Checked against NASA' })),
      end: words(screen.getByRole('region', { name: 'Try it on a landing site' })),
    };
    // Before the cut these were 239, 261, 204, 151 and 59: 914 in all. 02 keeps room for its five questions and answers.
    const CAPS = { forecast: 165, why: 200, places: 115, proof: 115, end: 45 };

    for (const k of Object.keys(CAPS) as (keyof typeof CAPS)[]) expect(count[k], k).toBeLessThanOrEqual(CAPS[k]);
    expect(Object.values(count).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(630);
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
