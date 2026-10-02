// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sites } from '@/test/file-loaders';
import { WhereOnMoon } from './WhereOnMoon';

const site = (id: string) => sites.find((s) => s.id === id)!;
const overview = {
  de_gerlache_center_rim_high: { sunFraction: 1, earthFraction: 0.49, nowHours: 720, best: { hour: 0, poweredHours: 720, earthFraction: 0.49 } },
  de_gerlache_center: { sunFraction: 0, earthFraction: 0, nowHours: 10, best: null },
};

describe('WhereOnMoon', () => {
  it('says what the place is and shows it on the map', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(panel.textContent).toMatch(/de Gerlache Rim 2\. A ridge on a crater rim, 52 km from the pole\./);
    expect(within(panel).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('aria-current')).toBe('true');
    expect(within(panel).getByRole('link', { name: 'See all sites' }).getAttribute('href')).toBe('/sites');
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
});
