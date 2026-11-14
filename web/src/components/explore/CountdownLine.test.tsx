// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { visibleWords, WIDE } from '@/test/visible-words';
import { CountdownLine } from './CountdownLine';

function series(sun: number[], earth: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n).fill(3),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth),
    sunAu: new Float64Array(n).fill(1),
  };
}

// The Sun up for 30 hours, then set; Earth rises at hour 5 and stays in view to the end.
const s = series([...new Array<number>(30).fill(1), ...new Array<number>(20).fill(0)], [0, 0, 0, 0, 0, ...new Array<number>(45).fill(1)]);

describe('CountdownLine', () => {
  it('gives the time to the next sunset or sunrise and to Earth’s next rising or setting at the hour', () => {
    const { rerender } = render(<CountdownLine series={s} hour={0} />);
    const line = screen.getByTestId('countdown');
    expect(visibleWords(line, WIDE).join(' ')).toBe('Sunset in 1 d 6 h Earth rises in 5 h');
    rerender(<CountdownLine series={s} hour={10} />);
    expect(visibleWords(line, WIDE).join(' ')).toBe('Sunset in 20 h Earth in view to the end');
    rerender(<CountdownLine series={s} hour={30} />);
    expect(visibleWords(line, WIDE).join(' ')).toBe('No sunrise before the end Earth in view to the end');
  });

  it('keeps one width as the hour moves: each part stands over unseen copies of every form its words take in the period, drawn by the stylesheet', () => {
    render(<CountdownLine series={s} hour={0} />);
    const line = screen.getByTestId('countdown');
    expect(line.className).toMatch(/\btabular-nums\b/);
    const sun = line.querySelector<HTMLElement>('[data-part="countdown-sun"]')!;
    const sizers = [...sun.querySelectorAll<HTMLElement>('[data-form]')].map((el) => el.style.getPropertyValue('--sizer'));
    expect(sizers.sort()).toEqual(['"No sunrise before the end"', '"Sunset in 0 d 0 h"', '"Sunset in 0 d"', '"Sunset in 0 h"', '"Sunset in 00 h"'].sort());
    // The copies hold no words of their own: the page says each thing once.
    for (const el of sun.querySelectorAll<HTMLElement>('[data-form]')) {
      expect(el.textContent).toBe('');
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.className).toMatch(/\binvisible\b.*before:content-\[var\(--sizer\)\]/);
    }
  });
});
