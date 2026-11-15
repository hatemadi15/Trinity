// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { PeriodBand, periodLine } from './PeriodBand';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };
const other = { id: 'apollo_11', name: 'Apollo 11', lat: 0.67, lon: 23.47, category: 'apollo', polar: false, source: 'x' };
const CATALOGUE = [site, other];
/** The lander's button is named by the lander itself, "Small lander: …. Change" or "Custom lander. Change", so it is found by that ending. */
const landerControl = () => screen.getByRole('button', { name: /lander.*\. Change$/ });

describe('PeriodBand', () => {
  it('shows the four things a forecast is for: site, start, length, lander', () => {
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const band = screen.getByRole('region', { name: 'What this forecast is for' });
    expect(band).toBeTruthy();
    // The site is a drop-down on the page (spec 23.4): a button, closed at first, and no link to the Sites page.
    const siteButton = screen.getByRole('button', { name: 'Landing site: de Gerlache Rim 2. Change site' });
    expect(siteButton.getAttribute('aria-expanded')).toBe('false');
    expect(within(band).queryByRole('link')).toBeNull();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-01');
    expect((screen.getByLabelText('For') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Landing time, UTC') as HTMLInputElement).value).toBe('00:00');
    expect(screen.getByRole('button', { name: 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery. Change' })).toBeTruthy();
    // The lander's name is the longest field: it gets the larger share of the row, and the date box no more than it needs.
    expect(landerControl().parentElement!.className).toMatch(/flex-\[1\.8_1_250px\]/);
    expect(screen.getByLabelText('From').className).toMatch(/\bw-\[144px\]/);
    // The name wraps at every width rather than being cut, as it carries the lander's numbers and a cut name would hide the battery;
    // the fields keep one bottom edge, so a lander on two lines grows upward and pushes no other field off line.
    const landerButton = landerControl();
    const nameSpan = landerButton.querySelector('span')!;
    expect(landerButton.className).toMatch(/(^| )h-auto( |$)/);
    expect(landerButton.className).toMatch(/(^| )min-h-\[52px\]( |$)/);
    expect(landerButton.className).toMatch(/(^| )py-2( |$)/);
    expect(nameSpan.className).not.toMatch(/(^| )(truncate|overflow-hidden|whitespace-nowrap)( |$)/);
    expect(band.className).toMatch(/(^| )items-end( |$)/);
    // Where the name wraps, a no-break space keeps each number with its unit, as it keeps "30 %" together; the accessible name keeps plain spaces.
    expect([nameSpan.textContent, landerButton.getAttribute('aria-label')]).toEqual(['Small lander: 4\u00a0m² panel, uses 200\u00a0W, 2\u00a0kWh battery', 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery. Change']);
  });

  it('opens the lander settings and passes period changes on', () => {
    const onLander = vi.fn();
    const onWindow = vi.fn();
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={onWindow} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={onLander} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom lander. Change' }));
    expect(onLander).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('For'), { target: { value: '14' } });
    expect(onWindow).toHaveBeenLastCalledWith('2027-01-01T00:00:00', 14);
    fireEvent.click(screen.getByRole('button', { name: 'One hour later' }));
    expect(onWindow).toHaveBeenLastCalledWith('2027-01-01T01:00:00', 30);
  });

  it('names a custom place by its coordinates', () => {
    const custom = { id: 'custom_-89.5000_10.0000', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    render(<PeriodBand site={custom} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByRole('button', { name: 'Landing site: Custom site -89.500°, 10.000°. Change site' })).toBeTruthy();
  });

  it('gives the lander more room than the site at 1440 px, and lets both shrink on a phone', () => {
    render(<PeriodBand sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} site={{ id: 's', name: 'Site', lat: -89, lon: 0, category: 'classic', polar: true, source: 'x' }} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const lander = landerControl().parentElement!;
    const site = screen.getByRole('button', { name: /^Landing site:/ }).parentElement!;
    expect(lander.className).toMatch(/flex-\[1\.8_1_250px\]/);
    expect(site.className).toMatch(/flex-\[1_1_250px\]/);
    // A long lander name must not hold the band wider than a phone: the columns may shrink, and the name wraps to the room it has.
    for (const col of [lander, site]) expect(col.className).toMatch(/(^| )min-w-0( |$)/);
    for (const control of [landerControl(), screen.getByRole('button', { name: /^Landing site:/ })]) expect(control.className).toMatch(/(^| )min-w-0( |$)/);
    expect(screen.getByRole('region', { name: 'What this forecast is for' }).className).toMatch(/(^| )min-w-0( |$)/);
  });

  it('says "change" on both fields, the site with the mark of a drop-down, and draws no icon', () => {
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const siteField = screen.getByRole('button', { name: /^Landing site/ });
    const landerField = landerControl();
    expect(siteField.querySelector('svg')).toBeNull();
    expect(landerField.querySelector('svg')).toBeNull();
    expect(siteField.textContent).toMatch(/change ▾$/);
    expect(landerField.textContent).toMatch(/change$/);
  });

  it('changes the site in a drop-down on the page: the catalogue in the Sites page’s groups, then "Your own site…"', () => {
    const onSite = vi.fn();
    const onOwn = vi.fn();
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={onSite} onOwn={onOwn} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const button = screen.getByRole('button', { name: /^Landing site/ });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('group', { name: 'Choose a landing site' });
    expect(within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Artemis crewed landing regions', 'Apollo landings']);
    // The site shown is marked and holds the cursor; the list says what stays.
    const shown = within(list).getByRole('button', { name: /^de Gerlache Rim 2/ });
    expect(shown.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(shown);
    expect(list.textContent).toMatch(/The dates and the lander stay as they are\./);
    // The arrow keys move through the list; Escape closes it and gives the cursor back to the field.
    fireEvent.keyDown(shown, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'Apollo 11' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    // A site pressed is handed on and the list closes; "Your own site…" asks the page for its fields.
    fireEvent.click(button);
    fireEvent.click(within(list).getByRole('button', { name: 'Apollo 11' }));
    expect(onSite).toHaveBeenCalledWith('apollo_11');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    fireEvent.click(within(list).getByRole('button', { name: 'Your own site…' }));
    expect(onOwn).toHaveBeenCalled();
  });

  it('folds the four fields into one line on a phone, so the answer is on the first screen, and opens them on "change" (spec 6)', () => {
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 30 days from 1 January 2027, 00:00 UTC, small lander:')).toBeTruthy();
    const change = screen.getByRole('button', { name: 'change' });
    expect(change.getAttribute('aria-expanded')).toBe('false');
    const fields = document.getElementById(change.getAttribute('aria-controls')!)!;
    expect(fields.className).toMatch(/\bmax-sm:hidden\b/);
    // The line itself shows on a phone only; from sm up the fields are always there.
    expect(change.closest('p')!.className).toMatch(/\bsm:hidden\b/);
    fireEvent.click(change);
    expect(screen.getByRole('button', { name: 'done' }).getAttribute('aria-expanded')).toBe('true');
    expect(fields.className).not.toMatch(/\bmax-sm:hidden\b/);
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(fields.className).toMatch(/\bmax-sm:hidden\b/);
  });

  it('says the new length in the folded line after a change, and a lander that is no ready-made one is a custom lander', () => {
    const { rerender } = render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 30 days from 1 January 2027, 00:00 UTC, custom lander:')).toBeTruthy();
    rerender(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-03-05T17:00:00" days={7} onWindow={() => {}} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 7 days from 5 March 2027, 17:00 UTC, custom lander:')).toBeTruthy();
  });

  it('leaves the stars behind the header alone: on a phone the band is a line of words, which no star may sit behind (part C read 1)', () => {
    render(<PeriodBand site={site} sites={CATALOGUE} onSite={() => {}} onOwn={() => {}} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByRole('region', { name: 'What this forecast is for' }).hasAttribute('data-band-end')).toBe(false);
  });

  it('words the folded line from the preset’s size', () => {
    expect(periodLine('Shackleton rim summit', '2026-06-01T00:00:00', 90, { ...DEFAULT_POWER, areaM2: 20, loadW: 500, batteryWh: 50000 })).toBe('Shackleton rim summit, 90 days from 1 June 2026, 00:00 UTC, large lander');
  });
});
