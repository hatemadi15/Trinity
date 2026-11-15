import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { DEFAULT_POWER } from '@/lib/engine/power';
import type { Outcome } from '@/lib/scenario/outcome';
import type { Outcome as PlanOutcome } from '@/lib/plan/outcome';
import { checkRequirements, NO_REQUIREMENTS } from '@/lib/plan/requirements';
import type { Scenario } from '@/lib/scenario/scenario';
import { decidingFigure, figureRows, READY_PAIRS, settingRows, signedPoints, signedSpan, story, timingLine, verdictLine, type Column } from './compare';

const rim: Site = { id: 'rim', name: 'Rim (formal)', label: 'Rim', lat: -88.28, lon: -64.31, category: 'x', polar: true, source: 'x' };
const summit: Site = { id: 'summit', name: 'Summit (formal)', label: 'Summit', lat: -88.66401, lon: -68.40606, category: 'x', polar: true, source: 'x' };

const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'rim', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
const later: Scenario = { ...base, id: 'b', label: '5 days later', startUtc: '2027-01-06T00:00:00', from: 'a' };
const near: Scenario = { ...later, id: 'c', label: 'Nearby: Summit', siteId: 'summit', from: 'b' };

/** The figures a column needs, with the ones a test does not name left plain. */
function outcome(o: Partial<Outcome> & { poweredH: number }): Outcome {
  const hours = o.hours ?? 720;
  return {
    days: hours / 24,
    hours,
    allPeriod: o.poweredH >= hours,
    sunFraction: 0.5,
    earthFraction: 0.45,
    poweredContactH: 0,
    outage: { start: 0, end: 100, hours: 100, fromStart: false, toEnd: false },
    firstSunset: { at: 67, inHours: 67, leftHours: hours },
    firstEarthset: { at: 30, inHours: 30, leftHours: hours },
    sunAtLanding: true,
    earthAtLanding: true,
    firstSunriseH: 0,
    firstEarthriseH: 0,
    longestNightH: 300,
    batteryH: 10,
    answer: { tone: o.poweredH >= hours ? 'good' : 'bad', kind: 'night', title: 't', sentences: ['First.', 'The Sun sets behind the hills on 3 January, and the night lasts 16 days 15 hours.'], better: null, hint: null, poweredHours: o.poweredH, contactHours: 0 },
    verdict: 'power for 3 days 4 hours, then night',
    best: null,
    ...o,
  } as Outcome;
}

const cols: Column[] = [
  { scenario: base, site: rim, siteName: 'Rim', outcome: outcome({ poweredH: 76, sunFraction: 0.446, earthFraction: 0.45, outage: { start: 10, end: 229, hours: 219, fromStart: false, toEnd: false }, longestNightH: 399 }) },
  {
    scenario: later,
    site: rim,
    siteName: 'Rim',
    outcome: outcome({
      poweredH: 10,
      sunFraction: 0.408,
      earthFraction: 0.45,
      sunAtLanding: false,
      firstSunriseH: 346,
      earthAtLanding: false,
      firstEarthriseH: 40,
      outage: { start: 0, end: 297, hours: 297, fromStart: true, toEnd: false },
      longestNightH: 346,
      verdict: 'power for 10 hours, then night',
      answer: {
        tone: 'bad',
        kind: 'night',
        title: 't',
        sentences: ['No radio contact: Earth is out of view for all 10 hours with power.', 'The period starts at night: the Sun is set behind the hills until it rises on 10 January.', 'The battery covers the first 10 hours of the night; power comes back on 10 January.'],
        better: null,
        hint: null,
        poweredHours: 10,
        contactHours: 0,
      },
    }),
  },
  {
    scenario: near,
    site: summit,
    siteName: 'Summit',
    outcome: outcome({ poweredH: 720, sunFraction: 1, earthFraction: 0.487, poweredContactH: 351, outage: { start: 300, end: 574, hours: 274, fromStart: false, toEnd: false }, longestNightH: 0, firstSunset: { at: null, inHours: null, leftHours: 720 }, verdict: 'power for all 30 days' }),
  },
];

describe('signed changes', () => {
  it('signs a span with a true minus and its units, and says when nothing changed', () => {
    expect(signedSpan(50)).toBe('+2 d 2 h');
    expect(signedSpan(-66)).toBe('−2 d 18 h');
    expect(signedSpan(0)).toBe('no change');
    expect(signedPoints(0.408, 0.446)).toBe('−4 points');
    expect(signedPoints(1, 0.446)).toBe('+55 points');
    expect(signedPoints(0.4501, 0.4499)).toBe('no change');
  });
});

describe('the figures side by side', () => {
  it('gives each figure for each scenario, the change from the baseline beside it, and whether that change is better or worse', () => {
    const rows = figureRows(cols);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(rows.map((r) => r.name)).toEqual([
      'Time with power',
      'Sunlight',
      'Earth in view',
      'Radio contact while it has power',
      'Longest time without Earth',
      'First sunset after landing',
      'Earth first sets after landing',
      'Longest night',
      'What happens',
    ]);
    // The baseline shows its figures and no change.
    expect(row('power').cells[0]).toEqual({ value: '3 d 4 h', change: null, tone: null });
    expect(row('power').cells[1]).toEqual({ value: '10 h', change: '−2 d 18 h', tone: 'worse' });
    expect(row('power').cells[2]).toEqual({ value: 'all 30 days', change: '+26 d 20 h', tone: 'better', best: true });
    expect(row('sun').cells[1]).toEqual({ value: '41 %', change: '−4 points', tone: 'worse' });
    expect(row('earth').cells[1]).toEqual({ value: '45 %', change: 'no change', tone: 'same' });
    expect(row('contact').cells[2]).toEqual({ value: '14 d 15 h', change: '+14 d 15 h', tone: 'better', best: true });
    // Less time without Earth is better; an edge of the period cuts the delayed landing's, so it is "at least".
    expect(row('outage').cells[1]).toEqual({ value: 'at least 12 d 9 h', change: '+3 d 6 h', tone: 'worse' });
    expect(row('outage').cells[2]).toEqual({ value: '11 d 10 h', change: '+2 d 7 h', tone: 'worse' });
    expect(row('sunset').cells[0]).toEqual({ value: '2 d 19 h', change: null, tone: null });
    // A body not there at landing says when it first comes: the night at landing lasts 14 d 10 h.
    expect(row('sunset').cells[1]).toEqual({ value: 'night at landing, rises after 14 d 10 h', change: 'was 2 d 19 h', tone: 'worse' });
    expect(row('earthset').cells[1]).toEqual({ value: 'out of view at landing, rises after 1 d 16 h', change: 'was 1 d 6 h', tone: 'worse' });
    // Out of view at landing in both, the one that comes sooner is better.
    const both = figureRows([cols[1], { ...cols[1], outcome: { ...cols[1].outcome!, firstEarthriseH: 100 } }]).find((r) => r.id === 'earthset')!;
    expect(both.cells[1]).toEqual({ value: 'out of view at landing, rises after 4 d 4 h', change: '2 d 12 h later', tone: 'worse' });
    expect(row('sunset').cells[2]).toEqual({ value: 'none in the period', change: 'was 2 d 19 h', tone: 'better' });
    expect(row('night').cells[2]).toEqual({ value: 'none', change: '−16 d 15 h', tone: 'better', best: true });
    expect(row('verdict').cells[2]).toEqual({ value: 'power for all 30 days', change: null, tone: 'better' });
  });

  it('marks the best of a row only where the landings differ, never the time without Earth, and never on incomplete terrain', () => {
    const marks = (list: Column[]) => Object.fromEntries(figureRows(list).map((r) => [r.id, r.cells.map((c) => c?.best === true)]));
    const all = marks(cols);
    expect(all.power).toEqual([false, false, true]);
    expect(all.sun).toEqual([false, false, true]);
    // Level figures leave the row unmarked: the first two share 45 % of Earth in view, and the third has more.
    expect(all.earth).toEqual([false, false, true]);
    expect(marks([cols[0], cols[1]]).earth).toEqual([false, false]);
    expect(marks([cols[0], cols[1]]).contact).toEqual([false, false]);
    // The period's ends cut the time without Earth ("at least"), and a first setting is not ordered: neither is marked.
    for (const id of ['outage', 'sunset', 'earthset', 'verdict']) expect(all[id]).toEqual([false, false, false]);
    // A landing alone, or one still being worked out, marks nothing.
    expect(marks([cols[0]]).power).toEqual([false]);
    expect(marks([cols[0], { ...cols[2], outcome: null }]).power).toEqual([false, false]);
    // Incomplete terrain can only make a figure too good: that landing is never marked, and when it shows the best value none is.
    const shaky = { ...cols[2], terrain: { quality: 'incomplete' } as Column['terrain'] };
    expect(marks([cols[0], cols[1], shaky]).power).toEqual([false, false, false]);
    expect(marks([cols[0], cols[1], shaky]).earth).toEqual([false, false, false]);
  });

  it('says which landing works best in one line, with the figure that decides it', () => {
    expect(verdictLine(cols)).toEqual({
      index: 2,
      reason: 'Longest time with power',
      line: '“Nearby: Summit” works best of these 3 landings: power for all 30 days, the longest here, with 14 days 15 hours of radio contact while it has power.',
    });
    // The visitor's own landing goes by "Your landing".
    expect(verdictLine([cols[0], cols[1]])).toEqual({ index: 0, reason: 'Longest time with power', line: 'Your landing works best of these 2 landings: power for 3 days 4 hours, the longest here, with no radio contact while it has power.' });
    // Nothing is said of a landing alone, or while one is worked out.
    expect(verdictLine([cols[0]])).toBeNull();
    expect(verdictLine([cols[0], { ...cols[1], outcome: null }])).toBeNull();
    // Level landings are said to be level, and none is named.
    expect(verdictLine([cols[0], { ...cols[0], scenario: { ...cols[0].scenario, id: 'z', label: 'Copy' } }])).toEqual({
      index: null,
      line: 'All of these landings work equally well: power for 3 days 4 hours, with no radio contact while it has power.',
    });
    // On incomplete terrain the best figures may be too high: no landing is named.
    expect(verdictLine([cols[0], { ...cols[2], terrain: { quality: 'incomplete' } as Column['terrain'] }])).toEqual({
      index: null,
      line: 'The terrain at Summit is incomplete, so no landing is named as working best: its figures may be too high.',
    });
    // A high point worked out from the heights is said not to be checked for landing.
    const derived = { ...cols[2], site: { ...summit, source: 'derived from LOLA' } };
    expect(verdictLine([cols[0], derived])!.line).toMatch(/ Summit is a high point worked out from the heights, not checked for landing\.$/);
  });

  it('says Earth is never in view on the far side, rather than a share of none', () => {
    const far = { ...cols[2], site: { ...summit, far_side: true }, outcome: { ...cols[2].outcome!, earthFraction: 0 } };
    expect(figureRows([cols[0], far]).find((r) => r.id === 'earth')!.cells[1]).toEqual({ value: 'never: far side', change: '\u221245 points', tone: 'worse' });
  });

  it('leaves a scenario still being worked out empty', () => {
    const rows = figureRows([cols[0], { ...cols[1], outcome: null }]);
    expect(rows[0].cells[1]).toBeNull();
  });

  it('gives the settings of each scenario, marking those that differ from the baseline', () => {
    const rows = settingRows(cols);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('site').cells.map((c) => c.value)).toEqual(['Rim', 'Rim', 'Summit']);
    expect(row('site').cells[2].change).toBe('12 km from Rim');
    // What kind of point each is, so a region's centre or a derived high point never reads as a surveyed spot.
    const kinds = settingRows([{ ...cols[0], site: { ...rim, kind: 'region_centre', uncertainty_km: 5 } }, { ...cols[2], site: { ...summit, kind: 'derived' } }]).find((r) => r.id === 'site')!;
    expect(kinds.cells.map((c) => c.kind)).toEqual(['Centre of a region, ±5\u00a0km', 'Derived high point, not checked as safe to land']);
    expect(row('landing').cells.map((c) => c.value)).toEqual(['1 Jan 2027, 00:00 UTC', '6 Jan 2027, 00:00 UTC', '6 Jan 2027, 00:00 UTC']);
    expect(row('landing').cells[1].change).toBe('5 days later');
    expect(row('landing').cells[0].change).toBeNull();
    expect(row('period').cells[1]).toEqual({ value: '30 days', change: null });
    expect(row('lander').cells[0].value).toBe('Small lander: 4 m² panel, uses 200 W, 2 kWh battery');
  });
});

describe('the comparison in words', () => {
  it('says what changed at the original site, with the reason', () => {
    const s = story(cols);
    expect(s.atOriginal).toEqual([
      '5 days later: power for 10 hours instead of 3 days 4 hours. The period starts at night: the Sun is set behind the hills until it rises on 10 January.',
    ]);
  });

  it('names the alternative that works better than the scenario it was made from, at the same landing time, with the trade-offs', () => {
    const s = story(cols);
    expect(s.alternative?.lead).toBe('Summit (12 km) works better than “5 days later” at the same landing time: power for all 30 days instead of 10 hours.');
    expect(s.alternative?.tradeoffs).toEqual([
      'Sunlight: 100 % against 41 %: better.',
      'Radio contact while it has power: 14 days 15 hours against none: better.',
      'Earth in view: 49 % against 45 %: better.',
      'Longest time without Earth: 11 days 10 hours against at least 12 days 9 hours: better.',
    ]);
  });

  it('never offers a high point worked out from the heights as a checked place to land', () => {
    const derived = { ...cols[2], site: { ...summit, source: 'derived: argmax LOLA 20 m height in annulus around de_gerlache_center' } };
    expect(story([cols[0], cols[1], derived]).alternative?.lead).toMatch(/^Summit \(12 km, not checked for landing\) works better than “5 days later”/);
    const kind = { ...cols[2], site: { ...summit, kind: 'derived' } as Site };
    expect(story([cols[0], cols[1], kind]).alternative?.lead).toMatch(/^Summit \(12 km, not checked for landing\) works better/);
  });

  it('says when no alternative works better, with its figures', () => {
    const worse = { ...cols[2], outcome: outcome({ poweredH: 5, verdict: 'power for 5 hours, then night' }) };
    expect(story([cols[0], cols[1], worse]).alternative?.lead).toBe('Summit (12 km) does not work better than “5 days later” at the same landing time: power for 5 hours instead of 10 hours.');
  });

  it('with the same time with power, names the figure that decides it, or says the two are level: never "10 hours instead of 10 hours"', () => {
    // Both lands at night on the battery alone: 10 hours each, the other site with Earth in view all the while.
    const night = (contact: number, sun = 0.408) => outcome({ poweredH: 10, poweredContactH: contact, sunFraction: sun, verdict: 'power for 10 hours, then night' });
    const at = (o: Outcome) => [cols[0], { ...cols[1], outcome: night(0) }, { ...cols[2], outcome: o }];
    const more = story(at(night(10))).alternative!.lead;
    expect(more).toBe('Summit (12 km) works better than “5 days later” at the same landing time: power for 10 hours, as long as “5 days later”, with more radio contact while it has power: 10 hours against none.');
    expect(more).not.toMatch(/instead of/);
    const sunnier = story(at(night(0, 0.52))).alternative!.lead;
    expect(sunnier).toBe('Summit (12 km) works better than “5 days later” at the same landing time: power for 10 hours, as long as “5 days later”, with more sunlight: 52\u00a0% against 41\u00a0%.');
    const less = story([cols[0], { ...cols[1], outcome: night(10) }, { ...cols[2], outcome: night(4) }]).alternative!.lead;
    expect(less).toBe('Summit (12 km) does not work better than “5 days later” at the same landing time: power for 10 hours, as long as “5 days later”, with less radio contact while it has power: 4 hours against 10 hours.');
    // Level on every figure as the page shows it (41 % and 41 %): neither is said to work better.
    const level = story(at(night(0, 0.4081))).alternative!.lead;
    expect(level).toBe('Summit (12 km) works as well as “5 days later” at the same landing time: power for 10 hours, as long as “5 days later”, with the same radio contact while it has power (none) and sunlight (41\u00a0%).');
    expect(decidingFigure(night(0, 0.4081), night(0))).toBeNull();
    expect(decidingFigure(night(3), night(0))).toBe('contact');
    expect(decidingFigure(outcome({ poweredH: 11 }), night(0))).toBe('power');
  });

  it('says which landing works best with the figure that decides a tie on power, and calls a tie no one can read level', () => {
    const night = (contact: number, sun = 0.408) => outcome({ poweredH: 10, poweredContactH: contact, sunFraction: sun, verdict: 'power for 10 hours, then night' });
    const pair = (a: Outcome, b: Outcome): Column[] => [
      { ...cols[0], outcome: a },
      { ...cols[2], outcome: b },
    ];
    expect(verdictLine(pair(night(0), night(10)))).toEqual({
      index: 1,
      reason: 'Same time with power, most radio contact',
      line: '“Nearby: Summit” works best of these 2 landings: power for 10 hours, as long as any here, with the most radio contact while it has power: 10 hours against none.',
    });
    expect(verdictLine(pair(night(0), night(0, 0.52)))!.line).toBe(
      '“Nearby: Summit” works best of these 2 landings: power for 10 hours, as long as any here, with the same radio contact while it has power, and the most sunlight: 52\u00a0% against 41\u00a0%.',
    );
    // 40.8 % and 40.81 % both show as 41 %: the landings are level, and none is named.
    expect(verdictLine(pair(night(0), night(0, 0.4081)))).toEqual({ index: null, line: 'All of these landings work equally well: power for 10 hours, with no radio contact while it has power.' });
  });

  it('says the landing times differ, and never compares an alternative at another time as if it were the same', () => {
    const other = { ...cols[2], scenario: { ...near, startUtc: '2027-01-08T00:00:00', timing: 'site-best' as const } };
    const s = story([cols[0], cols[1], other]);
    expect(s.alternative?.lead).toMatch(/^Summit \(12 km\) works better than “5 days later”, landing 8 January 2027, 00:00 UTC against 6 January 2027, 00:00 UTC: /);
  });
});

describe('the landing times', () => {
  it('says when the baseline alone lands', () => {
    expect(timingLine([cols[0]])).toBe('Your landing is 1 January 2027, 00:00 UTC.');
  });

  it('says when every scenario lands at the same time', () => {
    expect(timingLine([cols[1], cols[2]])).toBe('Every landing here is at the same time: 6 January 2027, 00:00 UTC.');
  });

  it('says once that every landing is at its own site’s best time, when each is', () => {
    const best = (c: Column, startUtc: string): Column => ({ ...c, scenario: { ...c.scenario, startUtc, timing: 'site-best' } });
    expect(timingLine([best(cols[0], '2027-01-03T05:00:00'), best(cols[2], '2027-01-08T00:00:00')])).toBe(
      'Landing times differ: dates change as well as places. Each lands at its site’s own best time in its period, not a time they share by choice.',
    );
  });

  it('says when they differ, and names a scenario at its site’s own best time', () => {
    expect(timingLine(cols)).toBe('Landing times differ: dates change as well as places.');
    const best = { ...cols[2], scenario: { ...near, timing: 'site-best' as const } };
    expect(timingLine([cols[1], best])).toBe('Every landing here is at the same time: 6 January 2027, 00:00 UTC. “Nearby: Summit” lands at Summit’s own best time in its period, not a time it shares by choice.');
  });
});

describe('READY_PAIRS', () => {
  it('offers two pairs of catalogue sites, each with a plain title', () => {
    expect(READY_PAIRS).toHaveLength(2);
    expect(READY_PAIRS[0]).toEqual({ title: 'A ridge vs the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] });
    expect(READY_PAIRS[1]).toEqual({ title: 'A sunlit rim vs a crater floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] });
  });
});

describe('each scenario’s requirement checks', () => {
  // The planner's requirements, checked against what each scenario's lander gets (lib/plan).
  const plan = (poweredH: number, poweredOutageH: number): PlanOutcome => ({ hour: 0, stayH: 720, poweredH, sunH: 300, contactH: 300, poweredContactH: 0, outageH: 200, poweredOutageH, firstContactH: 0, sunlitAtLanding: true });
  const req = { ...NO_REQUIREMENTS, minPoweredH: 120, maxOutageH: 72 };

  it('adds a row of your requirements, each scenario against the baseline, only once a requirement is set', () => {
    const checked = cols.map((c, i) => ({ ...c, checks: checkRequirements(i === 0 ? plan(76, 60) : i === 1 ? plan(10, 10) : plan(720, 60), req) }));
    const row = figureRows(checked).find((r) => r.id === 'requirements')!;
    expect(row.name).toBe('Your requirements');
    // Each check reads met or failed, with its value and its margin, under the count of those failed.
    expect(row.cells[0]).toEqual({
      value: 'Fails 1 of your 2 requirements.',
      change: null,
      tone: null,
      checks: [
        { met: false, words: 'Power for at least 5 d: 3 d 4 h, 1 d 20 h short' },
        { met: true, words: 'Longest time without Earth while powered at most 3 d: 2 d 12 h, 12 h to spare' },
      ],
    });
    expect(row.cells[1]).toMatchObject({ value: 'Fails 1 of your 2 requirements.', change: 'same', tone: 'same' });
    expect(row.cells[1]!.checks!.map((c) => c.words)).toEqual(['Power for at least 5 d: 10 h, 4 d 14 h short', 'Longest time without Earth while powered at most 3 d: 10 h, 2 d 14 h to spare']);
    expect(row.cells[2]).toMatchObject({ value: 'Meets all 2 of your requirements.', change: '1 fewer failed', tone: 'better' });
    expect(row.cells[2]!.checks!.map((c) => c.met)).toEqual([true, true]);
    // With 90 % of terrain versions asked for too, which Compare does not check, a scenario that fails none meets the
    // requirements checked here, never all of yours.
    const asked = { ...req, minHoldPct: 90 };
    const unchecked = cols.map((c, i) => ({ ...c, checks: checkRequirements(i === 0 ? plan(76, 60) : plan(720, 60), asked), unchecked: true }));
    const held = figureRows(unchecked).find((r) => r.id === 'requirements')!;
    expect(held.cells[0]).toMatchObject({ value: 'Fails 1 of your 2 requirements.' });
    expect(held.cells[2]).toMatchObject({ value: 'Meets the requirements checked here.', change: '1 fewer failed', tone: 'better' });
    // With none set there is nothing to check, and no row.
    expect(figureRows(cols).some((r) => r.id === 'requirements')).toBe(false);
    expect(figureRows(cols.map((c) => ({ ...c, checks: [] }))).some((r) => r.id === 'requirements')).toBe(false);
  });
});
