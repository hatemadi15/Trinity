// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { runControl } from '@/lib/luna/controls';
import { descentWords } from '@/lib/viz/descent';
import { Descent } from './Descent';

const words = descentWords();
const Scene = () => null;

afterEach(() => vi.restoreAllMocks());

describe('the descent (spec 23.1)', () => {
  it('opens on the headline, one sentence and two actions, with no line telling anyone to scroll', () => {
    render(<Descent words={words} Scene={Scene} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('See when a Moon lander has sunlight and a signal.');
    expect(h1.querySelector('em')!.textContent).toBe('sunlight');
    expect(h1.querySelector('.pixel')!.textContent).toBe('signal');
    expect(screen.getByText(/^A forecast for Moon landing sites and dates, 2024 to 2036/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Fly to the south pole/ }).getAttribute('href')).toBe('/sites');
    expect(screen.getByRole('link', { name: 'See why the pole is hard' }).getAttribute('href')).toBe('#why');
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

  it('lands at once with reduced motion, from the button or from Luna', () => {
    const before = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
    onTestFinished(() => {
      window.matchMedia = before;
    });
    const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Descent words={words} Scene={Scene} />);
    fireEvent.click(screen.getByRole('link', { name: /Fly to the south pole/ }));
    expect(to).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: words.answer }));
    to.mockClear();
    runControl('fly');
    expect(to).toHaveBeenCalled();
  });

  it('shows the first screen’s still before the picture is ready, and the relief map and the site’s picture where WebGL fails', async () => {
    const Broken = ({ onFail }: { onFail: (why: string) => void }) => {
      queueMicrotask(() => onFail('no WebGL'));
      return null;
    };
    const { container } = render(<Descent words={words} Scene={Broken} />);
    expect(container.querySelector('img[src="/hero/descent-wide.jpg"]')).toBeTruthy();
    await screen.findByText((_, el) => el?.tagName === 'IMG' && el.getAttribute('src') === words.hero.relief).catch(() => null);
    await vi.waitFor(() => expect(container.querySelector(`img[src="${words.hero.image}"]`)).toBeTruthy());
  });
});
