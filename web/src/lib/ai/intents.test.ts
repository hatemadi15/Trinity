import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { EXPLANATIONS, INTENTS, matchIntent } from './intents';

const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];

const m = (prompt: string) => matchIntent(prompt, sites);

describe('matchIntent', () => {
  it('has twelve rehearsed intents', () => {
    expect(INTENTS.length).toBe(12);
  });

  it('selects a site by name', () => {
    expect(m('Show me Nobile Rim 2')?.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(m('select haworth')?.actions).toEqual([{ type: 'select_site', id: 'haworth' }]);
    expect(m('go to de Gerlache Rim 2.')?.actions).toEqual([{ type: 'select_site', id: 'de_gerlache_rim_2' }]);
    expect(m('show me nobile rim 2')?.reply).toMatch(/Nobile Rim 2/);
  });

  it('answers with no actions when the named site is not in the catalogue', () => {
    const r = m('show me mars base');
    expect(r?.actions).toEqual([]);
    expect(r?.reply).toMatch(/mars base/);
  });

  it('compares two sites and opens Compare, with an optional window length', () => {
    expect(m('compare de gerlache rim 2 and nobile rim 2')?.actions).toEqual([
      { type: 'add_to_compare', id: 'de_gerlache_rim_2' },
      { type: 'add_to_compare', id: 'nobile_rim_2' },
      { type: 'open_page', page: 'compare' },
    ]);
    expect(m('Compare Haworth with Malapert Massif for 14 days')?.actions).toEqual([
      { type: 'add_to_compare', id: 'haworth' },
      { type: 'add_to_compare', id: 'malapert_massif' },
      { type: 'set_window', days: 14 },
      { type: 'open_page', page: 'compare' },
    ]);
  });

  it('adds a site to the comparison', () => {
    expect(m('add nobile rim 2 to compare')?.actions).toEqual([{ type: 'add_to_compare', id: 'nobile_rim_2' }]);
    expect(m('Add the peak near Shackleton to the comparison')?.actions).toEqual([{ type: 'add_to_compare', id: 'peak_near_shackleton' }]);
    // The matcher answers before the store acts, and a full Compare refuses a fifth site: the step's note says which.
    expect(m('add nobile rim 2 to compare')?.reply).toBe('Adding Nobile Rim 2 (Artemis III region) to the comparison.');
  });

  it('finds the best window for the site or the compared sites', () => {
    expect(m('best 14-day window')?.actions).toEqual([{ type: 'find_best_window', days: 14, scope: 'site' }]);
    expect(m('Find the best 30 day window across the compared sites')?.actions).toEqual([{ type: 'find_best_window', days: 30, scope: 'compare' }]);
    expect(m('best 45-day window')).toBeNull();
  });

  it('sets the window start and length', () => {
    expect(m('start on 2027-03-01 for 14 days')?.actions).toEqual([{ type: 'set_window', startUtc: '2027-03-01T00:00:00', days: 14 }]);
    expect(m('start on 2027-03-01')?.actions).toEqual([{ type: 'set_window', startUtc: '2027-03-01T00:00:00' }]);
    expect(m('start on 1 March 2027 for 90 days')?.actions).toEqual([{ type: 'set_window', startUtc: '2027-03-01T00:00:00', days: 90 }]);
    expect(m('start on March 1, 2027')?.actions).toEqual([{ type: 'set_window', startUtc: '2027-03-01T00:00:00' }]);
  });

  it('sets the load, the battery, the panel model and the mast', () => {
    expect(m('set the load to 300 W')?.actions).toEqual([{ type: 'set_power', patch: { loadW: 300 } }]);
    expect(m('set load to 150w')?.actions).toEqual([{ type: 'set_power', patch: { loadW: 150 } }]);
    expect(m('set the battery to 5000 Wh')?.actions).toEqual([{ type: 'set_power', patch: { batteryWh: 5000 } }]);
    expect(m('use a horizontal panel')?.actions).toEqual([{ type: 'set_power', patch: { panel: 'horizontal' } }]);
    expect(m('use a two-axis tracking panel')?.actions).toEqual([{ type: 'set_power', patch: { panel: 'full_tracking' } }]);
    expect(m('use a vertical panel')?.actions).toEqual([{ type: 'set_power', patch: { panel: 'vertical_tracking' } }]);
    expect(m('use a fixed vertical panel')?.actions).toEqual([{ type: 'set_power', patch: { panel: 'vertical' } }]);
    expect(m('set the mast height to 5 m')?.actions).toEqual([{ type: 'set_params', patch: { mastM: 5 } }]);
    expect(m('mast to 0m')?.actions).toEqual([{ type: 'set_params', patch: { mastM: 0 } }]);
  });

  it('opens pages, the site list among them, and knows no audience any more', () => {
    expect(m('open the site list')?.actions).toEqual([{ type: 'open_page', page: 'sites' }]);
    expect(m('show sites')?.actions).toEqual([{ type: 'open_page', page: 'sites' }]);
    expect(m('switch to learn mode')).toBeNull();
    expect(m('Switch to planner')).toBeNull();
    expect(m('open compare')?.actions).toEqual([{ type: 'open_page', page: 'compare' }]);
    expect(m('open the validate page')?.actions).toEqual([{ type: 'open_page', page: 'validate' }]);
  });

  it('opens pages by the names they have on screen, and says those names', () => {
    expect(m('open the accuracy page')?.actions).toEqual([{ type: 'open_page', page: 'validate' }]);
    expect(m('show me how it works')?.actions).toEqual([{ type: 'open_page', page: 'learn' }]);
    expect(m('Show me the list of landing sites')?.actions).toEqual([{ type: 'open_page', page: 'sites' }]);
    expect(m('open the accuracy page')?.reply).toBe('Opening Accuracy.');
    expect(m('open the validate page')?.reply).toBe('Opening Accuracy.');
    expect(m('open the site list')?.reply).toBe('Opening the site list.');
  });

  it('sets the period alone, and says which lengths exist when the asked one does not', () => {
    expect(m('make it 90 days')?.actions).toEqual([{ type: 'set_window', days: 90 }]);
    expect(m('for 14 days')?.actions).toEqual([{ type: 'set_window', days: 14 }]);
    expect(m('set the period to 30 days')?.actions).toEqual([{ type: 'set_window', days: 30 }]);
    expect(m('make it 90 days')?.reply).toBe('Period: 90 days.');
    const r = m('make it 45 days');
    expect(r?.actions).toEqual([]);
    expect(r?.reply).toMatch(/14, 30 or 90 days/);
  });

  it('answers in the words the pages use', () => {
    const old = /skyline|window|verdict|planner|validate/i;
    for (const prompt of ['start on 2027-03-01 for 14 days', 'Find the best 30 day window', 'best 14-day window across the compared sites', 'set the load to 5000 W', 'set the battery to 90000 Wh', 'mast to 25 m', 'mast to 5 m', 'open the validate page', 'compare haworth and nobile rim 2 for 20 days', 'make it 45 days']) {
      expect(m(prompt)?.reply, prompt).not.toMatch(old);
    }
    expect(m('start on 2027-03-01 for 14 days')?.reply).toBe('Period: from 1 March 2027 for 14 days.');
    expect(m('start on 2027-03-01')?.reply).toBe('Period: from 1 March 2027.');
  });

  it('finds the best landing date when asked in the words the pages use', () => {
    expect(m('Find the best landing date for 14 days')?.actions).toEqual([{ type: 'find_best_window', days: 14, scope: 'site' }]);
    expect(m('best 30-day landing date across the compared sites')?.actions).toEqual([{ type: 'find_best_window', days: 30, scope: 'compare' }]);
    expect(m('the best landing day for 90 days')?.actions).toEqual([{ type: 'find_best_window', days: 90, scope: 'site' }]);
    expect(m('best landing date for 45 days')).toBeNull();
  });

  it('explains the words the pages use too', () => {
    expect(m('explain the hills')?.actions).toEqual([{ type: 'explain', topic: 'skyline' }]);
    expect(m('what is the time with power')?.actions).toEqual([{ type: 'explain', topic: 'verdict' }]);
    expect(m('explain the best landing date')?.actions).toEqual([{ type: 'explain', topic: 'best window' }]);
  });

  it('explains the five topics with fixed paragraphs', () => {
    for (const topic of ['longest night', 'earth gap', 'best window', 'skyline', 'verdict']) {
      const r = m(`explain the ${topic}`);
      expect(r?.actions).toEqual([{ type: 'explain', topic }]);
      expect(r?.reply).toBe(EXPLANATIONS[topic]);
      expect(EXPLANATIONS[topic].length).toBeGreaterThan(80);
    }
    expect(m('explain quantum chromodynamics')).toBeNull();
  });

  it('returns null for anything else', () => {
    expect(m('what is the meaning of life')).toBeNull();
    expect(m('')).toBeNull();
  });
});

describe('matchIntent polish', () => {
  it('opens pages from "go to", "take me to" and "show me the … page"', () => {
    expect(m('go to compare')?.actions).toEqual([{ type: 'open_page', page: 'compare' }]);
    expect(m('take me to the brief')?.actions).toEqual([{ type: 'open_page', page: 'brief' }]);
    expect(m('show me the validate page')?.actions).toEqual([{ type: 'open_page', page: 'validate' }]);
    expect(m('go to de Gerlache Rim 2')?.actions).toEqual([{ type: 'select_site', id: 'de_gerlache_rim_2' }]);
  });

  it('replies with the clamped value when a setting is out of range', () => {
    expect(m('set the load to 5000 W')?.actions).toEqual([{ type: 'set_power', patch: { loadW: 2000 } }]);
    expect(m('set the load to 5000 W')?.reply).toMatch(/2000 W/);
    expect(m('set the battery to 90000 Wh')?.reply).toMatch(/50000 Wh/);
    expect(m('mast to 25 m')?.actions).toEqual([{ type: 'set_params', patch: { mastM: 10 } }]);
  });

  it('says which window lengths exist when the asked one does not', () => {
    const r = m('compare haworth and nobile rim 2 for 20 days');
    expect(r?.actions).toEqual([
      { type: 'add_to_compare', id: 'haworth' },
      { type: 'add_to_compare', id: 'nobile_rim_2' },
      { type: 'open_page', page: 'compare' },
    ]);
    expect(r?.reply).toMatch(/14, 30 or 90 days/);
  });
});
