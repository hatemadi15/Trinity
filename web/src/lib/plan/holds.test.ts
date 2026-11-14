import { describe, expect, it } from 'vitest';
import type { Outcome } from './outcome';
import { optionOf, rankOptions } from './rank';
import { checkRequirements, checksWords, failedWords, holdsIn, NO_REQUIREMENTS, requirementCount, type Requirements } from './requirements';

function outcome(o: Partial<Outcome>): Outcome {
  return { hour: 0, stayH: 720, poweredH: 100, sunH: 300, contactH: 200, poweredContactH: 50, outageH: 100, poweredOutageH: 50, firstContactH: 0, sunlitAtLanding: true, ...o };
}
const req = (r: Partial<Requirements>): Requirements => ({ ...NO_REQUIREMENTS, ...r });

describe('holding across the terrain versions, an optional requirement', () => {
  it('sets no share by default, and counts the share as a requirement once one is set', () => {
    expect(NO_REQUIREMENTS.minHoldPct).toBeNull();
    expect(requirementCount(req({ minHoldPct: 90 }))).toBe(1);
    expect(requirementCount(req({ minHoldPct: 90, minPoweredH: 120 }))).toBe(2);
  });

  it('says a version holds when it meets the other requirements, and with none set when power lasts the whole stay', () => {
    expect(holdsIn(outcome({ poweredH: 130 }), req({ minPoweredH: 120, minHoldPct: 90 }))).toBe(true);
    expect(holdsIn(outcome({ poweredH: 110 }), req({ minPoweredH: 120, minHoldPct: 90 }))).toBe(false);
    expect(holdsIn(outcome({ poweredH: 720 }), req({ minHoldPct: 90 }))).toBe(true);
    expect(holdsIn(outcome({ poweredH: 719 }), NO_REQUIREMENTS)).toBe(false);
  });

  it('checks the share last, with the count of versions behind it, and leaves it out where no versions were worked out', () => {
    const r = req({ minPoweredH: 120, minHoldPct: 90 });
    const checks = checkRequirements(outcome({ poweredH: 130 }), r, { held: 29, of: 32 });
    expect(checks.map((c) => [c.id, c.met])).toEqual([
      ['power', true],
      ['holds', true],
    ]);
    expect(checks[1].words).toBe('Holds in at least 90 % of terrain versions: 29 of 32 versions (91 %)');
    const short = checkRequirements(outcome({ poweredH: 130 }), r, { held: 25, of: 32 })[1];
    expect(short).toMatchObject({ met: false, value: 78, limit: 90 });
    expect(short.words).toBe('Holds in at least 90 % of terrain versions: 25 of 32 versions (78 %), 4 more needed');
    expect(failedWords(short)).toBe('holds in at least 90 % of terrain versions (78 %)');
    expect(checksWords([short])).toBe('Fails your requirement: holds in at least 90 % of terrain versions (78 %).');
    // No versions here (a point outside the catalogue, a site far from the pole): nothing to check it against.
    expect(checkRequirements(outcome({ poweredH: 130 }), r).map((c) => c.id)).toEqual(['power']);
  });

  it('ranks a choice that holds in too few versions below every choice that meets them all, as any failed requirement', () => {
    const r = req({ minPoweredH: 120, minHoldPct: 90 });
    const fragile = optionOf('longer, but fragile', outcome({ poweredH: 300 }), r, { held: 20, of: 32 });
    const robust = optionOf('shorter, and holds', outcome({ poweredH: 150 }), r, { held: 31, of: 32 });
    expect(fragile.failed).toBe(1);
    expect(rankOptions([fragile, robust]).map((o) => o.item)).toEqual(['shorter, and holds', 'longer, but fragile']);
    expect(robust.holds).toEqual({ held: 31, of: 32 });
    // Without the requirement, the same two rank by power alone, whatever their shares.
    const plain = req({ minPoweredH: 120 });
    expect(rankOptions([optionOf('robust', outcome({ poweredH: 150 }), plain, { held: 31, of: 32 }), optionOf('fragile', outcome({ poweredH: 300 }), plain, { held: 20, of: 32 })]).map((o) => o.item)).toEqual(['fragile', 'robust']);
  });
});

describe('the period’s landing times with their counts of versions', () => {
  it('recommends the landing time that holds in enough versions, once the requirement is set, and only then', async () => {
    const { readJson } = await import('../engine/__tests__/helpers');
    const { eph, sites } = await import('@/test/file-loaders');
    const { recompute, scanOf } = await import('../store/explore');
    const { DEFAULT_POWER } = await import('../engine/power');
    const { timeOptions } = await import('./options');
    const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
    const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
    const r = recompute(eph, site, mask, '2027-01-01T00:00:00', 30);
    const scan = scanOf(r.series);
    const plain = timeOptions({ scan, cfg: DEFAULT_POWER, req: NO_REQUIREMENTS, hours: 720, startUtc: '2027-01-01T00:00:00' });
    const best = plain.better!.item.hour;
    // A count by hour in which the usual best time holds in too few versions, and one other sunlit time in all of them.
    const other = Array.from({ length: 720 }, (_, h) => h).find((h) => h > 0 && Math.abs(h - best) > 72 && r.series.sunFraction[h] > 0)!;
    const holds = Array.from({ length: 720 }, (_, h) => ({ held: h === other ? 32 : 10, of: 32 }));
    const asked = timeOptions({ scan, cfg: DEFAULT_POWER, req: req({ minHoldPct: 90 }), hours: 720, startUtc: '2027-01-01T00:00:00', holds });
    expect(asked.better?.item.hour).toBe(other);
    expect(asked.better?.checks.map((c) => c.id)).toEqual(['holds']);
    expect(asked.current.checks[0].met).toBe(false);
    // The same counts change nothing while the requirement is not set.
    expect(timeOptions({ scan, cfg: DEFAULT_POWER, req: NO_REQUIREMENTS, hours: 720, startUtc: '2027-01-01T00:00:00', holds }).better?.item.hour).toBe(best);
  });
});
