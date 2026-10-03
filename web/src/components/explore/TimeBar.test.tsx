// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '@/lib/engine/power';
import { PLOT_GRID } from './TimeChart';
import { momentRows, TimeBar } from './TimeBar';

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

/** The colours of the stand view's dark theme, where the bar carries the dates, from globals.css. */
const DARK: Record<string, string> = (() => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
  for (const [, selectors, body] of css.matchAll(/^([^\s@/{}][^{}]*)\{([^{}]*)\n\}/gm)) {
    if (!selectors.split(',').some((s) => s.trim() === '.theme-dark')) continue;
    return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  }
  throw new Error('no .theme-dark block in globals.css');
})();
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** The contrast of two colours, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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
/** How tall a band, the strip or their box is, in px, from its h-[…px] class or a Tailwind step of 4 px (h-1.5 is 6 px). */
const heightPx = (el: Element) => {
  const c = el.getAttribute('class') ?? '';
  const px = /(?:^| )h-\[(\d+)px\](?: |$)/.exec(c);
  const step = /(?:^| )h-(\d+(?:\.\d+)?)(?: |$)/.exec(c);
  return px ? Number(px[1]) : step ? Number(step[1]) * 4 : NaN;
};
/** The box the sunlight strip and the bands under it share. */
const stripBox = (container: HTMLElement) => container.querySelector('[data-part="track"] svg')!.parentElement!;
/**
 * The stand view's key moments over 30 days from START, in order of time: the Sun sets on the 3rd, the
 * battery runs out on the 4th, Earth comes into view on the 10th, and the Sun and the power come back on the 20th.
 */
const MOMENTS = [
  { label: 'Sunset 3 Jan', hour: 50 },
  { label: 'Battery runs out 4 Jan', hour: 76 },
  { label: 'Earth in view 10 Jan', hour: 216 },
  { label: 'Sun and power back 20 Jan', hour: 456 },
];
const flagsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[data-part="moment"]')];
/** The stem of each flag, in the order of the flags. */
const stemsOf = (container: HTMLElement) => flagsOf(container).map((f) => f.querySelector<HTMLElement>('[data-part="moment-stem"]')!);
/** Diagonal stripes of the radio band's green at 45°, with the ground between them clear. */
const HATCHED = /(?:^| )bg-\[repeating-linear-gradient\(45deg,var\(--good\)_[^\]\s]*transparent[^\]\s]*\)\](?: |$)/;
/** The radio band's stretches over a period of `hours`, as hours from the start, and whether each is hatched. */
const contactRunsOf = (container: HTMLElement, hours: number) =>
  [...container.querySelectorAll<HTMLElement>('[data-part="contact-run"]')].map((r) => {
    const from = Math.round((parseFloat(r.style.left) / 100) * hours);
    return { from, to: from + Math.round((parseFloat(r.style.width) / 100) * hours), hatched: r.hasAttribute('data-if-survives') };
  });

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
    // 4 px tall here, without the dates; with them every band is 6 px (below).
    expect(heightPx(band)).toBe(4);
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

  it("draws the hours Earth is in view as a band in Earth's colour under the lander-off band, both 6 px tall with the dates, and adds it to the key", () => {
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 200 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 465 ? 0 : 1));
    const { container } = showPeriod(30, { dates: true, powered }, { earthVisible });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="earth-run"]')];
    expect(runs).toHaveLength(1);
    // From hour 100 to hour 200 of the 720, as shares of the track.
    expect(parseFloat(runs[0].style.left) / 100).toBeCloseTo(100 / 720, 6);
    expect(parseFloat(runs[0].style.width) / 100).toBeCloseTo(100 / 720, 6);
    // Earth's colour, which the light page and the stand view's dark one both set; at least 6 px wide, as wide as
    // the band is tall, so one hour still shows as a dot; the off band's runs too.
    expect(runs[0].classList.contains('bg-earth')).toBe(true);
    expect(runs[0].classList.contains('min-w-1.5')).toBe(true);
    expect(container.querySelector('[data-part="off-run"]')!.classList.contains('min-w-1.5')).toBe(true);
    // In the box of the sunlight strip and across its whole width, so on the same hours.
    const band = container.querySelector<HTMLElement>('[data-part="earth"]')!;
    const box = stripBox(container);
    expect(band.parentElement).toBe(box);
    expect(band.classList.contains('inset-x-0')).toBe(true);
    expect(band.getAttribute('aria-hidden')).toBe('true');
    // 6 px tall like the off band, which starts 2 px under the strip; Earth's starts 2 px under it, so none of them touch.
    const off = container.querySelector<HTMLElement>('[data-part="off"]')!;
    const strip = container.querySelector('[data-part="track"] svg')!;
    expect(off.parentElement).toBe(box);
    expect(heightPx(off)).toBe(6);
    expect(heightPx(band)).toBe(6);
    expect(topPx(off)).toBe(topPx(strip) + heightPx(strip) + 2);
    expect(topPx(off)).toBe(25);
    expect(topPx(band)).toBe(topPx(off) + 6 + 2);
    // The box grows from 32 to 47 px to hold the bands, so the dates under it stay clear.
    expect(heightPx(box)).toBe(47);
    expect(topPx(band) + heightPx(band)).toBeLessThanOrEqual(heightPx(box));
    // The key names it after "lander off", in the order of the bands from the top, in the same blue.
    const key = container.querySelector<HTMLElement>('[data-part="key-earth"]')!;
    expect(key.textContent).toBe('Earth in view');
    expect(key.querySelector('[data-swatch]')!.classList.contains('bg-earth')).toBe(true);
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key-off"]'));
    // Each swatch is a line as thick as its band: a 10 px box with 2 px of clear edge above and below.
    for (const k of ['key-off', 'key-earth']) {
      const swatch = container.querySelector(`[data-part="${k}"] [data-swatch]`)!;
      for (const c of ['h-2.5', 'border-y-2', 'border-transparent', 'bg-clip-padding']) expect(swatch.classList.contains(c)).toBe(true);
    }
  });

  it("draws the hours with both power and Earth in view, when the lander can radio home, as a green band on a row of its own right under Earth’s, so the blue never seems to stop, and names it in the key", () => {
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 300 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 250 ? 0 : 1));
    const { container } = showPeriod(30, { dates: true, powered }, { earthVisible });
    const runs = [...container.querySelectorAll<HTMLElement>('[data-part="contact-run"]')];
    // Power is back at hour 250 while Earth is still in view, until hour 300.
    expect(runs).toHaveLength(1);
    expect(parseFloat(runs[0].style.left) / 100).toBeCloseTo(250 / 720, 6);
    expect(parseFloat(runs[0].style.width) / 100).toBeCloseTo(50 / 720, 6);
    expect(runs[0].classList.contains('bg-good')).toBe(true);
    expect(runs[0].classList.contains('min-w-1.5')).toBe(true);
    // Earth's blue runs on through those hours, whole from hour 100 to hour 300.
    const earthRuns = [...container.querySelectorAll<HTMLElement>('[data-part="earth-run"]')];
    expect(earthRuns.map((r) => [parseFloat(r.style.left) / 100, parseFloat(r.style.width) / 100])).toEqual([[expect.closeTo(100 / 720, 6), expect.closeTo(200 / 720, 6)]]);
    // 6 px tall, 2 px under Earth's band rather than over it, inside the strip's box and across its whole width.
    const band = container.querySelector<HTMLElement>('[data-part="contact"]')!;
    const earth = container.querySelector<HTMLElement>('[data-part="earth"]')!;
    const box = stripBox(container);
    expect(band.parentElement).toBe(box);
    expect(band.classList.contains('inset-x-0')).toBe(true);
    expect(heightPx(band)).toBe(6);
    expect(topPx(band)).toBe(topPx(earth) + heightPx(earth) + 2);
    expect(topPx(band) + heightPx(band)).toBeLessThanOrEqual(heightPx(box));
    const key = container.querySelector<HTMLElement>('[data-part="key-contact"]')!;
    expect(key.textContent).toBe('radio contact');
    // A line as thick as its band, like the other two.
    const swatch = key.querySelector('[data-swatch]')!;
    for (const c of ['bg-good', 'h-2.5', 'border-y-2', 'border-transparent', 'bg-clip-padding']) expect(swatch.classList.contains(c)).toBe(true);
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

  it('hatches the radio band from the hour the lander first needs to have lived through the night, in its green on a clear ground, and names it in the key', () => {
    // Earth is in view from the 10th to the 23rd; the battery runs out on the 4th and the power comes back on the
    // 20th, so the one stretch of radio contact, the 20th to the 23rd, comes only if the lander survives the night.
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 216 && h < 552 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 456 ? 0 : 1));
    const plain = showPeriod(30, { dates: true, powered }, { earthVisible });
    const offBefore = plain.container.querySelector('[data-part="off"]')!.outerHTML;
    plain.unmount();
    const { container } = showPeriod(30, { dates: true, powered, ifSurvivesFrom: 456 }, { earthVisible });
    expect(contactRunsOf(container, 720)).toEqual([{ from: 456, to: 552, hatched: true }]);
    const run = container.querySelector<HTMLElement>('[data-part="contact-run"]')!;
    // Stripes of the radio green with the ground clear between them, not the solid green.
    expect(run.className).toMatch(HATCHED);
    expect(run.classList.contains('bg-good')).toBe(false);
    // Still a stretch of the radio row, drawn like the others.
    for (const c of ['absolute', 'inset-y-0', 'min-w-1.5', 'rounded-full']) expect(run.classList.contains(c)).toBe(true);
    expect(run.parentElement).toBe(container.querySelector('[data-part="contact"]'));
    // The lander-off band does not change.
    expect(container.querySelector('[data-part="off"]')!.outerHTML).toBe(offBefore);
    // The key says it after "radio contact": a hatched line as thick as the band, then the words.
    const key = container.querySelector<HTMLElement>('[data-part="key-if-survives"]')!;
    expect(key.textContent).toBe('if it survives the night');
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key-contact"]'));
    expect(container.querySelector('[data-part="key-contact"]')!.textContent).toBe('radio contact');
    for (const c of ['flex', 'items-center', 'gap-2', 'text-[15px]', 'text-ink-2']) expect(key.classList.contains(c)).toBe(true);
    const swatch = key.querySelector('[data-swatch]')!;
    expect(swatch.className).toMatch(HATCHED);
    for (const c of ['block', 'h-2.5', 'w-6', 'rounded-full', 'border-y-2', 'border-transparent', 'bg-clip-padding']) expect(swatch.classList.contains(c)).toBe(true);
    expect(swatch.classList.contains('bg-good')).toBe(false);
    expect(swatch.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the radio contact before that hour solid, splits a stretch that runs across it, and draws as before when no contact lies after it', () => {
    // Radio contact from hour 100 to 150 and from 200 to 300: the lander is off in between.
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 100 && h < 300 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 150 && h < 200 ? 0 : 1));
    const split = showPeriod(30, { dates: true, powered, ifSurvivesFrom: 250 }, { earthVisible });
    expect(contactRunsOf(split.container, 720)).toEqual([
      { from: 100, to: 150, hatched: false },
      { from: 200, to: 250, hatched: false },
      { from: 250, to: 300, hatched: true },
    ]);
    for (const r of split.container.querySelectorAll('[data-part="contact-run"]:not([data-if-survives])')) expect(r.classList.contains('bg-good')).toBe(true);
    expect(split.container.querySelector('[data-part="key-if-survives"]')).not.toBeNull();
    split.unmount();
    const before = showPeriod(30, { dates: true, powered }, { earthVisible }).container.innerHTML;
    cleanup();
    // No contact from hour 300 on: nothing to hatch and nothing to add to the key.
    const after = showPeriod(30, { dates: true, powered, ifSurvivesFrom: 300 }, { earthVisible });
    expect(after.container.querySelector('[data-if-survives]')).toBeNull();
    expect(after.container.querySelector('[data-part="key-if-survives"]')).toBeNull();
    expect(screen.queryByText('if it survives the night')).toBeNull();
    expect(after.container.innerHTML).toBe(before);
    after.unmount();
    // Without the hour, all is as before.
    expect(showPeriod(30, { dates: true, powered, ifSurvivesFrom: null }, { earthVisible }).container.innerHTML).toBe(before);
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
    expect(topPx(container.querySelector('[data-part="earth"]')!)).toBe(33);
    unmount();
    const none = showPeriod(30, { dates: true });
    expect(none.container.querySelector('[data-part="earth"]')).toBeNull();
    expect(none.container.querySelector('[data-part="earth-run"]')).toBeNull();
    expect(none.container.querySelector('[data-part="key-earth"]')).toBeNull();
    expect(screen.queryByText('Earth in view')).toBeNull();
    // The box keeps the height it has with the dates, so the bar does not change height from one site to another.
    expect(heightPx(stripBox(none.container))).toBe(47);
  });

  it("names the strip's grey, the hours without the Sun, right after the Sun's yellow when the dates are shown", () => {
    // The night of the second day leaves the strip grey there.
    const { container } = show(6, { dates: true });
    const key = container.querySelector<HTMLElement>('[data-part="key-no-sun"]')!;
    expect(key.textContent).toBe('no Sun');
    // The swatch is the strip's own grey: its background, where no yellow is drawn.
    expect(container.querySelector('[data-part="track"] svg')!.classList.contains('bg-surface-2')).toBe(true);
    expect(key.querySelector('[data-swatch]')!.classList.contains('bg-surface-2')).toBe(true);
    // On the stand view's dark bar that grey is all but the bar's own, so the swatch has a 1 px edge light enough
    // to see there: at least 3 to 1 against the bar, where the edge it had (the strong line) gave 2.4.
    const swatch = key.querySelector('[data-swatch]')!;
    expect(contrast(DARK['--surface-2'], DARK['--page'])).toBeLessThan(1.5);
    expect(swatch.classList.contains('border')).toBe(true);
    expect(swatch.classList.contains('border-ink-3')).toBe(true);
    expect(swatch.classList.contains('border-line-strong')).toBe(false);
    expect(contrast(DARK['--ink-3'], DARK['--page'])).toBeGreaterThanOrEqual(3);
    expect(contrast(DARK['--ink-3'], DARK['--surface-2'])).toBeGreaterThanOrEqual(3);
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

  it('slims the bar when compact on a medium screen and up: the keys join the line of the date and hour, at its right end, and stay under the date on a phone', () => {
    const { container } = show(6, { dates: true, powered: power.powered, compact: true, clockNote: ' (Earth time)' });
    const group = container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect([...group.children].map((k) => k.textContent)).toEqual(['Sun up', 'no Sun', 'lander off', 'Earth in view', 'radio contact']);
    // In the date's own line of words, after the date and its note.
    expect(group.parentElement).toBe(screen.getByTestId('when').closest('p'));
    expect(group.previousElementSibling).toBe(screen.getByTestId('clock-note').parentElement);
    // On a phone a line of their own under the date, as before; from md up as wide as they are, so they sit beside
    // the date when they fit (else on the next line, at the right all the same), pushed to the right end.
    for (const c of ['basis-full', 'md:basis-auto', 'md:ml-auto', 'sm:justify-end', 'flex-wrap', 'items-baseline']) expect(group.classList.contains(c)).toBe(true);
    cleanup();
    // Without compact they keep a line of their own at every width.
    const plain = show(6, { dates: true, powered: power.powered });
    const own = plain.container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect(own.classList.contains('basis-full')).toBe(true);
    expect(own.className).not.toMatch(/(^| )md:/);
  });

  it('keeps the bar low when compact: no sentence beside the date at any width, as the page says it in its own words, and smaller keys on a phone', () => {
    const { container } = show(6, { dates: true, powered: power.powered, compact: true });
    expect(screen.queryByTestId('status')).toBeNull();
    expect(screen.queryByText('Sun up, Earth behind the hills, battery 100 %')).toBeNull();
    expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
    // The slider still reads the hour in words.
    expect(screen.getByRole('slider', { name: 'Time' }).getAttribute('aria-valuetext')).toBe('1 Jan 2027, 06:00 UTC: Sun up, Earth behind the hills, battery 100 %');
    const group = container.querySelector('[data-part="key-off"]')!.parentElement!;
    expect(group.className).toContain('max-sm:[&>span]:text-[13px]');
    cleanup();
    // Without compact the sentence shows at every width.
    show(6, { dates: true });
    expect(screen.getByTestId('status').textContent).toBe('Sun up, Earth behind the hills, battery 100 %');
    expect(screen.getByTestId('status').className).not.toMatch(/hidden/);
  });

  it('writes a note after the date and hour on a wide screen only, in the second ink, on the same line', () => {
    show(0, { dates: true, powered: power.powered, compact: true, clockNote: ' (Earth time)' });
    const when = screen.getByTestId('when');
    expect(when.textContent).toBe('1 Jan 2027, 00:00 UTC');
    const note = screen.getByTestId('clock-note');
    expect(note.textContent).toBe(' (Earth time)');
    // Right after the date and hour and held to them, so a wide screen reads "1 Jan 2027, 00:00 UTC (Earth time)".
    const pair = note.parentElement!;
    expect(note.previousElementSibling).toBe(when);
    expect(pair.textContent).toBe('1 Jan 2027, 00:00 UTC (Earth time)');
    expect(pair.classList.contains('md:whitespace-nowrap')).toBe(true);
    expect(pair.parentElement!.tagName).toBe('P');
    // In the second ink at the size of the bar's other words, not the date's bold; not on a phone, where there is no room.
    for (const c of ['text-ink-2', 'text-[15px]', 'max-md:hidden']) expect(note.classList.contains(c)).toBe(true);
    expect(note.className).not.toMatch(/font-/);
    cleanup();
    // Without a note the date and hour stand in the line of words as before.
    show(0, { dates: true, powered: power.powered, compact: true });
    expect(screen.getByTestId('when').parentElement!.tagName).toBe('P');
    expect(screen.queryByTestId('clock-note')).toBeNull();
  });

  it('keeps only Play, the date and hour, and the track with its sunlight and handle when bare, for a clean view of the picture', () => {
    // The stand view's bar with every part it can carry: the night, the hours the lander is off, Earth on the second day, a moment.
    for (const compact of [true, false]) {
      const { container } = show(6, { dates: true, powered: power.powered, compact, moments: [{ label: 'Sunset 2 Jan', hour: 24 }], onMoment: vi.fn(), ifSurvivesFrom: 30, clockNote: ' (Earth time)', bare: true });
      expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
      expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
      expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
      // Play is the one button: no flags.
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Play']);
      // No sentence, no keys, no bands, no flags and no dates.
      expect(screen.queryByTestId('status')).toBeNull();
      expect(container.querySelector('[data-part^="key"]')).toBeNull();
      expect(container.querySelector('[data-swatch]')).toBeNull();
      for (const part of ['off', 'earth', 'contact', 'moments', 'moment', 'moment-tick']) expect(container.querySelector(`[data-part="${part}"]`)).toBeNull();
      expect(screen.queryByTestId('dates')).toBeNull();
      expect(container.querySelector('[data-date]')).toBeNull();
      // The date and hour are all the bar writes.
      expect(screen.getByRole('region', { name: 'Time' }).textContent).toBe('Play1 Jan 2027, 06:00 UTC');
      // With no band under the strip its box keeps only the slider's own room, so the bar stays as low as it can.
      expect(stripBox(container).getAttribute('class')).toBe('relative h-8');
      cleanup();
    }
  });

  it('still plays, and moves with the slider and its keys, when bare', () => {
    vi.useFakeTimers();
    const { onCursor } = show(10, { dates: true, powered: power.powered, compact: true, bare: true });
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement;
    // The slider still reads the hour in words, though the bar writes none of them.
    expect(slider.getAttribute('aria-valuetext')).toBe('1 Jan 2027, 10:00 UTC: Sun up, Earth behind the hills, battery 100 %');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(onCursor).toHaveBeenLastCalledWith(30);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(34);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(90);
    });
    expect(onCursor).toHaveBeenLastCalledWith(11);
  });

  it("puts a flag above the track at each of the period's key moments, at the share of the track its hour gives", () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS });
    const flags = flagsOf(container);
    expect(flags.map((f) => f.textContent)).toEqual(MOMENTS.map((m) => m.label));
    // Buttons, each named by its moment.
    for (const m of MOMENTS) expect(screen.getByRole('button', { name: m.label }).getAttribute('data-part')).toBe('moment');
    for (const f of flags) expect(f.type).toBe('button');
    // Hours 50, 76, 216 and 456 of the 720, as shares of the track, like the sunlight and the bands under it.
    flags.forEach((f, k) => expect(parseFloat(f.style.left) / 100).toBeCloseTo(MOMENTS[k].hour / 720, 6));
    // In the track's own column, right above the strip, so the flags line up with the hours.
    const row = container.querySelector<HTMLElement>('[data-part="moments"]')!;
    expect(row.parentElement).toBe(screen.getByRole('slider', { name: 'Time' }).closest('[data-part="track"]'));
    expect(row.nextElementSibling).toBe(stripBox(container));
    // Each starts at its hour, where its stem comes down on its left edge; all four have room to the right.
    for (const f of flags) expect(f.style.transform).toBe('');
    for (const s of stemsOf(container)) expect(s.classList.contains('-left-px')).toBe(true);
    // Small words in the ink on the panel colour, inside a thin rounded edge, on one line 20 px tall.
    for (const f of flags) {
      for (const c of ['text-[13px]', 'text-ink', 'bg-surface', 'border', 'border-ink-3', 'rounded', 'h-5', 'items-center', 'whitespace-nowrap']) {
        expect(f.classList.contains(c)).toBe(true);
      }
    }
    // No marks for the hours apart from the flags': each flag's stem is its tick.
    expect(container.querySelector('[data-part="moment-tick"]')).toBeNull();
  });

  it('makes each flag read as a button: a pointer, a clear edge, and a lighter fill with a brighter edge under the pointer or the keyboard, which also draws the page’s 2 px ring', () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS, cursor: 216 });
    const flags = flagsOf(container);
    const [chosen] = flags.splice(2, 1);
    for (const f of [...flags, chosen]) {
      for (const c of ['cursor-pointer', 'hover:bg-line', 'focus-visible:bg-line', 'hover:z-10', 'focus-visible:z-10']) expect(f.classList.contains(c)).toBe(true);
      // Nothing takes the keyboard's ring away.
      expect(f.className).not.toMatch(/outline-(none|hidden|0)\b/);
    }
    for (const f of flags) for (const c of ['border-ink-3', 'bg-surface', 'hover:border-ink', 'focus-visible:border-ink']) expect(f.classList.contains(c)).toBe(true);
    // The chosen flag keeps its marks, and its gold brightens in turn.
    expect(chosen.getAttribute('aria-current')).toBe('true');
    for (const c of ['border-sun', 'bg-surface-2', 'hover:border-sun-hover', 'focus-visible:border-sun-hover']) expect(chosen.classList.contains(c)).toBe(true);
    expect(chosen.className).not.toMatch(/(^| )(hover:|focus-visible:)?border-ink(-3)?( |$)/);
    // On the stand view's dark bar: an edge at rest that stands out from the bar and the flag's own ground (the
    // strong line it had gave 2.4 to 1), and under the pointer a fill lighter than both grounds and a brighter edge.
    for (const ground of ['--page', '--surface']) expect(contrast(DARK['--ink-3'], DARK[ground])).toBeGreaterThanOrEqual(3);
    expect(contrast(DARK['--line-strong'], DARK['--page'])).toBeLessThan(3);
    expect(luminance(DARK['--line'])).toBeGreaterThan(luminance(DARK['--surface-2']));
    expect(luminance(DARK['--surface-2'])).toBeGreaterThan(luminance(DARK['--surface']));
    expect(luminance(DARK['--ink'])).toBeGreaterThan(luminance(DARK['--ink-3']));
    expect(luminance(DARK['--sun-hover'])).toBeGreaterThan(luminance(DARK['--sun']));
    // The keyboard's ring is the page's own, 2 px of gold 2 px out (globals.css), on any flag that comes to the front.
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/\n:focus-visible \{\s*outline: 2px solid var\(--sun-ink\);\s*outline-offset: 2px;\s*\}/);
  });

  it('runs a 1 px stem in each flag’s own edge colour from the flag down to its hour on the strip', () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS, cursor: 216 });
    const flags = flagsOf(container);
    const stems = stemsOf(container);
    flags.forEach((f, k) => {
      // One stem, inside the flag: its colour is the flag's edge whatever that is (at rest, under the pointer,
      // chosen), and it takes no taps from the slider under it.
      expect(f.querySelectorAll('[data-part="moment-stem"]')).toHaveLength(1);
      const s = stems[k];
      for (const c of ['absolute', 'w-0', 'border-l', 'border-inherit', 'top-full', 'pointer-events-none', '-left-px']) expect(s.classList.contains(c)).toBe(true);
      expect(s.getAttribute('aria-hidden')).toBe('true');
      // From 1 px up into the flag's bottom edge, past the 2 px under a flag of the first row (24 px under one of
      // the second), to the strip 9 px down the box under the flags.
      expect(heightPx(s)).toBe(f.dataset.row === '1' ? 1 + 24 + 9 : 1 + 2 + 9);
    });
    expect(topPx(container.querySelector('[data-part="track"] svg')!)).toBe(9);
    // The words stay the flag's name: the stem adds none.
    expect(flags.map((f) => f.textContent)).toEqual(MOMENTS.map((m) => m.label));
  });

  it('draws no flags without the dates or without moments: Explore stays exactly as it was', () => {
    const before = show(6).container.innerHTML;
    cleanup();
    const explore = show(6, { moments: MOMENTS, onMoment: vi.fn() });
    expect(explore.container.querySelector('[data-part="moment"]')).toBeNull();
    expect(explore.container.innerHTML).toBe(before);
    cleanup();
    const plain = showPeriod(30, { dates: true }).container.innerHTML;
    cleanup();
    const empty = showPeriod(30, { dates: true, moments: [] });
    expect(empty.container.querySelector('[data-part="moments"]')).toBeNull();
    expect(empty.container.innerHTML).toBe(plain);
    cleanup();
    // Without the dates there is no radio band to hatch.
    const off = show(6, { powered: power.powered }).container.innerHTML;
    cleanup();
    expect(show(6, { powered: power.powered, ifSurvivesFrom: 30 }).container.innerHTML).toBe(off);
  });

  it("moves the handle to a flag's hour on a click, then tells the page which moment it was", () => {
    const onCursor = vi.fn();
    const onMoment = vi.fn();
    showPeriod(30, { dates: true, moments: MOMENTS, onCursor, onMoment });
    fireEvent.click(screen.getByRole('button', { name: 'Earth in view 10 Jan' }));
    expect(onCursor).toHaveBeenCalledTimes(1);
    expect(onCursor).toHaveBeenCalledWith(216);
    expect(onMoment).toHaveBeenCalledTimes(1);
    expect(onMoment.mock.calls[0][0]).toBe(MOMENTS[2]);
    // The handle first, then the page.
    expect(onCursor.mock.invocationCallOrder[0]).toBeLessThan(onMoment.mock.invocationCallOrder[0]);
    cleanup();
    // Without onMoment a flag still moves the handle.
    const alone = vi.fn();
    showPeriod(30, { dates: true, moments: MOMENTS, onCursor: alone });
    fireEvent.click(screen.getByRole('button', { name: 'Sunset 3 Jan' }));
    expect(alone).toHaveBeenCalledWith(50);
  });

  it('shows the flag of the moment the handle is on as chosen: the current one, with a gold edge on a lighter ground', () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS, cursor: 216 });
    const flags = flagsOf(container);
    // "Earth in view 10 Jan", at hour 216, and no other.
    expect(flags.map((f) => f.getAttribute('aria-current'))).toEqual([null, null, 'true', null]);
    const [chosen] = flags.splice(2, 1);
    // The Sun's gold for its edge, which both themes set, on a ground lighter than the others'.
    expect(chosen.classList.contains('border-sun')).toBe(true);
    expect(chosen.classList.contains('bg-surface-2')).toBe(true);
    expect(chosen.classList.contains('border-ink-3')).toBe(false);
    expect(chosen.classList.contains('bg-surface')).toBe(false);
    for (const f of flags) {
      expect(f.classList.contains('border-ink-3')).toBe(true);
      expect(f.classList.contains('bg-surface')).toBe(true);
      expect(f.classList.contains('border-sun')).toBe(false);
    }
    cleanup();
    // Between two moments none is chosen.
    const between = showPeriod(30, { dates: true, moments: MOMENTS, cursor: 100 });
    for (const f of flagsOf(between.container)) {
      expect(f.hasAttribute('aria-current')).toBe(false);
      expect(f.classList.contains('border-sun')).toBe(false);
    }
    cleanup();
    // On a phone when compact, where each flag is a dot, the chosen one's dot is gold and the others' ink.
    const phone = showPeriod(30, { dates: true, moments: MOMENTS, compact: true, cursor: 216 });
    const dots = flagsOf(phone.container).map((f) => f.querySelector('[data-part="moment-dot"]')!);
    expect(dots.map((d) => (d.classList.contains('bg-sun') ? 'gold' : d.classList.contains('bg-ink') ? 'ink' : null))).toEqual(['ink', 'ink', 'gold', 'ink']);
    expect(flagsOf(phone.container)[2].getAttribute('aria-current')).toBe('true');
  });

  it('puts one of two flags that would meet in a second row, choosing the one whose stem then comes down in sight', () => {
    // On the 1000 px a track has without a layout (jsdom), "Battery runs out 4 Jan" starts on the words of "Sunset 3 Jan":
    // lifted, its stem would come down behind them, so "Sunset 3 Jan" goes up instead, its stem just left of the other.
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS });
    const flags = flagsOf(container);
    expect(flags.map((f) => f.dataset.row)).toEqual(['1', '0', '0', '0']);
    // Two rows of 22 px, each flag 20 px tall with 2 px under it; the first row right above the strip.
    expect(container.querySelector('[data-part="moments"]')!.classList.contains('h-[44px]')).toBe(true);
    expect(flags[0].classList.contains('bottom-[24px]')).toBe(true);
    expect(flags[1].classList.contains('bottom-[2px]')).toBe(true);
    // Every stem reaches the strip: 12 px from the first row, 22 px more from the second.
    expect(stemsOf(container).map(heightPx)).toEqual([34, 12, 12, 12]);
    // The upper flag's stem, at hour 50, comes down left of the lower flag, which starts at hour 76.
    expect(parseFloat(flags[0].style.left)).toBeLessThan(parseFloat(flags[1].style.left));
    cleanup();
    // Moments far apart keep to one row.
    const one = showPeriod(30, { dates: true, moments: [MOMENTS[0], MOMENTS[2], MOMENTS[3]] });
    expect(flagsOf(one.container).map((f) => f.dataset.row)).toEqual(['0', '0', '0']);
    expect(one.container.querySelector('[data-part="moments"]')!.classList.contains('h-[22px]')).toBe(true);
  });

  it('ends a flag at its hour when its words would run past the right end of the track, the stem on its right edge', () => {
    const moments = [
      { label: 'Earth in view 21 Jan', hour: 480 },
      { label: 'Sun back 30 Jan', hour: 719 },
    ];
    const { container } = showPeriod(30, { dates: true, moments });
    const [earth, sun] = flagsOf(container);
    const [earthStem, sunStem] = stemsOf(container);
    expect(earth.style.transform).toBe('');
    expect(sun.style.transform).toBe('translateX(-100%)');
    expect(parseFloat(sun.style.left) / 100).toBeCloseTo(719 / 720, 6);
    // The stem stays on the hour: on the flag's right edge rather than its left.
    expect(sunStem.classList.contains('-right-px')).toBe(true);
    expect(sunStem.classList.contains('-left-px')).toBe(false);
    expect(earthStem.classList.contains('-left-px')).toBe(true);
    expect(earthStem.classList.contains('-right-px')).toBe(false);
    // The corner over the stem is square, so the stem runs on from the flag's edge.
    expect(earth.classList.contains('rounded-bl-none')).toBe(true);
    expect(sun.classList.contains('rounded-br-none')).toBe(true);
  });

  it('measures the track, so on a narrow one a flag near the right end ends at its hour', () => {
    let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
    class FakeObserver {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const { container } = showPeriod(30, { dates: true, moments: [{ label: 'Earth in view 26 Jan', hour: 600 }] });
    // Until measured, 1000 px: hour 600 of the 720 leaves 167 px, room for the 158 px of its words.
    expect(flagsOf(container)[0].style.transform).toBe('');
    act(() => report!([{ contentRect: { width: 600 } }]));
    // On 600 px it leaves 100 px: the flag ends at its hour.
    expect(flagsOf(container)[0].style.transform).toBe('translateX(-100%)');
  });

  it('on a phone when compact, Play shows its word beside its sign, at one width for Play and Pause, and the bar takes the whole width for it', () => {
    vi.useFakeTimers();
    const { container } = show(0, { dates: true, powered: power.powered, compact: true });
    const play = screen.getByRole('button', { name: 'Play' });
    const word = play.querySelector('span')!;
    expect(word.textContent).toBe('Play');
    expect(word.className).not.toMatch(/sr-only/);
    // Still the plain 48 px button, a little tighter at the sides on a phone, and wide enough for "Pause" too, so the
    // date beside it does not move when it is pressed.
    expect(play.classList.contains('btn')).toBe(true);
    for (const c of ['max-sm:px-3', 'max-sm:gap-2']) expect(play.classList.contains(c)).toBe(true);
    expect(play.className).toMatch(/(^| )max-sm:min-w-\[\d+px\]( |$)/);
    fireEvent.click(play);
    const pause = screen.getByRole('button', { name: 'Pause' });
    expect(pause.querySelector('span')!.textContent).toBe('Pause');
    expect(pause.querySelector('span')!.className).not.toMatch(/sr-only/);
    expect(pause.className).toBe(play.className);
    // No chart above the stand view's bar to line the track up with: on a phone the bar drops the chart panel's
    // inset and keeps the room for the word.
    const grid = container.querySelector('[data-part="bar-grid"]')!;
    expect(grid.classList.contains('px-[25px]')).toBe(true);
    expect(grid.classList.contains('max-sm:px-0')).toBe(true);
    cleanup();
    // Without compact, as before: the sign alone on a phone, and the inset kept.
    const plain = show(0, { dates: true });
    expect(screen.getByRole('button', { name: 'Play' }).querySelector('span')!.className).toMatch(/max-sm:sr-only/);
    expect(screen.getByRole('button', { name: 'Play' }).className).not.toMatch(/max-sm:(min-w|px|gap)/);
    expect(plain.container.querySelector('[data-part="bar-grid"]')!.className).not.toMatch(/max-sm:px-0/);
  });

  it('on a phone when compact, the chosen dot shows its words in a chip just above it, kept inside the track', () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS, compact: true, cursor: 456 });
    const chips = [...container.querySelectorAll<HTMLElement>('[data-part="moment-chip"]')];
    expect(chips).toHaveLength(1);
    const [chip] = chips;
    expect(chip.textContent).toBe('Sun and power back 20 Jan');
    // Only on a phone, where the flags are dots; elsewhere the chosen flag shows its words itself.
    expect(chip.classList.contains('hidden')).toBe(true);
    expect(chip.classList.contains('max-sm:flex')).toBe(true);
    // In the row of the flags, its foot on the row's foot: the dot's top is 1 px under it (the dot, 8 px, rests on
    // the strip, 9 px down the box under the row).
    expect(chip.parentElement).toBe(container.querySelector('[data-part="moments"]'));
    expect(chip.classList.contains('bottom-0')).toBe(true);
    // At its hour's share of the track, drawn back by the same share of its own width: at the start of the track it
    // starts there, at the end it ends there, and its dot is always under it.
    expect(parseFloat(chip.style.left)).toBeCloseTo((456 / 720) * 100, 6);
    expect(chip.style.transform).toBe(`translateX(-${(456 / 720) * 100}%)`);
    // Words at 14 px in the ink, on the chosen flag's ground inside its gold edge, on one line.
    for (const c of ['text-[14px]', 'text-ink', 'bg-surface-2', 'border', 'border-sun', 'rounded', 'whitespace-nowrap']) expect(chip.classList.contains(c)).toBe(true);
    // A label, not a second button: a tap goes through it, and the dot's own button already carries the words.
    expect(chip.classList.contains('pointer-events-none')).toBe(true);
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    // At the first hour, at the very start of the track.
    const start = showPeriod(30, { dates: true, moments: [{ label: 'Sunrise 1 Jan', hour: 0 }, ...MOMENTS], compact: true, cursor: 0 });
    const first = start.container.querySelector<HTMLElement>('[data-part="moment-chip"]')!;
    expect(first.textContent).toBe('Sunrise 1 Jan');
    expect(parseFloat(first.style.left)).toBe(0);
    cleanup();
    // None while the time is between moments, and none without compact.
    expect(showPeriod(30, { dates: true, moments: MOMENTS, compact: true, cursor: 100 }).container.querySelector('[data-part="moment-chip"]')).toBeNull();
    cleanup();
    expect(showPeriod(30, { dates: true, moments: MOMENTS, cursor: 456 }).container.querySelector('[data-part="moment-chip"]')).toBeNull();
  });

  it('on a phone when compact, makes each flag a dot on the top edge of the strip, named for screen readers and big enough to tap', () => {
    const { container } = showPeriod(30, { dates: true, moments: MOMENTS, compact: true });
    // The bar stays low: the flags take 11 px over the strip there, the room a finger needs above the dots.
    expect(container.querySelector('[data-part="moments"]')!.classList.contains('max-sm:h-[11px]')).toBe(true);
    flagsOf(container).forEach((f, k) => {
      expect(f.getAttribute('aria-label')).toBe(MOMENTS[k].label);
      expect(screen.getByRole('button', { name: MOMENTS[k].label })).toBe(f);
      // The words stay, for screen readers only.
      const words = f.querySelector('span')!;
      expect(words.textContent).toBe(MOMENTS[k].label);
      expect(words.classList.contains('max-sm:sr-only')).toBe(true);
      // An 8 px round dot, on a phone only.
      const dot = f.querySelector<HTMLElement>('[data-part="moment-dot"]')!;
      for (const c of ['size-2', 'rounded-full', 'hidden', 'max-sm:block']) expect(dot.classList.contains(c)).toBe(true);
      expect(dot.getAttribute('aria-hidden')).toBe('true');
      // A target 24 px square, without the flag's edge or panel colour.
      for (const c of ['max-sm:size-6', 'max-sm:border-0', 'max-sm:bg-transparent']) expect(f.classList.contains(c)).toBe(true);
    });
    // No stems there: the dot sits on the strip itself.
    for (const s of stemsOf(container)) expect(s.classList.contains('max-sm:hidden')).toBe(true);
    cleanup();
    // Without compact the flags keep their words at every width.
    const wide = showPeriod(30, { dates: true, moments: MOMENTS });
    for (const f of flagsOf(wide.container)) {
      expect(f.querySelector('[data-part="moment-dot"]')).toBeNull();
      expect(f.outerHTML).not.toMatch(/max-sm:/);
    }
    expect(wide.container.querySelector('[data-part="moments"]')!.className).not.toMatch(/max-sm:/);
  });
});

describe('momentRows', () => {
  it('keeps moments far apart in the first row', () => {
    expect(momentRows([MOMENTS[0], MOMENTS[2], MOMENTS[3]], 720, 1000)).toEqual([0, 0, 0]);
  });

  it('lifts the first of two moments a day apart on a 30-day track 1000 px wide, as the second one’s stem would come down behind it: 33 px apart, and "Sunset 3 Jan" is about 100 px wide', () => {
    // "Battery runs out 4 Jan" starts at 100 px, on the words of "Sunset 3 Jan" (67 to 167 px); "Sunset 3 Jan", lifted,
    // brings its stem down at 67 px, clear of the other.
    expect(
      momentRows(
        [
          { label: 'Sunset 3 Jan', hour: 48 },
          { label: 'Battery runs out 4 Jan', hour: 72 },
        ],
        720,
        1000,
      ),
    ).toEqual([1, 0]);
  });

  it('puts a third close one in the second row all the same when the first row’s flag cannot go up, and goes back to the first row once that is clear', () => {
    // "Earth in view 5 Jan" starts on "Battery runs out 4 Jan", which cannot go up: it would meet "Sunset 3 Jan" there.
    expect(
      momentRows(
        [
          { label: 'Sunset 3 Jan', hour: 48 },
          { label: 'Battery runs out 4 Jan', hour: 72 },
          { label: 'Earth in view 5 Jan', hour: 96 },
          { label: 'Power back 9 Jan', hour: 200 },
        ],
        720,
        1000,
      ),
    ).toEqual([1, 0, 1, 0]);
  });

  it('keeps a flag in the first row, over the end of the one before it, when going up would cover more of the words there', () => {
    // On a 538 px track (a 768 px screen), "Sun and power back, 20 Jan" ends at its hour, 341 px, so it runs back to
    // 140 px: up, it would cover all of "Earth in view, 10 Jan" (161 to 327 px); down, the last 97 px of
    // "Battery runs out, 4 Jan" (57 to 236 px). Four flags this long cannot all stay clear in two rows.
    const stand = [
      { label: 'Sunset, 3 Jan', hour: 50 },
      { label: 'Battery runs out, 4 Jan', hour: 76 },
      { label: 'Earth in view, 10 Jan', hour: 216 },
      { label: 'Sun and power back, 20 Jan', hour: 456 },
    ];
    expect(momentRows(stand, 720, 538)).toEqual([1, 0, 1, 0]);
    // With room for all four, the first goes up so the second's stem stays in sight, and the rest keep to the first row.
    expect(momentRows(stand, 720, 1050)).toEqual([1, 0, 0, 0]);
  });

  it('lifts the later of two all the same when each would come down behind the other: a flag ending at its hour reaches back over the one before', () => {
    // "Earth in view 25 Jan" runs from 800 to 958 px; "Sun and power back, 29 Jan" ends at its hour, 950 px, so it runs
    // back to 749 px, over the other's stem, and its own stem at 950 px is on the other's words.
    expect(
      momentRows(
        [
          { label: 'Earth in view 25 Jan', hour: 576 },
          { label: 'Sun and power back, 29 Jan', hour: 684 },
        ],
        720,
        1000,
      ),
    ).toEqual([0, 1]);
  });

  it('takes a flag at the very end as ending at its hour: it reaches back over one just before it, and clears one further back', () => {
    // Run to the right, "Sun back 30 Jan" at the last hour would start at 999 px, past the end of "Earth in view 26 Jan" at 991 px.
    // Ending at its hour it starts at 877 px, on those words, so one of the two goes up: itself, as its stem, on its
    // right edge at 999 px, comes down past the end of the other.
    expect(
      momentRows(
        [
          { label: 'Earth in view 26 Jan', hour: 600 },
          { label: 'Sun back 30 Jan', hour: 719 },
        ],
        720,
        1000,
      ),
    ).toEqual([0, 1]);
    // "Earth in view 21 Jan" ends at 825 px: the two share the first row.
    expect(
      momentRows(
        [
          { label: 'Earth in view 21 Jan', hour: 480 },
          { label: 'Sun back 30 Jan', hour: 719 },
        ],
        720,
        1000,
      ),
    ).toEqual([0, 0]);
  });

  it('has no rows for no moments', () => {
    expect(momentRows([], 720, 1000)).toEqual([]);
  });
});
