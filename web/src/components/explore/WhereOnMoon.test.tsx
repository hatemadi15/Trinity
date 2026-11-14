// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sites } from '@/test/file-loaders';
import { WhereOnMoon } from './WhereOnMoon';

const site = (id: string) => sites.find((s) => s.id === id)!;
const overview = {
  de_gerlache_center_rim_high: { sunFraction: 1, earthFraction: 0.49, nowHours: 720, best: { hour: 0, poweredHours: 720, earthFraction: 0.49 }, afterSun: 1, afterEarth: 0.49 },
  de_gerlache_center: { sunFraction: 0, earthFraction: 0, nowHours: 10, best: null, afterSun: 0, afterEarth: 0 },
};

describe('WhereOnMoon', () => {
  it('says what the place is and shows it on the map', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(panel.textContent).toMatch(/de Gerlache Rim 2\. A ridge on a crater rim, 52 km from the pole\./);
    expect(within(panel).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('aria-current')).toBe('true');
    expect(within(panel).getByRole('link', { name: 'See all sites' }).getAttribute('href')).toBe('/sites');
    // The dots' colours are explained here too, not only on the site list.
    expect(panel.textContent).toMatch(/two weeks or more with power/);
  });

  it('lays the map beside the words when it has the row to itself', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} wide />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(panel.querySelector('[data-part="layout"]')!.className).toMatch(/md:grid-cols-\[minmax\(0,420px\)_minmax\(0,1fr\)\]/);
  });

  it('lists the three nearest sites with their sunlight for the same period, as links', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} />);
    const near = screen.getByRole('list', { name: 'Nearby sites, same 30 days' });
    const rows = within(near).getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/de Gerlache rim summit.*12 km away.*100 %/); // a no-break space keeps the number with its sign
    expect(rows[0].getAttribute('href')).toBe('/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30');
    // A row is a link and looks like one: the site's name is underlined.
    expect(within(rows[0]).getByText('de Gerlache rim summit').className).toMatch(/\bunderline\b/);
    expect(rows[1].textContent).toMatch(/de Gerlache crater floor.*no sunlight/);
    expect(rows[2].textContent).toMatch(/Lunar south pole, 52 km away.*working it out/);
  });

  it('lists no site farther than 300 km as nearby, and says so', () => {
    render(<WhereOnMoon site={site('blue_ghost_m1')} sites={sites} overview={{}} startUtc="2025-03-02T00:00:00" days={14} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(within(panel).queryByRole('list', { name: /Nearby sites/ })).toBeNull();
    expect(panel.textContent).not.toMatch(/km away/);
    expect(panel.textContent).toMatch(/No other site in the list is within 300 km\./);
  });

  it('says so for a site that lies outside the map, and places a custom site by its coordinates', () => {
    const { unmount } = render(<WhereOnMoon site={site('blue_ghost_m1')} sites={sites} overview={{}} startUtc="2025-03-02T00:00:00" days={14} />);
    expect(screen.getByRole('region', { name: 'Where on the Moon' }).textContent).toMatch(/lies far outside this map of the south pole/);
    unmount();
    const custom = { id: 'custom_-89.0000_45.0000', name: 'Custom site -89.000°, 45.000°', lat: -89, lon: 45, category: 'custom', polar: true, source: 'user' };
    render(<WhereOnMoon site={custom} sites={[...sites, custom]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    const pin = screen.getByRole('link', { name: 'Custom site -89.000°, 45.000°' });
    expect(pin.getAttribute('aria-current')).toBe('true');
    expect(pin.style.left).toMatch(/^5[34]/);
  });

  it('says what kind of point the site is, after what the place is', () => {
    const { unmount } = render(<WhereOnMoon site={site('haworth')} sites={sites} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    const line = () => screen.getByText(/^Haworth\./).closest('p')!;
    expect(line().textContent).toMatch(/Beside a crater that is always in shadow\. The rough centre of a wider region, give or take 5 km, not a chosen landing point\./);
    unmount();
    render(<WhereOnMoon site={site('shackleton_center_rim_high')} sites={sites} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    expect(screen.getByRole('region', { name: 'Where on the Moon' }).textContent).toMatch(/It has not been checked as a safe place to land\./);
  });

  it('offers the day a lander landed when the table covers it, and only its date before 2024', () => {
    const { unmount } = render(<WhereOnMoon site={site('change6')} sites={sites} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(panel.textContent).toMatch(/It landed on 1 June 2024\./);
    expect(within(panel).getByRole('link', { name: 'See the days after it landed' }).getAttribute('href')).toBe('/explore?site=change6&start=2024-06-01T23:00&days=30');
    // The far side: no period changes that Earth never rises there.
    expect(panel.textContent).toMatch(/It lies on the far side, where Earth never rises: a lander there talks to Earth through a relay satellite\./);
    unmount();
    render(<WhereOnMoon site={site('apollo_11')} sites={sites} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    const apollo = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(apollo.textContent).toMatch(/It landed on 20 July 1969, before the years this app covers \(2024 to 2036\), so the figures are for the days chosen above\./);
    expect(within(apollo).queryByRole('link', { name: /days after it landed/ })).toBeNull();
    expect(apollo.textContent).toMatch(/lies far outside this map of the south pole/);
    expect(apollo.textContent).not.toMatch(/far side/);
  });

  it('names its NASA data', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} wide />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    const row = within(panel).getByLabelText('Data sources');
    // The relief is LOLA's 80 m grid. The sunlight figures and the pins' colours come from horizons on the 20 m grid
    // near the pole and the 80 m grid farther out, with DE440. The pins are NASA's Artemis III regions and the CLPS landings.
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NASA LRO LOLA 20 m', 'NASA LRO LOLA 80 m', 'JPL DE440', 'Artemis III regions', 'CLPS mission records']);
    expect(within(panel).getByRole('link', { name: 'IM-2 Athena' })).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Malapert Massif' })).toBeTruthy();
    // The row is the panel's foot, away from its heading.
    expect(panel.lastElementChild).toBe(row);
  });
});
