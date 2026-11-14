import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { distanceKm } from '../viz/relief';
import { neighbourhoodRadius, neighbourhoodRange, positionRadiusKm, rangeWords, ringPoints, type PointResult, type SitePosition } from './neighbourhood';
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
    const site = (extra: Partial<SitePosition>): Site & SitePosition => ({ id: 'x', name: 'X', lat: -88, lon: 0, category: 'artemis3', polar: true, source: 's', ...extra });
    expect(positionRadiusKm(site({ approximate: true, source: "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km" }))).toBe(5);
    expect(positionRadiusKm(site({ kind: 'region_centre', uncertainty_km: 5 }))).toBe(5);
    expect(positionRadiusKm(site({ kind: 'target', uncertainty_km: 15 }))).toBe(15);
    expect(positionRadiusKm(site({ source: 'NASA / Intuitive Machines, February 2024' }))).toBeNull();
    // A surveyed lander is where it is: the few metres its images leave are no neighbourhood.
    expect(positionRadiusKm(site({ kind: 'surveyed', uncertainty_km: 0.02 }))).toBeNull();
    expect(positionRadiusKm(site({ kind: 'region_centre', uncertainty_km: null }))).toBeNull();
  });

  it('works out a ring round a stated radius, or round a derived high point at 1 km to show how much landing on it matters', () => {
    const site = (extra: Partial<SitePosition>): Site & SitePosition => ({ id: 'x', name: 'X', lat: -88, lon: 0, category: 'artemis3', polar: true, source: 's', ...extra });
    expect(neighbourhoodRadius(site({ kind: 'region_centre', uncertainty_km: 5 }))).toEqual({ km: 5, stated: true });
    expect(neighbourhoodRadius(site({ approximate: true, source: 'derived: argmax LOLA 20 m height in annulus around shackleton_center' }))).toEqual({ km: 1, stated: false });
    expect(neighbourhoodRadius(site({ kind: 'derived', uncertainty_km: null }))).toEqual({ km: 1, stated: false });
    expect(neighbourhoodRadius(site({ kind: 'surveyed' }))).toBeNull();
    // Outside the polar elevation grids no skyline can be worked out round a point.
    expect(neighbourhoodRadius(site({ kind: 'region_centre', uncertainty_km: 5, polar: false }))).toBeNull();
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
    // The skylines are kept for the next period: their time is what the worker spent on them, not this run's.
    // The ring's points are exactly 2.5 and 5 km out: the line says so in as few words as the first screen allows.
    expect(w.words).toBe('Within 5 km (9 points): power 3.2 to 30 days.');
    expect(w.detail).toBe(
      'Worked out here and at 8 points round it, 2.5 and 5 km away, with the same lander, period and 2 m mast; their skylines took 2.4 s to work out. Power 3 d 4 h to 30 d; sunlight 12 d 12 h; Earth in view 12 d 12 h; contact while powered 10 h; longest time without Earth while powered 2 d 12 h. Each point’s hills come from the same NASA elevation grids, which do not show a hill narrower than one grid cell.',
    );
    expect(rangeWords(neighbourhoodRange(o(720), done(new Array(8).fill(720))), { radiusKm: 5, ms: 900, mastM: 2 }).words).toBe('Within 5 km (9 points): power for all 30 days at each.');
    const gaps = rangeWords(neighbourhoodRange(o(76), done([90, 120, 720, 76, 80, 400, 300, 100], [2, 5])), { radiusKm: 5, ms: 2400, mastM: 2 });
    expect(gaps.words).toBe('Within 5 km (7 of 9 points): power 3.2 to 12.5 days.');
    expect(gaps.detail).toMatch(/^Worked out here and at 6 of 8 points round it.* 2 points have no elevation data here, so they are left out\./);
    // Round a derived high point the radius is a probe, not a stated uncertainty: no "about", and the detail says so.
    const probe = rangeWords(neighbourhoodRange(o(720), done([720, 700, 720, 300, 720, 720, 76, 720])), { radiusKm: 1, ms: 2400, mastM: 2, stated: false });
    expect(probe.words).toBe('Within 1 km (9 points): power 3.2 to 30 days.');
    expect(probe.detail).toMatch(/^A derived high point states no radius of its own: these points, 0\.5 and 1 km away, show how much the result depends on landing on the point itself\. /);
    // With no point round it worked out there is no range to give, and the line says why.
    const none = rangeWords(neighbourhoodRange(o(76), done([], [0, 1, 2, 3, 4, 5, 6, 7])), { radiusKm: 5, ms: 300, mastM: 2 });
    expect(none.words).toBe('No range within 5 km: the points round this one have no elevation data here.');
  });
});
