// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';
import { TOUR_STEPS, tourAsked } from './explore/Tour';

const SITE = '?site=de_gerlache_rim_2&start=2027-01-01&days=30';

/** The page as the Choose a site map opens it (`search` with tour=1), or as any other link does. */
async function open(search: string) {
  window.history.replaceState({}, '', `/explore${search}`);
  const store = createExploreStore(fileLoaders());
  render(<ExploreView store={store} navigate={() => {}} />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Where on the Moon' })).toBeTruthy(), { timeout: 20_000 });
  return store;
}
const shownSteps = () => [...document.querySelectorAll('[data-tour-step]')].map((el) => Number(el.getAttribute('data-tour-step')));
const part = (n: number) => document.querySelector<HTMLElement>(`[data-tour-step="${n}"]`)!;
/** The tour's own Next buttons: the time bar has a "Next: <moment>" of its own. */
const nexts = () => [...document.querySelectorAll<HTMLButtonElement>('[data-part="tour-next"] button')];
const next = () => {
  expect(nexts()).toHaveLength(1);
  return nexts()[0];
};
const region = (name: string | RegExp) => screen.queryByRole('region', { name });

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('Explore, the guided arrival from the Choose a site map (tour=1)', () => {
  it('reads tour=1 from the address, and never for a place of the visitor’s own', () => {
    expect(tourAsked('?site=x&tour=1')).toBe(true);
    expect(tourAsked('?site=x')).toBe(false);
    expect(tourAsked('?site=x&tour=0')).toBe(false);
    expect(tourAsked('?own=1&tour=1')).toBe(false);
  });

  it('opens on where the site is alone, with the step, one Next button and Show everything', async () => {
    await open(`${SITE}&tour=1`);
    expect(shownSteps()).toEqual([1]);
    expect(region('The answer')).toBeNull();
    expect(region('Hour by hour')).toBeNull();
    expect(region('Ask in plain words')).toBeNull();
    expect(screen.queryByRole('link', { name: 'See the checks' })).toBeNull();
    expect(document.querySelector('[data-part="tour-bar"]')!.textContent).toMatch(/^Step 1 of 5/);
    expect(nexts()).toHaveLength(1);
    expect(next().textContent).toMatch(/^Next: the answer/);
    expect(screen.getByRole('button', { name: 'Show everything' })).toBeTruthy();
    // The address keeps the tour while parts are waiting, so a reload stays in it.
    await waitFor(() => expect(window.location.search).toMatch(/[?&]tour=1/));
  });

  it('brings the parts in one at a time, in order, each with the focus on its heading, a fade and rise, and a polite word', async () => {
    await open(`${SITE}&tour=1`);
    const scrolled: unknown[] = [];
    Element.prototype.scrollIntoView = function (o?: unknown) {
      scrolled.push(o);
    };
    const said = () => screen.getAllByRole('status').find((el) => el.className.includes('sr-only') && /Step|full page/.test(el.textContent ?? ''))?.textContent;
    const names = ['the answer', 'hour by hour', 'the year', 'questions and checks'];
    for (let n = 2; n <= 5; n++) {
      expect(next().textContent).toMatch(new RegExp(`^Next: ${names[n - 2]}`));
      fireEvent.click(next());
      expect(shownSteps()).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      const heading = part(n).querySelector('h1, h2, h3')!;
      expect(document.activeElement).toBe(heading);
      expect(part(n).className).toMatch(/animate-\[step-in_400ms/);
      expect(part(n).getAttribute('data-tour-motion')).toBe('rise');
      expect(scrolled.at(-1)).toEqual({ behavior: 'smooth', block: 'start' });
      expect(said()).toMatch(new RegExp(`^Step ${n} of 5: ${TOUR_STEPS[n - 1].name}\\.`));
    }
    expect(scrolled).toHaveLength(4);
    // The first part never moves: it is the page as it opens.
    expect(part(1).className).not.toMatch(/animate-/);
    // Each part holds what the full page holds, in the page's order.
    expect(part(2).contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
    expect(part(3).contains(region('Hour by hour'))).toBe(true);
    expect(part(4).querySelector('h2')!.textContent).toMatch(/12 months|year/i);
    expect(part(5).contains(screen.getByRole('link', { name: 'See the checks' }))).toBe(true);
    // At the end the tour's controls go and the address drops tour=1; the site and the period stay.
    expect(nexts()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Show everything' })).toBeNull();
    expect(said()).toMatch(/The full page is now shown\.$/);
    await waitFor(() => expect(window.location.search).not.toMatch(/tour/));
    expect(window.location.search).toMatch(/^\?site=de_gerlache_rim_2&start=2027-01-01&days=30/);
  });

  it('“Show everything” shows every part at once, without scrolling, and drops tour=1 from the address', async () => {
    await open(`${SITE}&tour=1`);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(shownSteps()).toEqual([1, 2, 3, 4, 5]);
    expect(scroll).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(part(2).querySelector('h1, h2, h3'));
    expect(nexts()).toHaveLength(0);
    expect(document.querySelector('[data-part="tour-bar"]')).toBeNull();
    await waitFor(() => expect(window.location.search).not.toMatch(/tour/));
  });

  it('scrolling on past the end of the page brings the next part, once the page has rested there', async () => {
    await open(`${SITE}&tour=1`);
    // In jsdom the page is always at its end; it has rested there once half a second has passed.
    const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
    fireEvent.wheel(window, { deltaY: -200 });
    expect(shownSteps()).toEqual([1]);
    // A small nudge is not enough; pushed on, the next part comes.
    fireEvent.wheel(window, { deltaY: 60 });
    expect(shownSteps()).toEqual([1]);
    fireEvent.wheel(window, { deltaY: 60 });
    expect(shownSteps()).toEqual([1, 2]);
    expect(document.activeElement).toBe(part(2).querySelector('h1, h2, h3'));
    now.mockRestore();
  });

  it('under reduced motion the parts appear at once on the same actions: no animation and no smooth scroll', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
    await open(`${SITE}&tour=1`);
    const scrolled: unknown[] = [];
    Element.prototype.scrollIntoView = function (o?: unknown) {
      scrolled.push(o);
    };
    fireEvent.click(next());
    expect(shownSteps()).toEqual([1, 2]);
    expect(part(2).className).not.toMatch(/animate-/);
    expect(part(2).getAttribute('data-tour-motion')).toBe('none');
    expect(scrolled).toEqual([{ behavior: 'auto', block: 'start' }]);
    expect(document.activeElement).toBe(part(2).querySelector('h1, h2, h3'));
  });

  it('without tour=1 the full page opens as before, with no tour controls', async () => {
    await open(SITE);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(shownSteps()).toEqual([1, 2, 3, 4, 5]);
    expect(nexts()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Show everything' })).toBeNull();
    expect(document.querySelector('[data-part="tour-bar"]')).toBeNull();
    expect(document.querySelector('[data-tour-motion]')).toBeNull();
    expect(document.querySelector('[class*="step-in"]')).toBeNull();
    expect(window.location.search).not.toMatch(/tour/);
  });

  it('a place of the visitor’s own (own=1) has no tour', async () => {
    window.history.replaceState({}, '', '/explore?own=1&tour=1');
    render(<ExploreView store={createExploreStore(fileLoaders())} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your own site' })).toBeTruthy(), { timeout: 20_000 });
    expect(nexts()).toHaveLength(0);
  });
});
