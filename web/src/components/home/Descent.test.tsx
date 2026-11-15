// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { runControl } from '@/lib/luna/controls';
import { descentWords } from '@/lib/viz/descent';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { Descent } from './Descent';

const words = descentWords();
const Scene = () => null;
const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect;

/**
 * jsdom lays nothing out: this gives the picture a window's size and the first screen's words the boxes a browser gives
 * them at 1440 × 900 (the title, the sentence and the three choices, from 112 px to 752 px across).
 */
function laidOut() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900);
  const boxes = [rect(112, 133, 740, 370), rect(112, 390, 612, 421), rect(112, 453, 752, 578)];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const parent = this.parentElement;
    if (parent?.hasAttribute('data-opening')) return boxes[[...parent.children].indexOf(this)] ?? rect(0, 0, 0, 0);
    return rect(0, 0, 0, 0);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('the descent (spec 23.1)', () => {
  it('opens on the headline, one short line and three equal choices, and nothing else: no line telling anyone to scroll', () => {
    render(<Descent words={words} Scene={Scene} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('See when a Moon lander has sunlight and a signal.');
    expect(h1.querySelector('em')!.textContent).toBe('sunlight');
    expect(h1.querySelector('.pixel')!.textContent).toBe('signal');
    // The title is first: nothing stands over it.
    expect(h1.previousElementSibling).toBeNull();
    const sentence = h1.nextElementSibling as HTMLElement;
    expect(sentence.textContent).toBe('A forecast for Moon landing sites and dates, 2024 to 2036.');
    // The three choices follow the line, and end the first screen: each is a link with a clear name and one line.
    const choices = screen.getByRole('navigation', { name: 'Start here' });
    expect(sentence.nextElementSibling).toBe(choices);
    expect(choices.nextElementSibling).toBeNull();
    expect(screen.getByRole('link', { name: /^Pick a known site\s*:\s*34 places on the Moon$/ }).getAttribute('href')).toBe('/sites');
    expect(screen.getByRole('link', { name: /^Pick your own site\s*:\s*any point near the south pole$/ }).getAttribute('href')).toBe('/explore?own=1');
    expect(screen.getByRole('link', { name: /^Compare sites\s*:\s*side by side: power and radio contact$/ }).getAttribute('href')).toBe('/compare');
    expect(within(choices).getAllByRole('link')).toHaveLength(3);
    expect(words.knownSites).toBe(34);
    // The old first screen's actions, its eyebrow and its audience line are gone.
    const first = document.querySelector<HTMLElement>('[data-stage="moon"]')!;
    expect(first.textContent).not.toMatch(/Fly to the south pole|See why|For planners|How it works|South pole forecast/);
    expect(first.querySelectorAll('a, button')).toHaveLength(3);
    // On a phone the choices stack, one to a row, short of the rail's dots; from 640 px they stand side by side.
    expect(choices.className).toMatch(/\bgrid\b/);
    expect(choices.className).toMatch(/\bsm:grid-cols-3\b/);
    expect(choices.className).not.toMatch(/(^| )grid-cols-/);
    expect(choices.className).toMatch(/\bmax-sm:pr-8\b/);
    expect(document.body.textContent).not.toMatch(/scroll/i);
  });

  it('reads in order without the picture: the headline, a line for each stage, then the answer for the site and its two actions', () => {
    const { container } = render(<Descent words={words} Scene={Scene} />);
    const text = (container.textContent ?? '').replace(/ /g, ' ');
    const order = ['See when a Moon lander has sunlight and a signal.', words.turn.text, words.pole.text, words.site.text, words.answer.replace(/ /g, ' '), 'Open the full forecast', 'Choose a landing site'];
    let at = -1;
    for (const part of order) {
      const k = text.indexOf(part, at + 1);
      expect(k, part).toBeGreaterThan(at);
      at = k;
    }
    expect(screen.getByRole('link', { name: 'Open the full forecast' }).getAttribute('href')).toBe(words.exploreHref);
    expect(screen.getByRole('heading', { level: 2, name: words.answer })).toBeTruthy();
  });

  it('names the stages at the side, and a press on one takes the page to it', () => {
    const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Descent words={words} Scene={Scene} />);
    const rail = screen.getByRole('navigation', { name: 'Stages of the descent' });
    expect(within(rail).getAllByRole('button').map((b) => b.textContent)).toEqual(['The Moon', 'It turns', 'The south pole', 'The site', 'The answer']);
    expect(within(rail).getByRole('button', { name: 'The Moon' }).getAttribute('aria-current')).toBe('step');
    fireEvent.click(within(rail).getByRole('button', { name: 'The answer' }));
    expect(to).toHaveBeenCalled();
  });

  it('puts the pole’s names and the site on the map, from the relief map’s own pins', () => {
    render(<Descent words={words} Scene={Scene} />);
    for (const p of words.pins) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
    expect(words.pins.find((p) => p.hero)!.label).toBe('de Gerlache Rim 2');
    expect(words.pins.find((p) => p.id === 'south_pole')!.lat).toBeCloseTo(-90, 6);
  });

  it('says what each stage shows, in the app’s own figures', () => {
    expect(words.pole.eyebrow).toBe('The south pole · 500 km across');
    expect(words.site.eyebrow).toBe('de Gerlache Rim 2 · 20 km across');
    expect(words.site.text).toMatch(/^NASA has shortlisted de Gerlache Rim 2, this ridge, for astronauts to land on\. Black is ground the Sun cannot reach on 2 January 2027\.$/);
  });

  it('lands at once with reduced motion, when Luna is asked to fly', () => {
    const before = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
    onTestFinished(() => {
      window.matchMedia = before;
    });
    const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Descent words={words} Scene={Scene} />);
    act(() => void runControl('fly'));
    expect(to).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: words.answer }));
  });

  it('stands the first screen’s Moon, still or live, right of the words and clear of them: never under the title, the sentence or the three choices', async () => {
    laidOut();
    let given: { current: { moon: { cx: number; cy: number; r: number }; earth: { cx: number; cy: number; r: number } } | null } | null = null;
    const Seen = (p: { layout?: typeof given }) => {
      given = p.layout ?? null;
      return null;
    };
    const { container } = render(<Descent words={words} Scene={Seen as never} />);
    const moon = await vi.waitFor(() => {
      const img = container.querySelector<HTMLImageElement>('img[data-still="moon"]');
      expect(img).toBeTruthy();
      return img!;
    });
    // The still's disc takes 47 % of its picture: its left limb stands right of the words' right edge (752 px).
    const left = parseFloat(moon.style.left), size = parseFloat(moon.style.width);
    expect(left + size / 2 - 0.4715 * size).toBeGreaterThan(752 + 20);
    // The live picture is handed the same place.
    expect(given!.current!.moon.cx - given!.current!.moon.r).toBeGreaterThan(772);
    expect(container.querySelector('img[data-still="earth"]')).toBeTruthy();
  });

  it('keeps the stills, the relief map and the site’s picture where WebGL fails, and says so on the first screen within its 60 words', async () => {
    const Broken = ({ onFail }: { onFail: (why: string) => void }) => {
      queueMicrotask(() => onFail('no WebGL'));
      return null;
    };
    const { container } = render(<Descent words={words} Scene={Broken} />);
    await vi.waitFor(() => expect(container.querySelector(`img[src="${words.hero.image}"]`)).toBeTruthy());
    expect(container.querySelector(`img[src="${words.hero.relief}"]`)).toBeTruthy();
    const first = container.querySelector<HTMLElement>('[data-stage="moon"]')!;
    const notice = within(first).getByRole('status');
    expect(notice.textContent).toBe('Still pictures: this browser cannot draw the live view.');
    for (const width of [WIDE, PHONE]) expect(visibleWords(first, width).length).toBeLessThanOrEqual(60);
  });

  it('keeps the first screen to 60 words, at 1440 and on a phone (spec 20.1): the title, one line and the three choices', () => {
    const { container } = render(<Descent words={words} Scene={Scene} />);
    const first = container.querySelector<HTMLElement>('[data-stage="moon"]')!;
    expect(within(first).queryByRole('status')).toBeNull();
    for (const width of [WIDE, PHONE]) expect(visibleWords(first, width).length).toBeLessThanOrEqual(60);
  });

  it('plays the descent when Luna is asked to fly, and stops the moment the visitor scrolls, or the page is scrolled by any other hand', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Descent words={words} Scene={Scene} />);
    act(() => void runControl('fly'));
    act(() => vi.advanceTimersByTime(1000));
    const calls = to.mock.calls.length;
    expect(calls).toBeGreaterThan(5);
    // The scrollbar dragged far from where the flight last put the page: no wheel, touch or key.
    const was = window.scrollY;
    Object.defineProperty(window, 'scrollY', { value: 12345, configurable: true });
    try {
      fireEvent.scroll(window);
      act(() => vi.advanceTimersByTime(3000));
      expect(to.mock.calls.length).toBe(calls);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: was, configurable: true });
    }
  });

  it('names the stages on plates that read over the Moon, from 1024 px, and keeps the dots in one column on the rail', () => {
    render(<Descent words={words} Scene={Scene} />);
    const rail = screen.getByRole('navigation', { name: 'Stages of the descent' });
    expect(rail.querySelector('ol')!.className).toMatch(/\bitems-end\b/);
    for (const b of within(rail).getAllByRole('button')) {
      const label = b.querySelector('span')!;
      expect(label.className).toMatch(/\bmax-lg:sr-only\b/);
      expect(label.className).toMatch(/\bbg-black\/70\b/);
    }
  });
});
