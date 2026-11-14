import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { distanceKm } from '../viz/relief';
import { neighbourhoodRange, positionRadiusKm, rangeWords, ringPoints, type PointResult } from './neighbourhood';
import type { Outcome } from './outcome';

const centre = { lat: -88.28, lon: -64.31 };
const o = (poweredH: number, extra: Partial<Outcome> = {}): Outcome => ({ hour: 0, stayH: 720, poweredH, sunH: 300, contactH: 300, poweredContactH: 10, outageH: 200, poweredOutageH: 60, firstContactH: 0, sunlitAtLanding: true, ...extra });

describe('the points round an approximate site', () => {
  it('lays 8 points round it, 4 at half the radius and 4 at the radius, between them every 45 degrees', () => {
    const pts = ringPoints(centre, 5);
    expect(pts.map((p) => [p.km, p.bearingDeg])).toEqual([
      [2.5, 0],
      [2.5, 90],
      [2.5, 180],
      [2.5, 270],
      [5, 45],
      [5, 135],
      [5, 225],
      [5, 315],
    ]);
    for (const p of pts) expect(distanceKm(centre, p)).toBeCloseTo(p.km, 3);
    for (const p of pts) expect(p.lon).toBeGreaterThanOrEqual(-180);
  });

  it('takes the radius a site states, and none for a surveyed point', () => {
    const site = (extra: Partial<Site>): Site => ({ id: 'x', name: 'X', lat: -88, lon: 0, category: 'artemis3', polar: true, source: 's', ...extra });
    expect(positionRadiusKm(site({ approximate: true, source: "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km" }))).toBe(5);
    expect(positionRadiusKm(site({ approximate: true, source: 'x', ...({ uncertainty_km: 2 } as object) }))).toBe(2);
    expect(positionRadiusKm(site({ source: 'NASA / Intuitive Machines, February 2024' }))).toBeNull();
    // A derived high point states no radius yet: no range rather than a guessed one.
    expect(positionRadiusKm(site({ approximate: true, source: 'derived: argmax LOLA 20 m height in annulus around shackleton_center' }))).toBeNull();
  });
});

describe('the range of results round a point', () => {
  const pts = ringPoints(centre, 5);
  const done = (poweredH: number[], missing: number[] = []): PointResult[] => pts.map((p, i) => (missing.includes(i) ? { ...p, outcome: null, missing: 'no elevation data here' } : { ...p, outcome: o(poweredH[i]), missing: null }));

  it('spans the centre and every point worked out, figure by figure', () => {
    const r = neighbourhoodRange(o(76), done([90, 120, 720, 76, 80, 400, 300, 100]));
    expect(r).toMatchObject({ points: 9, missing: 0, poweredH: [76, 720], sunH: [300, 300], poweredOutageH: [60, 60] });
  });

  it('leaves out a point whose terrain is missing, and says how many', () => {
    const r = neighbourhoodRange(o(76), done([90, 120, 720, 76, 80, 400, 300, 100], [2, 5]));
    expect(r).toMatchObject({ points: 7, missing: 2, poweredH: [76, 300] });
  });

  it('says the range in a short line for the first screen, the detail in full for planners', () => {
    const r = neighbourhoodRange(o(76), done([90, 120, 720, 76, 80, 400, 300, 100]));
    const w = rangeWords(r, { radiusKm: 5, ms: 2400, mastM: 2 });
    expect(w.words).toBe('Within about 5 km (9 points): power for 3.2 to 30 days.');
    expect(w.detail).toBe(
      'Worked out here and at 8 points round it, 2.5 and 5 km away, with the same lander, period and 2 m mast, in 2.4 s. Power 3 d 4 h to 30 d; sunlight 12 d 12 h; Earth in view 12 d 12 h; contact while powered 10 h; longest time without Earth while powered 2 d 12 h. Each point’s hills come from the same NASA elevation grids, which do not show a hill narrower than one grid cell.',
    );
    expect(rangeWords(neighbourhoodRange(o(720), done(new Array(8).fill(720))), { radiusKm: 5, ms: 900, mastM: 2 }).words).toBe('Within about 5 km (9 points): power for all 30 days at every one.');
    const gaps = rangeWords(neighbourhoodRange(o(76), done([90, 120, 720, 76, 80, 400, 300, 100], [2, 5])), { radiusKm: 5, ms: 2400, mastM: 2 });
    expect(gaps.words).toBe('Within about 5 km (7 of 9 points): power for 3.2 to 12.5 days.');
    expect(gaps.detail).toMatch(/^Worked out here and at 6 of 8 points round it.* 2 points have no elevation data here, so they are left out\./);
  });
});
