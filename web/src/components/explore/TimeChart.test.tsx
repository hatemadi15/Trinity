// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hourlySeries } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { eph } from '@/test/file-loaders';
import { TimeChart } from './TimeChart';

// jsdom has no PointerEvent; MouseEvent carries clientX, which is all the chart reads.
if (!('PointerEvent' in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const START = '2027-01-01T00:00:00';
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const series = hourlySeries({ lat: -88.28, lon: -64.31 }, mask, eph, utcToEt(START), 720);
const power = powerBudget(series, DEFAULT_POWER);

function show(extra: Partial<Parameters<typeof TimeChart>[0]> = {}) {
  const onCursor = vi.fn();
  const onHover = vi.fn();
  const view = render(<TimeChart series={series} mask={mask} power={power} batteryWh={2000} startUtc={START} days={30} cursor={30} hoverHour={null} onCursor={onCursor} onHover={onHover} {...extra} />);
  return { onCursor, onHover, ...view };
}

describe('TimeChart', () => {
  it('says what it is and that time runs left to right', () => {
    show();
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    expect(within(chart).getByRole('heading', { level: 2 }).textContent).toBe('Why: the 30 days, hour by hour');
    // One sentence explains the top row and the grey: the Sun goes round the sky, so the grey is the hills that way, not one mountain.
    expect(chart.textContent).toMatch(
      /Time runs left to right\. From the site, the Sun goes once round the sky in a month: the top row names its direction, and the grey is the hills that way at that hour, not one mountain\./,
    );
  });

  it('draws the Sun, Earth and the battery as three named rows with their story in words', () => {
    show();
    const [sun, earth, battery] = screen.getAllByRole('img');
    expect(sun.getAttribute('aria-label')).toMatch(/^The Sun over the 30 days from 1 January\. The Sun is hidden from 3 Jan to 20 Jan, 16 days 15 hours\.$/);
    expect(earth.getAttribute('aria-label')).toMatch(/^Earth over the 30 days from 1 January\. Earth is hidden from /);
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
      'dotted while hidden',
      'the hills in its direction at that time',
      'battery charge',
    ]);
    expect(key.querySelectorAll('svg, [data-swatch]').length).toBeGreaterThanOrEqual(5);
  });

  it('gives the Sun and Earth rows height lines with the same spacing, so a degree means the same in both', () => {
    show();
    const [sun, earth] = screen.getAllByRole('img');
    const degrees = (row: HTMLElement) => [...row.textContent!.matchAll(/(\d+)° up/g)].map((m) => Number(m[1]));
    const steps = [...degrees(sun), ...degrees(earth)];
    // de Gerlache Rim 2 needs 10° spacing in Earth's row, so the Sun's row uses it too: no "5° up" anywhere.
    expect(steps.every((d) => d % 10 === 0)).toBe(true);
    expect(sun.querySelectorAll('line[data-height]').length).toBeGreaterThanOrEqual(1);
  });

  it('names the compass direction of the Sun along the top and the days along the bottom', () => {
    show();
    const compass = screen.getByTestId('compass');
    expect(compass.textContent).toMatch(/west.*south.*east/);
    expect(screen.getByText('Direction of the Sun')).toBeTruthy();
    expect(screen.getByTestId('days').textContent).toMatch(/^1 Jan6 Jan11 Jan16 Jan21 Jan26 Jan$/);
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
});
