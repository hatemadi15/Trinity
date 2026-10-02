// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { PeriodBand } from './PeriodBand';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };

describe('PeriodBand', () => {
  it('shows the four things a forecast is for: site, start, length, lander', () => {
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const band = screen.getByRole('region', { name: 'What this forecast is for' });
    expect(band).toBeTruthy();
    const siteLink = screen.getByRole('link', { name: 'Landing site: de Gerlache Rim 2. Change site' });
    expect(siteLink.getAttribute('href')).toBe('/sites');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-01');
    expect(screen.getByRole('radiogroup', { name: 'For' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lander: 4 m² panel, uses 200 W, 2 kWh battery. Change' })).toBeTruthy();
  });

  it('opens the lander settings and passes period changes on', () => {
    const onLander = vi.fn();
    const onWindow = vi.fn();
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={onWindow} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={onLander} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lander: Custom lander. Change' }));
    expect(onLander).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(onWindow).toHaveBeenLastCalledWith('2027-01-01T00:00:00', 14);
  });

  it('names a custom place by its coordinates', () => {
    const custom = { id: 'custom_-89.5000_10.0000', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    render(<PeriodBand site={custom} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByRole('link', { name: 'Landing site: Custom site -89.500°, 10.000°. Change site' })).toBeTruthy();
  });

  it('gives the lander more room than the site at 1440 px, and lets both shrink on a phone', () => {
    render(<PeriodBand site={{ id: 's', name: 'Site', lat: -89, lon: 0, category: 'classic', polar: true, source: 'x' }} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const lander = screen.getByRole('button', { name: /^Lander:/ }).parentElement!;
    const site = screen.getByRole('link', { name: /^Landing site:/ }).parentElement!;
    expect(lander.className).toMatch(/flex-\[1\.4_1_250px\]/);
    expect(site.className).toMatch(/flex-\[1_1_250px\]/);
    // A long lander name must not hold the band wider than a phone: the columns may shrink and the name is cut with an ellipsis.
    for (const col of [lander, site]) expect(col.className).toMatch(/(^| )min-w-0( |$)/);
    for (const control of [screen.getByRole('button', { name: /^Lander:/ }), screen.getByRole('link', { name: /^Landing site:/ })]) expect(control.className).toMatch(/(^| )min-w-0( |$)/);
    expect(screen.getByRole('region', { name: 'What this forecast is for' }).className).toMatch(/(^| )min-w-0( |$)/);
  });

  it('draws no dropdown arrow: the site opens a page and the lander a dialog, and each says "change"', () => {
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const siteField = screen.getByRole('link', { name: /^Landing site/ });
    const landerField = screen.getByRole('button', { name: /^Lander/ });
    expect(siteField.querySelector('svg')).toBeNull();
    expect(landerField.querySelector('svg')).toBeNull();
    expect(siteField.textContent).toMatch(/change site$/);
    expect(landerField.textContent).toMatch(/change$/);
  });
});
