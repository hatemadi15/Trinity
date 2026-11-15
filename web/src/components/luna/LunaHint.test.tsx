// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_DELAY_MS, hintsFor, LUNA_HINTS_KEY, resetHints } from '@/lib/luna/hints';
import { PLAN_HREF } from '@/lib/links';
import { lunaStore } from '@/lib/luna/store';
import { createExploreStore, exploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { lunaPlace } from './LunaButton';
import { LunaEngine } from './LunaEngine';
import { LunaAsk, LunaHint } from './LunaHint';

const reset = () => act(() => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, messages: [], voice: true, prime: () => {} }));
const hint = () => screen.queryByRole('region', { name: 'Suggestions from Luna' });
const wait = () => act(() => vi.advanceTimersByTime(HINT_DELAY_MS));
const reduce = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reset();
  resetHints();
  lunaPlace.setState({ at: 'header' });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Luna’s suggestions beside her (spec 22.6)', () => {
  it('shows two seconds after the page opens, a labelled region that takes no focus, with the page’s requests as named buttons', () => {
    for (const path of ['/', '/sites', '/explore', '/compare', '/explore/stand']) {
      render(<LunaHint className="" path={path} />);
      expect(hint(), path).toBeNull();
      act(() => vi.advanceTimersByTime(HINT_DELAY_MS - 1));
      expect(hint(), path).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      const pane = hint()!;
      expect(within(pane).getByText('Ask me')).toBeTruthy();
      const want = hintsFor(path, exploreStore.getState().days);
      for (const t of want) expect(within(pane).getByRole('button', { name: `Ask Luna: ${t}` }), path).toBeTruthy();
      // The requests and the cross, and nothing else to press.
      expect(within(pane).getAllByRole('button')).toHaveLength(want.length + 1);
      expect(document.activeElement).toBe(document.body);
      cleanup();
    }
  });

  it('shows nothing on the printable brief, nor while Luna is on', () => {
    render(<LunaHint className="" path="/brief" />);
    wait();
    expect(hint()).toBeNull();
    cleanup();
    act(() => lunaStore.setState({ on: true }));
    render(<LunaHint className="" path="/explore" />);
    wait();
    expect(hint()).toBeNull();
  });

  it('shows once per page in a visit', () => {
    const { unmount } = render(<LunaHint className="" path="/explore" />);
    wait();
    expect(hint()).not.toBeNull();
    unmount();
    render(<LunaHint className="" path="/explore" />);
    wait();
    expect(hint()).toBeNull();
    cleanup();
    render(<LunaHint className="" path="/sites" />);
    wait();
    expect(hint()).not.toBeNull();
  });

  it('is said to a screen reader politely, once in a visit', () => {
    render(<LunaHint className="" path="/explore" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    wait();
    expect(status.textContent).toContain(`Luna suggests: ${hintsFor('/explore', exploreStore.getState().days)[0]}`);
    cleanup();
    render(<LunaHint className="" path="/sites" />);
    wait();
    expect(hint()).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('closes at the cross, and stays closed on other pages and on the next visit', () => {
    render(<LunaHint className="" path="/explore" />);
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Close Luna’s suggestions' }));
    expect(hint()).toBeNull();
    expect(window.localStorage.getItem(LUNA_HINTS_KEY)).toBe('off');
    expect(lunaStore.getState().on).toBe(false);
    cleanup();
    // The next visit: nothing in memory, the browser's note alone.
    resetHints();
    window.sessionStorage.clear();
    render(<LunaHint className="" path="/sites" />);
    wait();
    expect(hint()).toBeNull();
  });

  it('comes in with a short motion, and without any under reduced motion', () => {
    render(<LunaHint className="" path="/explore" />);
    wait();
    expect(hint()!.dataset.motion).toBe('in');
    expect(hint()!.className).toMatch(/animate-\[bubble-in/);
    cleanup();
    reduce(true);
    render(<LunaHint className="" path="/sites" />);
    wait();
    expect(hint()!.dataset.motion).toBe('none');
    expect(hint()!.className).not.toMatch(/animate-/);
  });

  it('a press opens her panel beside her and sends the request as if typed: the planner opens and she answers', async () => {
    const store = createExploreStore(fileLoaders());
    const navigate = vi.fn();
    const prime = vi.fn();
    const speak = vi.fn(() => true);
    render(
      <>
        <LunaEngine store={store} recognition={() => null} recorder={{ supported: () => false } as never} speak={speak} hush={() => {}} prime={prime} navigate={navigate} ask={vi.fn()} />
        <LunaHint className="" path="/sites" />
      </>,
    );
    wait();
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Luna: Plan a landing' }));
    expect(hint()).toBeNull();
    expect(lunaStore.getState().on).toBe(true);
    expect(lunaPlace.getState().at).toBe('dock');
    expect(prime).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(PLAN_HREF));
    await waitFor(() => expect(lunaStore.getState().messages.map((m) => m.from)).toEqual(['you', 'luna']));
    const [mine, hers] = lunaStore.getState().messages;
    expect(mine.text).toBe('Plan a landing');
    expect(hers.text).toMatch(/^Opening the planner\./);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('under Explore’s answer, "Ask Luna:" offers the best date and the best site; a press runs the search on the page', async () => {
    const store = createExploreStore(fileLoaders());
    await act(async () => {
      vi.useRealTimers();
      await store.getState().init();
    });
    const findBestWindow = vi.fn(async () => {});
    store.setState({ findBestWindow } as never);
    render(
      <>
        <LunaEngine store={store} recognition={() => null} recorder={{ supported: () => false } as never} speak={() => true} hush={() => {}} prime={() => {}} navigate={vi.fn()} ask={vi.fn()} />
        <LunaAsk days={30} />
      </>,
    );
    const strip = screen.getByRole('group', { name: 'Ask Luna' });
    expect(within(strip).getByText('Ask Luna:')).toBeTruthy();
    expect(within(strip).getAllByRole('button').map((b) => b.textContent)).toEqual(['Find the best landing date for 30 days', 'Compare this to every landing site', 'Explain the longest night']);
    fireEvent.click(within(strip).getByRole('button', { name: 'Ask Luna: Find the best landing date for 30 days' }));
    expect(lunaPlace.getState().at).toBe('dock');
    await waitFor(() => expect(findBestWindow).toHaveBeenCalledWith(30, 'site'));
    await waitFor(() => expect(lunaStore.getState().messages.at(-1)?.from).toBe('luna'));
    expect(lunaStore.getState().messages[0].text).toBe('Find the best landing date for 30 days');
  });
});
