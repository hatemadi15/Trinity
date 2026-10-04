// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEAT_STOPS } from '@/lib/sky/arrivalTiming';
import { arrivalWords } from '@/lib/viz/arrival';
import { Arrival } from './Arrival';
import type { StageProps } from './ArrivalCanvas';

// The live stage needs WebGL: these tests hand the section a stand-in.
vi.mock('./ArrivalCanvas', () => ({ default: () => null }));
const words = arrivalWords();
const plain = (t: string) => t.replace(/ /g, ' ');
let stage: StageProps | null = null;
const Stage = (p: StageProps) => {
  stage = p;
  return null;
};
/** As if the page were scrolled `screens` screens into the arrival. */
function scrolled(screens: number) {
  const section = document.querySelector('[data-arrival]') as HTMLElement;
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: -screens * window.innerHeight } as DOMRect);
  fireEvent.scroll(window);
}

describe('the arrival', () => {
  beforeEach(() => {
    stage = null;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as { matchMedia?: unknown }).matchMedia;
    window.history.replaceState(null, '', '/');
  });

  it('reads in order without the pictures: the headline, the three beats, then the answer for the site and its two actions', () => {
    const { container } = render(<Arrival words={words} Stage={Stage} />);
    const text = plain(container.textContent ?? '');
    const order = ['See when a Moon lander has sunlight and a signal.', ...words.beats, plain(words.siteLine), plain(words.answer), 'Open the full forecast', 'Choose a landing site'];
    let at = -1;
    for (const part of order) {
      const k = text.indexOf(part, at + 1);
      expect(k, part).toBeGreaterThan(at);
      at = k;
    }
    // The challenge's landers (NASA's CLPS), named in plain words on the first screen: who it is for.
    expect(screen.getByText("For planners of NASA's commercial Moon landers, educators and anyone curious.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the full forecast' }).getAttribute('href')).toBe(words.exploreHref);
    expect(screen.getByRole('link', { name: 'Choose a landing site' }).getAttribute('href')).toBe('/sites');
    // The headline keeps its spans of days and hours on one line with no-break spaces, as the stand view's does.
    expect(screen.getByRole('heading', { level: 2, name: words.answer })).toBeTruthy();
  });

  it('fades each beat’s words as they near the top, so they never pass over the date’s bar there; the first screen and the answer stay', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const plates = [...document.querySelectorAll<HTMLElement>('[data-plate]')];
    expect(plates).toHaveLength(words.beats.length);
    vi.spyOn(plates[0], 'getBoundingClientRect').mockReturnValue({ top: 400 } as DOMRect);
    vi.spyOn(plates[1], 'getBoundingClientRect').mockReturnValue({ top: 104 } as DOMRect);
    vi.spyOn(plates[2], 'getBoundingClientRect').mockReturnValue({ top: 40 } as DOMRect);
    scrolled(1.5);
    expect(plates[0].style.opacity).toBe('1');
    expect(Number(plates[1].style.opacity)).toBeGreaterThan(0.2);
    expect(Number(plates[1].style.opacity)).toBeLessThan(0.8);
    expect(plates[2].style.opacity).toBe('0');
    // The headline and the answer rest at the top: they are not beats' plates.
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-plate]')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: words.answer }).closest('[data-plate]')).toBeNull();
  });

  it('follows the scroll: each screen is its beat’s stop, and Skip shows only between the first screen and the last', () => {
    render(<Arrival words={words} Stage={Stage} />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    scrolled(2);
    expect(stage!.progress.current).toBeCloseTo(BEAT_STOPS[2], 6);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    // Skip lands on the last screen, the answer after the month at the site.
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 6 * window.innerHeight - 2 * window.innerHeight, behavior: 'instant' });
    scrolled(6);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('plays the flight from Fly to the south pole, and stops the moment the visitor scrolls', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Fly to the south pole' }));
    act(() => vi.advanceTimersByTime(2000));
    const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(10);
    fireEvent.wheel(window);
    act(() => vi.advanceTimersByTime(5000));
    expect((window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    // Still a link without the script.
    expect(screen.getByRole('link', { name: 'Fly to the south pole' }).getAttribute('href')).toBe('/sites');
  });

  it('hands the answer the focus when the flight it plays reaches the site, as Skip does', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Fly to the south pole' }));
    act(() => vi.advanceTimersByTime(22000));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: words.answer }));
  });

  it('with reduced motion lands at once and holds the flight on the beats', () => {
    // jsdom has no matchMedia: this one says the system asks for reduced motion.
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(1.4);
    expect(stage!.progress.current).toBe(BEAT_STOPS[1]);
    expect(stage!.reduced).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Fly to the south pole' }));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('holds the flight where ?arrival= says, words left out with &bare=1, hydrating the server’s page without a mismatch', async () => {
    // The server renders without the address's query (it builds the page once, for every visitor).
    window.history.replaceState(null, '', '/');
    const html = renderToString(<Arrival words={words} Stage={Stage} />);
    window.history.replaceState(null, '', '/?arrival=2&bare=1');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, <Arrival words={words} Stage={Stage} />);
    });
    expect(errors.mock.calls.filter((c) => String(c[0]).includes('hydrat'))).toEqual([]);
    errors.mockRestore();
    expect(stage!.progress.current).toBe(2);
    expect(stage!.capture).toBe(true);
    expect(container.querySelector('[data-beat="0"]')!.closest('[hidden]')).not.toBeNull();
    container.remove();
  });

  it('shows the stills when the live view cannot draw, beat by beat', () => {
    const { container } = render(<Arrival words={words} Stage={Stage} />);
    act(() => stage!.onFail('WebGL 2 is not available'));
    scrolled(3);
    const shown = [...container.querySelectorAll('[data-still]')].filter((n) => n.getAttribute('data-shown') === '1');
    expect(shown.map((n) => n.getAttribute('data-still'))).toEqual(['3']);
    expect(shown[0].querySelector('img')!.getAttribute('src')).toBe('/arrival/beat-3-wide.jpg');
  });
});
