// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createExploreStore } from '../store/explore';
import { plannerLog } from '../store/planner-log';
import { fileLoaders } from '@/test/file-loaders';
import type { PlannerAnswer } from '../ai/client';
import { parseCommand } from './commands';
import { registerControls } from './controls';
import { HELP_REPLY, REPLIES, runCommand, type LunaDeps } from './run';

/** A store with the real catalogue, on de Gerlache Rim 2 from 1 January 2027 for 30 days. */
async function loaded() {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  await store.getState().selectSite('de_gerlache_rim_2');
  store.getState().setWindow('2027-01-01T00:00:00', 30);
  return store;
}

function deps(store: Awaited<ReturnType<typeof loaded>>, at = '/explore', ask?: LunaDeps['ask']): LunaDeps & { navigate: Mock<(href: string) => void>; setTheme: Mock<(t: 'light' | 'dark') => void>; turnOff: Mock<() => void> } {
  return {
    store,
    navigate: vi.fn<(href: string) => void>(),
    path: () => at,
    ask: ask ?? vi.fn(async () => ({ source: 'model', actions: [], reply: 'An answer.' }) as PlannerAnswer),
    setTheme: vi.fn<(t: 'light' | 'dark') => void>(),
    turnOff: vi.fn<() => void>(),
  };
}

beforeEach(() => plannerLog.getState().clear());
afterEach(() => vi.restoreAllMocks());

describe('what Luna does with a command', () => {
  it('runs a control the page has lent, and says what it did, or her own words for it', async () => {
    const store = await loaded();
    const d = deps(store);
    const off = registerControls({ play: vi.fn(), next: () => 'Next: Sunset, 3 Jan' });
    expect(await runCommand({ kind: 'control', control: 'play' }, d)).toBe(REPLIES.play);
    expect(await runCommand({ kind: 'control', control: 'next' }, d)).toBe('Next: Sunset, 3 Jan');
    expect(d.navigate).not.toHaveBeenCalled();
    off();
  });

  it('opens the view from the site for a turn or the player when the page has none, and keeps the control for it', async () => {
    const store = await loaded();
    const d = deps(store, '/compare');
    const reply = await runCommand({ kind: 'control', control: 'turn-earth' }, d);
    expect(d.navigate).toHaveBeenCalledWith('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0');
    expect(reply).toBe(`Opening the view from the site. ${REPLIES['turn-earth']}`);
    // The view lends its turns when it opens: the kept control runs then.
    vi.useFakeTimers();
    try {
      const turn = vi.fn();
      const off = registerControls({ 'turn-earth': turn });
      await vi.advanceTimersByTimeAsync(10);
      expect(turn).toHaveBeenCalledTimes(1);
      off();
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes home for the flight, and says where the better day is when no page offers it', async () => {
    const store = await loaded();
    const d = deps(store, '/sites');
    await runCommand({ kind: 'control', control: 'fly' }, d);
    expect(d.navigate).toHaveBeenCalledWith('/');
    const better = await runCommand({ kind: 'control', control: 'better-day' }, d);
    expect(better).toMatch(/Explore|view from the site/);
  });

  it('opens the forecast to show the year from a page without it, where the year then shows itself', async () => {
    const store = await loaded();
    const d = deps(store, '/sites');
    expect(await runCommand({ kind: 'control', control: 'year' }, d)).toBe('Opening the forecast, with every landing day of the next 12 months.');
    expect(d.navigate).toHaveBeenCalledWith('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    // The forecast lends the year once it is there, and the year waiting for it runs.
    vi.useFakeTimers();
    try {
      const show = vi.fn();
      const off = registerControls({ year: show });
      await vi.advanceTimersByTimeAsync(10);
      expect(show).toHaveBeenCalledTimes(1);
      off();
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes you to each page, Explore and the view from the site on the site and period chosen', async () => {
    const store = await loaded();
    const d = deps(store, '/');
    const to = async (place: string) => {
      d.navigate.mockClear();
      await runCommand({ kind: 'go', place } as never, d);
      return d.navigate.mock.calls[0][0];
    };
    expect(await to('home')).toBe('/');
    expect(await to('stand')).toBe('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0');
    expect(await to('explore')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    for (const p of ['sites', 'compare', 'validate', 'learn', 'brief']) expect(await to(p)).toBe(`/${p}`);
  });

  it('changes the theme, helps, greets, thanks and says goodbye before she stops listening', async () => {
    const store = await loaded();
    const d = deps(store);
    expect(await runCommand({ kind: 'theme', theme: 'dark' }, d)).toBe('Dark theme.');
    expect(d.setTheme).toHaveBeenCalledWith('dark');
    expect(await runCommand({ kind: 'help' }, d)).toBe(HELP_REPLY);
    expect(await runCommand({ kind: 'hello' }, d)).toMatch(/^Hello/);
    expect(await runCommand({ kind: 'thanks' }, d)).toMatch(/welcome/i);
    expect(await runCommand({ kind: 'stop' }, d)).toMatch(/^Luna is off/);
    expect(d.turnOff).toHaveBeenCalledTimes(1);
    expect(await runCommand({ kind: 'nothing' }, d)).toBeNull();
  });

  it('applies the planner’s actions as the Ask box does, logs the exchange there, and opens Explore to show a new site from another page', async () => {
    const store = await loaded();
    const d = deps(store, '/learn');
    const cmd = parseCommand('show me nobile rim two', store.getState().sites);
    const reply = await runCommand(cmd, d, 'show me nobile rim two');
    expect(store.getState().siteId).toBe('nobile_rim_2');
    expect(reply).toBe('Selected Nobile Rim 2 (Artemis III region).');
    expect(d.navigate).toHaveBeenCalledWith('/explore?site=nobile_rim_2&start=2027-01-01&days=30');
    const x = plannerLog.getState().exchanges[0];
    expect([x.prompt, x.source]).toEqual(['show me nobile rim two', 'intent']);
  });

  it('lands the view from the site on a new site or period, when that is the page she is on', async () => {
    const store = await loaded();
    const d = deps(store, '/explore/stand');
    await runCommand(parseCommand('start on january 20th 2027', store.getState().sites), d, 'start on january 20th 2027');
    expect(store.getState().startUtc).toBe('2027-01-20T00:00:00');
    expect(d.navigate).toHaveBeenCalledWith('/explore/stand?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=0');
  });

  it('asks the model the rest, applies what it answers, and says when it cannot be reached', async () => {
    const store = await loaded();
    const ask = vi.fn(async () => ({ source: 'model', model: 'm', actions: [{ type: 'open_page', page: 'compare' }], reply: 'Here is Compare.' }) as PlannerAnswer);
    const d = deps(store, '/explore', ask);
    expect(await runCommand({ kind: 'ask', prompt: 'which site is best for radio' }, d, 'which site is best for radio')).toBe('Here is Compare.');
    expect(ask).toHaveBeenCalledWith('which site is best for radio', expect.anything(), store.getState().aiMode);
    expect(d.navigate).toHaveBeenCalledWith('/compare');
    const down = deps(store, '/explore', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await runCommand({ kind: 'ask', prompt: 'which site is best' }, down, 'which site is best')).toMatch(/cannot reach the assistant/);
  });
});
