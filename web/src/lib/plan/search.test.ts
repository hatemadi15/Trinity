import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { eph, sites } from '@/test/file-loaders';
import { answerOf, bucketsOf, planRankWords, planStep, rankWith, searchSite, spokenSummary, type SiteInput } from './search';
import { weighedScore } from './rank';
import { applyPatch, DEFAULT_SPEC, hearSpec, mergeHeard, whereSites } from './spec';

const EXAMPLE =
  'We need at least five days of power, Earth in view when we land, no radio gap longer than three days, a 300 watt load and a 3 kilowatt-hour battery, landing between March and June 2027, near the Artemis III regions.';

function inputs(ids: string[]): SiteInput[] {
  return ids.map((id) => {
    const site = sites.find((s) => s.id === id)!;
    const doc = readJson<{ elevation_deg: number[]; mast_m: number }>('data', 'masks', `${id}.json`);
    return { site, mask: Float64Array.from(doc.elevation_deg), skyline: { source: 'featured', mastM: doc.mast_m } };
  });
}

function run(text: string) {
  const { spec } = mergeHeard(DEFAULT_SPEC, {}, hearSpec(text, sites));
  const list = inputs(whereSites(spec.where, sites).map((s) => s.id));
  const step = planStep(spec, list.length);
  const t0 = performance.now();
  const findings = list.map((x) => searchSite(eph, x, spec, step.stepH));
  const ms = performance.now() - t0;
  return { spec, findings, answer: answerOf(findings, spec), ms, step };
}

describe('the search over sites and landing times', () => {
  it('tries every hour of the window at each site, lands only in daylight, and ranks the sites that meet every requirement first', () => {
    const { spec, findings, answer, ms } = run(EXAMPLE);
    expect(findings).toHaveLength(9);
    for (const f of findings) {
      expect(f.tried).toBe(122 * 24);
      if (f.best) {
        expect(f.best.outcome.sunlitAtLanding).toBe(true);
        expect(f.best.item.utc >= spec.fromUtc && f.best.item.utc < spec.toUtc).toBe(true);
      }
    }
    expect(answer.meetingSites).toBeGreaterThan(0);
    expect(answer.shown.length).toBeLessThanOrEqual(3);
    for (const f of answer.shown) expect(f.best!.failed).toBe(0);
    // Ranked best first: no shown site has less power than the one after it, among those that meet every requirement.
    const p = answer.shown.map((f) => f.best!.outcome.poweredH);
    expect([...p].sort((a, b) => b - a)).toEqual(p);
    expect(answer.headline).toMatch(/of the 9 sites meet every requirement/);
    expect(answer.why[0]).toMatch(/longer than at|meets every requirement|ties with/);
    // The work is bounded and quick: 9 sites of 2,928 landing times each.
    expect(ms).toBeLessThan(5000);
  });

  it('says which requirement fails everywhere, and what comes closest, when nothing meets them all', () => {
    const { answer } = run('at least 60 days of power, a 2 kWh battery, a 500 watt load, landing in March 2027, at the Artemis III regions');
    expect(answer.meetingSites).toBe(0);
    expect(answer.failsEverywhere.map((f) => f.id)).toEqual(['power']);
    expect(answer.headline).toMatch(/^No site meets every requirement at any landing time tried\./);
    expect(answer.headline).toMatch(/Power for at least 60 d fails at every site and landing time: the most is .+ at /);
    expect(answer.shown.length).toBeGreaterThan(0);
  });

  it('bounds the work by trying landing times less often when the window and the sites are many, and says so', () => {
    const wide = { ...DEFAULT_SPEC, fromUtc: '2027-01-01T00:00:00', toUtc: '2028-01-01T00:00:00' };
    expect(planStep(DEFAULT_SPEC, 9)).toEqual({ stepH: 1, coarsened: false });
    expect(planStep(wide, 40)).toEqual({ stepH: 2, coarsened: true });
  });

  it('gives Luna a short summary to read aloud', () => {
    const { answer, spec } = run(EXAMPLE);
    const said = spokenSummary(answer, spec, { sites: 9, landingTimes: 9 * 2928, ms: 420 });
    expect(said).toMatch(/^I searched 9 sites and 26,352 landing times in 0\.4 seconds\. The best is /);
    expect(said).toMatch(/UTC/);
    expect(said).toMatch(/Say plan this landing/);
  });

  it('ranks by the priorities picked when asked, gives each site’s score and parts in why it comes first, and states the rule', () => {
    const heard = mergeHeard(DEFAULT_SPEC, {}, hearSpec('a 300 watt load, landing between March and June 2027, near the Artemis III regions', sites));
    const contact = applyPatch(heard.spec, heard.from, { objective: 'weighed', priorities: { power: 1, contact: 5, gap: 1 } }, 'edited').spec;
    const list = inputs(whereSites(contact.where, sites).map((s) => s.id));
    const findings = list.map((x) => searchSite(eph, x, contact, 6));
    const answer = answerOf(findings, contact);
    const scores = answer.shown.map((f) => weighedScore(f.best!.outcome, contact.priorities).score);
    // Best first by the score, every site's best landing time the best it found by the same rule.
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(answer.headline).toMatch(/ranked by your priorities \(power 1, Earth in view 5, shorter gaps 1\) alone/);
    expect(answer.why[0]).toMatch(/^It scores \d+\.\d against \d+\.\d for .+: (more power|more Earth in view|shorter gaps)\.$/);
    expect(planRankWords(contact)).toMatch(/^Ranked by your priorities: power 1, Earth in view 5, shorter gaps 1\. .*0\.55x \+ 0\.30√x \+ 0\.15x²/);
    expect(planRankWords(DEFAULT_SPEC)).toBe('Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier landing.');
    // Priorities the rule cannot use are not taken: the ones before stay.
    expect(applyPatch(contact, {}, { priorities: { power: 0, contact: 0, gap: 0 } }, 'edited').spec.priorities).toEqual({ power: 1, contact: 5, gap: 1 });
  });

  it('keeps each site’s best landing in every month of the window, ranked as the site’s best is, for the dates at a glance', () => {
    const { spec, findings } = run(EXAMPLE);
    const rank = rankWith(spec.objective, spec.priorities);
    // March to June 2027: four months, each from its first day (the window's first hour for the first).
    expect(bucketsOf(spec)).toEqual([
      { label: 'Mar 2027', fromHour: 0 },
      { label: 'Apr 2027', fromHour: 31 * 24 },
      { label: 'May 2027', fromHour: 61 * 24 },
      { label: 'Jun 2027', fromHour: 92 * 24 },
    ]);
    for (const f of findings) {
      expect(f.byDate).toHaveLength(4);
      const bests = f.byDate!.filter((m) => m !== null);
      for (const [i, m] of f.byDate!.entries()) {
        if (!m) continue;
        // Inside its own month, and sunlit at landing as every candidate is.
        expect(m.item.hour).toBeGreaterThanOrEqual(bucketsOf(spec)[i].fromHour);
        if (i < 3) expect(m.item.hour).toBeLessThan(bucketsOf(spec)[i + 1].fromHour);
        expect(m.outcome.sunlitAtLanding).toBe(true);
      }
      // The site's best landing is the best of its months'.
      if (f.best) expect(bests.some((m) => m!.item.hour === f.best!.item.hour && rank(m!, f.best!) === 0)).toBe(true);
    }
    // A window of a few weeks is cut into weeks instead, from its first day.
    expect(bucketsOf({ fromUtc: '2027-03-01T00:00:00', toUtc: '2027-03-22T00:00:00' })).toEqual([
      { label: '1 Mar', fromHour: 0 },
      { label: '8 Mar', fromHour: 168 },
      { label: '15 Mar', fromHour: 336 },
    ]);
  });
});
