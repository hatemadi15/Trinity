import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type MaskMeta, type SiteResult } from '../store/explore';
import { DEFAULT_PREFERENCES, MISSION_PROFILES, rankingFeatures } from './mission';
import { parsePlan, serializePlan, type Scenario } from './scenarios';
import { preferenceScore, recommendCandidates, RECOMMENDATION_MODEL, type RecommendationCandidate } from './recommendation';

const requirements = { requiredHours: 1, minContactHours: 0, maxGapHours: 720 };
function candidate(id: string, power: number, contact: number, gap: number, days: 14 | 30 | 90 = 30): RecommendationCandidate {
  const hours = days * 24;
  const scenario: Scenario = { id, label: id, site: { id: 'de_gerlache_rim_2', name: 'Ridge', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'NASA' }, startUtc: '2027-01-01T00:00:00', days, params: structuredClone(DEFAULT_PARAMS) };
  const result = { site: scenario.site, series: { hours, earthVisible: Uint8Array.from({ length: hours }, (_, h) => h < contact ? 1 : 0) }, summary: { hours, longestEarthGapH: gap }, power: { firstBrownoutHour: power === hours ? null : power, powerW: new Float64Array(hours) }, maskMeta: { source: 'featured', failedTiles: 0, siteHeightM: 0, mastM: 2 } } as unknown as SiteResult & { maskMeta: MaskMeta };
  return { scenario, result };
}

describe('trained mission preference model', () => {
  it('uses nonnegative learned weights and changes the recommendation with the mission priority', () => {
    expect(RECOMMENDATION_MODEL.weights.every((w) => w > 0)).toBe(true);
    const options = [candidate('longer-power', 600, 120, 180), candidate('more-earth-view', 400, 350, 24)];
    const power = recommendCandidates(options, requirements, MISSION_PROFILES[1].preferences, 30);
    const contact = recommendCandidates(options, requirements, MISSION_PROFILES[2].preferences, 30);
    expect(power.topIds).toEqual(['longer-power']);
    expect(contact.topIds).toEqual(['more-earth-view']);
  });

  it('never trades away a must-have requirement or scores incomplete/assumed terrain', () => {
    const fails = candidate('fails', 100, 90, 0);
    const incomplete = candidate('incomplete', 720, 700, 0);
    incomplete.result!.maskMeta.failedTiles = 1;
    const flat = candidate('flat', 720, 700, 0);
    flat.result!.maskMeta.source = 'flat';
    const passes = candidate('passes', 400, 300, 20);
    const ranked = recommendCandidates([fails, incomplete, flat, passes], { ...requirements, requiredHours: 336 }, { power: 0, contact: 100, gap: 0 }, 30);
    expect(ranked.topIds).toEqual(['passes']);
    expect(ranked.excluded).toHaveLength(3);
    expect(ranked.excluded[0].reasons.join(' ')).toContain('Needs 336');
    expect(recommendCandidates([fails], { ...requirements, requiredHours: 336 }, DEFAULT_PREFERENCES, 30).topIds).toEqual([]);
  });

  it('waits for pending calculations and excludes unequal forecast durations', () => {
    const good = candidate('ready', 400, 200, 20);
    const pending = { scenario: { ...good.scenario, id: 'waiting' } };
    expect(recommendCandidates([good, pending], requirements, DEFAULT_PREFERENCES, 30).topIds).toEqual([]);
    const compared = recommendCandidates([good, candidate('longer-forecast', 2000, 1500, 20, 90)], requirements, DEFAULT_PREFERENCES, 30);
    expect(compared.topIds).toEqual(['ready']);
    expect(compared.excluded[0].reasons[0]).toContain('90 days');
  });

  it('preserves monotone scores, candidate-independent normalization and exact ties', () => {
    for (let h = 100; h < 600; h += 29) {
      const base = { poweredHours: h, contactHours: h / 2, longestEarthGapHours: 200 };
      const score = preferenceScore(base, 720, DEFAULT_PREFERENCES).score;
      expect(preferenceScore({ ...base, poweredHours: h + 1 }, 720, DEFAULT_PREFERENCES).score).toBeGreaterThan(score);
      expect(preferenceScore({ ...base, contactHours: h / 2 + 1 }, 720, DEFAULT_PREFERENCES).score).toBeGreaterThan(score);
      expect(preferenceScore({ ...base, longestEarthGapHours: 199 }, 720, DEFAULT_PREFERENCES).score).toBeGreaterThan(score);
    }
    const options = [candidate('a', 400, 200, 20), candidate('b', 400, 200, 20)];
    const pair = recommendCandidates(options, requirements, DEFAULT_PREFERENCES, 30);
    expect(pair.topIds).toEqual(['a', 'b']);
    expect(pair.ranked[0].score).toBe(recommendCandidates([options[0]], requirements, DEFAULT_PREFERENCES, 30).ranked[0].score);
  });

  it('rejects invalid priorities and impossible feature values instead of recommending', () => {
    const metrics = { poweredHours: 400, contactHours: 500, longestEarthGapHours: 20 };
    expect(() => rankingFeatures(metrics, 720, DEFAULT_PREFERENCES)).toThrow(/metrics/);
    expect(() => rankingFeatures({ ...metrics, contactHours: 20 }, 720, { power: 0, contact: 0, gap: 0 })).toThrow(/priorities/);
    expect(recommendCandidates([candidate('a', 400, 300, 20)], requirements, { power: NaN, contact: 1, gap: 1 }, 30).topIds).toEqual([]);
    const invalid = candidate('invalid', 400, 300, -1);
    expect(recommendCandidates([invalid], requirements, DEFAULT_PREFERENCES, 30).excluded[0].reasons).toContain('Forecast metrics are invalid for this model.');
  });

  it('round-trips mission priorities and accepts old links without them', () => {
    const scenario = candidate('a', 400, 300, 20).scenario;
    const priorities = { power: 1, contact: 7, gap: 3 };
    const payload = serializePlan([scenario], requirements, priorities);
    expect(parsePlan(payload)?.preferences).toEqual(priorities);
    const old = JSON.parse(payload);
    delete old.preferences;
    expect(parsePlan(JSON.stringify(old))?.preferences).toEqual(DEFAULT_PREFERENCES);
    old.preferences = { power: 0, contact: 0, gap: 0 };
    expect(parsePlan(JSON.stringify(old))).toBeNull();
  });
});
