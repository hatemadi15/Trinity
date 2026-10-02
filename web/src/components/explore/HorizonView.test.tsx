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
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} />);
    expect(screen.getByRole('img', { name: /^The horizon all round the site, with the paths of the Sun and Earth over these days/ })).toBeTruthy();
    expect(screen.getByText('The whole horizon around the site, from north through east, south and west. Over these days the Sun moves from right to left along its path.')).toBeTruthy();
    const words = [...document.querySelectorAll('[data-compass]')].map((e) => e.textContent);
    expect(words).toEqual(['north', 'east', 'south', 'west', 'north']);
  });

  it('marks where the Sun and Earth are at the hour of the time bar', () => {
    render(<HorizonView mask={new Float64Array(720)} series={series} cursor={10} />);
    const sun = document.querySelector<HTMLElement>('[data-marker="sun"]')!;
    const earth = document.querySelector<HTMLElement>('[data-marker="earth"]')!;
    expect(parseFloat(sun.style.left)).toBeCloseTo(((270 - 5) / 360) * 100, 6);
    expect(parseFloat(earth.style.left)).toBeCloseTo((18 / 360) * 100, 6);
  });
});
