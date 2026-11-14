import { describe, expect, it } from 'vitest';
import type { Outcome } from './outcome';
import {
  BY_POWER,
  compareOptions,
  curve,
  objectiveWords,
  optionOf,
  PRIORITY_PROFILES,
  priorityWords,
  profileOf,
  rankOptions,
  scoreWords,
  validPriorities,
  weighedScore,
  whyAbove,
  yearRuleWords,
  type Priorities,
  type RankBy,
} from './rank';
import { NO_REQUIREMENTS } from './requirements';

/** An outcome over a stay of `stayH` hours with the three measures the weighed rule reads, the rest plain. */
function outcome(poweredH: number, poweredContactH: number, outageH: number, stayH = 720): Outcome {
  return { hour: 0, stayH, poweredH, sunH: poweredH, contactH: poweredContactH, poweredContactH, outageH, poweredOutageH: 0, firstContactH: 0, sunlitAtLanding: true };
}

const weighed = (priorities: Priorities): RankBy => ({ kind: 'weighed', priorities });
const balanced = weighed({ power: 1, contact: 1, gap: 1 });
const profile = (id: string) => weighed(PRIORITY_PROFILES.find((p) => p.id === id)!.priorities);

describe('the weighed ranking rule', () => {
  it('counts a share x of the stay as 0.55x + 0.30√x + 0.15x², from 0 for none to 1 for all of it', () => {
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBeCloseTo(1, 12);
    expect(curve(0.25)).toBeCloseTo(0.55 * 0.25 + 0.3 * 0.5 + 0.15 * 0.0625, 12);
    // A share outside 0 to 1 is held to it.
    expect(curve(-1)).toBe(0);
    expect(curve(2)).toBeCloseTo(1, 12);
  });

  it('scores power, Earth contact while powered and no time without Earth for the whole stay as 100, and none of them as 0', () => {
    for (const p of PRIORITY_PROFILES) expect(weighedScore(outcome(720, 720, 0), p.priorities).score).toBeCloseTo(100, 9);
    expect(weighedScore(outcome(0, 0, 720), { power: 1, contact: 1, gap: 1 }).score).toBe(0);
  });

  it('weighs each measure by its share of the priorities, and its part is its term of the score', () => {
    // Power for a quarter of a 100-hour stay, no Earth at all: only the power term counts, a third of the weight.
    const s = weighedScore(outcome(25, 0, 100, 100), { power: 1, contact: 1, gap: 1 });
    expect(s.parts.power).toBeCloseTo((100 * curve(0.25)) / 3, 9);
    expect(s.parts.contact).toBe(0);
    expect(s.parts.gap).toBe(0);
    expect(s.score).toBeCloseTo(s.parts.power + s.parts.contact + s.parts.gap, 12);
    // Five times the priority on power: five sevenths of the weight.
    expect(weighedScore(outcome(25, 0, 100, 100), { power: 5, contact: 1, gap: 1 }).parts.power).toBeCloseTo((100 * 5 * curve(0.25)) / 7, 9);
  });

  it('never lowers a score when one measure improves and the others stay', () => {
    const p = { power: 2, contact: 3, gap: 1 };
    for (let h = 100; h < 700; h += 37) {
      const base = weighedScore(outcome(h, h / 2, 200), p).score;
      expect(weighedScore(outcome(h + 1, h / 2, 200), p).score).toBeGreaterThan(base);
      expect(weighedScore(outcome(h, h / 2 + 1, 200), p).score).toBeGreaterThan(base);
      expect(weighedScore(outcome(h, h / 2, 199), p).score).toBeGreaterThan(base);
    }
  });

  it('changes the order with the priority picked: mostly power keeps the longer power, mostly Earth in view the more contact', () => {
    const longPower = optionOf('longer power', outcome(600, 120, 180), NO_REQUIREMENTS);
    const moreEarth = optionOf('more Earth in view', outcome(400, 350, 24), NO_REQUIREMENTS);
    expect(rankOptions([moreEarth, longPower], profile('power')).map((o) => o.item)).toEqual(['longer power', 'more Earth in view']);
    expect(rankOptions([longPower, moreEarth], profile('contact')).map((o) => o.item)).toEqual(['more Earth in view', 'longer power']);
    // The default ranking is the longest time with power, as it always was.
    expect(rankOptions([moreEarth, longPower]).map((o) => o.item)).toEqual(['longer power', 'more Earth in view']);
    expect(rankOptions([moreEarth, longPower], BY_POWER).map((o) => o.item)).toEqual(['longer power', 'more Earth in view']);
  });

  it('still puts every choice that meets the requirements first, whatever its score', () => {
    const req = { ...NO_REQUIREMENTS, minPoweredH: 336 };
    const fails = optionOf('fails', outcome(100, 90, 0), req);
    const meets = optionOf('meets', outcome(400, 10, 600), req);
    expect(weighedScore(fails.outcome, { power: 0, contact: 100, gap: 0 }).score).toBeGreaterThan(weighedScore(meets.outcome, { power: 0, contact: 100, gap: 0 }).score);
    expect(rankOptions([fails, meets], weighed({ power: 0, contact: 100, gap: 0 })).map((o) => o.item)).toEqual(['meets', 'fails']);
  });

  it('calls two choices whose scores agree to a billionth a tie, which their order settles, and says so', () => {
    const a = optionOf('a', outcome(400, 200, 20), NO_REQUIREMENTS);
    const b = optionOf('b', outcome(400, 200, 20), NO_REQUIREMENTS);
    expect(compareOptions(a, b, balanced)).toBe(0);
    expect(rankOptions([a, b], balanced).map((o) => o.item)).toEqual(['a', 'b']);
    expect(whyAbove(a, b, 'time', 'the next', balanced)).toBe('It ties with the next on your priorities and comes first as the earlier time.');
    expect(whyAbove(a, b, 'place', 'the next', balanced)).toBe('It ties with the next on your priorities and comes first as the nearer place.');
  });

  it('says why a choice ranks above the next with both scores and the measure that gains it most', () => {
    const a = optionOf('a', outcome(720, 360, 100), NO_REQUIREMENTS);
    const b = optionOf('b', outcome(360, 360, 100), NO_REQUIREMENTS);
    const A = weighedScore(a.outcome, { power: 1, contact: 1, gap: 1 });
    const B = weighedScore(b.outcome, { power: 1, contact: 1, gap: 1 });
    const why = whyAbove(a, b, 'time', 'landing at the period start', balanced);
    // Twice the power, the same Earth in view and gaps: the power gains it.
    expect(why).toBe(`It scores ${A.score.toFixed(1)} against ${B.score.toFixed(1)} for landing at the period start: more power.`);
    const c = optionOf('c', outcome(360, 360, 10), NO_REQUIREMENTS);
    expect(whyAbove(c, b, 'time', 'the next', balanced)).toMatch(/ for the next: shorter gaps\.$/);
    // A failed requirement still decides first, in the same words as the default ranking.
    const req = { ...NO_REQUIREMENTS, minPoweredH: 500 };
    expect(whyAbove(optionOf('a', a.outcome, req), optionOf('b', b.outcome, req), 'time', 'the next', balanced)).toMatch(/^It meets every requirement; the next fails one: power for at least 20 d/);
  });

  it('gives a choice’s score in one line, each measure’s part after it', () => {
    const s = weighedScore(outcome(720, 360, 100), { power: 5, contact: 1, gap: 1 });
    expect(scoreWords(outcome(720, 360, 100), { power: 5, contact: 1, gap: 1 })).toBe(`Score ${s.score.toFixed(1)} of 100: power ${s.parts.power.toFixed(1)}, Earth in view ${s.parts.contact.toFixed(1)}, shorter gaps ${s.parts.gap.toFixed(1)}.`);
  });

  it('states the rule where recommendations appear: the priorities, the formula, and that it is not a chance of success', () => {
    const words = objectiveWords(weighed({ power: 5, contact: 1, gap: 1 }));
    expect(words).toMatch(/^Ranked by your priorities: power 5, Earth in view 1, shorter gaps 1\./);
    expect(words).toContain('0.55x + 0.30√x + 0.15x²');
    expect(words).toContain('not a chance that a landing works');
    expect(objectiveWords(BY_POWER)).toBe('Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier time or the nearer place.');
    expect(yearRuleWords(6, true, weighed({ power: 1, contact: 5, gap: 1 }))).toBe('Landing times tried every 6 hours, ranked by your requirements, then your priorities (power 1, Earth in view 5, shorter gaps 1).');
    expect(yearRuleWords(6, false)).toBe('Landing times tried every 6 hours, ranked by time with power from landing, then Earth contact while powered.');
  });

  it('takes priorities from 0 to 100 with at least one above 0, and names a profile from its weights or calls them your own', () => {
    expect(validPriorities({ power: 1, contact: 7, gap: 3 })).toBe(true);
    expect(validPriorities({ power: 0, contact: 0, gap: 0 })).toBe(false);
    expect(validPriorities({ power: -1, contact: 1, gap: 1 })).toBe(false);
    expect(validPriorities({ power: 101, contact: 1, gap: 1 })).toBe(false);
    expect(validPriorities({ power: Number.NaN, contact: 1, gap: 1 })).toBe(false);
    expect(validPriorities({ power: 1, contact: 1 })).toBe(false);
    expect(profileOf({ power: 1, contact: 1, gap: 1 })).toBe('balanced');
    expect(profileOf({ power: 1, contact: 1, gap: 5 })).toBe('gap');
    expect(profileOf({ power: 1, contact: 7, gap: 3 })).toBe('custom');
    expect(priorityWords({ power: 1, contact: 7, gap: 3 })).toBe('power 1, Earth in view 7, shorter gaps 3');
    expect(PRIORITY_PROFILES.map((p) => p.id)).toEqual(['balanced', 'power', 'contact', 'gap']);
  });
});
