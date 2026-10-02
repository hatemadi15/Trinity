// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { HorizonView } from './HorizonView';

const n = 48;
const series: Series = {
  i0: 0,
  hours: n,
  sunAz: Float64Array.from({ length: n }, (_, h) => 270 - h * 0.5),
  sunEl: new Float64Array(n).fill(2),
  earthAz: new Float64Array(n).fill(18),
  earthEl: new Float64Array(n).fill(4),
  sunFraction: new Float64Array(n).fill(1),
  earthVisible: new Uint8Array(n).fill(1),
  sunAu: new Float64Array(n).fill(1),
};

describe('HorizonView', () => {
  it('shows the horizon all round with the paths of the Sun and Earth, and says how to read it', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    expect(screen.getByRole('img', { name: /^The view all round the site: the hills, and the paths of the Sun and Earth over these days/ })).toBeTruthy();
    expect(screen.getByText(/^The view all round the site, from north through east, south and west\. From here the Sun goes once round the sky in a month, passing through the north at both ends of the picture, so it moves from right to left\. Earth stays in one part of the sky and only wobbles\./)).toBeTruthy();
    const words = [...document.querySelectorAll('[data-compass]')].map((e) => e.textContent);
    expect(words).toEqual(['north', 'east', 'south', 'west', 'north']);
  });

  it('says the Sun moves left to right for a site north of the equator, where it passes through the south', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={18.56} />);
    expect(screen.getByText(/From here the Sun rises in the east, passes through the south and sets in the west, so it moves from left to right\./)).toBeTruthy();
  });

  it('has a key, and a height scale: the horizon at 0° and the top whole degree', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    const key = screen.getByRole('list', { name: 'Key' });
    expect([...key.querySelectorAll('li')].map((li) => li.textContent)).toEqual(["the Sun's path", "Earth's path", 'dotted while hidden', 'the hills all round', "the Sun and Earth at the time bar's hour"]);
    // Earth at 4° is the highest thing drawn: the picture reaches 5°, and its top whole degree is 4°.
    expect(screen.getByText('horizon (0°)')).toBeTruthy();
    expect(screen.getByText('4°')).toBeTruthy();
  });

  it('keeps the top degree and its words well inside the picture', () => {
    const high: Series = { ...series, earthEl: Float64Array.from({ length: n }, (_, h) => -5 + h * 0.45) };
    render(<HorizonView mask={new Float64Array(720)} series={high} cursor={10} lat={-88.28} />);
    // Earth climbs from -5° to 16.2°: the picture spans -6° to 17.2°, and its top words sit below its top tenth.
    // The gridline is a round number: 10°, not the odd 13° just below the top.
    const top = screen.getByText('10°');
    expect(parseFloat(top.style.top)).toBeGreaterThanOrEqual(10);
  });

  it('is taller for its width on a phone, where 360° in a few hundred pixels would flatten the hills, and says how much it stretches them there', () => {
    const watchers: ((entries: { contentRect: { width: number } }[]) => void)[] = [];
    class FakeObserver {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        watchers.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    try {
      render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
      const picture = screen.getByRole('img', { name: /^The view all round the site/ });
      expect(picture.style.height).toBe('240px');
      act(() => watchers.forEach((cb) => cb([{ contentRect: { width: 350 } }])));
      expect(picture.style.height).toBe('170px');
      // 170 px for 6° up, 350 px for 360° across: about 29 times.
      expect(screen.getByText(/Heights are stretched about 29 times\./)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sets the words of a line near the bottom above it, and of a line near the top below it', () => {
    const day: Series = { ...series, sunEl: Float64Array.from({ length: n }, (_, h) => h * 1.5), earthEl: new Float64Array(n).fill(27) };
    render(<HorizonView mask={new Float64Array(720)} series={day} cursor={10} lat={18.56} />);
    expect(screen.getByText('horizon (0°)').style.transform).toBe('translateY(-100%)');
  });

  it('says across the top that left to right is direction, not time, and dates the start and end of the Sun\'s path', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} startUtc="2027-01-01T00:00:00" />);
    expect(screen.getByText('Left to right is the direction from the site, not time.')).toBeTruthy();
    expect(document.querySelector('[data-path-date="start"]')!.textContent).toBe('1 Jan');
    expect(document.querySelector('[data-path-date="end"]')!.textContent).toBe('2 Jan');
  });

  it('draws Earth over the Sun, so its small loop stays visible where the paths cross', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    const lines = [...document.querySelectorAll('polyline')];
    expect(lines[lines.length - 1].getAttribute('stroke')).toBe('var(--stage-earth)');
  });

  it('says how much the heights are stretched', () => {
    // A picture from -1° to 5°, 1000 by 240: 40 px per degree up, 2.8 px per degree across, about 14 times.
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    expect(screen.getByText(/Heights are stretched about 14 times\./)).toBeTruthy();
  });

  it('marks where the Sun and Earth are at the hour of the time bar', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    const sun = document.querySelector<HTMLElement>('[data-marker="sun"]')!;
    const earth = document.querySelector<HTMLElement>('[data-marker="earth"]')!;
    expect(parseFloat(sun.style.left)).toBeCloseTo(((270 - 5) / 360) * 100, 6);
    expect(parseFloat(earth.style.left)).toBeCloseTo((18 / 360) * 100, 6);
  });
});
