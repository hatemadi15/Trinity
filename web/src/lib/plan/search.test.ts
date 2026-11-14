import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { eph, sites } from '@/test/file-loaders';
import { answerOf, planStep, searchSite, spokenSummary, type SiteInput } from './search';
import { DEFAULT_SPEC, hearSpec, mergeHeard, whereSites } from './spec';

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
});
