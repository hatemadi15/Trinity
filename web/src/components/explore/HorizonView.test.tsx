// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByRole('img', { name: /^The horizon all round the site, with the paths of the Sun and Earth over these days/ })).toBeTruthy();
    expect(screen.getByText('The whole horizon around the site, from north through east, south and west. Over these days the Sun moves from right to left along its path.')).toBeTruthy();
    const words = [...document.querySelectorAll('[data-compass]')].map((e) => e.textContent);
    expect(words).toEqual(['north', 'east', 'south', 'west', 'north']);
  });

  it('says the Sun moves left to right for a site north of the equator, where it passes through the south', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={18.56} />);
    expect(screen.getByText('The whole horizon around the site, from north through east, south and west. Over these days the Sun moves from left to right along its path.')).toBeTruthy();
  });

  it('has a key, and a height scale: the horizon at 0° and the top whole degree', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    const key = screen.getByRole('list', { name: 'Key' });
    expect([...key.querySelectorAll('li')].map((li) => li.textContent)).toEqual(["the Sun's path", "Earth's path", 'dotted while hidden', 'the hills all round']);
    // Earth at 4° is the highest thing drawn: the picture reaches 5°, and its top whole degree is 4°.
    expect(screen.getByText('horizon (0°)')).toBeTruthy();
    expect(screen.getByText('4°')).toBeTruthy();
  });

  it('keeps the top degree and its words well inside the picture, and is taller on a phone', () => {
    const high: Series = { ...series, earthEl: Float64Array.from({ length: n }, (_, h) => -5 + h * 0.45) };
    render(<HorizonView mask={new Float64Array(720)} series={high} cursor={10} lat={-88.28} />);
    // Earth climbs from -5° to 16.2°: the picture spans -6° to 17.2°, and its top words sit below its top tenth.
    const top = screen.getByText('13°');
    expect(parseFloat(top.style.top)).toBeGreaterThanOrEqual(10);
    const picture = screen.getByRole('img', { name: /^The horizon all round the site/ });
    expect(picture.className).toMatch(/\baspect-\[2\/1\]/);
    expect(picture.className).toMatch(/\bsm:aspect-\[1000\/240\]/);
  });

  it('sets the words of a line near the bottom above it, and of a line near the top below it', () => {
    const day: Series = { ...series, sunEl: Float64Array.from({ length: n }, (_, h) => h * 1.5), earthEl: new Float64Array(n).fill(27) };
    render(<HorizonView mask={new Float64Array(720)} series={day} cursor={10} lat={18.56} />);
    expect(screen.getByText('horizon (0°)').style.transform).toBe('translateY(-100%)');
  });

  it('marks where the Sun and Earth are at the hour of the time bar', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} lat={-88.28} />);
    const sun = document.querySelector<HTMLElement>('[data-marker="sun"]')!;
    const earth = document.querySelector<HTMLElement>('[data-marker="earth"]')!;
    expect(parseFloat(sun.style.left)).toBeCloseTo(((270 - 5) / 360) * 100, 6);
    expect(parseFloat(earth.style.left)).toBeCloseTo((18 / 360) * 100, 6);
  });
});
