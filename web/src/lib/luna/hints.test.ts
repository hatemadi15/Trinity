// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { parseCommand } from './commands';
import { closeHints, exploreHints, firstAnnouncement, hintSeen, hintsClosed, hintsFor, LUNA_HINTS_KEY, markHintSeen, resetHints, sendToLuna } from './hints';
import { lunaStore } from './store';

const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
const PAGES = ['/', '/sites', '/explore', '/compare', '/explore/stand', '/learn', '/validate'];

afterEach(() => {
  resetHints();
  window.localStorage.clear();
  window.sessionStorage.clear();
  lunaStore.setState({ on: false, status: 'off', submit: () => {}, prime: () => {} });
});

describe('what Luna suggests (spec 22.6)', () => {
  it('offers two or three requests on each page, and none on the printable brief', () => {
    for (const p of PAGES) {
      const n = hintsFor(p).length;
      expect(n, p).toBeGreaterThanOrEqual(2);
      expect(n, p).toBeLessThanOrEqual(3);
    }
    expect(hintsFor('/brief')).toEqual([]);
    expect(hintsFor('/')).toContain('Which site is best for these dates?');
    expect(hintsFor('/sites')).toEqual(['Which site is best for these dates?', 'Plan a landing']);
    expect(hintsFor('/explore', 30)).toEqual(['Find the best landing date for 30 days', 'Compare this to every landing site', 'Explain the longest night']);
    expect(hintsFor('/compare', 30)).toEqual(['Compare this to every landing site', 'Best 30-day landing date across the compared sites']);
    expect(hintsFor('/explore/stand')[0]).toBe('When does Earth set?');
    expect(exploreHints(14)).toEqual(hintsFor('/explore', 14));
  });

  it('suggests only what she acts on herself: every request is one of her commands or the planner’s phrasings, never a question for the model', () => {
    for (const p of PAGES)
      for (const days of [2, 14, 30, 90])
        for (const t of hintsFor(p, days)) {
          const c = parseCommand(t, sites);
          expect(['planner', 'plan', 'sky', 'control'], `${p}: ${t}`).toContain(c.kind);
        }
    expect(parseCommand(hintsFor('/explore', 14)[0], sites)).toMatchObject({ kind: 'planner', actions: [{ type: 'find_best_window', days: 14, scope: 'site' }] });
    expect(parseCommand(hintsFor('/compare', 14)[1], sites)).toMatchObject({ kind: 'planner', actions: [{ type: 'find_best_window', days: 14, scope: 'compare' }] });
    for (const t of ['Compare this to every landing site', 'Which site is best for these dates?']) expect(parseCommand(t, sites)).toMatchObject({ kind: 'planner', actions: [{ type: 'compare_best' }] });
    expect(parseCommand('Plan a landing', sites)).toEqual({ kind: 'plan', step: 'open' });
    // A period outside the planner's bounds is brought inside them.
    expect(hintsFor('/explore', 400)[0]).toBe('Find the best landing date for 90 days');
  });

  it('never uses the wording the copy guards forbid', () => {
    for (const p of PAGES) for (const t of hintsFor(p)) expect(t).not.toMatch(/surviv|guarantee|always|never/i);
  });

  it('shows once per page in a visit, and stays closed in this browser once closed', () => {
    expect(hintSeen('/explore')).toBe(false);
    markHintSeen('/explore');
    expect(hintSeen('/explore')).toBe(true);
    expect(hintSeen('/sites')).toBe(false);
    // Kept for the visit: a reload reads it back.
    resetHints();
    expect(hintSeen('/explore')).toBe(true);
    expect(hintsClosed()).toBe(false);
    closeHints();
    expect(window.localStorage.getItem(LUNA_HINTS_KEY)).toBe('off');
    resetHints();
    expect(hintsClosed()).toBe(true);
    expect(firstAnnouncement()).toBe(true);
    expect(firstAnnouncement()).toBe(false);
  });

  it('still works where storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hintsClosed()).toBe(false);
    markHintSeen('/explore');
    expect(hintSeen('/explore')).toBe(true);
    closeHints();
    expect(hintsClosed()).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });

  it('hands her a request at once while she is on; off, turns her on, readies her voice, and sends it when her engine takes typed words', async () => {
    const submit = vi.fn();
    lunaStore.setState({ on: true, submit });
    sendToLuna('Plan a landing');
    expect(submit).toHaveBeenCalledWith('Plan a landing');
    const prime = vi.fn();
    lunaStore.setState({ on: false, submit: () => {}, prime });
    sendToLuna('Explain the longest night');
    expect(prime).toHaveBeenCalledTimes(1);
    expect(lunaStore.getState().on).toBe(true);
    // Her engine, turned on, takes typed words.
    const typed = vi.fn();
    lunaStore.setState({ submit: typed });
    await Promise.resolve();
    expect(typed).toHaveBeenCalledWith('Explain the longest night');
    expect(typed).toHaveBeenCalledTimes(1);
  });
});
