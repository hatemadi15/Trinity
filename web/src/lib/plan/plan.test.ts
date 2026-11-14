import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { outcomeScanner, periodOutcome, worstOf, type Outcome } from './outcome';
import { checkRequirements, checksWords, NO_REQUIREMENTS, requirementCount, type Requirements } from './requirements';
import { compareOptions, FAIL_RULE, OBJECTIVE, optionOf, pickApart, rankOptions, searchWords, tradeOffs, tradeOffWords, whyAbove } from './rank';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

function series(sun: number[], earth?: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth ?? rep(0, n)),
    sunAu: new Float64Array(n).fill(1),
  };
}

/** An outcome with the given figures and plain defaults for the rest. */
function outcome(o: Partial<Outcome>): Outcome {
  return { hour: 0, stayH: 720, poweredH: 100, sunH: 300, contactH: 200, poweredContactH: 50, outageH: 100, poweredOutageH: 50, firstContactH: 0, sunlitAtLanding: true, ...o };
}

const req = (r: Partial<Requirements>): Requirements => ({ ...NO_REQUIREMENTS, ...r });

describe('outcomes of a landing hour', () => {
  // Ten hours of Sun, then thirty of night; Earth in view from hour 5 to hour 14.
  const s = series([...rep(1, 10), ...rep(0, 30)], [...rep(0, 5), ...rep(1, 10), ...rep(0, 25)]);
  const at = outcomeScanner(s, CFG);

  it('counts the power in a row, the sunlight, Earth in view, contact while powered and the longest time without Earth, over the stay and while powered', () => {
    // Power for 20 hours: Earth is out of view for the first 5 and the last 5 of them, and for 25 hours at the end of the stay.
    expect(at(0, 40)).toEqual({ hour: 0, stayH: 40, poweredH: 20, sunH: 10, contactH: 10, poweredContactH: 10, outageH: 25, poweredOutageH: 5, firstContactH: 5, sunlitAtLanding: true });
    expect(at(5, 10)).toEqual({ hour: 5, stayH: 10, poweredH: 10, sunH: 5, contactH: 10, poweredContactH: 10, outageH: 0, poweredOutageH: 0, firstContactH: 0, sunlitAtLanding: true });
  });

  it('counts fewer hours of stay where the series ends, and has no first contact when Earth stays out of view', () => {
    expect(at(30, 20)).toEqual({ hour: 30, stayH: 10, poweredH: 10, sunH: 0, contactH: 0, poweredContactH: 0, outageH: 10, poweredOutageH: 10, firstContactH: null, sunlitAtLanding: false });
  });

  it('gives the same figures for a period from its own battery walk as for its first hour', () => {
    expect(periodOutcome(s, powerBudget(s, CFG))).toEqual(at(0, 40));
  });

  it('takes the worst of several sites for each figure, never their mean', () => {
    const a = outcome({ poweredH: 300, sunH: 400, contactH: 100, poweredContactH: 80, outageH: 50, poweredOutageH: 40, firstContactH: 2 });
    const b = outcome({ poweredH: 90, sunH: 500, contactH: 300, poweredContactH: 10, outageH: 200, poweredOutageH: 20, firstContactH: 0, sunlitAtLanding: false });
    expect(worstOf([a, b])).toEqual(outcome({ poweredH: 90, sunH: 400, contactH: 100, poweredContactH: 10, outageH: 200, poweredOutageH: 40, firstContactH: 2, sunlitAtLanding: false }));
    expect(worstOf([a, outcome({ firstContactH: null })]).firstContactH).toBeNull();
  });
});

describe('requirement checks', () => {
  it('checks nothing when no requirement is set', () => {
    expect(requirementCount(NO_REQUIREMENTS)).toBe(0);
    expect(checkRequirements(outcome({}), NO_REQUIREMENTS)).toEqual([]);
    expect(checksWords([])).toBeNull();
  });

  it('checks the least power in a row, with the value and the margin', () => {
    const [met] = checkRequirements(outcome({ poweredH: 303 }), req({ minPoweredH: 120 }));
    expect(met).toEqual({ id: 'power', label: 'Power for at least 5 d', met: true, value: 303, limit: 120, margin: 183, words: 'Power for at least 5 d: 12 d 15 h, 7 d 15 h to spare' });
    const [failed] = checkRequirements(outcome({ poweredH: 76 }), req({ minPoweredH: 120 }));
    expect(failed).toMatchObject({ met: false, value: 76, margin: -44, words: 'Power for at least 5 d: 3 d 4 h, 1 d 20 h short' });
  });

  it('checks Earth in view at the landing hour, or within a stated number of hours of it', () => {
    const at0 = req({ contactWithinH: 0 });
    expect(checkRequirements(outcome({ firstContactH: 0 }), at0)[0]).toMatchObject({ id: 'contact-at-landing', label: 'Earth in view at landing', met: true, value: 0, margin: 0, words: 'Earth in view at landing: yes' });
    expect(checkRequirements(outcome({ firstContactH: 5 }), at0)[0]).toMatchObject({ met: false, value: 5, margin: -5, words: 'Earth in view at landing: not until 5 h after landing, 5 h late' });
    const within6 = req({ contactWithinH: 6 });
    expect(checkRequirements(outcome({ firstContactH: 2 }), within6)[0]).toMatchObject({ label: 'Earth in view within 6 h of landing', met: true, margin: 4, words: 'Earth in view within 6 h of landing: after 2 h, 4 h to spare' });
    expect(checkRequirements(outcome({ firstContactH: null, stayH: 720 }), within6)[0]).toMatchObject({ met: false, value: null, margin: null, words: 'Earth in view within 6 h of landing: no, Earth stays out of view all 30 d' });
  });

  it('checks the longest time without Earth while the lander has power against the most the mission accepts', () => {
    // After the power is gone the lander cannot talk to Earth anyway: only the outage it lives through counts.
    expect(checkRequirements(outcome({ outageH: 400, poweredOutageH: 26 }), req({ maxOutageH: 72 }))[0]).toMatchObject({ id: 'outage', label: 'Longest time without Earth while powered at most 3 d', met: true, value: 26, margin: 46, words: 'Longest time without Earth while powered at most 3 d: 1 d 2 h, 1 d 22 h to spare' });
    expect(checkRequirements(outcome({ poweredOutageH: 396 }), req({ maxOutageH: 72 }))[0]).toMatchObject({ met: false, margin: -324, words: 'Longest time without Earth while powered at most 3 d: 16 d 12 h, 13 d 12 h too long' });
  });

  it('checks the least Earth contact while the lander has power', () => {
    expect(checkRequirements(outcome({ poweredContactH: 0 }), req({ minPoweredContactH: 24 }))[0]).toMatchObject({ id: 'powered-contact', label: 'Earth contact while powered at least 1 d', met: false, value: 0, margin: -24, words: 'Earth contact while powered at least 1 d: 0 h, 1 d short' });
  });

  it('checks every requirement set, in one order, and sums them up in a sentence', () => {
    const all = req({ minPoweredH: 120, contactWithinH: 0, maxOutageH: 72, minPoweredContactH: 24 });
    expect(requirementCount(all)).toBe(4);
    const checks = checkRequirements(outcome({ poweredH: 303, firstContactH: 0, poweredOutageH: 396, poweredContactH: 77 }), all);
    expect(checks.map((c) => [c.id, c.met])).toEqual([
      ['power', true],
      ['contact-at-landing', true],
      ['outage', false],
      ['powered-contact', true],
    ]);
    expect(checksWords(checks)).toBe('Fails 1 of your 4 requirements: longest time without Earth while powered at most 3 d (16 d 12 h).');
    expect(checksWords(checks.filter((c) => c.met))).toBe('Meets all 3 of your requirements.');
    expect(checksWords(checks.slice(0, 1))).toBe('Meets your requirement.');
    // Earth keeps its capital in the middle of a sentence.
    expect(checksWords(checkRequirements(outcome({ firstContactH: null }), req({ contactWithinH: 0 })))).toBe('Fails your requirement: Earth in view at landing (never in view).');
    expect(checksWords(checkRequirements(outcome({ firstContactH: 219 }), req({ contactWithinH: 0 })))).toBe('Fails your requirement: Earth in view at landing (not until 9 d 3 h after landing).');
  });
});

describe('ranking', () => {
  const two = req({ minPoweredH: 120, maxOutageH: 72 });

  it('ranks the choices that meet every requirement first, then by the longest power, then by contact while powered, then in the order given', () => {
    const long = optionOf('long but out of touch', outcome({ poweredH: 600, poweredOutageH: 300 }), two);
    const short = optionOf('meets both', outcome({ poweredH: 130, poweredOutageH: 40 }), two);
    const both = optionOf('fails both', outcome({ poweredH: 50, poweredOutageH: 400 }), two);
    const tie = optionOf('meets both, more contact', outcome({ poweredH: 130, poweredOutageH: 40, poweredContactH: 90 }), two);
    const twin = optionOf('meets both, same again', outcome({ poweredH: 130, poweredOutageH: 40, poweredContactH: 90 }), two);
    expect(rankOptions([both, long, short, twin, tie]).map((o) => o.item)).toEqual(['meets both, same again', 'meets both, more contact', 'meets both', 'long but out of touch', 'fails both']);
    expect(compareOptions(short, long)).toBeLessThan(0);
    expect(long.failed).toBe(1);
  });

  it('ranks by the objective alone when no requirement is set', () => {
    const a = optionOf('a', outcome({ poweredH: 600, poweredOutageH: 300 }), NO_REQUIREMENTS);
    const b = optionOf('b', outcome({ poweredH: 130, poweredOutageH: 40 }), NO_REQUIREMENTS);
    expect(rankOptions([b, a]).map((o) => o.item)).toEqual(['a', 'b']);
  });

  it('keeps alternatives apart: a time close to a better one is the same choice', () => {
    const at = (hour: number, poweredH: number) => optionOf(hour, outcome({ hour, poweredH }), NO_REQUIREMENTS);
    const ranked = rankOptions([at(0, 100), at(6, 300), at(12, 290), at(100, 250), at(200, 260)]);
    expect(pickApart(ranked, 72, 3).map((o) => o.item)).toEqual([6, 200, 100]);
    expect(pickApart(ranked, 72, 2).map((o) => o.item)).toEqual([6, 200]);
  });

  it('says in a plain sentence why a choice ranks above the next', () => {
    const meets = optionOf('a', outcome({ poweredH: 130, poweredOutageH: 40 }), two);
    const fails = optionOf('b', outcome({ poweredH: 600, poweredOutageH: 396 }), two);
    expect(whyAbove(meets, fails, 'time')).toBe('It meets every requirement; the next fails one: longest time without Earth while powered at most 3 d (16 d 12 h).');
    const failsBoth = optionOf('c', outcome({ poweredH: 50, poweredOutageH: 396 }), two);
    expect(whyAbove(fails, failsBoth, 'time')).toBe('It fails fewer requirements than the next: 1 against 2.');
    const a = optionOf('a', outcome({ poweredH: 303 }), NO_REQUIREMENTS);
    const b = optionOf('b', outcome({ poweredH: 76 }), NO_REQUIREMENTS);
    expect(whyAbove(a, b, 'time')).toBe('Power lasts 9 d 11 h longer than the next.');
    expect(whyAbove(a, b, 'time', 'landing at the period start')).toBe('Power lasts 9 d 11 h longer than landing at the period start.');
    const c = optionOf('c', outcome({ poweredH: 76, poweredContactH: 70 }), NO_REQUIREMENTS);
    expect(whyAbove(c, b, 'place')).toBe('Power lasts as long as the next, with 20 h more Earth contact while powered.');
    expect(whyAbove(b, b, 'place')).toBe('It ties with the next and comes first as the nearer place.');
    expect(whyAbove(b, b, 'time')).toBe('It ties with the next and comes first as the earlier time.');
  });
});

describe('trade-offs against the current choice', () => {
  it('gives each figure signed, with its unit, and whether it is better', () => {
    const base = outcome({ poweredH: 76, sunH: 300, contactH: 200, poweredContactH: 0, poweredOutageH: 396 });
    const t = tradeOffs(outcome({ poweredH: 303, sunH: 300, contactH: 180, poweredContactH: 77, poweredOutageH: 300 }), base);
    expect(t.map((x) => [x.id, x.delta, x.better])).toEqual([
      ['power', 227, true],
      ['sunlight', 0, null],
      ['contact', -20, false],
      ['powered-contact', 77, true],
      ['outage', -96, true],
    ]);
    expect(tradeOffWords(t)).toBe('Power +9 d 11 h, sunlight same, Earth in view −20 h, contact while powered +3 d 5 h, longest time without Earth while powered −4 d');
  });
});

describe('what the ranking is and how finely it searched, said where the recommendations are', () => {
  it('states the objective, the rule for a failed requirement and the search resolution', () => {
    expect(OBJECTIVE).toBe('Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier time or the nearer place.');
    expect(FAIL_RULE).toBe('A choice that fails a requirement ranks below every choice that meets them all; among those, fewer failures rank first.');
    expect(searchWords({ kind: 'period', days: 30 })).toBe('Landing times tried every hour of these 30 days (UTC), each for a 30-day stay.');
    expect(searchWords({ kind: 'year', days: 30, stepH: 6 })).toBe('Landing times tried every 6 hours over the next 12 months (UTC), each for a 30-day stay.');
    expect(searchWords({ kind: 'place', days: 30, km: 30 })).toBe('Catalogue sites within 30 km tried from the same landing hour, each for a 30-day stay.');
  });
});
