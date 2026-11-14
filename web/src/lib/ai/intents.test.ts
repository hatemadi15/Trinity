import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { EXPLANATIONS, INTENTS, matchIntent, parseClock } from './intents';

const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];

const m = (prompt: string) => matchIntent(prompt, sites);

describe('matchIntent', () => {
  it('has thirteen rehearsed intents', () => {
    expect(INTENTS.length).toBe(13);
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
    expect(m('best 45-day window')?.actions).toEqual([{ type: 'find_best_window', days: 45, scope: 'site' }]);
    expect(m('best 120-day window')).toBeNull();
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

  it('sets the period alone, any length from 2 to 90 days, and says the bounds when the asked one is outside them', () => {
    expect(m('make it 90 days')?.actions).toEqual([{ type: 'set_window', days: 90 }]);
    expect(m('for 14 days')?.actions).toEqual([{ type: 'set_window', days: 14 }]);
    expect(m('for 7 days')?.actions).toEqual([{ type: 'set_window', days: 7 }]);
    expect(m('for seven days')?.actions).toEqual([{ type: 'set_window', days: 7 }]);
    expect(m('make it 45 days')?.actions).toEqual([{ type: 'set_window', days: 45 }]);
    expect(m('set the period to 30 days')?.actions).toEqual([{ type: 'set_window', days: 30 }]);
    expect(m('set the length to 10 days')?.actions).toEqual([{ type: 'set_window', days: 10 }]);
    expect(m('make it 90 days')?.reply).toBe('Period: 90 days.');
    for (const prompt of ['make it 120 days', 'for 1 day']) {
      const r = m(prompt);
      expect(r?.actions, prompt).toEqual([]);
      expect(r?.reply, prompt).toBe('A period is 2 to 90 whole days, so the period stays as it is.');
    }
  });

  it('answers in the words the pages use', () => {
    const old = /skyline|window|verdict|planner|validate/i;
    for (const prompt of ['start on 2027-03-01 for 14 days', 'Find the best 30 day window', 'best 14-day window across the compared sites', 'set the load to 5000 W', 'set the battery to 90000 Wh', 'mast to 25 m', 'mast to 5 m', 'open the validate page', 'compare haworth and nobile rim 2 for 120 days', 'make it 120 days', 'delay the landing by five days', 'start at 17:00 UTC']) {
      expect(m(prompt)?.reply, prompt).not.toMatch(old);
    }
    expect(m('start on 2027-03-01 for 14 days')?.reply).toBe('Period: from 1 March 2027, 00:00 UTC, for 14 days.');
    expect(m('start on 2027-03-01')?.reply).toBe('Period: from 1 March 2027, 00:00 UTC.');
  });

  it('finds the best landing date when asked in the words the pages use', () => {
    expect(m('Find the best landing date for 14 days')?.actions).toEqual([{ type: 'find_best_window', days: 14, scope: 'site' }]);
    expect(m('best 30-day landing date across the compared sites')?.actions).toEqual([{ type: 'find_best_window', days: 30, scope: 'compare' }]);
    expect(m('the best landing day for 90 days')?.actions).toEqual([{ type: 'find_best_window', days: 90, scope: 'site' }]);
    expect(m('best landing date for 45 days')?.actions).toEqual([{ type: 'find_best_window', days: 45, scope: 'site' }]);
    expect(m('best landing date for 120 days')).toBeNull();
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

  it('compares over any length from 2 to 90 days, and says the bounds when the asked one is outside them', () => {
    expect(m('compare haworth and nobile rim 2 for 20 days')?.actions).toEqual([
      { type: 'add_to_compare', id: 'haworth' },
      { type: 'add_to_compare', id: 'nobile_rim_2' },
      { type: 'set_window', days: 20 },
      { type: 'open_page', page: 'compare' },
    ]);
    const r = m('compare haworth and nobile rim 2 for 120 days');
    expect(r?.actions).toEqual([
      { type: 'add_to_compare', id: 'haworth' },
      { type: 'add_to_compare', id: 'nobile_rim_2' },
      { type: 'open_page', page: 'compare' },
    ]);
    expect(r?.reply).toMatch(/A period is 2 to 90 whole days, so the period stays as it is\.$/);
  });
});

describe('the landing hour, the length and a slipped landing, in plain words', () => {
  it('starts on a date at a UTC hour, typed in the usual ways', () => {
    expect(m('start on January 20th 2027 at 17:00 UTC')).toEqual({ actions: [{ type: 'set_window', startUtc: '2027-01-20T17:00:00' }], reply: 'Period: from 20 January 2027, 17:00 UTC.' });
    expect(m('start on 2027-01-20 at 17:00 for 7 days')).toEqual({ actions: [{ type: 'set_window', startUtc: '2027-01-20T17:00:00', days: 7 }], reply: 'Period: from 20 January 2027, 17:00 UTC, for 7 days.' });
    for (const prompt of ['land on 20 January 2027 at 5 pm', 'start on 20 January 2027 at 1700 UTC', 'begin on January 20, 2027 at 5:00 p.m.', 'start on 2027-01-20 17:00']) {
      expect(m(prompt)?.actions, prompt).toEqual([{ type: 'set_window', startUtc: '2027-01-20T17:00:00' }]);
    }
    // Minutes are read at the nearest whole hour, as the engine reads its hourly table, and the reply says so.
    expect(m('start on 20 January 2027 at 17:40')).toEqual({
      actions: [{ type: 'set_window', startUtc: '2027-01-20T18:00:00' }],
      reply: 'Period: from 20 January 2027, 18:00 UTC. The Sun and Earth table is hourly, so 17:40 is read as 18:00 UTC.',
    });
  });

  it('lands at a UTC hour on the date already chosen', () => {
    expect(m('start at 17:00 UTC')).toEqual({ actions: [{ type: 'set_window', timeUtc: '17:00' }], reply: 'Landing at 17:00 UTC on the date already chosen.' });
    expect(m('land at 6 am')?.actions).toEqual([{ type: 'set_window', timeUtc: '06:00' }]);
    expect(m('start at 17:00 for 7 days')?.actions).toEqual([{ type: 'set_window', timeUtc: '17:00', days: 7 }]);
    // A time no clock shows, or an hour that could be morning or evening, is left to the model.
    for (const prompt of ['start at 24:00', 'start at 5', 'land at the rim', 'start playing']) expect(m(prompt), prompt).toBeNull();
  });

  it('moves the landing by days or hours, later or earlier, keeping the length', () => {
    const shifts: [string, number][] = [
      ['delay the landing by five days', 120],
      ['Delay the landing by 5 days.', 120],
      ['delay by five days', 120],
      ['postpone the landing by 2 days', 48],
      ['push back the landing by a day', 24],
      ['our landing slipped by five days', 120],
      ['the landing slipped five days', 120],
      ['shift by 6 hours', 6],
      ['shift the landing by -6 hours', -6],
      ['shift the landing 6 hours earlier', -6],
      ['move the landing 2 days earlier', -48],
      ['move the landing forward by 3 hours', -3],
      ['bring the landing forward by 3 hours', -3],
      ['land 2 days later', 48],
      ['land a day earlier', -24],
      ['shift the start by twenty four hours', 24],
    ];
    for (const [prompt, hours] of shifts) expect(m(prompt)?.actions, prompt).toEqual([{ type: 'shift_window', hours }]);
    expect(m('delay the landing by five days')?.reply).toBe('Moving the landing 5 days later.');
    expect(m('shift the landing by -6 hours')?.reply).toBe('Moving the landing 6 hours earlier.');
    for (const prompt of ['delay the landing by 0 days', 'shift by some hours', 'move the lander 2 m']) expect(m(prompt), prompt).toBeNull();
  });
});

describe('parseClock', () => {
  it('reads a time of day as typed or said, in minutes after midnight UTC', () => {
    const cases: [string, number][] = [
      ['17:00', 1020],
      ['17:00 utc', 1020],
      ['17:00 UTC', 1020],
      ['06:00z', 360],
      ['1700', 1020],
      ['1700 hours', 1020],
      ['17h', 1020],
      ['17h00', 1020],
      ['5 pm', 1020],
      ['5pm', 1020],
      ['5 p m', 1020],
      ['5 p.m.', 1020],
      ['5:30 pm', 1050],
      ['5 30 p m', 1050],
      ['12 am', 0],
      ['12 pm', 720],
      ['noon', 720],
      ['midnight', 0],
      ['17 hundred', 1020],
      ['17 hundred hours', 1020],
      ['oh 6 hundred', 360],
      ['0 6 hundred', 360],
      ['6 hundred hours', 360],
      ['17 30', 1050],
      ['17 utc', 1020],
    ];
    for (const [text, minutes] of cases) expect(parseClock(text), text).toBe(minutes);
  });

  it('reads nothing that is no clock time, or an hour without morning or evening', () => {
    for (const text of ['24:00', '25:00', '17:60', '13 pm', '0 am', 'soon', '5', '17', '', '2027']) expect(parseClock(text), text).toBeNull();
  });
});
