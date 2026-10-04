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
    const order = ['See when a Moon lander has sunlight and a signal.', ...words.beats, plain(words.siteLine), plain(words.answer), 'Explore this site', 'Choose a landing site'];
    let at = -1;
    for (const part of order) {
      const k = text.indexOf(part, at + 1);
      expect(k, part).toBeGreaterThan(at);
      at = k;
    }
    expect(screen.getByRole('link', { name: 'Explore this site' }).getAttribute('href')).toBe(words.exploreHref);
    expect(screen.getByRole('link', { name: 'Choose a landing site' }).getAttribute('href')).toBe('/sites');
    // The headline keeps its spans of days and hours on one line with no-break spaces, as the stand view's does.
    expect(screen.getByRole('heading', { level: 2, name: words.answer })).toBeTruthy();
  });

  it('follows the scroll: each screen is its beat’s stop, and Skip shows only between the first screen and the last', () => {
    render(<Arrival words={words} Stage={Stage} />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    scrolled(2);
    expect(stage!.progress.current).toBeCloseTo(BEAT_STOPS[2], 6);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 4 * window.innerHeight - 2 * window.innerHeight, behavior: 'instant' });
    scrolled(4);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('plays the flight from Explore a landing site, and stops the moment the visitor scrolls', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Explore a landing site' }));
    act(() => vi.advanceTimersByTime(2000));
    const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(10);
    fireEvent.wheel(window);
    act(() => vi.advanceTimersByTime(5000));
    expect((window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    // Still a link without the script.
    expect(screen.getByRole('link', { name: 'Explore a landing site' }).getAttribute('href')).toBe('/sites');
  });

  it('hands the answer the focus when the flight it plays reaches the site, as Skip does', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Explore a landing site' }));
    act(() => vi.advanceTimersByTime(16000));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: words.answer }));
  });

  it('with reduced motion lands at once and holds the flight on the beats', () => {
    // jsdom has no matchMedia: this one says the system asks for reduced motion.
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(1.4);
    expect(stage!.progress.current).toBe(BEAT_STOPS[1]);
    expect(stage!.reduced).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Explore a landing site' }));
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
