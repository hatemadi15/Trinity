// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '@/lib/engine/power';
import { PLOT_GRID } from './TimeChart';
import { TimeBar } from './TimeBar';

const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const HOURS = 72;
// Sun for a day, night for a day (the battery carries ten hours of it), Sun again; Earth in view on the second day only.
const sun = Array.from({ length: HOURS }, (_, h) => (h < 24 || h >= 48 ? 1 : 0));
const series: Series = {
  i0: 0,
  hours: HOURS,
  sunAz: new Float64Array(HOURS),
  sunEl: new Float64Array(HOURS).fill(5),
  earthAz: new Float64Array(HOURS),
  earthEl: new Float64Array(HOURS),
  sunFraction: Float64Array.from(sun),
  earthVisible: Uint8Array.from({ length: HOURS }, (_, h) => (h >= 24 && h < 48 ? 1 : 0)),
  sunAu: new Float64Array(HOURS).fill(1),
};
const power = powerBudget(series, CFG);
const START = '2027-01-01T00:00:00';

function show(cursor: number, extra: Partial<Parameters<typeof TimeBar>[0]> = {}) {
  const onCursor = vi.fn();
  const view = render(<TimeBar series={series} power={power} startUtc={START} cursor={cursor} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} {...extra} />);
  return { onCursor, ...view };
}

/**
 * A period of `days` days from START under a steady Sun with Earth out of view, for the dates and the
 * bands under the sunlight; `over` swaps in other hours of the Sun or of Earth.
 */
function showPeriod(days: number, extra: Partial<Parameters<typeof TimeBar>[0]> = {}, over: Partial<Series> = {}) {
  const hours = days * 24;
  const steady: Series = {
    i0: 0,
    hours,
    sunAz: new Float64Array(hours),
    sunEl: new Float64Array(hours).fill(5),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours).fill(1),
    earthVisible: new Uint8Array(hours),
    sunAu: new Float64Array(hours).fill(1),
    ...over,
  };
  return render(<TimeBar series={steady} power={null} startUtc={START} cursor={0} hoverHour={null} batteryWh={0} onCursor={vi.fn()} {...extra} />);
}
const dateLabels = () => [...screen.getByTestId('dates').querySelectorAll<HTMLElement>('[data-date]')];
/** The labels left out on a track narrower than `px`, so that the rest do not crowd. */
const leftOutBelow = (px: number) => dateLabels().filter((l) => l.className.includes(`@max-[${px}px]:hidden`)).map((l) => l.textContent);
/** How far down the box of the sunlight strip a band starts, in px, from its top-[…px] class. */
const topPx = (el: Element) => Number(/(?:^| )top-\[(\d+)px\](?: |$)/.exec(el.getAttribute('class') ?? '')?.[1]);
/** The box the sunlight strip and the bands under it share. */
const stripBox = (container: HTMLElement) => container.querySelector('[data-part="track"] svg')!.parentElement!;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TimeBar', () => {
  it('says the date and hour in UTC and what is happening then', () => {
    show(6);
    expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun up, Earth behind the hills, battery 100 %');
  });

  it("lines its track up under the chart's plot: the chart's grid, inset by the chart panel's edge", () => {
    show(6);
    const bar = screen.getByRole('region', { name: 'Time' });
    const grid = bar.querySelector<HTMLElement>('[data-part="bar-grid"]')!;
    for (const c of PLOT_GRID.split(' ')) expect(grid.classList.contains(c)).toBe(true);
    expect(grid.className).toMatch(/\bpx-\[25px\]/);
    // Play sits in the column of the row names; the date, the words and the track in the column of the plot.
    expect(screen.getByRole('button', { name: /Play/ }).className).toMatch(/\brow-span-2\b/);
    const track = screen.getByRole('slider', { name: 'Time' }).closest<HTMLElement>('[data-part="track"]')!;
    expect(track.className).toMatch(/\bcol-start-2\b/);
    // The date and the words share one line.
    expect(screen.getByTestId('when').parentElement).toBe(screen.getByTestId('status').parentElement);
  });

  it('keeps the bar short: Play shows only its sign on a phone, and the days are left to the chart the track lines up with', () => {
    show(6);
    const word = screen.getByRole('button', { name: /Play/ }).querySelector('span')!;
    expect(word.textContent).toBe('Play');
    expect(word.className).toMatch(/max-sm:sr-only/);
    expect(screen.queryByTestId('ticks')).toBeNull();
  });

  it('shows the hour under the pointer on the chart while the handle stays put', () => {
    show(6, { hoverHour: 40 });
    expect(screen.getByTestId('when').textContent).toBe('2 Jan 2027, 16:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun behind the hills, Earth in view but the lander is off, battery empty');
    expect((screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement).value).toBe('6');
  });

  it('is a slider over the hours of the period that reads its position in words', () => {
    const { onCursor } = show(10);
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('71');
    expect(slider.step).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('1 Jan 2027, 10:00 UTC: Sun up, Earth behind the hills, battery 100 %');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(onCursor).toHaveBeenLastCalledWith(30);
  });

  it('moves one hour with the arrow keys and one day with Page Up and Page Down, never past the ends', () => {
    const { onCursor, rerender } = show(10);
    const slider = screen.getByRole('slider', { name: 'Time' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onCursor).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onCursor).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(34);
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(onCursor).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onCursor).toHaveBeenLastCalledWith(71);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onCursor).toHaveBeenLastCalledWith(0);
    rerender(<TimeBar series={series} power={power} startUtc={START} cursor={60} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(71);
  });

  it('says what the yellow of its track is, so it does not read as progress', () => {
    show(6);
    const bar = screen.getByRole('region', { name: 'Time' });
    const key = bar.querySelector<HTMLElement>('[data-part="key"]')!;
    expect(key.textContent).toBe('Sun up');
    expect(key.querySelector('[data-swatch]')!.className).toMatch(/\bbg-sun\b/);
    // On a phone too: the yellow track needs its key there as much as anywhere.
    expect(key.className).not.toMatch(/hidden/);
  });

  it('draws the sunlight of the period as the track', () => {
    const { container } = show(0);
    expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
  });

  it('plays an hour at a time from a plain button, not gold or ink, and stops at the end', () => {
    vi.useFakeTimers();
    const { onCursor, rerender } = show(69);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.className).toMatch(/\bbtn\b/);
    expect(play.className).not.toMatch(/btn-ink|btn-primary/);
    expect(play.className).not.toMatch(/btn-primary/);
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(90);
    });
    expect(onCursor).toHaveBeenLastCalledWith(70);
    rerender(<TimeBar series={series} power={power} startUtc={START} cursor={71} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy(); // stopped at the last hour
    expect(onCursor).not.toHaveBeenCalledWith(72);
  });

  it('starts again from the beginning when Play is pressed at the end', () => {
    vi.useFakeTimers();
    const { onCursor } = show(71);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onCursor).toHaveBeenLastCalledWith(0);
  });

  it('does not play when the system asks for reduced motion, and says why', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    show(0);
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Playback is off because your system asks for reduced motion/)).toBeTruthy();
  });

  it('leaves out the dates, the hours the lander is off, the hours Earth is in view and the name of the grey unless asked: on Explore the chart above shows them', () => {
    // The lander of this period is off for part of the night, but only the chart says so.
    expect(power.powered.includes(0)).toBe(true);
    // Earth is in view on the second day, and the night leaves the strip grey: the chart's rows show both.
    expect(series.earthVisible.includes(1)).toBe(true);
    expect(series.sunFraction.includes(0)).toBe(true);
    const { container, unmount } = show(6);
    expect(screen.queryByTestId('dates')).toBeNull();
    expect(container.querySelector('[data-date]')).toBeNull();
    expect(container.querySelector('[data-part="off"]')).toBeNull();
    expect(container.querySelector('[data-part="key-off"]')).toBeNull();
    expect(screen.queryByText('lander off')).toBeNull();
    expect(container.querySelector('[data-part="earth"]')).toBeNull();
    expect(container.querySelector('[data-part="key-earth"]')).toBeNull();
    expect(screen.queryByText('Earth in view')).toBeNull();
    expect(container.querySelector('[data-part="key-no-sun"]')).toBeNull();
    expect(screen.queryByText('no Sun')).toBeNull();
    expect(container.querySelectorAll('[data-swatch]')).toHaveLength(1);
    // The box of the strip keeps its height: nothing under the strip but the slider's own room.
    expect(stripBox(container).getAttribute('class')).toBe('relative h-8');
    unmount();
    // The hours the lander is off on their own bring neither: Earth's band and the grey's name come with the dates.
    const offOnly = show(6, { powered: power.powered });
    expect(offOnly.container.querySelector('[data-part="off"]')).not.toBeNull();
    expect(offOnly.container.querySelector('[data-part="earth"]')).toBeNull();
    expect(screen.queryByText('Earth in view')).toBeNull();
    expect(screen.queryByText('no Sun')).toBeNull();
    expect(offOnly.container.querySelectorAll('[data-swatch]')).toHaveLength(2);
    expect(stripBox(offOnly.container).getAttribute('class')).toBe('relative h-8');
  });

  it('writes the dates under the track when asked: every 5 days over 30 days, each at the start of its day on the track', () => {
    showPeriod(30, { dates: true });
    const row = screen.getByTestId('dates');
    const labels = dateLabels();
    expect(labels.map((l) => l.textContent)).toEqual(['1 Jan', '6 Jan', '11 Jan', '16 Jan', '21 Jan', '26 Jan']);
    // In the track's own column, so on the same grid as the sunlight and the chart's plot.
    expect(row.parentElement).toBe(screen.getByRole('slider', { name: 'Time' }).closest('[data-part="track"]'));
    // Hour 120 k of 720: the first against the left end, the others centred on theirs.
    labels.forEach((l, k) => expect(parseFloat(l.style.left)).toBeCloseTo(((k * 120) / 720) * 100, 6));
    expect(labels[0].style.transform).toBe('');
    for (const l of labels.slice(1)) expect(l.style.transform).toBe('translateX(-50%)');
    // None falls outside the track: the last centre leaves half a step (2.5 days) to the right end, room for half a label.
    for (const l of labels) expect(parseFloat(l.style.left)).toBeGreaterThanOrEqual(0);
    expect(1 - parseFloat(labels[labels.length - 1].style.left) / 100).toBeGreaterThanOrEqual(2.5 / 30 - 1e-9);
    // Readable on the grey page and on the stand view's dark one: 15 px in the second ink, which both themes set.
    expect(row.className).toMatch(/\btext-\[15px\]/);
    expect(row.className).toMatch(/\btext-ink-2\b/);
    // The slider already reads the date in words.
    expect(row.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the dates apart on a narrow track such as a phone: every other one gives way below the width six need', () => {
    showPeriod(30, { dates: true });
    expect(screen.getByTestId('dates').className).toMatch(/(^| )@container( |$)/);
    expect(leftOutBelow(504)).toEqual(['6 Jan', '16 Jan', '26 Jan']);
    expect(dateLabels().filter((l) => /hidden/.test(l.className)).map((l) => l.textContent)).toEqual(['6 Jan', '16 Jan', '26 Jan']);
  });

  it('spaces the dates by the length of the period: every 2 days over 14 days, every 15 over 90', () => {
    const { unmount } = showPeriod(14, { dates: true });
    expect(dateLabels().map((l) => l.textContent)).toEqual(['1 Jan', '3 Jan', '5 Jan', '7 Jan', '9 Jan', '11 Jan', '13 Jan']);
    // Seven labels need a wider track than six before all of them show.
    expect(leftOutBelow(588)).toEqual(['3 Jan', '7 Jan', '11 Jan']);
    unmount();
    showPeriod(90, { dates: true });
    expect(dateLabels().map((l) => l.textContent)).toEqual(['1 Jan', '16 Jan', '31 Jan', '15 Feb', '2 Mar', '17 Mar']);
    expect(leftOutBelow(504)).toEqual(['16 Jan', '15 Feb', '17 Mar']);
  });

  it('draws the hours the lander is off as a thin red band right under the sunlight, and adds it to the key', () => {
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 465 ? 0 : 1));
    const { container } = showPeriod(30, { powered });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="off-run"]')];
    expect(runs).toHaveLength(1);
    // From hour 76 to hour 465 of the 720, as shares of the track.
    expect(parseFloat(runs[0].style.left) / 100).toBeCloseTo(76 / 720, 6);
    expect(parseFloat(runs[0].style.width) / 100).toBeCloseTo((465 - 76) / 720, 6);
    expect(runs[0].className).toMatch(/\bbg-bad\b/);
    // In the box of the sunlight strip and across its whole width, so on the same hours.
    const band = container.querySelector<HTMLElement>('[data-part="off"]')!;
    const strip = container.querySelector('[data-part="lit"]')!.closest('svg')!;
    expect(band.parentElement).toBe(strip.parentElement);
    expect(band.className).toMatch(/\binset-x-0\b/);
    expect(band.className).toMatch(/\bh-1\b/);
    expect(band.getAttribute('aria-hidden')).toBe('true');
    // The key names it next to the Sun's, in the same red.
    const key = container.querySelector<HTMLElement>('[data-part="key-off"]')!;
    expect(key.textContent).toBe('lander off');
    expect(key.querySelector('[data-swatch]')!.className).toMatch(/\bbg-bad\b/);
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key"]'));
    expect(container.querySelector('[data-part="key"]')!.textContent).toBe('Sun up');
    // The two keys wrap as one, at the right on a wide screen, so "lander off" never strays to the far side of a new line.
    const keys = key.parentElement!;
    expect(keys.tagName).not.toBe('P');
    expect(keys.className).toMatch(/\bsm:ml-auto\b/);
    // Two keys fit beside the words: without the dates they do not take a line of their own.
    expect(keys.classList.contains('basis-full')).toBe(false);
  });

  it('draws one band for each stretch the lander is off', () => {
    const powered = Uint8Array.from({ length: 336 }, (_, h) => ((h >= 10 && h < 20) || h >= 300 ? 0 : 1));
    const { container } = showPeriod(14, { powered });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="off-run"]')];
    expect(runs.map((r) => [parseFloat(r.style.left) / 100, parseFloat(r.style.width) / 100])).toEqual([
      [expect.closeTo(10 / 336, 6), expect.closeTo(10 / 336, 6)],
      [expect.closeTo(300 / 336, 6), expect.closeTo(36 / 336, 6)],
    ]);
  });

  it('draws no band and no key while the lander keeps power all through', () => {
    const { container, unmount } = showPeriod(30, { powered: new Uint8Array(720).fill(1) });
    expect(container.querySelector('[data-part="off"]')).toBeNull();
    expect(container.querySelector('[data-part="key-off"]')).toBeNull();
    expect(screen.queryByText('lander off')).toBeNull();
    unmount();
    const empty = showPeriod(30, { powered: null });
    expect(empty.container.querySelector('[data-part="off"]')).toBeNull();
    expect(screen.queryByText('lander off')).toBeNull();
  });

  it("draws the hours Earth is in view as a thin band in Earth's colour under the lander-off band, and adds it to the key", () => {
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 200 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 465 ? 0 : 1));
    const { container } = showPeriod(30, { dates: true, powered }, { earthVisible });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="earth-run"]')];
    expect(runs).toHaveLength(1);
    // From hour 100 to hour 200 of the 720, as shares of the track.
    expect(parseFloat(runs[0].style.left) / 100).toBeCloseTo(100 / 720, 6);
    expect(parseFloat(runs[0].style.width) / 100).toBeCloseTo(100 / 720, 6);
    // Earth's colour, which the light page and the stand view's dark one both set; at least 4 px wide, like the off band.
    expect(runs[0].classList.contains('bg-earth')).toBe(true);
    expect(runs[0].classList.contains('min-w-1')).toBe(true);
    // In the box of the sunlight strip and across its whole width, so on the same hours.
    const band = container.querySelector<HTMLElement>('[data-part="earth"]')!;
    const box = stripBox(container);
    expect(band.parentElement).toBe(box);
    expect(band.classList.contains('inset-x-0')).toBe(true);
    expect(band.classList.contains('h-1')).toBe(true);
    expect(band.getAttribute('aria-hidden')).toBe('true');
    // 4 px tall like the off band, starting 2 px below it, so the two never touch.
    const off = container.querySelector<HTMLElement>('[data-part="off"]')!;
    expect(off.parentElement).toBe(box);
    expect(topPx(off)).toBe(25);
    expect(topPx(band)).toBe(topPx(off) + 4 + 2);
    // The box grows from 32 to 36 px to hold it, so the dates under it stay clear.
    expect(box.classList.contains('h-9')).toBe(true);
    expect(topPx(band) + 4).toBeLessThanOrEqual(36);
    // The key names it after "lander off", in the order of the bands from the top, in the same blue.
    const key = container.querySelector<HTMLElement>('[data-part="key-earth"]')!;
    expect(key.textContent).toBe('Earth in view');
    expect(key.querySelector('[data-swatch]')!.classList.contains('bg-earth')).toBe(true);
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key-off"]'));
  });

  it("draws the hours with both power and Earth in view, when the lander can radio home, as a thicker green band over Earth’s, and names it in the key", () => {
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 300 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 250 ? 0 : 1));
    const { container } = showPeriod(30, { dates: true, powered }, { earthVisible });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="contact-run"]')];
    // Power is back at hour 250 while Earth is still in view, until hour 300.
    expect(runs).toHaveLength(1);
    expect(parseFloat(runs[0].style.left) / 100).toBeCloseTo(250 / 720, 6);
    expect(parseFloat(runs[0].style.width) / 100).toBeCloseTo(50 / 720, 6);
    expect(runs[0].classList.contains('bg-good')).toBe(true);
    // 6 px tall over the 4 px Earth band, inside the strip's box.
    const band = container.querySelector<HTMLElement>('[data-part="contact"]')!;
    expect(band.parentElement).toBe(stripBox(container));
    expect(band.classList.contains('h-1.5')).toBe(true);
    expect(topPx(band)).toBe(30);
    const key = container.querySelector<HTMLElement>('[data-part="key-contact"]')!;
    expect(key.textContent).toBe('radio contact');
    expect(key.querySelector('[data-swatch]')!.classList.contains('bg-good')).toBe(true);
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key-earth"]'));
  });

  it('draws no radio band, nor its key, while power and Earth never meet, or without the power data', () => {
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 200 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 465 ? 0 : 1));
    const { container, unmount } = showPeriod(30, { dates: true, powered }, { earthVisible });
    expect(container.querySelector('[data-part="contact"]')).toBeNull();
    expect(screen.queryByText('radio contact')).toBeNull();
    unmount();
    const none = showPeriod(30, { dates: true }, { earthVisible });
    expect(none.container.querySelector('[data-part="contact"]')).toBeNull();
  });

  it('draws one Earth band for each stretch Earth is in view, and none, nor its key, while Earth stays out of view', () => {
    const earthVisible = Uint8Array.from({ length: 336 }, (_, h) => (h < 5 || (h >= 200 && h < 201) ? 1 : 0));
    const { container, unmount } = showPeriod(14, { dates: true }, { earthVisible });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="earth-run"]')];
    expect(runs.map((r) => [parseFloat(r.style.left) / 100, parseFloat(r.style.width) / 100])).toEqual([
      [0, expect.closeTo(5 / 336, 6)],
      [expect.closeTo(200 / 336, 6), expect.closeTo(1 / 336, 6)],
    ]);
    // Without power data the Earth band keeps its place, so it does not take the off band's.
    expect(container.querySelector('[data-part="off"]')).toBeNull();
    expect(topPx(container.querySelector('[data-part="earth"]')!)).toBe(31);
    unmount();
    const none = showPeriod(30, { dates: true });
    expect(none.container.querySelector('[data-part="earth"]')).toBeNull();
    expect(none.container.querySelector('[data-part="earth-run"]')).toBeNull();
    expect(none.container.querySelector('[data-part="key-earth"]')).toBeNull();
    expect(screen.queryByText('Earth in view')).toBeNull();
    // The box keeps the height it has with the dates, so the bar does not change height from one site to another.
    expect(stripBox(none.container).classList.contains('h-9')).toBe(true);
  });

  it("names the strip's grey, the hours without the Sun, right after the Sun's yellow when the dates are shown", () => {
    // The night of the second day leaves the strip grey there.
    const { container } = show(6, { dates: true });
    const key = container.querySelector<HTMLElement>('[data-part="key-no-sun"]')!;
    expect(key.textContent).toBe('no Sun');
    // The swatch is the strip's own grey: its background, where no yellow is drawn.
    expect(container.querySelector('[data-part="track"] svg')!.classList.contains('bg-surface-2')).toBe(true);
    expect(key.querySelector('[data-swatch]')!.classList.contains('bg-surface-2')).toBe(true);
    // An edge, so the grey shows against the bar's own background.
    expect(key.querySelector('[data-swatch]')!.classList.contains('border-line-strong')).toBe(true);
    const sunKey = container.querySelector('[data-part="key"]')!;
    expect(key.previousElementSibling).toBe(sunKey);
  });

  it('names the grey only when some hour has no Sun at all, by the rule the strip is drawn with: any part of the disc is yellow', () => {
    // A sliver of the Sun all through: the strip is yellow from end to end, with no grey to name.
    const { container, unmount } = showPeriod(30, { dates: true }, { sunFraction: new Float64Array(720).fill(0.2) });
    expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(1);
    expect(container.querySelector('[data-part="key-no-sun"]')).toBeNull();
    expect(screen.queryByText('no Sun')).toBeNull();
    unmount();
    // One hour without it is grey on the strip, and named.
    const sunFraction = new Float64Array(720).fill(1);
    sunFraction[300] = 0;
    const one = showPeriod(30, { dates: true }, { sunFraction });
    expect(one.container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
    expect(screen.getByText('no Sun')).toBeTruthy();
  });

  it('keeps all five keys on one baseline on a line of their own, at the right on a wide screen, so the bar keeps one height while the words change', () => {
    // The night, the hours the battery runs out in it, and Earth on the second day while the lander has power: every key is needed.
    const { container } = show(6, { dates: true, powered: power.powered });
    const keys = [...container.querySelectorAll<HTMLElement>('[data-part^="key"]')];
    expect(keys.map((k) => k.textContent)).toEqual(['Sun up', 'no Sun', 'lander off', 'Earth in view', 'radio contact']);
    // One group, not the line of words itself, so no key strays to the far side of a new line.
    const group = keys[0].parentElement!;
    for (const k of keys) expect(k.parentElement).toBe(group);
    expect(group.tagName).not.toBe('P');
    expect(group.classList.contains('flex-wrap')).toBe(true);
    expect(group.classList.contains('items-baseline')).toBe(true);
    // Five keys do not fit beside a long sentence even on a wide screen: on a line of their own they never
    // jump between the end of the words and the next line as the hour changes.
    expect(group.classList.contains('basis-full')).toBe(true);
    expect(group.classList.contains('sm:justify-end')).toBe(true);
    for (const k of keys) {
      // Every swatch in a box as tall as the Sun's, so the words of all five sit on one line; at 15 px in the second ink.
      expect(k.querySelector('[data-swatch]')!.classList.contains('h-2.5')).toBe(true);
      expect(k.querySelector('[data-swatch]')!.getAttribute('aria-hidden')).toBe('true');
      expect(k.classList.contains('text-[15px]')).toBe(true);
      expect(k.classList.contains('text-ink-2')).toBe(true);
    }
  });
});
