// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { legendWords } from '@/lib/viz/year';
import { YearView } from './YearView';

const site = (id: string) => sites.find((s) => s.id === id)!;
const maskOf = (id: string) => (site(id).polar ? Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${id}.json`).elevation_deg) : new Float64Array(720));
const MASKS = Object.fromEntries(['de_gerlache_rim_2', 'shackleton_center_rim_high', 'blue_ghost_m1'].map((id) => [id, maskOf(id)]));
const nb = (s: string) => s.replace(/ %/g, '\u00a0%');

type Props = Parameters<typeof YearView>[0];
function props(id: string, over: Partial<Props> = {}): Props {
  return { eph, site: site(id), mask: MASKS[id], startUtc: '2027-01-01T00:00:00', days: 30, params: DEFAULT_PARAMS, onLand: vi.fn(), ...over };
}
const days = () => screen.queryAllByRole('button', { name: /^Land / });
async function openYear(p: Props) {
  const view = render(<YearView {...p} />);
  await waitFor(() => expect(days().length).toBeGreaterThan(0), { timeout: 20_000 });
  return view;
}

describe('YearView', () => {
  it('says plainly that it is working, then shows every landing day of the year as a control named by its date and both figures', async () => {
    render(<YearView {...props('de_gerlache_rim_2')} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Every landing day of the next 12 months');
    expect(screen.getByRole('status').textContent).toBe('Working out the 365 landing days…');
    expect(days()).toHaveLength(0);
    await waitFor(() => expect(days()).toHaveLength(365), { timeout: 20_000 });
    expect(screen.getByRole('button', { name: nb('Land 20 January 2027, 00:00 UTC, at night: power 43 % of the 30 days, radio contact 12 %. Mixed.') })).toBeTruthy();
    expect(screen.getByRole('button', { name: nb('Land 1 January 2027, 00:00 UTC: power 11 % of the 30 days, no radio contact. Poor.') })).toBeTruthy();
    // The year's answer in one sentence, as the best-date search would give it.
    expect(screen.getByRole('status').textContent).toBe(nb('No landing day keeps power all 30 days. The best: 13 October 2027, power 45 % of the time, radio contact 36 %.'));
    // Month by month, each a grid named by its month.
    expect(screen.getAllByRole('grid').map((g) => g.getAttribute('aria-label'))).toEqual(['January 2027', 'February 2027', 'March 2027', 'April 2027', 'May 2027', 'June 2027', 'July 2027', 'August 2027', 'September 2027', 'October 2027', 'November 2027', 'December 2027']);
  });

  it('keeps its words before a tap short: how the days are coloured waits one tap away (spec 20.1)', async () => {
    await openYear(props('de_gerlache_rim_2'));
    const region = screen.getByRole('region', { name: 'Every landing day of the next 12 months' });
    for (const width of [WIDE, PHONE]) expect(visibleWords(region, width).length).toBeLessThanOrEqual(100);
    expect(region.textContent).toContain('Each square is a landing that day at 00:00 UTC');
    expect(visibleWords(region, WIDE).join(' ')).not.toContain('Each square');
    fireEvent.click(within(region).getByRole('button', { name: 'How the days are coloured' }));
    expect(visibleWords(region, WIDE).join(' ')).toContain('Each square is a landing that day at 00:00 UTC, coloured by its 30 days.');
  });

  it('colours each day on one scale with a key in plain words, and marks the best days with a dot as well as their colour', async () => {
    await openYear(props('shackleton_center_rim_high', { days: 14 }));
    const key = screen.getByRole('list', { name: 'Key' });
    const words = legendWords(14);
    expect(within(key).getAllByRole('listitem').map((li) => li.textContent)).toEqual([words.best, words.good, words.mixed, words.poor]);
    const best = screen.getByRole('button', { name: nb('Land 4 January 2027, 00:00 UTC: power all 14 days, radio contact 54 %. Best.') });
    const good = screen.getByRole('button', { name: nb('Land 1 January 2027, 00:00 UTC: power all 14 days, radio contact 33 %. Good.') });
    expect(best.getAttribute('data-grade')).toBe('best');
    expect(good.getAttribute('data-grade')).toBe('good');
    expect(best.querySelector('[data-mark="best"]')).toBeTruthy();
    expect(good.querySelector('[data-mark="best"]')).toBeNull();
    // Each grade has its own colour, the same in the key.
    const colours = new Set(days().map((b) => b.style.backgroundColor));
    expect(colours.size).toBe(4);
    expect(key.querySelector('[data-grade="best"]')!.getAttribute('style')).toBe(best.getAttribute('style'));
  });

  it('marks the day the period lands on now, and lands on a day when it is pressed', async () => {
    const p = props('de_gerlache_rim_2', { startUtc: '2027-01-20T00:00:00' });
    await openYear(p);
    const chosen = screen.getByRole('button', { current: 'date' });
    expect(chosen.getAttribute('aria-label')).toMatch(/^Land 20 January 2027, 00:00 UTC/);
    fireEvent.click(screen.getByRole('button', { name: /^Land 14 March 2027, 00:00 UTC/ }));
    expect(p.onLand).toHaveBeenCalledWith('2027-03-14T00:00:00');
  });

  it('keeps one tab stop, on the chosen day, and moves day by day, week by week and month by month from the keyboard', async () => {
    await openYear(props('de_gerlache_rim_2', { startUtc: '2027-01-20T00:00:00' }));
    const stops = days().filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('aria-label')).toMatch(/^Land 20 January 2027/);
    act(() => stops[0].focus());
    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
    press('ArrowRight');
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Land 21 January 2027/);
    press('ArrowDown');
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Land 28 January 2027/);
    press('PageDown');
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Land 28 February 2027/);
    press('ArrowUp');
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Land 21 February 2027/);
    press('End');
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Land 19 January 2028/);
    // The tab stop goes with the focus.
    expect(days().filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('aria-label'))).toEqual([document.activeElement!.getAttribute('aria-label')]);
  });

  it('shows the figures of the day under the pointer or the focus, and says how to use the year otherwise', async () => {
    await openYear(props('de_gerlache_rim_2', { startUtc: '2027-01-20T00:00:00' }));
    const readout = screen.getByTestId('year-readout');
    expect(readout.textContent).toBe('Press a day to land on it.');
    const other = screen.getByRole('button', { name: /^Land 1 February 2027/ });
    fireEvent.pointerOver(other);
    expect(readout.textContent).toBe(other.getAttribute('aria-label')!.replace(/^Land /, ''));
    fireEvent.pointerLeave(other.closest('[role="grid"]')!.parentElement!.parentElement!);
    expect(readout.textContent).toBe('Press a day to land on it.');
    // The day the period lands on now says so.
    act(() => screen.getByRole('button', { current: 'date' }).focus());
    expect(readout.textContent).toBe(nb('Now shown: 20 January 2027, 00:00 UTC, at night: power 43 % of the 30 days, radio contact 12 %. Mixed.'));
  });

  it('keeps the year where it is while a landing within it is chosen, and starts again from a landing outside it or at another hour', async () => {
    const p = props('de_gerlache_rim_2');
    const { rerender } = await openYear(p);
    rerender(<YearView {...p} startUtc="2027-03-14T00:00:00" />);
    expect(screen.getByRole('status').textContent).not.toMatch(/^Working out/);
    expect(days()[0].getAttribute('aria-label')).toMatch(/^Land 1 January 2027/);
    expect(screen.getByRole('button', { current: 'date' }).getAttribute('aria-label')).toMatch(/^Land 14 March 2027/);
    rerender(<YearView {...p} startUtc="2028-06-01T00:00:00" />);
    await waitFor(() => expect(days()[0]?.getAttribute('aria-label')).toMatch(/^Land 1 June 2028/), { timeout: 20_000 });
    rerender(<YearView {...p} startUtc="2028-06-05T10:00:00" />);
    await waitFor(() => expect(days()[0]?.getAttribute('aria-label')).toMatch(/^Land 5 June 2028, 10:00 UTC/), { timeout: 20_000 });
  });

  it('never shows a year worked out for another site or period, however quickly they change', async () => {
    // Each slice waits for the test to let it go, so the first site's year is still on its way when the site changes.
    const waiting: (() => void)[] = [];
    const pause = () => new Promise<void>((resolve) => waiting.push(resolve));
    const release = async () => {
      while (waiting.length) {
        await act(async () => {
          waiting.splice(0).forEach((go) => go());
        });
      }
    };
    const p = props('de_gerlache_rim_2', { pause });
    const { rerender } = render(<YearView {...p} />);
    await waitFor(() => expect(waiting.length).toBeGreaterThan(0));
    rerender(<YearView {...p} site={site('blue_ghost_m1')} mask={MASKS.blue_ghost_m1} startUtc="2025-03-02T00:00:00" days={14} />);
    expect(screen.getByRole('status').textContent).toBe('Working out the 365 landing days…');
    expect(days()).toHaveLength(0);
    await release();
    await waitFor(() => expect(days()).toHaveLength(365));
    expect(days()[0].getAttribute('aria-label')).toBe(nb('Land 2 March 2025, 00:00 UTC, at night: power all 14 days, radio contact 100 %. Best.'));
    expect(screen.getByRole('status').textContent).toBe(nb('The best landing day: 3 March 2025, power all 14 days, radio contact 100 %.'));
  });

  it('stops at the end of the Sun and Earth table and says so', async () => {
    await openYear(props('de_gerlache_rim_2', { startUtc: '2036-06-01T00:00:00', days: 90 }));
    expect(days()).toHaveLength(125);
    expect(days().at(-1)!.getAttribute('aria-label')).toMatch(/^Land 3 October 2036/);
    expect(screen.getByText('The Sun and Earth table ends on 31 December 2036, so the year stops at 3 October 2036, the last landing whose 90 days fit.')).toBeTruthy();
  });

  it('names its NASA data at its foot, as every panel does', async () => {
    await openYear(props('de_gerlache_rim_2'));
    const row = screen.getByLabelText('Data sources');
    expect([...row.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m']);
  });
});
