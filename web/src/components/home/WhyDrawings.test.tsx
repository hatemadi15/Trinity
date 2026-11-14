// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { whyDrawings } from '@/lib/viz/why';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from './WhyDrawings';

const d = whyDrawings();
const words = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-label]')].map((l) => l.textContent);
const all = () => [<SunNeverClimbs key="a" d={d.sun} />, <HillsDecide key="b" d={d.hills} />, <EarthSetsToo key="c" d={d.earth} />];

/** jsdom has no matchMedia: this one says the system asks for reduced motion. */
function reducedMotion() {
  const before = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  onTestFinished(() => {
    window.matchMedia = before;
  });
}

afterEach(() => vi.useRealTimers());

describe('the drawings of why the south pole is hard', () => {
  it('writes every word as page text of 14 px or more, so it stays readable when a drawing is small', () => {
    for (const drawing of all()) {
      const { container, unmount } = render(drawing);
      expect(container.querySelectorAll('svg text')).toHaveLength(0);
      const labels = [...container.querySelectorAll<HTMLElement>('[data-label]')];
      expect(labels.length).toBeGreaterThanOrEqual(8);
      for (const l of labels) expect(parseFloat(l.style.fontSize), l.textContent ?? '').toBeGreaterThanOrEqual(14);
      for (const el of container.querySelectorAll<HTMLElement>('*')) {
        const size = el.className.toString().match(/text-\[(\d+)px\]/);
        if (size) expect(Number(size[1]), el.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(14);
      }
      unmount();
    }
  });

  it('gives each drawing a text alternative that says what it shows, in the month’s own figures, and a line of what to notice', () => {
    for (const [drawing, data] of [
      [<SunNeverClimbs key="a" d={d.sun} />, d.sun],
      [<HillsDecide key="b" d={d.hills} />, d.hills],
      [<EarthSetsToo key="c" d={d.earth} />, d.earth],
    ] as const) {
      const { container, unmount } = render(drawing);
      const img = within(container).getByRole('img');
      expect(img.getAttribute('aria-label')).toBe(data.alt);
      expect(container.querySelector('figcaption')!.textContent!.startsWith(data.notice)).toBe(true);
      unmount();
    }
    expect(d.sun.alt).toMatch(/never stands higher than 2\.5°/);
    expect(d.hills.alt).toMatch(/sets behind the hills for 16 days 15 hours in a row/);
    expect(d.hills.alt).toMatch(/sunlit all month/);
    expect(d.earth.alt).toMatch(/in view for radio, 45\u00a0% of the month/);
  });

  it('labels the axes in degrees and by direction, and names what is in each drawing where it stands', () => {
    const sun = words(render(<SunNeverClimbs d={d.sun} />).container);
    expect(sun[0]).toBe("The Sun's path over one month");
    for (const w of ['4°', '2°', '0°', '−2°', 'N', 'E', 'S', 'W', 'direction from the site', 'horizon', 'highest 2.5°, 1 Jan', '8 Jan', '15 Jan', '22 Jan', '29 Jan']) expect(sun, w).toContain(w);
    expect(sun).toContain('Apollo 15, 26°: up to about 64° ↑');
    const hills = words(render(<HillsDecide d={d.hills} />).container);
    expect(hills[0]).toBe('The same month, 12 km apart');
    expect(hills).toContain('de Gerlache Rim 2: sunlit 45\u00a0% of the month');
    expect(hills).toContain("The rim's summit, 12 km away: sunlit all month");
    expect(hills).toContain('Sun set behind the hills, 3 Jan to 20 Jan');
    const earth = words(render(<EarthSetsToo d={d.earth} />).container);
    expect(earth[0]).toBe('Earth stays in one direction');
    for (const w of ['Earth in view: 45\u00a0% of the month', 'Earth set behind the hills', 'hills', '5°', '0°', '−5°', 'direction from north']) expect(earth, w).toContain(w);
  });

  it('shades the hours the hills hide the Sun at the ridge, and none at the summit', () => {
    const { container } = render(<HillsDecide d={d.hills} />);
    expect(container.querySelectorAll('[data-panel="site"] [data-hidden]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-panel="summit"] [data-hidden]')).toHaveLength(0);
  });

  it('plays from its button, by keyboard as by pointer: a marker runs along the month with the date, then stops on its last day', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { container } = render(<HillsDecide d={d.hills} />);
    expect(container.querySelector('[data-marker]')).toBeNull();
    const play = screen.getByRole('button', { name: 'Play the month' });
    expect(play.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(play);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
    // Both skylines show the same hour.
    expect(container.querySelectorAll('[data-marker]')).toHaveLength(2);
    const date = words(container).find((w) => /^\d+ Jan$/.test(w ?? ''));
    expect(date).toBeTruthy();
    expect(date).not.toBe('1 Jan');
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    expect(words(container)).toContain('30 Jan');
  });

  it('with reduced motion shows the month’s last hour, still, and offers nothing to play', () => {
    reducedMotion();
    for (const drawing of all()) {
      const { container, unmount } = render(drawing);
      expect(screen.queryByRole('button', { name: /Play/ })).toBeNull();
      expect(container.querySelector('[data-marker]')).not.toBeNull();
      expect(words(container)).toContain('30 Jan');
      unmount();
    }
  });
});
