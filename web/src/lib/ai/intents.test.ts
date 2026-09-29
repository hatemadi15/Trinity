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

  it('switches audience and opens pages', () => {
    expect(m('switch to learn mode')?.actions).toEqual([{ type: 'set_audience', audience: 'learn' }]);
    expect(m('Switch to planner')?.actions).toEqual([{ type: 'set_audience', audience: 'planner' }]);
    expect(m('open compare')?.actions).toEqual([{ type: 'open_page', page: 'compare' }]);
    expect(m('open the validate page')?.actions).toEqual([{ type: 'open_page', page: 'validate' }]);
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
