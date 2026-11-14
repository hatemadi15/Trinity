// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { BEAT_STOPS, LANDED } from '@/lib/sky/arrivalTiming';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { arrivalWords } from '@/lib/viz/arrival';
import { Arrival } from './Arrival';
import { runControl } from '@/lib/luna/controls';
import type { StageProps } from './ArrivalCanvas';

// The live stage needs WebGL: these tests hand the section a stand-in.
vi.mock('./ArrivalCanvas', () => ({ default: () => null }));
const words = arrivalWords();
const CAP = 100;
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
    expect(screen.getByText(/^For planners of NASA's commercial Moon landers, teachers/).textContent).toBe("For planners of NASA's commercial Moon landers, teachers (start with How it works) and anyone curious.");
    expect(screen.getByRole('link', { name: 'Open the full forecast' }).getAttribute('href')).toBe(words.exploreHref);
    expect(screen.getByRole('link', { name: 'Choose a landing site' }).getAttribute('href')).toBe('/sites');
    // The headline keeps its spans of days and hours on one line with no-break spaces, as the stand view's does.
    expect(screen.getByRole('heading', { level: 2, name: words.answer })).toBeTruthy();
  });

  it("names NASA's data and the check on the first screen, for a wider screen only", () => {
    render(<Arrival words={words} Stage={Stage} />);
    const proof = screen.getByText(/^Built on NASA LRO LOLA terrain and JPL DE440;/);
    expect(proof.textContent).toBe("Built on NASA LRO LOLA terrain and JPL DE440; checked against JPL Horizons to 0.00003° and LOLA sunlight maps. See the checks");
    const link = within(proof).getByRole('link', { name: 'See the checks' });
    expect(link.getAttribute('href')).toBe('/validate');
    expect(link.className).toMatch(/(^| )underline( |$)/);
    // On a phone the first screen stays short: like the first sentence, this line waits for a wider screen.
    expect(proof.className).toMatch(/\bmax-sm:hidden\b/);
    // 15 to 16 px in the intro's colour, and among the first screen's words, so the stage's labels keep clear of it.
    expect(proof.className).toMatch(/(^| )text-(base|\[1[56]px\])( |$)/);
    expect(proof.className).toContain('text-[#c6c5c0]');
    expect(proof.hasAttribute('data-words')).toBe(true);
    // Under the intro paragraph and above the actions.
    const intro = screen.getByText(/^Earthrise is a forecast for Moon landing sites and dates/).closest('p')!;
    const actions = screen.getByRole('link', { name: 'Fly to the south pole' }).parentElement!;
    expect(intro.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proof.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the second action for the section it jumps to, so only the link to /learn says how it works', () => {
    render(<Arrival words={words} Stage={Stage} />);
    // The three drawings of why the pole is hard, on the home page itself.
    expect(screen.getByRole('link', { name: 'See why the pole is hard' }).getAttribute('href')).toBe('#why');
    // The old name read as a twin of the link two lines below it, which goes to a page of its own.
    expect(screen.queryByRole('link', { name: /see how it works/i })).toBeNull();
    expect(screen.getAllByRole('link', { name: /how it works/i }).map((a) => a.getAttribute('href'))).toEqual(['/learn']);
  });

  /** The beats' plates, each with its beat's screen, before landing and once landed (the date bar shows then). */
  const platesOf = () => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-plate]')].map((plate) => {
      const beat = plate.closest<HTMLElement>('[data-beat]')!;
      return { plate, beat, landed: BEAT_STOPS[Number(beat.dataset.beat)] > LANDED };
    });
    expect(all).toHaveLength(words.beats.length);
    return { before: all.filter((p) => !p.landed), landed: all.filter((p) => p.landed) };
  };
  /** A plate `top` px from the window's top, its beat's screen `beatTop` px (0 at the beat's stop). */
  const placed = ({ plate, beat }: { plate: HTMLElement; beat: HTMLElement }, top: number, beatTop: number) => {
    vi.spyOn(plate, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
    vi.spyOn(beat, 'getBoundingClientRect').mockReturnValue({ top: beatTop } as DOMRect);
  };

  it('fades the words of the beats under the date bar as they near it, gone by its foot, so the bar never gives way to them; the first screen and the answer stay', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const { landed } = platesOf();
    // Standing, and the month at the site.
    expect(landed).toHaveLength(2);
    // The bar runs from 16 px to about 160 px: on a tall window a plate is whole from 256 px, gone at 160 (both
    // readers, part C read 1).
    placed(landed[0], 400, 0);
    placed(landed[1], 208, -192);
    scrolled(4.5);
    expect(landed[0].plate.style.opacity).toBe('1');
    expect(Number(landed[1].plate.style.opacity)).toBeCloseTo(0.5, 2);
    placed(landed[1], 160, -240);
    scrolled(4.6);
    expect(landed[1].plate.style.opacity).toBe('0');
    // The headline and the answer rest at the top: they are not beats' plates.
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-plate]')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: words.answer }).closest('[data-plate]')).toBeNull();
  });

  it('keeps each beat’s words whole at its own stop on a short window, as on a laptop at 150 % (960 × 530), and fades them from there', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const { landed } = platesOf();
    // At its stop the plate rests 200 px down, just under the bar: whole there, not part gone.
    placed(landed[0], 200, 0);
    scrolled(4);
    expect(landed[0].plate.style.opacity).toBe('1');
    // Then it fades over what is left above it, gone at the bar's foot.
    placed(landed[0], 180, -20);
    scrolled(4.04);
    expect(Number(landed[0].plate.style.opacity)).toBeCloseTo(0.5, 2);
    placed(landed[0], 160, -40);
    scrolled(4.08);
    expect(landed[0].plate.style.opacity).toBe('0');
  });

  it('fades the words of the beats before landing only at the top, where no bar stands yet', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const { before } = platesOf();
    // The pole, the cap and the landing.
    expect(before).toHaveLength(3);
    // Whole from 136 px, gone at 72.
    placed(before[0], 400, 0);
    placed(before[1], 104, -296);
    placed(before[2], 72, -328);
    scrolled(2);
    expect(before[0].plate.style.opacity).toBe('1');
    expect(Number(before[1].plate.style.opacity)).toBeCloseTo(0.5, 2);
    expect(before[2].plate.style.opacity).toBe('0');
  });

  it('centres the words of the beats under the date bar in the room under it on a wide screen, and at the foot on a phone', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const { before, landed } = platesOf();
    for (const { beat } of landed) {
      expect(beat.className).toMatch(/(^| )sm:pt-\[176px\]( |$)/);
      expect(beat.className).toMatch(/(^| )sm:items-center-safe( |$)/);
      expect(beat.className).toMatch(/(^| )items-end pb-24( |$)/);
    }
    for (const { beat } of before) expect(beat.className).toMatch(/(^| )sm:items-center( |$)/);
  });

  it('keeps each beat’s words in a column that ends short of the middle on a wide screen, so the lander stands clear of it', () => {
    render(<Arrival words={words} Stage={Stage} />);
    for (const plate of document.querySelectorAll<HTMLElement>('[data-plate]')) expect(plate.className).toMatch(/sm:max-w-\[min\(600px,46vw\)\]/);
    // The answer's card in the same column, its left edge where the beats' cards have theirs.
    const answer = screen.getByRole('heading', { level: 2, name: words.answer }).closest('[data-words]')!.parentElement!;
    expect(answer.className).toMatch(/(^| )wrap( |$)/);
  });

  it('measures a screen by its stage’s height, not the window’s, which grows as a phone’s address bar hides', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const section = document.querySelector('[data-arrival]') as HTMLElement;
    // Seven screens of 700 px (100svh) in a window now 800 px tall: two screens in is beat 2, and Skip lands on the last.
    vi.spyOn(section, 'offsetHeight', 'get').mockReturnValue(7 * 700);
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: -2 * 700 } as DOMRect);
    const was = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    try {
      fireEvent.scroll(window);
      expect(stage!.progress.current).toBeCloseTo(BEAT_STOPS[2], 6);
      fireEvent.click(screen.getByRole('button', { name: 'Skip to the answer' }));
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: window.scrollY - 2 * 700 + 6 * 700, behavior: 'instant' });
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: was, configurable: true });
    }
  });

  it('starts the answer’s card under the date bar at every width, so the date and the sky stay in view (teacher, read 6)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const last = document.querySelector(`[data-beat="${BEAT_STOPS.length - 1}"]`)!;
    // The beats' column is centred with the page, so its card always reaches under the centred date bar.
    expect(last.className).toMatch(/\bpt-\[168px\]/);
    expect(last.className).not.toMatch(/:pt-/);
  });

  it('keeps the phone’s first screen short, so the Moon shows under the words: the product sentence stays, the proof line and the scroll hint wait for a wider screen (spec 18.2, 20.1)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    // The sentence that repeats the flight's first lines is gone, not hidden.
    expect(document.body.textContent).not.toMatch(/one hill can keep them out of sight for weeks/);
    const product = screen.getByText(/^Earthrise is a forecast for Moon landing sites and dates, 2024 to 2036: sunlight, radio contact with Earth and how long a lander keeps power, for ready-made landers or your own\.$/);
    expect(product.className).not.toMatch(/\bmax-sm:hidden\b/);
    expect(screen.getByText(/^Scroll to fly down/).className).toMatch(/\bmax-sm:hidden\b/);
  });

  it('keeps the first screen to 100 words, at 1440 and on a phone (spec 20.1)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const first = document.querySelector('[data-beat="0"]')!;
    for (const width of [WIDE, PHONE]) expect(visibleWords(first, width).length).toBeLessThanOrEqual(CAP);
  });

  it('keeps the page when the stage fails to load: the headline and the first still stay', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      throw new Error('chunk failed');
    };
    render(<Arrival words={words} Stage={Broken as unknown as ComponentType<StageProps>} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See when a Moon lander has sunlight and a signal.');
    const first = document.querySelector('[data-still="0"]')!;
    expect(first.getAttribute('data-shown')).toBe('1');
    quiet.mockRestore();
  });

  it('on a phone keeps Skip under the date bar once landed, and at the top right before (the final review)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(2);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).toMatch(/\bmax-sm:top-4\b/);
    scrolled(4);
    const skip = screen.getByRole('button', { name: 'Skip to the answer' });
    expect(skip.className).toContain('max-sm:top-[160px]');
    expect(skip.className).not.toMatch(/\bmax-sm:top-4\b/);
  });

  it('names Skip for where it goes: the long form to a screen reader at every width, to the eye from 640 px, and a short word below (both readers, spec 19.4)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(2);
    const skip = screen.getByRole('button', { name: 'Skip to the answer' });
    // The label is the name a screen reader reads at every width, so the two words are for the eye alone: one shows per
    // width (display: none), as the stand view's watch lead does.
    expect(skip.getAttribute('aria-label')).toBe('Skip to the answer');
    const wide = screen.getByText('Skip to the answer'), phone = screen.getByText('Skip');
    expect(wide.className).toBe('max-sm:hidden');
    expect(phone.className).toBe('sm:hidden');
    for (const word of [wide, phone]) expect(word.getAttribute('aria-hidden')).toBe('true');
    // Not a plate: the section fades every plate as it scrolls up, and Skip stays whole while the flight moves.
    expect(skip.hasAttribute('data-plate')).toBe(false);
  });

  it('follows the scroll: each screen is its beat’s stop, and Skip shows only between the first screen and the last', () => {
    render(<Arrival words={words} Stage={Stage} />);
    expect(screen.queryByRole('button', { name: 'Skip to the answer' })).toBeNull();
    // On a phone Skip waits until the first screen has scrolled away whole, so it never covers its words (read D2-2 and
    // read D3: at three quarters of a screen the intro's last lines were still under it; spec 18.3).
    scrolled(0.3);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).toMatch(/\bmax-sm:hidden\b/);
    scrolled(0.75);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).toMatch(/\bmax-sm:hidden\b/);
    scrolled(1);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).not.toMatch(/\bmax-sm:hidden\b/);
    scrolled(2);
    expect(stage!.progress.current).toBeCloseTo(BEAT_STOPS[2], 6);
    // On a phone Skip sits at the top right, clear of the beats' cards at the foot of the screen (read D2: 13, 17).
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).toMatch(/\bmax-sm:top-4\b/);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).toMatch(/\bmax-sm:bottom-auto\b/);
    expect(screen.getByRole('button', { name: 'Skip to the answer' }).className).not.toMatch(/\bmax-sm:hidden\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the answer' }));
    // Skip lands on the last screen, the answer after the month at the site.
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 6 * window.innerHeight - 2 * window.innerHeight, behavior: 'instant' });
    scrolled(6);
    expect(screen.queryByRole('button', { name: 'Skip to the answer' })).toBeNull();
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

  it('lends Luna the flight, which plays as Fly to the south pole does (spec 22)', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    const view = render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    act(() => {
      expect(runControl('fly').ok).toBe(true);
    });
    act(() => vi.advanceTimersByTime(2000));
    expect((window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(10);
    view.unmount();
    expect(runControl('fly').ok).toBe(false);
  });

  it('stops playing when the page scrolls by any other hand: the scrollbar dragged, autoscroll, a link to a section', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Fly to the south pole' }));
    act(() => vi.advanceTimersByTime(1000));
    const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(5);
    // The scrollbar dragged far from where the flight last put the page: no wheel, touch or key.
    const was = window.scrollY;
    Object.defineProperty(window, 'scrollY', { value: 12345, configurable: true });
    try {
      fireEvent.scroll(window);
      act(() => vi.advanceTimersByTime(3000));
      expect((window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: was, configurable: true });
    }
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

  it('says the pictures are stills, and why, when the globe files are missing: in the scroll hint’s place, within the first screen’s 100 words', () => {
    render(<Arrival words={words} Stage={Stage} />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => stage!.onFail('could not load /data/globe/manifest.json (HTTP 404)'));
    const first = document.querySelector('[data-beat="0"]')!;
    const notice = within(first as HTMLElement).getByRole('status');
    expect(notice.textContent).toBe('Still pictures: this copy has no globe files.');
    // On a phone too, where the scroll hint waits for a wider screen.
    expect(notice.className).not.toMatch(/\bmax-sm:hidden\b/);
    expect(screen.queryByText(/^Scroll to fly down/)).toBeNull();
    for (const width of [WIDE, PHONE]) expect(visibleWords(first, width).length).toBeLessThanOrEqual(CAP);
  });

  it('says the pictures are stills when the browser cannot draw the live flight', () => {
    render(<Arrival words={words} Stage={Stage} />);
    act(() => stage!.onFail('WebGL 2 is not available'));
    expect(screen.getByRole('status').textContent).toBe('Still pictures: this browser cannot draw the live flight.');
    const first = document.querySelector('[data-beat="0"]')!;
    for (const width of [WIDE, PHONE]) expect(visibleWords(first, width).length).toBeLessThanOrEqual(CAP);
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
