// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '@/lib/engine/power';
import { PLOT_GRID } from './TimeChart';
import { dotShifts, PLAY_HPS, SPEEDS, TimeBar } from './TimeBar';

// jsdom has no PointerEvent; this one carries the pointer's id and its kind (mouse, touch or pen) on top of the mouse
// event's position.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

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
/** A little over one of Play's steps, which come twelve a second. */
const STEP = 84;

/** The colours of the stand view's dark theme, where the bar carries the dates, from globals.css (its block sits in `@media screen`). */
const DARK: Record<string, string> = (() => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
  for (const [, selectors, body] of css.matchAll(/^[ \t]*([^\s@/{}*][^{}]*)\{([^{}]*)\n[ \t]*\}/gm)) {
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

type Props = Parameters<typeof TimeBar>[0];

function show(cursor: number, extra: Partial<Props> = {}) {
  const onCursor = vi.fn();
  const view = render(<TimeBar series={series} power={power} startUtc={START} cursor={cursor} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} {...extra} />);
  return { onCursor, ...view };
}

/**
 * A period of `days` days from START under a steady Sun with Earth out of view, for the dates and the bands under
 * the sunlight; `over` swaps in other hours of the Sun or of Earth.
 */
function steady(days: number, over: Partial<Series> = {}): Series {
  const hours = days * 24;
  return {
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
}
function showPeriod(days: number, extra: Partial<Props> = {}, over: Partial<Series> = {}) {
  return render(<TimeBar series={steady(days, over)} power={null} startUtc={START} cursor={0} hoverHour={null} batteryWh={0} onCursor={vi.fn()} {...extra} />);
}

/**
 * The bar on a page that keeps the hour, as the pages do: each hour the bar asks for (Play's steps, the slider, a
 * dot) comes back to it as its hour. `onCursor` records the hours asked for.
 */
function playPage(s: Series, start: number, extra: Partial<Props> = {}) {
  const onCursor = vi.fn();
  function Page() {
    const [hour, setHour] = useState(start);
    return (
      <TimeBar
        series={s}
        power={null}
        startUtc={START}
        hoverHour={null}
        batteryWh={0}
        {...extra}
        cursor={hour}
        onCursor={(h) => {
          onCursor(h);
          setHour(h);
        }}
      />
    );
  }
  return { onCursor, ...render(<Page />) };
}
/** The hours the bar has asked the page for, in order. */
const asked = (onCursor: Mock) => onCursor.mock.calls.map(([h]) => h as number);

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
/** The buttons of the moments' dots, in order of time. */
const dotsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[data-part="moment"]')];
/** Diagonal stripes of the radio band's green at 45°, with the ground between them clear. */
const HATCHED = /(?:^| )bg-\[repeating-linear-gradient\(45deg,var\(--good\)_[^\]\s]*transparent[^\]\s]*\)\](?: |$)/;
/** The radio band's stretches over a period of `hours`, as hours from the start, and whether each is hatched. */
const contactRunsOf = (container: HTMLElement, hours: number) =>
  [...container.querySelectorAll<HTMLElement>('[data-part="contact-run"]')].map((r) => {
    const from = Math.round((parseFloat(r.style.left) / 100) * hours);
    return { from, to: from + Math.round((parseFloat(r.style.width) / 100) * hours), hatched: r.hasAttribute('data-if-survives') };
  });
/** A key entry's words as a wide screen shows them (the hatched entry has a shorter copy for a phone, 18.3). */
const wordsOf = (k: Element) => k.querySelector('[data-wide]')?.textContent ?? k.textContent;
/** The words of the key's entries, in order. */
const keyWords = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-part^="key"]')].map(wordsOf);
/**
 * A length in px from a class such as `h-[27px]` or `h-10` (a Tailwind step of 4 px): `prop` is the utility (h, w,
 * size), `prefix` the variant before it ('' for none, 'max-sm:' on a phone).
 */
const classPx = (el: Element, prop: string, prefix = '') => {
  for (const c of (el.getAttribute('class') ?? '').split(/\s+/)) {
    if (!c.startsWith(`${prefix}${prop}-`)) continue;
    const v = c.slice(prefix.length + prop.length + 1);
    const px = /^\[(\d+(?:\.\d+)?)px\]$/.exec(v);
    const step = /^(\d+(?:\.\d+)?)$/.exec(v);
    if (px) return Number(px[1]);
    if (step) return Number(step[1]) * 4;
  }
  return NaN;
};
/** Every size of type the bar's classes set, in px, at any width (`text-[15px]`, `max-sm:[&>span]:text-[14px]`). */
const textSizes = (container: HTMLElement) =>
  [...container.querySelectorAll('*')].flatMap((el) => [...el.classList].flatMap((c) => /(?:^|:)text-\[(\d+(?:\.\d+)?)px\]$/.exec(c)?.[1] ?? []).map(Number));
/**
 * The stand view's key moments as it labels them, with a comma before the day: the Sun sets on the 3rd, the
 * battery runs out on the 4th, Earth comes into view on the 10th, and the Sun comes back on the 20th.
 */
const STAND_MOMENTS = [
  { label: 'Sunset, 3 Jan', hour: 50 },
  { label: 'Battery runs out, 4 Jan', hour: 76 },
  { label: 'Earth in view, 10 Jan', hour: 216 },
  { label: 'Sun back, 20 Jan', hour: 456 },
];
/**
 * A period like the stand view's 30 days from 1 January 2027 at de Gerlache Rim 2, with what the stand view
 * passes the bar: the Sun sets on the 3rd and the battery runs out on the 4th, before Earth comes into view on
 * the 10th; the Sun and the power come back on the 20th, while Earth is still in view, until the 23rd. So all
 * its radio contact, the 20th to the 23rd, needs the lander to have survived the night.
 */
const STAND_SKY = {
  sunFraction: Float64Array.from({ length: 720 }, (_, h) => (h < 50 || h >= 456 ? 1 : 0)),
  earthVisible: Uint8Array.from({ length: 720 }, (_, h) => (h >= 216 && h < 552 ? 1 : 0)),
};
const STAND_POWERED = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 456 ? 0 : 1));
function showStandPeriod(extra: Partial<Props> = {}) {
  return showPeriod(30, { dates: true, powered: STAND_POWERED, ifSurvivesFrom: 456, ...extra }, STAND_SKY);
}
/** A ResizeObserver whose one report sets the width the moments' row measures; call the result inside act(). */
function measuredTrack(): (px: number) => void {
  let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
  class FakeObserver {
    constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
      report = cb;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeObserver);
  return (px) => report!([{ contentRect: { width: px } }]);
}
/** Where the target of a moment's dot starts along a track `trackPx` wide, in px: at its hour's share, then by its own margin (`--dot-x`). */
const dotTargetLeft = (b: HTMLElement, trackPx: number) => (parseFloat(b.style.left) / 100) * trackPx + parseFloat(b.style.getPropertyValue('--dot-x'));
/**
 * Gives the slider a size on screen, 14 px wider than the hours it runs over from the first to the `last`: its
 * handle is 14 px wide, and its middle runs from 7 px in at one end to 7 px in at the other. So the hour under the
 * pointer is its x less 7 px.
 */
function sizeSlider(last: number): HTMLElement {
  const slider = screen.getByRole('slider', { name: 'Time' });
  const width = last + 14;
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: 47, width, height: 47, toJSON: () => ({}) });
  return slider;
}
const peekOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-part="peek"]');
/** The share of the track a plate is drawn back by, from its `translateX(-…%)`. */
const drawnBack = (el: HTMLElement) => Number(/^translateX\(-?([\d.]+)%\)$/.exec(el.style.transform)?.[1]);
/** One rule of globals.css, by its selector exactly, and a length in it in px. */
const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const lengthIn = (body: string, prop: string) => Number(new RegExp(`(?:^|[\\s;{])${prop}:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(body)?.[1]);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TimeBar', () => {
  it('says the date and hour in UTC and what is happening then', () => {
    show(6);
    expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun up, Earth behind a hill, battery 100 %');
  });

  it("lines its track up under the chart's plot: the chart's grid, inset by the chart panel's edge, Play in the column of the row names", () => {
    show(6);
    const bar = screen.getByRole('region', { name: 'Time' });
    const grid = bar.querySelector<HTMLElement>('[data-part="bar-grid"]')!;
    for (const c of PLOT_GRID.split(' ')) expect(grid.classList.contains(c)).toBe(true);
    expect(grid.className).toMatch(/\bpx-\[25px\]/);
    // Play first, in the column of the row names; the date's line and the track in the column of the plot.
    expect(grid.firstElementChild).toBe(screen.getByRole('button', { name: 'Play' }));
    const track = screen.getByRole('slider', { name: 'Time' }).closest<HTMLElement>('[data-part="track"]')!;
    expect(track.className).toMatch(/(^| )col-start-2( |$)/);
    // The date's line starts with the speed, right after Play, and carries the date and the words.
    const line = grid.querySelector<HTMLElement>('[data-part="line"]')!;
    expect(line.previousElementSibling).toBe(grid.firstElementChild);
    expect(line.firstElementChild).toBe(screen.getByRole('button', { name: /^Speed / }));
    expect(line.contains(screen.getByTestId('when'))).toBe(true);
    expect(line.contains(screen.getByTestId('status'))).toBe(true);
  });

  it("keeps Play's word beside its sign on a phone in every mode, Explore's too, and leaves the days to the chart the track lines up with", () => {
    for (const mode of [{}, { dates: true, powered: power.powered, compact: true }, { dates: true, bare: true }]) {
      show(6, mode);
      const word = screen.getByRole('button', { name: 'Play' }).querySelector('span')!;
      expect(word.textContent).toBe('Play');
      expect(word.className).not.toMatch(/sr-only|hidden/);
      cleanup();
    }
    show(6);
    expect(screen.queryByTestId('ticks')).toBeNull();
    expect(screen.queryByTestId('dates')).toBeNull();
  });

  it('on a phone puts Play and the speed beside the date, and gives the line after them the whole width of the bar', () => {
    const { container } = show(6, { dates: true, powered: power.powered, compact: true });
    const grid = container.querySelector<HTMLElement>('[data-part="bar-grid"]')!;
    // Three columns there, Play's, the speed's and the date's, 8 px apart, and rows flush, as the targets are 40 px tall.
    for (const c of ['max-sm:grid-cols-[auto_auto_minmax(0,1fr)]', 'max-sm:gap-x-2', 'max-sm:gap-y-0']) expect(grid.classList.contains(c)).toBe(true);
    // The date's line gives up its own box there, so the speed and the date take a column each, and what follows a row
    // of the bar's whole width.
    expect(grid.querySelector('[data-part="line"]')!.classList.contains('max-sm:contents')).toBe(true);
    const track = container.querySelector<HTMLElement>('[data-part="track"]')!;
    for (const c of ['max-sm:col-span-3', 'max-sm:col-start-1', 'max-sm:mt-1']) expect(track.classList.contains(c)).toBe(true);
    // No chart above the stand view's bar to line the track up with: it drops the chart panel's inset at every width,
    // room for Play's word and the speed on a phone and for Next on the date's line from 768 px.
    expect(grid.classList.contains('px-0')).toBe(true);
    expect(grid.className).not.toMatch(/px-\[25px\]/);
    cleanup();
    // Explore keeps the inset on a phone too, where its chart's plot is inset by as much.
    show(6);
    expect(document.querySelector('[data-part="bar-grid"]')!.classList.contains('px-[25px]')).toBe(true);
    expect(document.querySelector('[data-part="bar-grid"]')!.className).not.toMatch(/(^| )(max-sm:)?px-0( |$)/);
  });

  it('shows the hour under the pointer on the chart while the handle stays put', () => {
    show(6, { hoverHour: 40 });
    expect(screen.getByTestId('when').textContent).toBe('2 Jan 2027, 16:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun behind a hill, Earth in view but the lander is off, battery empty');
    expect((screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement).value).toBe('6');
  });

  it('is a slider over the hours of the period that reads its position in words', () => {
    const { onCursor } = show(10);
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('71');
    expect(slider.step).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('1 Jan 2027, 10:00 UTC: Sun up, Earth behind a hill, battery 100 %');
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

  // The yellow is the site in sunlight, not the Sun above the horizon: a Sun up behind the hills leaves it grey.
  it('says what the yellow of its track is, so it does not read as progress: the site in sunlight', () => {
    show(6);
    const bar = screen.getByRole('region', { name: 'Time' });
    const key = bar.querySelector<HTMLElement>('[data-part="key"]')!;
    expect(key.textContent).toBe('in sunlight');
    expect(key.querySelector('[data-swatch]')!.className).toMatch(/\bbg-sun\b/);
    // On a phone too: the yellow track needs its key there as much as anywhere.
    expect(key.className).not.toMatch(/hidden/);
  });

  it('draws the sunlight of the period as the track', () => {
    const { container } = show(0);
    expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
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
    expect(screen.queryByText('night')).toBeNull();
    expect(container.querySelectorAll('[data-swatch]')).toHaveLength(1);
    // The box of the strip keeps its height: nothing under the strip but the slider's own room.
    expect(stripBox(container).getAttribute('class')).toBe('relative h-8');
    unmount();
    // The hours the lander is off on their own bring neither: Earth's band and the grey's name come with the dates.
    const offOnly = show(6, { powered: power.powered });
    expect(offOnly.container.querySelector('[data-part="off"]')).not.toBeNull();
    expect(offOnly.container.querySelector('[data-part="earth"]')).toBeNull();
    expect(screen.queryByText('Earth in view')).toBeNull();
    expect(screen.queryByText('night')).toBeNull();
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
    expect(container.querySelector('[data-part="key"]')!.textContent).toBe('in sunlight');
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
    // The key names it: a hatched line as thick as the band, then the words, which say what the hatching is (radio)
    // so they do not read as a fragment. No hour of the green is solid here, so "radio contact" is not named, and
    // the hatched entry comes right after Earth's.
    const key = container.querySelector<HTMLElement>('[data-part="key-if-survives"]')!;
    expect(wordsOf(key)).toBe('radio, if the lander survives the cold');
    // On a phone, where the key sits in the bar's second column (about 240 px at 390 px), the words would wrap onto a
    // second line and take 20 px from the scene (18.3): a shorter copy shows there, the same meaning.
    expect(key.querySelector('[data-wide]')!.className).toBe('max-sm:hidden');
    const phone = key.querySelector<HTMLElement>('[data-phone]')!;
    // Keeping 'the cold', which is what the words are for (18.2; the final review of D3).
    expect(phone.textContent).toBe('radio if it survives the cold');
    expect(phone.className).toBe('sm:hidden');
    expect(key.previousElementSibling).toBe(container.querySelector('[data-part="key-earth"]'));
    expect(container.querySelector('[data-part="key-contact"]')).toBeNull();
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
    expect(screen.queryByText('radio, if the lander survives the cold')).toBeNull();
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

  it("names the strip's grey, the night, right after the yellow of its sunlight when the dates are shown", () => {
    // The second day leaves the strip grey there, with the Sun 5° up all the while, set behind the hills. So the key
    // names the site in sunlight and the night, not whether the Sun is up.
    expect(series.sunEl[30]).toBe(5);
    expect(series.sunFraction[30]).toBe(0);
    const { container } = show(6, { dates: true });
    const key = container.querySelector<HTMLElement>('[data-part="key-no-sun"]')!;
    expect(key.textContent).toBe('night');
    expect(container.querySelector('[data-part="key"]')!.textContent).toBe('in sunlight');
    for (const k of container.querySelectorAll('[data-part^="key"]')) expect(k.textContent).not.toMatch(/Sun up|no Sun/);
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
    expect(screen.queryByText('night')).toBeNull();
    unmount();
    // One hour without it is grey on the strip, and named.
    const sunFraction = new Float64Array(720).fill(1);
    sunFraction[300] = 0;
    const one = showPeriod(30, { dates: true }, { sunFraction });
    expect(one.container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
    expect(screen.getByText('night')).toBeTruthy();
  });

  it('leaves "radio contact" out of the key when the lander loses power before Earth comes into view: the bar draws no solid green, only the hatched radio after the night', () => {
    const { container } = showStandPeriod();
    // All the radio band holds is hatched, from the 20th, when the power comes back, to the 23rd.
    expect(contactRunsOf(container, 720)).toEqual([{ from: 456, to: 552, hatched: true }]);
    expect(container.querySelector('[data-part="contact-run"]:not([data-if-survives])')).toBeNull();
    // So the key names no solid green for a reader to go looking for: the hatched entry comes right after Earth's.
    expect(keyWords(container)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio, if the lander survives the cold']);
    expect(container.querySelector('[data-part="key-contact"]')).toBeNull();
    expect(screen.queryByText('radio contact')).toBeNull();
    expect(container.querySelector('[data-part="key-if-survives"]')!.previousElementSibling).toBe(container.querySelector('[data-part="key-earth"]'));
  });

  it('names "radio contact" when the bar draws some hour of solid green, before the hatched entry when some hour is hatched too', () => {
    // Earth in view from the 2nd to the 5th: the lander has power until the battery runs out on the 4th, so the green
    // is solid from the 2nd until then. Earth is gone when the power comes back on the 20th, so no hour is hatched.
    const sunFraction = Float64Array.from({ length: 720 }, (_, h) => (h < 50 || h >= 456 ? 1 : 0));
    const powered = Uint8Array.from({ length: 720 }, (_, h) => (h >= 76 && h < 456 ? 0 : 1));
    const early = Uint8Array.from({ length: 720 }, (_, h) => (h >= 24 && h < 100 ? 1 : 0));
    const { container, unmount } = showPeriod(30, { dates: true, powered, ifSurvivesFrom: 456 }, { sunFraction, earthVisible: early });
    expect(contactRunsOf(container, 720)).toEqual([{ from: 24, to: 76, hatched: false }]);
    expect(keyWords(container)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio contact']);
    expect(screen.queryByText('radio, if the lander survives the cold')).toBeNull();
    unmount();
    // With Earth in view again from the 20th to the 23rd, both kinds of green are drawn, and both named, the solid first.
    const twice = Uint8Array.from({ length: 720 }, (_, h) => ((h >= 24 && h < 100) || (h >= 456 && h < 552) ? 1 : 0));
    const both = showPeriod(30, { dates: true, powered, ifSurvivesFrom: 456 }, { sunFraction, earthVisible: twice });
    expect(contactRunsOf(both.container, 720)).toEqual([
      { from: 24, to: 76, hatched: false },
      { from: 456, to: 552, hatched: true },
    ]);
    expect(keyWords(both.container)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio contact', 'radio, if the lander survives the cold']);
  });

  it('leaves "lander off" out of the key when no hour is without power', () => {
    // A lander that keeps its power all through, the night as well: no red band. Earth comes into view on the 10th.
    const sunFraction = Float64Array.from({ length: 720 }, (_, h) => (h < 50 || h >= 456 ? 1 : 0));
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 216 && h < 552 ? 1 : 0));
    const { container } = showPeriod(30, { dates: true, powered: new Uint8Array(720).fill(1), ifSurvivesFrom: null }, { sunFraction, earthVisible });
    expect(container.querySelector('[data-part="off"]')).toBeNull();
    expect(keyWords(container)).toEqual(['in sunlight', 'night', 'Earth in view', 'radio contact']);
    expect(screen.queryByText('lander off')).toBeNull();
  });

  it('leaves "in sunlight" out of the key when no hour has any of the Sun: there is no yellow to name', () => {
    // A period all night: the strip is grey from end to end, and the key names the grey alone.
    const dark = new Float64Array(720);
    const { container, unmount } = showPeriod(30, { dates: true }, { sunFraction: dark });
    expect(container.querySelector('[data-part="lit"]')).toBeNull();
    expect(keyWords(container)).toEqual(['night']);
    expect(screen.queryByText('in sunlight')).toBeNull();
    unmount();
    // Explore's key names the yellow alone, so for such a period it has no entry at all.
    const explore = showPeriod(30, {}, { sunFraction: dark });
    expect(explore.container.querySelector('[data-part^="key"]')).toBeNull();
    expect(explore.container.querySelector('[data-swatch]')).toBeNull();
  });

  it('keeps all five keys on one baseline on a line of their own, at the right on a wide screen, so the bar keeps one height while the words change', () => {
    // The night, the hours the battery runs out in it, and Earth on the second day while the lander has power: every key is needed.
    const { container } = show(6, { dates: true, powered: power.powered });
    const keys = [...container.querySelectorAll<HTMLElement>('[data-part^="key"]')];
    expect(keys.map((k) => k.textContent)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio contact']);
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

  it('slims the bar when compact on a medium screen and up: the keys join the line of the date and hour at its right end, in up to two lines, where they have room', () => {
    const { container } = show(6, { dates: true, powered: power.powered, compact: true, clockNote: ' (Earth time)' });
    const group = container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect([...group.children].map((k) => k.textContent)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio contact']);
    // In the date's own line, after the date and its note.
    expect(container.querySelector('[data-part="line"]')!.contains(group)).toBe(true);
    expect(screen.getByTestId('clock-note').compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // From md up they ask for 28rem beside the date and Next, room for the five entries in two lines, and take what is
    // left of the line, their entries at its right end; with less room left they take the next line whole, at the right
    // all the same.
    for (const c of ['basis-full', 'md:basis-[28rem]', 'md:grow', 'md:ml-auto', 'sm:justify-end', 'flex-wrap', 'items-baseline']) expect(group.classList.contains(c)).toBe(true);
    // Each line of entries 20 px tall, so two of them are no taller than Play, the speed and Next beside them.
    expect(group.classList.contains('leading-5')).toBe(true);
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
    expect(screen.queryByText('Sun up, Earth behind a hill, battery 100 %')).toBeNull();
    expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
    // The slider still reads the hour in words.
    expect(screen.getByRole('slider', { name: 'Time' }).getAttribute('aria-valuetext')).toBe('1 Jan 2027, 06:00 UTC: Sun up, Earth behind a hill, battery 100 %');
    // Smaller on a phone, but no smaller than the 14 px every word in the bar keeps to.
    const group = container.querySelector('[data-part="key-off"]')!.parentElement!;
    expect(group.className).toContain('max-sm:[&>span]:text-[14px]');
    cleanup();
    // Without compact the sentence shows at every width.
    show(6, { dates: true });
    expect(screen.getByTestId('status').textContent).toBe('Sun up, Earth behind a hill, battery 100 %');
    expect(screen.getByTestId('status').className).not.toMatch(/hidden/);
  });

  it('on a phone folds the key behind a "Key ▾" button after the date: 14 px, underlined, a 40 px target, and opens it under the date', () => {
    const { container } = show(6, { dates: true, powered: power.powered, compact: true, ifSurvivesFrom: 30, clockNote: ' (Earth time)' });
    const key = screen.getByRole('button', { name: 'Key' });
    const group = container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect(key.textContent).toBe('Key ▾');
    expect(key.querySelector('[aria-hidden="true"]')!.textContent).toBe(' ▾');
    // On a phone only: from 640 px up the key shows whole, as it always has.
    for (const c of ['text-[14px]', 'underline', 'h-10', 'sm:hidden']) expect(key.classList.contains(c)).toBe(true);
    expect(group.className).not.toMatch(/(^| )(sm|md|lg|xl):hidden( |$)/);
    // After the date in the bar's order.
    expect(screen.getByTestId('when').compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Folded: the entries do not show on a phone, and the button says so.
    expect(key.getAttribute('aria-expanded')).toBe('false');
    expect(group.classList.contains('max-sm:hidden')).toBe(true);
    expect([...group.children].map(wordsOf)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio contact', 'radio, if the lander survives the cold']);
    fireEvent.click(key);
    // Opened: under the date at 14 px with shorter swatches, as a phone has shown them.
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(key.textContent).toBe('Key ▴');
    expect(group.classList.contains('max-sm:hidden')).toBe(false);
    for (const c of ['flex', 'basis-full', 'flex-wrap', 'items-baseline', 'max-sm:gap-x-2', 'max-sm:[&>span]:text-[14px]', 'max-sm:[&_i]:w-4']) expect(group.classList.contains(c)).toBe(true);
    // And folded again.
    fireEvent.click(key);
    expect(key.getAttribute('aria-expanded')).toBe('false');
    expect(group.classList.contains('max-sm:hidden')).toBe(true);
  });

  it('on a phone names in the key only what the bar draws', () => {
    // The stand view's period, where the only radio drawn is hatched: no "radio contact".
    const { container } = showStandPeriod({ compact: true });
    const group = container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect([...group.children].map(wordsOf)).toEqual(['in sunlight', 'night', 'lander off', 'Earth in view', 'radio, if the lander survives the cold']);
    cleanup();
    // A lander that keeps its power all through: no "lander off".
    const earthVisible = Uint8Array.from({ length: 720 }, (_, h) => (h >= 216 && h < 552 ? 1 : 0));
    const second = showPeriod(30, { dates: true, powered: new Uint8Array(720).fill(1), compact: true }, { earthVisible });
    const keys = second.container.querySelector<HTMLElement>('[data-part="key"]')!.parentElement!;
    expect([...keys.children].map((k) => k.textContent)).toEqual(['in sunlight', 'Earth in view', 'radio contact']);
  });

  it("has no Key button where the key is the Sun's alone, as on Explore, or when bare: there is nothing to fold", () => {
    const { container } = show(6);
    expect(screen.queryByRole('button', { name: 'Key' })).toBeNull();
    expect(container.querySelector('[data-part="key"]')!.className).not.toMatch(/hidden/);
    cleanup();
    show(6, { dates: true, powered: power.powered, compact: true, bare: true });
    expect(screen.queryByRole('button', { name: 'Key' })).toBeNull();
  });

  it('sets every word in the bar at 14 px or more, in every mode and at every width', () => {
    // Every mode the bar has, with every part it can carry, its key open where a button folds it, and the plate shown.
    const all = { dates: true, powered: power.powered, moments: [{ label: 'Sunset 2 Jan', hour: 24 }, { label: 'Earth in view 2 Jan', hour: 30 }], onMoment: vi.fn(), ifSurvivesFrom: 30, clockNote: ' (Earth time)' };
    const modes: Partial<Props>[] = [{}, { powered: power.powered }, all, { ...all, compact: true }, { ...all, bare: true }, { ...all, compact: true, bare: true }];
    for (const mode of modes) {
      for (const cursor of [6, 24]) {
        const { container } = show(cursor, mode);
        const key = screen.queryByRole('button', { name: 'Key' });
        if (key) fireEvent.click(key);
        fireEvent.pointerMove(sizeSlider(71), { clientX: 30, pointerType: 'mouse' });
        expect(peekOf(container)).not.toBeNull();
        const sizes = textSizes(container);
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
        // Nor any of Tailwind's own sizes under 14 px.
        expect(container.innerHTML).not.toMatch(/(?:^|[\s":])text-(?:xs|2xs)(?=[\s"])/);
        cleanup();
      }
    }
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
});

describe('TimeBar: Play', () => {
  it('plays a day a second at 1×: twelve steps a second, two hours a step', () => {
    vi.useFakeTimers();
    expect(PLAY_HPS).toBe(24);
    const { onCursor } = playPage(series, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(asked(onCursor)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
  });

  it("makes Play the one primary control, filled with ink and never gold: gold is the page's one other action", () => {
    show(10);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.classList.contains('btn')).toBe(true);
    expect(play.classList.contains('btn-ink')).toBe(true);
    expect(play.className).not.toMatch(/btn-primary|bg-sun|border-sun/);
    // The bar's other buttons keep the plain edge.
    for (const b of screen.getAllByRole('button').filter((b) => b !== play)) expect(b.className).not.toMatch(/btn-ink|btn-primary/);
  });

  it('moves two hours a step for each step of speed, and stops exactly on the last hour', () => {
    vi.useFakeTimers();
    const twice = playPage(series, 0, { speed: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(3 * STEP));
    expect(asked(twice.onCursor)).toEqual([4, 8, 12]);
    twice.unmount();
    // At 4× from hour 50 of 71: 58, 66, then a short step onto the last hour, where Play stops.
    const four = playPage(series, 50, { speed: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(asked(four.onCursor)).toEqual([58, 66, 71]);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
  });

  it('cycles its speed 1×, 2×, 4× and back from a button right after Play, 44 px wide and 40 px tall whatever it shows, named for what it means', () => {
    expect(SPEEDS).toEqual([1, 2, 4]);
    show(10);
    const speed = screen.getByRole('button', { name: 'Speed 1×: a day a second' });
    expect(screen.getAllByRole('button').indexOf(speed)).toBe(screen.getAllByRole('button').indexOf(screen.getByRole('button', { name: 'Play' })) + 1);
    expect(speed.textContent).toBe('1×');
    expect(classPx(speed, 'w')).toBe(44);
    expect(classPx(speed, 'h')).toBe(40);
    expect(speed.classList.contains('shrink-0')).toBe(true);
    const look = speed.className;
    fireEvent.click(speed);
    expect(speed.getAttribute('aria-label')).toBe('Speed 2×: two days a second');
    expect(speed.textContent).toBe('2×');
    fireEvent.click(speed);
    expect(speed.getAttribute('aria-label')).toBe('Speed 4×: four days a second');
    expect(speed.textContent).toBe('4×');
    fireEvent.click(speed);
    expect(speed.getAttribute('aria-label')).toBe('Speed 1×: a day a second');
    expect(speed.className).toBe(look);
  });

  it('plays at a speed chosen while it runs from the next step on, and keeps playing', () => {
    vi.useFakeTimers();
    const { onCursor } = playPage(series, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(STEP));
    fireEvent.click(screen.getByRole('button', { name: /^Speed / }));
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(onCursor)).toEqual([2, 6]);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('keeps the speed the page gives it, telling the page the next one when pressed, and its own when the page gives none', () => {
    const onSpeed = vi.fn();
    const props = { series, power, startUtc: START, cursor: 10, hoverHour: null, batteryWh: CFG.batteryWh, onCursor: vi.fn(), onSpeed };
    const { rerender } = render(<TimeBar {...props} speed={2} />);
    const speed = screen.getByRole('button', { name: 'Speed 2×: two days a second' });
    fireEvent.click(speed);
    expect(onSpeed).toHaveBeenLastCalledWith(4);
    // The page decides: until it gives the new speed, the button shows the one it gave.
    expect(speed.textContent).toBe('2×');
    rerender(<TimeBar {...props} speed={4} />);
    expect(speed.getAttribute('aria-label')).toBe('Speed 4×: four days a second');
    fireEvent.click(speed);
    expect(onSpeed).toHaveBeenLastCalledWith(1);
    cleanup();
    // Given none, the bar keeps its own, from 1×, and tells the page all the same.
    render(<TimeBar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speed 1×: a day a second' }));
    expect(onSpeed).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('button', { name: 'Speed 2×: two days a second' }).textContent).toBe('2×');
  });

  it('does not play when the system asks for reduced motion, and says why: Play and the speed are off, and Space is the page’s', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    show(0, { spaceToPlay: true });
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^Speed / }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Playback is off because your system asks for reduced motion/)).toBeTruthy();
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: ' ' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('stops on each moment it comes to, stepping past none, holds there for a second reading Pause, then goes on, and tells the page it arrived', () => {
    vi.useFakeTimers();
    const onArrive = vi.fn();
    const { onCursor, unmount } = playPage(steady(30), 47, { moments: STAND_MOMENTS, onArrive });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(2 * STEP));
    // Two hours a step from 47 would pass the sunset at 50: the second step stops on it.
    expect(asked(onCursor)).toEqual([49, 50]);
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect(onArrive).toHaveBeenCalledWith(STAND_MOMENTS[0]);
    // The time first, then the page, which may turn the view to the moment.
    expect(onCursor.mock.invocationCallOrder[1]).toBeLessThan(onArrive.mock.invocationCallOrder[0]);
    // A second on the moment, Play still running.
    act(() => vi.advanceTimersByTime(990));
    expect(asked(onCursor)).toEqual([49, 50]);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(10));
    expect(asked(onCursor)).toEqual([49, 50, 52]);
    unmount();
    // At 4× a step from 70 would jump the battery running out at 76: it stops there too.
    const fast = playPage(steady(30), 70, { moments: STAND_MOMENTS, onArrive, speed: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(fast.onCursor)).toEqual([76]);
    expect(onArrive).toHaveBeenLastCalledWith(STAND_MOMENTS[1]);
  });

  it('holds on a moment for as long as the page asks', () => {
    vi.useFakeTimers();
    const { onCursor } = playPage(steady(30), 49, { moments: STAND_MOMENTS, holdMs: 2500 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(onCursor)).toEqual([50]);
    act(() => vi.advanceTimersByTime(2400));
    expect(asked(onCursor)).toEqual([50]);
    act(() => vi.advanceTimersByTime(100));
    expect(asked(onCursor)).toEqual([50, 52]);
  });

  it('does not hold on the hour Play starts from, nor on the first hour when it plays again from the end', () => {
    vi.useFakeTimers();
    const onArrive = vi.fn();
    const from = playPage(steady(30), 50, { moments: STAND_MOMENTS, onArrive });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(from.onCursor)).toEqual([52]);
    from.unmount();
    const again = playPage(steady(30), 719, { moments: [{ label: 'Sunrise, 1 Jan', hour: 0 }, ...STAND_MOMENTS], onArrive });
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(again.onCursor)).toEqual([0, 2]);
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('gives way to the hand: a press on the track, a dot or Next, or a key on the slider, pauses Play until Play is pressed again', () => {
    vi.useFakeTimers();
    const slider = () => screen.getByRole('slider', { name: 'Time' });
    const presses: [string, () => void][] = [
      ['a press on the track', () => fireEvent.pointerDown(slider(), { pointerType: 'mouse' })],
      ['a dot', () => fireEvent.click(screen.getByRole('button', { name: 'Earth in view, 10 Jan' }))],
      ['Next', () => fireEvent.click(screen.getByRole('button', { name: /^Next: / }))],
      ...['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].map((key): [string, () => void] => [key, () => fireEvent.keyDown(slider(), { key })]),
      ['Shift+ArrowRight', () => fireEvent.keyDown(slider(), { key: 'ArrowRight', shiftKey: true })],
      ['Shift+ArrowLeft', () => fireEvent.keyDown(slider(), { key: 'ArrowLeft', shiftKey: true })],
    ];
    for (const [what, press] of presses) {
      const { onCursor, unmount } = playPage(steady(30), 100, { moments: STAND_MOMENTS });
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => vi.advanceTimersByTime(STEP));
      expect(asked(onCursor), what).toEqual([102]);
      press();
      expect(screen.queryByRole('button', { name: 'Pause' }), what).toBeNull();
      const before = onCursor.mock.calls.length;
      act(() => vi.advanceTimersByTime(2000));
      expect(onCursor.mock.calls.length, what).toBe(before);
      unmount();
    }
  });

  it('toggles Play with Space on the slider, without scrolling the page', () => {
    vi.useFakeTimers();
    show(10);
    const slider = screen.getByRole('slider', { name: 'Time' });
    expect(fireEvent.keyDown(slider, { key: ' ' })).toBe(false);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(fireEvent.keyDown(slider, { key: ' ' })).toBe(false);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('toggles Play with Space anywhere on the page when asked, but not in a button, a link, a field, an editable element or a dialog', () => {
    vi.useFakeTimers();
    const page = document.createElement('div');
    page.innerHTML =
      '<button type="button">A button</button><a href="#there">A link</a><input aria-label="A field"><select aria-label="A list"><option>One</option></select>' +
      '<textarea aria-label="Words"></textarea><div contenteditable="true">Editable</div><div role="dialog"><p>In a dialog</p></div><dialog open><p>In a dialog element</p></dialog>';
    document.body.append(page);
    try {
      show(10, { spaceToPlay: true });
      // From the page itself: Play, then Pause, and the page does not scroll.
      expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
      expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
      expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
      expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
      // In each of these Space is theirs: Play stays as it was, and the browser does what it does there.
      const theirs = page.querySelectorAll('button, a, input, select, textarea, [contenteditable], [role="dialog"] p, dialog p');
      expect(theirs).toHaveLength(8);
      for (const el of theirs) {
        expect(fireEvent.keyDown(el, { key: ' ' }), el.outerHTML).toBe(true);
        expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
      }
    } finally {
      page.remove();
    }
    cleanup();
    // Not asked, Space on the page is the page's.
    show(10);
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('reads Replay with a ↺ sign at the last hour, and from there plays again from the first hour', () => {
    vi.useFakeTimers();
    const { onCursor } = playPage(series, 71);
    const replay = screen.getByRole('button', { name: 'Replay' });
    expect(replay.querySelector('svg')!.getAttribute('data-sign')).toBe('replay');
    fireEvent.click(replay);
    expect(asked(onCursor)).toEqual([0]);
    expect(screen.getByRole('button', { name: 'Pause' })).toBe(replay);
    act(() => vi.advanceTimersByTime(STEP));
    expect(asked(onCursor)).toEqual([0, 2]);
  });

  it('keeps one width for Play, Pause and Replay, and a sign that never shrinks, so nothing beside it moves', () => {
    vi.useFakeTimers();
    playPage(series, 69);
    const button = screen.getByRole('button', { name: 'Play' });
    const look = button.className;
    // 104 px at every width: the column of the chart's row names on a wide screen, and on a phone room for "Replay".
    expect(classPx(button, 'w')).toBe(104);
    expect(PLOT_GRID).toContain('grid-cols-[104px_');
    const sign = () => button.querySelector('svg')!;
    expect(sign().getAttribute('data-sign')).toBe('play');
    expect(sign().classList.contains('shrink-0')).toBe(true);
    fireEvent.click(button);
    expect(button.textContent).toBe('Pause');
    expect(sign().getAttribute('data-sign')).toBe('pause');
    expect(sign().classList.contains('shrink-0')).toBe(true);
    expect(button.className).toBe(look);
    act(() => vi.advanceTimersByTime(STEP));
    expect(button.textContent).toBe('Replay');
    expect(sign().getAttribute('data-sign')).toBe('replay');
    expect(sign().classList.contains('shrink-0')).toBe(true);
    expect(button.className).toBe(look);
  });

  it('tells the page when Play starts, by Space and Replay too, and not when it pauses or the time is moved by hand', () => {
    vi.useFakeTimers();
    const onPlay = vi.fn();
    showPeriod(30, { dates: true, moments: STAND_MOMENTS, onPlay, cursor: 60 });
    // The slider, the keys, the dots and Next move the time through onCursor, as Play does, so onCursor cannot tell
    // the page that Play was pressed.
    const slider = screen.getByRole('slider', { name: 'Time' });
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Earth in view, 10 Jan' }));
    fireEvent.click(screen.getByRole('button', { name: /^Next: / }));
    fireEvent.click(screen.getByRole('button', { name: /^Speed / }));
    expect(onPlay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    // Pausing stops the time rather than starting it; the next Play starts it again, by Space as by a press.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(slider, { key: ' ' });
    expect(onPlay).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(slider, { key: ' ' });
    expect(onPlay).toHaveBeenCalledTimes(2);
    cleanup();
    const replay = vi.fn();
    show(71, { onPlay: replay });
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(replay).toHaveBeenCalledTimes(1);
  });
});

describe('TimeBar: moments', () => {
  it('draws each moment as a 12 px dot on the top edge of the strip at every width, gold for the one the time is on, with a target 24 px wide and 40 px tall', () => {
    const { container } = showPeriod(30, { dates: true, moments: STAND_MOMENTS, cursor: 216 });
    const row = container.querySelector<HTMLElement>('[data-part="moments"]')!;
    // Right above the strip in the track's own column, so the dots line up with the hours: 27 px over the slider and
    // lifted over it, so with the grid's 4 px above the row and the slider's 9 px over the strip under it each target
    // is 40 px tall, its foot on the strip's top edge, the strip left to the slider.
    expect(row.parentElement).toBe(screen.getByRole('slider', { name: 'Time' }).closest('[data-part="track"]'));
    expect(row.nextElementSibling).toBe(stripBox(container));
    expect(classPx(row, 'h')).toBe(27);
    expect(row.classList.contains('z-[1]')).toBe(true);
    expect(topPx(container.querySelector('[data-part="track"] svg')!)).toBe(9);
    // The same at every width: no width's variant in the row.
    expect(row.outerHTML).not.toMatch(/(?:max-)?(?:sm|md|lg|xl):/);
    dotsOf(container).forEach((f, k) => {
      // At its hour's share of the track, like the sunlight and the lanes under it.
      expect(parseFloat(f.style.left) / 100).toBeCloseTo(STAND_MOMENTS[k].hour / 720, 6);
      // Named for screen readers, its words not shown.
      expect(f.getAttribute('aria-label')).toBe(STAND_MOMENTS[k].label);
      expect(f.querySelector('span')!.classList.contains('sr-only')).toBe(true);
      expect(f.querySelector('span')!.textContent).toBe(STAND_MOMENTS[k].label);
      // A target 40 px tall and 24 px wide, centred on its hour, lighter under the pointer.
      expect(classPx(f, 'h')).toBe(40);
      expect(classPx(f, 'w')).toBe(24);
      expect(classPx(f, 'h')).toBe(4 + classPx(row, 'h') + 9);
      for (const c of ['absolute', '-bottom-[9px]', 'ml-[var(--dot-x)]', 'rounded-full', 'cursor-pointer', 'hover:bg-line']) expect(f.classList.contains(c)).toBe(true);
      expect(f.style.getPropertyValue('--dot-x')).toBe('-12px');
      // A round dot 12 px across at its foot.
      const dot = f.querySelector('[data-part="moment-dot"]')!;
      for (const c of ['block', 'size-3', 'rounded-full', 'absolute', 'bottom-0', 'left-1/2', '-translate-x-1/2']) expect(dot.classList.contains(c)).toBe(true);
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    });
    // Gold for the moment the time is on, the ink for the others.
    const tones = dotsOf(container).map((f) => f.querySelector('[data-part="moment-dot"]')!.classList);
    expect(tones.map((c) => (c.contains('bg-sun') ? 'gold' : c.contains('bg-ink') ? 'ink' : null))).toEqual(['ink', 'ink', 'gold', 'ink']);
    expect(dotsOf(container).map((f) => f.getAttribute('aria-current'))).toEqual([null, null, 'true', null]);
    // No boxed flags, stems, rows of flags or chip.
    for (const part of ['moment-stem', 'moment-chip']) expect(container.querySelector(`[data-part="${part}"]`)).toBeNull();
    expect(container.querySelector('[data-row]')).toBeNull();
  });

  it('draws the moments with or without the dates, so Explore can have them too', () => {
    const { container } = showPeriod(30, { moments: STAND_MOMENTS, cursor: 60 });
    expect(dotsOf(container).map((f) => f.getAttribute('aria-label'))).toEqual(STAND_MOMENTS.map((m) => m.label));
    expect(screen.getByRole('button', { name: 'Next: Battery runs out, 4 Jan' })).toBeTruthy();
    // Over the strip's 32 px box, with no lanes under it.
    expect(heightPx(stripBox(container))).toBe(32);
    expect(container.querySelector('[data-part="moments"]')!.nextElementSibling).toBe(stripBox(container));
  });

  it('draws no dots and no Next without moments, so the bar is as it was', () => {
    const before = show(6).container.innerHTML;
    cleanup();
    expect(show(6, { moments: [], onMoment: vi.fn() }).container.innerHTML).toBe(before);
    cleanup();
    const plain = showPeriod(30, { dates: true }).container.innerHTML;
    cleanup();
    const empty = showPeriod(30, { dates: true, moments: [] });
    expect(empty.container.querySelector('[data-part="moments"]')).toBeNull();
    expect(empty.container.querySelector('[data-part="next"]')).toBeNull();
    expect(empty.container.innerHTML).toBe(plain);
    cleanup();
    // Without the dates there is no radio band to hatch.
    const off = show(6, { powered: power.powered }).container.innerHTML;
    cleanup();
    expect(show(6, { powered: power.powered, ifSurvivesFrom: 30 }).container.innerHTML).toBe(off);
  });

  it("moves the time to a dot's moment when pressed, then tells the page which moment it was", () => {
    const onCursor = vi.fn();
    const onMoment = vi.fn();
    showPeriod(30, { dates: true, moments: STAND_MOMENTS, onCursor, onMoment });
    fireEvent.click(screen.getByRole('button', { name: 'Earth in view, 10 Jan' }));
    expect(onCursor).toHaveBeenCalledTimes(1);
    expect(onCursor).toHaveBeenCalledWith(216);
    expect(onMoment).toHaveBeenCalledTimes(1);
    expect(onMoment.mock.calls[0][0]).toBe(STAND_MOMENTS[2]);
    // The time first, then the page.
    expect(onCursor.mock.invocationCallOrder[0]).toBeLessThan(onMoment.mock.invocationCallOrder[0]);
    cleanup();
    // Without onMoment a dot still moves the time.
    const alone = vi.fn();
    showPeriod(30, { dates: true, moments: STAND_MOMENTS, onCursor: alone });
    fireEvent.click(screen.getByRole('button', { name: 'Sunset, 3 Jan' }));
    expect(alone).toHaveBeenCalledWith(50);
  });

  it('moves dots too close for their targets apart, so each keeps a target of its own 24 px wide', () => {
    const report = measuredTrack();
    const { container } = showPeriod(30, { dates: true, moments: STAND_MOMENTS });
    const exact = (px: number) => STAND_MOMENTS.map((m) => (m.hour / 720) * px);
    // Until measured (1000 px) the dots are on their hours, 36 px apart and more.
    expect(dotsOf(container).map((f) => dotTargetLeft(f, 1000) + 12)).toEqual(exact(1000).map((x) => expect.closeTo(x, 9)));
    // On a phone's 358 px track the 1st and the 2nd lie 13 px apart: the two dots move apart evenly, so their targets
    // meet without covering each other; the other two stay on their hours.
    act(() => report(358));
    const at = exact(358);
    const middle = (at[0] + at[1]) / 2;
    const lefts = dotsOf(container).map((f) => dotTargetLeft(f, 358));
    expect(lefts.map((l) => l + 12)).toEqual([middle - 12, middle + 12, at[2], at[3]].map((x) => expect.closeTo(x, 9)));
    for (let k = 1; k < lefts.length; k++) expect(lefts[k] - lefts[k - 1]).toBeGreaterThanOrEqual(24 - 1e-9);
  });

  it('offers the next moment as a real button after the date, "Next: Battery runs out, 4 Jan ›", which moves the time there and tells the page', () => {
    const onCursor = vi.fn();
    const onMoment = vi.fn();
    const { container } = showStandPeriod({ compact: true, clockNote: ' (Earth time)', moments: STAND_MOMENTS, cursor: 60, onCursor, onMoment });
    const next = screen.getByRole('button', { name: 'Next: Battery runs out, 4 Jan' });
    expect(next.getAttribute('type')).toBe('button');
    // Its words: "Next:" in the second ink, the moment in the ink, then a sign no screen reader reads.
    const label = next.querySelector<HTMLElement>('[data-label]')!;
    expect(label.textContent).toBe('Next: Battery runs out, 4 Jan ›');
    expect(label.querySelector('.text-ink-2')!.textContent).toBe('Next:');
    expect(label.querySelector('[aria-hidden="true"]')!.textContent).toBe(' ›');
    // A button like the bar's others, at 15 px, on a target 40 px tall, its words in its middle whatever its width (it
    // keeps the width of the longest, so a short one would sit off to one side of an empty box).
    for (const c of ['btn', 'h-10', 'text-[15px]', 'text-center', 'justify-items-center']) expect(next.classList.contains(c)).toBe(true);
    expect(next.classList.contains('text-left')).toBe(false);
    // On the date's line, right after the date and hour and their note, and never over the track.
    expect(container.querySelector('[data-part="line"]')!.contains(next)).toBe(true);
    expect(container.querySelector('[data-part="readout"]')!.nextElementSibling!.contains(next)).toBe(true);
    expect(next.closest('[data-part="track"]')).toBeNull();
    fireEvent.click(next);
    expect(onCursor).toHaveBeenCalledWith(76);
    expect(onMoment).toHaveBeenCalledWith(STAND_MOMENTS[1]);
    expect(onCursor.mock.invocationCallOrder[0]).toBeLessThan(onMoment.mock.invocationCallOrder[0]);
  });

  it('names in Next the moment after the time, and after the last keeps its place empty, not a button', () => {
    const nextAt = (cursor: number) => {
      cleanup();
      showPeriod(30, { dates: true, moments: STAND_MOMENTS, cursor });
      return screen.queryByRole('button', { name: /^Next: / })?.querySelector('[data-label]')?.textContent ?? null;
    };
    expect(nextAt(0)).toBe('Next: Sunset, 3 Jan ›');
    // On a moment's hour, the one after it.
    expect(nextAt(50)).toBe('Next: Battery runs out, 4 Jan ›');
    expect(nextAt(217)).toBe('Next: Sun back, 20 Jan ›');
    expect(nextAt(456)).toBeNull();
    expect(nextAt(719)).toBeNull();
    // Its place stays, empty and unread, so nothing beside it moves.
    const place = document.querySelector<HTMLElement>('[data-part="next"]')!;
    expect(place.tagName).toBe('SPAN');
    expect(place.getAttribute('aria-hidden')).toBe('true');
    for (const c of ['invisible', 'btn', 'h-10']) expect(place.classList.contains(c)).toBe(true);
  });

  it('keeps Next in one place and one width from 640 px up: the date before it holds the width of its widest, and Next the width of its longest name', () => {
    const { container } = showPeriod(90, { dates: true, moments: STAND_MOMENTS, cursor: 60, compact: true, clockNote: ' (Earth time)' });
    const readout = container.querySelector<HTMLElement>('[data-part="readout"]')!;
    expect(readout.classList.contains('grid')).toBe(true);
    // The 28th of each month the period runs into: two figures for the day, and every figure as wide as the others; drawn
    // in the date's type, then the note in its own, from 768 px as the note shows.
    const dates = [...readout.querySelectorAll<HTMLElement>('[data-sizer]')];
    expect(dates.map((s) => s.style.getPropertyValue('--sizer'))).toEqual(['"28 Jan 2027, 00:00 UTC"', '"28 Feb 2027, 00:00 UTC"', '"28 Mar 2027, 00:00 UTC"']);
    for (const s of dates) {
      expect(s.style.getPropertyValue('--note')).toBe('" (Earth time)"');
      for (const c of ['before:content-[var(--sizer)]', 'before:text-[17px]', 'before:font-semibold', 'after:content-[var(--note)]', 'after:text-[15px]', 'max-md:after:hidden']) expect(s.classList.contains(c)).toBe(true);
    }
    // Next holds the width of the longest of the period's moments, whichever it names.
    const next = screen.getByRole('button', { name: 'Next: Battery runs out, 4 Jan' });
    const names = [...next.querySelectorAll<HTMLElement>('[data-sizer]')];
    expect(names.map((s) => s.style.getPropertyValue('--sizer'))).toEqual(STAND_MOMENTS.map((m) => `"Next: ${m.label} ›"`));
    for (const s of names) expect(s.classList.contains('before:content-[var(--sizer)]')).toBe(true);
    // Unseen and unread, in the cell of what shows, and not on a phone, where Next has a row of its own; drawn by the
    // stylesheet rather than written, so no search of the page's words finds them twice.
    for (const s of [...dates, ...names]) {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      expect(s.textContent).toBe('');
      for (const c of ['invisible', 'col-start-1', 'row-start-1', 'whitespace-nowrap', 'max-sm:hidden']) expect(s.classList.contains(c)).toBe(true);
    }
    expect(screen.getAllByText(/\(Earth time\)/)).toHaveLength(1);
    for (const shown of [screen.getByTestId('when').parentElement!, next.querySelector('[data-label]')!]) for (const c of ['col-start-1', 'row-start-1']) expect(shown.classList.contains(c)).toBe(true);
    cleanup();
    // Bare, or with no moments, there is no Next to keep in place.
    for (const extra of [{ bare: true }, { moments: [] }]) {
      const { container: c } = showPeriod(30, { dates: true, moments: STAND_MOMENTS, ...extra });
      expect(c.querySelector('[data-sizer]')).toBeNull();
      cleanup();
    }
  });

  it('on a phone gives Next and the Key button a row of their own under Play, Next at its start and Key at its end', () => {
    const { container } = showStandPeriod({ compact: true, moments: STAND_MOMENTS, cursor: 60 });
    const next = screen.getByRole('button', { name: 'Next: Battery runs out, 4 Jan' });
    const row = next.parentElement!;
    expect(row).toBe(screen.getByRole('button', { name: 'Key' }).parentElement);
    expect(row.firstElementChild).toBe(next);
    // From 640 px up it gives up its box to the date's line; on a phone it is a row as wide as the bar.
    for (const c of ['contents', 'max-sm:col-span-3', 'max-sm:flex', 'max-sm:justify-between']) expect(row.classList.contains(c)).toBe(true);
    expect(container.querySelector('[data-part="line"]')!.contains(row)).toBe(true);
  });

  it('steps to the next and the previous moment with Shift and the arrow keys on the slider, telling the page', () => {
    const onCursor = vi.fn();
    const onMoment = vi.fn();
    const { rerender } = showPeriod(30, { moments: STAND_MOMENTS, cursor: 60, onCursor, onMoment });
    const slider = screen.getByRole('slider', { name: 'Time' });
    expect(fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })).toBe(false);
    expect(onCursor).toHaveBeenLastCalledWith(76);
    expect(onMoment).toHaveBeenLastCalledWith(STAND_MOMENTS[1]);
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(onCursor).toHaveBeenLastCalledWith(50);
    expect(onMoment).toHaveBeenLastCalledWith(STAND_MOMENTS[0]);
    // Before the first moment there is none to step back to, and nothing moves.
    rerender(<TimeBar series={steady(30)} power={null} startUtc={START} cursor={40} hoverHour={null} batteryWh={0} onCursor={onCursor} moments={STAND_MOMENTS} onMoment={onMoment} />);
    onCursor.mockClear();
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(onCursor).not.toHaveBeenCalled();
    // The arrows alone still move an hour.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onCursor).toHaveBeenLastCalledWith(41);
  });

  it('takes Play, the speed, Next and the slider in that order from the keyboard, and leaves the dots to the pointer, named in their group', () => {
    showPeriod(30, { moments: STAND_MOMENTS, cursor: 60 });
    const bar = screen.getByRole('region', { name: 'Time' });
    const order = [...bar.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]')].filter((el) => el.tabIndex >= 0);
    expect(order).toEqual([
      screen.getByRole('button', { name: 'Play' }),
      screen.getByRole('button', { name: 'Speed 1×: a day a second' }),
      screen.getByRole('button', { name: 'Next: Battery runs out, 4 Jan' }),
      screen.getByRole('slider', { name: 'Time' }),
    ]);
    const dots = within(screen.getByRole('group', { name: 'Jump to a moment' })).getAllByRole('button');
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(STAND_MOMENTS.map((m) => m.label));
    for (const d of dots) expect(d.tabIndex).toBe(-1);
  });
});

describe('TimeBar: scrubbing and the plate', () => {
  it('lets the slider cover the strip and all its lanes, 47 px tall with the dates and 32 px without, its handle centred on the strip', () => {
    const { container } = showStandPeriod();
    const slider = screen.getByRole('slider', { name: 'Time' });
    const box = stripBox(container);
    expect(slider.parentElement).toBe(box);
    expect(heightPx(box)).toBe(47);
    expect(slider.classList.contains('time-range')).toBe(true);
    expect(slider.hasAttribute('data-lanes')).toBe(true);
    // 47 px with the lanes, its own track and handle kept to the top 32 px by padding under them, in WebKit and Firefox
    // alike; the radio band, the lowest lane, ends at the foot of the box.
    expect(lengthIn(rule('.time-range'), 'height')).toBe(32);
    expect(lengthIn(rule('.time-range[data-lanes]'), 'height')).toBe(47);
    expect(lengthIn(rule('.time-range[data-lanes]'), 'padding-bottom')).toBe(15);
    expect(lengthIn(rule('.time-range::-webkit-slider-runnable-track'), 'height')).toBe(32);
    expect(lengthIn(rule('.time-range::-moz-range-track'), 'height')).toBe(32);
    const contact = container.querySelector('[data-part="contact"]')!;
    expect(topPx(contact) + heightPx(contact)).toBe(47);
    // The handle's middle on the strip's, 9 + 14 / 2 = 16 px down: WebKit's by its margin, Firefox's in the middle of its track.
    const strip = container.querySelector('[data-part="track"] svg')!;
    const middle = topPx(strip) + 14 / 2;
    expect(strip.classList.contains('h-3.5')).toBe(true);
    const thumb = rule('.time-range::-webkit-slider-thumb');
    expect(lengthIn(thumb, 'margin-top') + lengthIn(thumb, 'height') / 2).toBe(middle);
    expect(lengthIn(rule('.time-range::-moz-range-track'), 'height') / 2).toBe(middle);
    cleanup();
    // Without the lanes, the slider is the box's 32 px.
    const plain = showPeriod(30, {});
    expect(stripBox(plain.container).getAttribute('class')).toBe('relative h-8');
    expect(screen.getByRole('slider', { name: 'Time' }).hasAttribute('data-lanes')).toBe(false);
  });

  it('shows the date and hour under a mouse on a plate above the track, and what the lanes say then, without moving the time', () => {
    const onCursor = vi.fn();
    const { container } = showStandPeriod({ onCursor });
    const slider = sizeSlider(719);
    expect(peekOf(container)).toBeNull();
    // Hour 263, the 11th at 23:00: the night, the lander off, Earth in view.
    fireEvent.pointerMove(slider, { clientX: 7 + 263, pointerType: 'mouse' });
    const plate = peekOf(container)!;
    expect([...plate.children].map((l) => l.textContent)).toEqual(['11 Jan, 23:00', 'night · lander off · Earth in view']);
    // In the key's own words and order: the Sun and the power back on the 20th with Earth still in view, so radio if
    // the lander survived the night.
    fireEvent.pointerMove(slider, { clientX: 7 + 500, pointerType: 'mouse' });
    expect([...plate.children].map((l) => l.textContent)).toEqual(['21 Jan, 20:00', 'in sunlight · Earth in view · radio, if the lander survives the cold']);
    fireEvent.pointerMove(slider, { clientX: 7 + 20, pointerType: 'mouse' });
    expect([...plate.children].map((l) => l.textContent)).toEqual(['1 Jan, 20:00', 'in sunlight']);
    // Above the track, taking no presses, and unread: the slider's own words say the hour.
    expect(plate.parentElement).toBe(slider.closest('[data-part="track"]'));
    for (const c of ['absolute', 'bottom-full', 'pointer-events-none']) expect(plate.classList.contains(c)).toBe(true);
    expect(plate.getAttribute('aria-hidden')).toBe('true');
    // A plate at 14 px, opaque, inside an edge that shows on the dark bar: no shadow, no blur.
    for (const c of ['text-[14px]', 'bg-surface', 'border', 'border-line-strong', 'rounded']) expect(plate.classList.contains(c)).toBe(true);
    // A preview: the time stays where it was.
    expect(onCursor).not.toHaveBeenCalled();
    // Gone when the pointer leaves the track, or is let go.
    fireEvent.pointerLeave(slider, { pointerType: 'mouse' });
    expect(peekOf(container)).toBeNull();
    fireEvent.pointerMove(slider, { clientX: 100, pointerType: 'mouse' });
    expect(peekOf(container)).not.toBeNull();
    fireEvent.pointerUp(slider, { pointerType: 'mouse' });
    expect(peekOf(container)).toBeNull();
  });

  it('shows the plate under a finger or a pen only while it is held down on the track', () => {
    for (const pointerType of ['touch', 'pen']) {
      const { container, unmount } = showStandPeriod();
      const slider = sizeSlider(719);
      fireEvent.pointerMove(slider, { clientX: 7 + 263, pointerType });
      expect(peekOf(container), pointerType).toBeNull();
      fireEvent.pointerDown(slider, { clientX: 7 + 263, pointerType });
      expect(peekOf(container)!.firstElementChild!.textContent).toBe('11 Jan, 23:00');
      fireEvent.pointerMove(slider, { clientX: 7 + 500, pointerType });
      expect(peekOf(container)!.firstElementChild!.textContent).toBe('21 Jan, 20:00');
      fireEvent.pointerUp(slider, { pointerType });
      expect(peekOf(container)).toBeNull();
      fireEvent.pointerMove(slider, { clientX: 7 + 263, pointerType });
      expect(peekOf(container)).toBeNull();
      unmount();
    }
  });

  it("names the moment on the plate over its dot's target, over the dot", () => {
    const { container } = showStandPeriod({ moments: STAND_MOMENTS });
    sizeSlider(719);
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Battery runs out, 4 Jan' }), { clientX: 80, pointerType: 'mouse' });
    const plate = peekOf(container)!;
    expect(plate.textContent).toBe('Battery runs out, 4 Jan');
    // At the dot's share of the track, drawn back by as much of its own width, so the dot is always under it.
    expect(parseFloat(plate.style.left)).toBeCloseTo((76 / 720) * 100, 6);
    expect(drawnBack(plate)).toBeCloseTo((76 / 720) * 100, 6);
  });

  it('keeps the plate inside the track at both ends, and the hour on the period, past the ends too', () => {
    const { container } = showStandPeriod();
    const slider = sizeSlider(719);
    const at = (clientX: number) => {
      fireEvent.pointerMove(slider, { clientX, pointerType: 'mouse' });
      const plate = peekOf(container)!;
      return { left: parseFloat(plate.style.left), back: drawnBack(plate), when: plate.firstElementChild!.textContent };
    };
    // At the start its left edge on the track's, at the end its right edge on the track's, in between drawn back by
    // its share of the track, so the pointer is always under it.
    expect(at(0)).toEqual({ left: 0, back: 0, when: '1 Jan, 00:00' });
    expect(at(733)).toEqual({ left: 100, back: 100, when: '30 Jan, 23:00' });
    expect(at(-50)).toEqual({ left: 0, back: 0, when: '1 Jan, 00:00' });
    expect(at(900)).toEqual({ left: 100, back: 100, when: '30 Jan, 23:00' });
    const middle = at(7 + 263);
    expect(middle.left).toBeCloseTo((270 / 733) * 100, 6);
    expect(middle.back).toBeCloseTo((270 / 733) * 100, 6);
  });

  it('tells the page the hour under the pointer as it moves, once for each hour, and null once it leaves', () => {
    const onHover = vi.fn();
    showStandPeriod({ moments: STAND_MOMENTS, onHover });
    const slider = sizeSlider(719);
    fireEvent.pointerMove(slider, { clientX: 7 + 263, pointerType: 'mouse' });
    fireEvent.pointerMove(slider, { clientX: 7 + 263.2, pointerType: 'mouse' });
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Earth in view, 10 Jan' }), { clientX: 300, pointerType: 'mouse' });
    fireEvent.pointerLeave(slider, { pointerType: 'mouse' });
    expect(onHover.mock.calls).toEqual([[263], [216], [null]]);
  });

  it('shows only the date and hour on the plate where the bar draws no lanes: on Explore, and when bare', () => {
    for (const extra of [{ dates: false, powered: null }, { bare: true }]) {
      const { container, unmount } = showStandPeriod(extra);
      fireEvent.pointerMove(sizeSlider(719), { clientX: 7 + 263, pointerType: 'mouse' });
      expect([...peekOf(container)!.children].map((l) => l.textContent)).toEqual(['11 Jan, 23:00']);
      unmount();
    }
  });
});

describe('TimeBar: bare', () => {
  it('keeps only Play, the date and hour, the track with its sunlight and handle, and the moments as dots when bare, for a clean view of the picture', () => {
    // The stand view's bar with every part it can carry: the night, the hours the lander is off, Earth on the second day, a moment.
    for (const compact of [true, false]) {
      const { container } = show(6, { dates: true, powered: power.powered, compact, moments: [{ label: 'Sunset 2 Jan', hour: 24 }], onMoment: vi.fn(), ifSurvivesFrom: 30, clockNote: ' (Earth time)', bare: true });
      expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
      expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
      expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
      // Play and the moment's dot are the buttons: no speed, no Next, no Key button.
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Play', 'Sunset 2 Jan']);
      // No sentence, no note, no keys, no lanes and no dates.
      expect(screen.queryByTestId('status')).toBeNull();
      expect(screen.queryByTestId('clock-note')).toBeNull();
      expect(container.querySelector('[data-part^="key"]')).toBeNull();
      expect(container.querySelector('[data-swatch]')).toBeNull();
      for (const part of ['off', 'earth', 'contact', 'next']) expect(container.querySelector(`[data-part="${part}"]`)).toBeNull();
      expect(screen.queryByTestId('dates')).toBeNull();
      expect(container.querySelector('[data-date]')).toBeNull();
      // Besides the date and hour the bar writes nothing: the dot's own words are for screen readers.
      expect(container.querySelector('[data-part="moment"] span')!.classList.contains('sr-only')).toBe(true);
      expect(screen.getByRole('region', { name: 'Time' }).textContent).toBe('Play1 Jan 2027, 06:00 UTCSunset 2 Jan');
      // With no lane under the strip its box keeps only the slider's own room, so the bar stays as low as it can; and with
      // nothing on the date's line but the date, Play stands beside both the date and the track, as it did before the speed.
      expect(stripBox(container).getAttribute('class')).toBe('relative h-8');
      expect(screen.getByRole('slider', { name: 'Time' }).hasAttribute('data-lanes')).toBe(false);
      const play = screen.getByRole('button', { name: 'Play' });
      for (const c of ['row-span-2', 'self-center', 'max-sm:row-span-1']) expect(play.classList.contains(c)).toBe(true);
      expect(container.querySelector('[data-part="line"]')!.classList.contains('min-h-10')).toBe(false);
      cleanup();
    }
  });

  it('keeps the moments as dots when bare, which move the time when pressed and name themselves on the plate, so a class can go from one to the next', () => {
    const onCursor = vi.fn();
    const onMoment = vi.fn();
    const { container } = showPeriod(30, { dates: true, moments: STAND_MOMENTS, compact: true, bare: true, onCursor, onMoment, cursor: 60 });
    expect(dotsOf(container).map((f) => f.getAttribute('aria-label'))).toEqual(STAND_MOMENTS.map((m) => m.label));
    fireEvent.click(screen.getByRole('button', { name: 'Earth in view, 10 Jan' }));
    expect(onCursor).toHaveBeenCalledWith(216);
    expect(onMoment).toHaveBeenCalledWith(STAND_MOMENTS[2]);
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Battery runs out, 4 Jan' }), { pointerType: 'mouse' });
    expect(peekOf(container)!.textContent).toBe('Battery runs out, 4 Jan');
  });

  it('still plays, and moves with the slider and its keys, when bare', () => {
    vi.useFakeTimers();
    const { onCursor } = show(10, { dates: true, powered: power.powered, compact: true, bare: true });
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement;
    // The slider still reads the hour in words, though the bar writes none of them.
    expect(slider.getAttribute('aria-valuetext')).toBe('1 Jan 2027, 10:00 UTC: Sun up, Earth behind a hill, battery 100 %');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(onCursor).toHaveBeenLastCalledWith(30);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(34);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(STEP));
    expect(onCursor).toHaveBeenLastCalledWith(12);
  });
});

describe('dotShifts', () => {
  it('leaves each dot on its hour while their targets, 24 px wide and centred on them, clear each other', () => {
    expect(dotShifts(STAND_MOMENTS, 720, 1000)).toEqual([0, 0, 0, 0]);
    expect(dotShifts([], 720, 358)).toEqual([]);
    // Exactly 24 px apart, the targets meet without covering each other.
    expect(dotShifts([{ label: 'a', hour: 100 }, { label: 'b', hour: 124 }], 720, 720)).toEqual([0, 0]);
  });

  it("moves two dots a day apart on a phone's 358 px track apart evenly about their middle, until their targets meet", () => {
    const at = STAND_MOMENTS.map((m) => (m.hour / 720) * 358);
    // 13 px apart, so each moves by half of the 11 px the two lack.
    const half = (24 - (at[1] - at[0])) / 2;
    expect(half).toBeCloseTo(5.5, 0);
    expect(dotShifts(STAND_MOMENTS, 720, 358)).toEqual([expect.closeTo(-half, 9), expect.closeTo(half, 9), 0, 0]);
  });

  it('spreads a run of close dots about the middle of their hours, and takes in the dot before when the run then reaches its target', () => {
    // On a track as wide as the period has hours: the dots at 130 and 140 px meet; spread about 135 px they reach back to
    // 111 px, over the target of the dot at 100 px (88 to 112 px), so all three spread about 123⅓ px, 24 px apart.
    const shifts = dotShifts(
      [
        { label: 'a', hour: 100 },
        { label: 'b', hour: 130 },
        { label: 'c', hour: 140 },
      ],
      720,
      720,
    );
    expect(shifts).toEqual([expect.closeTo(-2 / 3, 9), expect.closeTo(-20 / 3, 9), expect.closeTo(22 / 3, 9)]);
    // Two at one hour sit side by side about it.
    expect(dotShifts([{ label: 'a', hour: 300 }, { label: 'b', hour: 300 }], 720, 720)).toEqual([expect.closeTo(-12, 9), expect.closeTo(12, 9)]);
  });

  it('keeps the dots on the track at either end, moving the run inwards rather than past the end', () => {
    expect(dotShifts([{ label: 'a', hour: 0 }, { label: 'b', hour: 5 }], 720, 720)).toEqual([expect.closeTo(0, 9), expect.closeTo(19, 9)]);
    expect(dotShifts([{ label: 'a', hour: 715 }, { label: 'b', hour: 719 }], 720, 720)).toEqual([expect.closeTo(-19, 9), expect.closeTo(1, 9)]);
  });

  it('never lets two targets cover each other, nor a dot leave the track, whatever the hours', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 500; run++) {
      const hours = 24 * (7 + Math.floor(rand() * 84));
      const trackPx = 300 + Math.floor(rand() * 900);
      const moments = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({ label: 'm', hour: Math.floor(rand() * hours) })).sort((a, b) => a.hour - b.hour);
      const shifts = dotShifts(moments, hours, trackPx);
      const centres = moments.map((m, k) => (m.hour / hours) * trackPx + shifts[k]);
      for (let k = 1; k < centres.length; k++) expect(centres[k] - centres[k - 1]).toBeGreaterThanOrEqual(24 - 1e-9);
      expect(centres[0]).toBeGreaterThanOrEqual(-1e-9);
      expect(centres[centres.length - 1]).toBeLessThanOrEqual(trackPx + 1e-9);
    }
  });
});
