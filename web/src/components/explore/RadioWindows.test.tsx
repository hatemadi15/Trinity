// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hero } from '@/lib/viz/arrival';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { RadioWindows } from './RadioWindows';

// de Gerlache Rim 2 from 1 January 2027 for 30 days: one window, 10 to 23 January; the lander, off from 4 January, has
// power again from 20 January if it survives the night.
const h = hero();
const show = (hour = 0) => render(<RadioWindows series={h.series} power={h.power} startUtc={h.startUtc} hour={hour} />);
const panel = () => screen.getByRole('region', { name: 'Radio windows' });

describe('RadioWindows', () => {
  it('says what it counts in plain words, a geometrically possible direct link, and once what that does not establish', () => {
    show();
    const text = panel().textContent ?? '';
    expect(text).toMatch(/When a direct radio link to Earth is geometrically possible\./);
    expect(text).toMatch(/Earth in view alone does not establish antenna performance, a link budget, ground stations or a schedule\./);
    expect(text.match(/does not establish/g)).toHaveLength(1);
  });

  it('gives the next opening or closing at the time bar’s hour, with its time in UTC, and follows the hour', () => {
    const { rerender } = show(0);
    expect(screen.getByTestId('radio-next').textContent).toBe('Next window opens 10 Jan, 03:00 UTC, in 9 d 3 h, and lasts 13 d 12 h');
    rerender(<RadioWindows series={h.series} power={h.power} startUtc={h.startUtc} hour={300} />);
    expect(screen.getByTestId('radio-next').textContent).toBe('This window closes 23 Jan, 15:00 UTC, in 10 d 3 h');
    rerender(<RadioWindows series={h.series} power={h.power} startUtc={h.startUtc} hour={600} />);
    expect(screen.getByTestId('radio-next').textContent).toBe('No window opens before the period ends');
    // On a phone the line keeps two lines, so the page under it does not move as the words change.
    expect(screen.getByTestId('radio-next').className).toMatch(/max-sm:min-h-\[2lh\]/);
  });

  it('gives the hours with Earth in view, the longest time without it and the radio contact while it has power, each with what bounds it', () => {
    show();
    const figure = (name: string) => within(panel()).getByText(name).closest('div')!.textContent;
    expect(figure('Earth in view')).toBe('Earth in view13 d 12 hin 1 window');
    // Cut short by the period's start: the time without Earth may have begun before it.
    expect(figure('Longest without Earth')).toBe('Longest without Earthat least 9 d 3 hfrom the period’s start');
    // As the answer counts it, from the landing; the hours after the power comes back apart, with their condition.
    expect(figure('Radio contact while it has power')).toBe('Radio contact while it has powernoneuntil the battery runs out; 3 d 5 h after, if the lander survives the cold');
  });

  it('lists every window in a fold: when it opens and closes in UTC, how long it lasts, and the lander’s power in it', () => {
    show();
    const fold = within(panel()).getByRole('button', { name: 'Every window, with its times' });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(fold.getAttribute('aria-controls')!)!.hidden).toBe(true);
    fireEvent.click(fold);
    const table = within(panel()).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Opens (UTC)', 'Closes (UTC)', 'Length', 'Lander power']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))).toEqual([['10 Jan, 03:00', '23 Jan, 15:00', '13 d 12 h', 'power for 3 d 5 h of it, if the lander survives the cold']]);
    // The window is marked as one the lander can use only if it survives the cold.
    expect(rows[0].querySelector('[data-use]')!.getAttribute('data-use')).toBe('if-survives');
    // What a time means: the first whole hour of the new state.
    expect(panel().textContent).toMatch(/Each time is the first whole hour after the change\./);
  });

  it('says a window open at either end of the period may be longer than the period shows', () => {
    const always = { ...h.series, earthVisible: new Uint8Array(h.series.hours).fill(1) };
    render(<RadioWindows series={always} power={h.power} startUtc={h.startUtc} hour={0} />);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Every window, with its times' }));
    const cells = [...within(panel()).getAllByRole('row')[1].querySelectorAll('th, td')].map((c) => c.textContent);
    expect(cells.slice(0, 3)).toEqual(['open at the start', 'open at the end', 'at least 30 d']);
    expect(screen.getByTestId('radio-next').textContent).toBe('This window stays open to the end of the period');
    expect(within(panel()).getByText('Longest without Earth').closest('div')!.textContent).toBe('Longest without EarthnoneEarth never leaves the view');
  });

  it('keeps to 110 words before a tap, and stacks the table on a phone so nothing scrolls sideways', () => {
    show();
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel(), width).length).toBeLessThanOrEqual(110);
    // With room under it for the longer words other periods give (a two-figure wait, a window open to the end, contact
    // both before and after a power cut: six words more at most).
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel(), width).length).toBeLessThanOrEqual(104);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Every window, with its times' }));
    const table = within(panel()).getByRole('table');
    expect(table.className).toMatch(/\bmax-sm:block\b/);
    expect(table.querySelector('thead')!.className).toMatch(/\bmax-sm:sr-only\b/);
  });
});
