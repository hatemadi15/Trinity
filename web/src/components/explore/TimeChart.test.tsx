// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hourlySeries } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { eph } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { TimeChart } from './TimeChart';

// jsdom has no PointerEvent; MouseEvent carries clientX, which is all the chart reads.
if (!('PointerEvent' in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const START = '2027-01-01T00:00:00';
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const series = hourlySeries({ lat: -88.28, lon: -64.31 }, mask, eph, utcToEt(START), 720);
const power = powerBudget(series, DEFAULT_POWER);

it('keeps its explanation to a readable line length', () => {
  show();
  expect(screen.getByText(/^Time runs left to right\./).className).toMatch(/\bmax-w-\[46em\]/);
});

function show(extra: Partial<Parameters<typeof TimeChart>[0]> = {}) {
  const onCursor = vi.fn();
  const onHover = vi.fn();
  const view = render(<TimeChart series={series} mask={mask} power={power} batteryWh={2000} startUtc={START} days={30} cursor={30} hoverHour={null} onCursor={onCursor} onHover={onHover} {...extra} />);
  return { onCursor, onHover, ...view };
}

describe('TimeChart dates on a phone', () => {
  it('keeps every other date only from the small screen up, so the dates never run into each other', () => {
    show();
    const dates = [...document.querySelectorAll<HTMLElement>('[data-day]')];
    expect(dates.length).toBeGreaterThan(3);
    dates.forEach((d, i) => expect(d.className.includes('max-sm:hidden')).toBe(i % 2 === 1));
  });
});

describe('TimeChart', () => {
  it('says what it is, and keeps how to read it one tap away under "How to read the chart" (spec 20.1)', () => {
    show();
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    expect(within(chart).getByRole('heading', { level: 2 }).textContent).toBe('Why: the 30 days, hour by hour');
    // One sentence explains the top row and the grey: the Sun goes round the sky, so the grey is the hills that way, not one mountain.
    const intro = within(chart).getByText(
      /^Time runs left to right\. From the site, the Sun goes once round the sky in a month: the top row names its direction, and the grey is the hills that way at that hour, not one mountain\. Earth stays low over one stretch of the horizon; the Moon's slow monthly wobble lifts it into view and lowers it out of view\. Press Play in the bar at the bottom to run through the days\.$/,
    );
    // Where it read before, under the heading and above the key; the page keeps it, so a search finds it, but it shows
    // only once the button opens it.
    const how = within(chart).getByRole('button', { name: 'How to read the chart' });
    expect(within(chart).getByRole('heading', { level: 2 }).nextElementSibling!.contains(how)).toBe(true);
    expect(how.compareDocumentPosition(within(chart).getByRole('list', { name: 'Key' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const fold = document.getElementById(how.getAttribute('aria-controls')!)!;
    expect(fold.contains(intro)).toBe(true);
    expect(fold.hidden).toBe(true);
    fireEvent.click(how);
    expect(how.getAttribute('aria-expanded')).toBe('true');
    expect(fold.hidden).toBe(false);
  });

  it('keeps the words above the plot to 30 before a tap, at 1440 and on a phone (spec 20.1)', () => {
    show();
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    // The heading, the fold and the key: everything above the row of the Sun's directions that tops the plot.
    const parts = [...chart.children];
    const above = parts.slice(0, parts.indexOf(screen.getByTestId('compass').parentElement!));
    expect(above.length).toBeGreaterThan(0);
    for (const width of [WIDE, PHONE]) expect(above.reduce((n, el) => n + visibleWords(el, width).length, 0)).toBeLessThanOrEqual(30);
  });

  it('draws the Sun, Earth and the battery as three named rows with their story in words', () => {
    show();
    const [sun, earth, battery] = screen.getAllByRole('img');
    expect(sun.getAttribute('aria-label')).toMatch(/^The Sun over the 30 days from 1 January\. The Sun is set from 3 Jan to 20 Jan, 16 days 15 hours\.$/);
    expect(earth.getAttribute('aria-label')).toMatch(/^Earth over the 30 days from 1 January\. Earth is set from /);
    expect(battery.getAttribute('aria-label')).toBe('The battery first runs out on 4 January and the lander is off for 16 days 6 hours of these 30 days.');
    expect(screen.getByText('The Sun')).toBeTruthy();
    expect(screen.getByText('Earth')).toBeTruthy();
    expect(screen.getByText('Battery')).toBeTruthy();
  });

  it('explains its marks in a key with a sample of each', () => {
    show();
    const key = screen.getByRole('list', { name: 'Key' });
    expect(within(key).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "the Sun's height",
      "Earth's height",
      'dotted while set',
      'the hills in its direction at that time',
      'battery charge',
    ]);
    expect(key.querySelectorAll('svg, [data-swatch]').length).toBeGreaterThanOrEqual(5);
  });

  it('gives each row its own height scale with words, the Sun row too', () => {
    show();
    const [sun, earth] = screen.getAllByRole('img');
    // At de Gerlache Rim 2 in January 2027 the Sun stays within a few degrees of the horizon: 5° apart fits its row.
    expect(sun.textContent).toMatch(/5° up/);
    expect(sun.querySelectorAll('line[data-height]').length).toBeGreaterThanOrEqual(2);
    expect(earth.querySelectorAll('line[data-height]').length).toBeGreaterThanOrEqual(1);
  });

  it('names the compass direction of the Sun along the top and the days along the bottom', () => {
    show();
    const compass = screen.getByTestId('compass');
    expect(compass.textContent).toMatch(/west.*south.*east/);
    expect(screen.getByText('Direction of the Sun')).toBeTruthy();
    expect(screen.getByTestId('days').textContent).toMatch(/^1 Jan6 Jan11 Jan16 Jan21 Jan26 Jan$/);
  });

  it("draws the dotted sample of the key in the Sun's and Earth's colours, as the chart draws them", () => {
    show();
    const key = screen.getByRole('list', { name: 'Key' });
    const dotted = [...key.querySelectorAll('li')].find((li) => li.textContent?.includes('dotted while set'))!;
    const strokes = [...dotted.querySelectorAll('line')].map((l) => l.getAttribute('stroke'));
    expect(strokes).toEqual(['var(--stage-sun)', 'var(--stage-earth)']);
  });

  it('ties each direction word to its hour with a tick', () => {
    show();
    const compass = screen.getByTestId('compass');
    const words = [...compass.querySelectorAll<HTMLElement>('[data-direction]')];
    expect(words.length).toBeGreaterThan(2);
    for (const w of words) expect(w.querySelector('[data-tick]')).toBeTruthy();
  });

  it('draws its time line so that it shows on the black rows and on the light battery row', () => {
    show();
    const line = document.querySelector<HTMLElement>('[data-part="cursor"]')!;
    expect(line.className).toMatch(/\bbg-stage-ink\b/);
    expect(line.className).toMatch(/\bborder-x\b/);
  });

  it('marks the hour of the time bar, and the hour under the pointer', () => {
    const { container, rerender, onCursor, onHover } = show();
    const cursor = container.querySelector<HTMLElement>('[data-part="cursor"]')!;
    expect(parseFloat(cursor.style.left)).toBeCloseTo(((30 + 0.5) / 720) * 100, 6);
    expect(container.querySelector('[data-part="hover"]')).toBeNull();
    rerender(<TimeChart series={series} mask={mask} power={power} batteryWh={2000} startUtc={START} days={30} cursor={30} hoverHour={400} onCursor={onCursor} onHover={onHover} />);
    expect(parseFloat(container.querySelector<HTMLElement>('[data-part="hover"]')!.style.left)).toBeCloseTo(((400 + 0.5) / 720) * 100, 6);
  });

  it('follows the pointer: moving shows the hour, pressing and dragging moves the time', () => {
    const { container, onCursor, onHover } = show();
    const layer = container.querySelector<HTMLElement>('[data-part="pointer"]')!;
    layer.getBoundingClientRect = () => ({ left: 100, top: 0, width: 720, height: 200, right: 820, bottom: 200, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(layer, { clientX: 460 });
    expect(onHover).toHaveBeenLastCalledWith(360);
    expect(onCursor).not.toHaveBeenCalled();
    fireEvent.pointerDown(layer, { clientX: 200, pointerId: 1 });
    expect(onCursor).toHaveBeenLastCalledWith(100);
    fireEvent.pointerMove(layer, { clientX: 300 });
    expect(onCursor).toHaveBeenLastCalledWith(200);
    fireEvent.pointerUp(layer, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 350 });
    expect(onCursor).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenLastCalledWith(250);
    fireEvent.pointerLeave(layer);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('writes on the battery row when the lander is off, and nothing when it never is', () => {
    const { unmount } = show();
    expect(screen.getByText('battery empty, lander off')).toBeTruthy();
    unmount();
    show({ power: powerBudget(series, { ...DEFAULT_POWER, batteryWh: 50000, loadW: 10 }), batteryWh: 50000 });
    expect(screen.queryByText('battery empty, lander off')).toBeNull();
    expect(screen.getAllByRole('img')[2].getAttribute('aria-label')).toBe('The battery never runs out in these 30 days.');
  });

  it('still draws the Sun and Earth before the power budget is known', () => {
    show({ power: null });
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('keeps every label as page text of at least 13 px', () => {
    const { container } = show();
    expect(container.querySelectorAll('svg text')).toHaveLength(0);
    for (const l of container.querySelectorAll<HTMLElement>('[data-label]')) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(13);
  });

  it('names its NASA data', () => {
    const names = () => within(screen.getByLabelText('Data sources')).getAllByRole('listitem').map((li) => li.textContent);
    // DE440 gives the Sun's and Earth's heights and LOLA the hills; the power model is the app's own, so it has no pill.
    const first = show();
    expect(names()).toEqual(['JPL DE440', 'NASA LRO LOLA 20 m']);
    // The row is the chart's foot, away from its heading.
    expect(screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' }).lastElementChild).toBe(screen.getByLabelText('Data sources'));
    first.unmount();
    // Given its site, the chart names the grid the hills come from: 80 m for a site north of 87.55° S.
    const farther = show({ site: { lat: -86, polar: true } });
    expect(names()).toEqual(['JPL DE440', 'NASA LRO LOLA 80 m']);
    farther.unmount();
    // A horizon of zeros is a place off the polar grids: no hills, so no LOLA.
    show({ mask: new Float64Array(720) });
    expect(names()).toEqual(['JPL DE440']);
  });
});
