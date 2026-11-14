import { describe, expect, it } from 'vitest';
import { HOME } from '../data/home';
import catalogue from '../data/catalogue.json';
import { descentPose, globePoint, psSouthKm, psSouthLatLon, reliefKm, STAGES, stageAt, stageOpacity } from './descentPose';

const sizes = { reliefHalfKm: HOME.relief.half_km, windowKm: HOME.hero.window_km };

describe('the descent’s projection (spec 23.1)', () => {
  it('puts every site where the relief map’s pins put it, so the map lies on the globe in its place', () => {
    const sites = catalogue.sites as { id: string; lat: number; lon: number }[];
    for (const pin of HOME.relief.sites) {
      const site = sites.find((s) => s.id === pin.id);
      if (!site) continue;
      const { x, y } = psSouthKm(site.lat, site.lon);
      expect(0.5 + x / (2 * HOME.relief.half_km), pin.id).toBeCloseTo(pin.u, 3);
      expect(0.5 - y / (2 * HOME.relief.half_km), pin.id).toBeCloseTo(pin.v, 3);
    }
  });

  it('turns a pin back into its latitude and longitude', () => {
    const { x, y } = reliefKm(0.406, 0.4548, HOME.relief.half_km);
    const back = psSouthLatLon(x, y);
    expect(back.lat).toBeCloseTo(-88.28, 2);
    expect(back.lon).toBeCloseTo(-64.31, 1);
  });

  it('places points on three.js’s unit sphere: the south pole at the bottom, every point at distance 1', () => {
    expect(globePoint(-90, 0)[1]).toBeCloseTo(-1, 9);
    for (const [lat, lon] of [[0, 0], [-45, 120], [-88.28, -64.31]]) expect(Math.hypot(...globePoint(lat, lon))).toBeCloseTo(1, 9);
  });
});

describe('the descent’s pose', () => {
  it('comes ever closer, from the whole Moon to the polar cap to the site, and ends on the site with the pole towards us', () => {
    let last = 0;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const z = descentPose(p, 1.6, sizes).zoom;
      expect(z).toBeGreaterThanOrEqual(last - 1e-9);
      last = z;
    }
    const start = descentPose(0, 1.6, sizes), end = descentPose(1, 1.6, sizes);
    // The whole Moon fills about four fifths of the view's height at first.
    expect(2 * start.zoom / 2).toBeGreaterThan(0.75);
    expect(2 * start.zoom / 2).toBeLessThan(0.9);
    expect(end.tilt).toBeCloseTo(-Math.PI / 2, 9);
    expect(end.spin).toBeCloseTo(0, 9);
    expect(end.toSite).toBe(1);
    expect(end.site).toBe(1);
    expect(end.earth).toBe(0);
    // The site's 20 km picture fills nine tenths of the shorter side when the descent reaches it.
    const atSite = descentPose(0.82, 1.6, sizes);
    expect((HOME.hero.window_km / 1737.4) * atSite.zoom / 2).toBeCloseTo(0.92, 2);
  });

  it('turns the Moon as it comes closer, one and a quarter turns that settle as it reaches the site', () => {
    const spins = [0, 0.2, 0.4, 0.6, 0.82].map((p) => descentPose(p, 1.6, sizes).spin);
    expect(spins[0]).toBeCloseTo(-1.25 * 2 * Math.PI, 9);
    for (let i = 1; i < spins.length; i++) expect(spins[i]).toBeGreaterThan(spins[i - 1]);
    expect(spins[4]).toBeCloseTo(0, 9);
  });

  it('keeps the first screen’s Moon beside the words, then centres it', () => {
    expect(descentPose(0, 1.6, sizes).offset).toBe(1);
    expect(descentPose(0.3, 1.6, sizes).offset).toBe(0);
  });
});

describe('the descent’s stages', () => {
  it('shows one stage’s words at a time: one has gone before the next comes', () => {
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const shown = STAGES.filter((s) => stageOpacity(s, p) > 0.001);
      expect(shown.length, `p = ${p.toFixed(3)}`).toBeLessThanOrEqual(1);
    }
  });

  it('starts on the first screen’s words and ends on the answer, and names the stage at any point', () => {
    expect(stageOpacity(STAGES[0], 0)).toBe(1);
    expect(stageOpacity(STAGES[STAGES.length - 1], 1)).toBe(1);
    expect(stageAt(0)).toBe('moon');
    expect(stageAt(0.25)).toBe('turn');
    expect(stageAt(0.54)).toBe('pole');
    expect(stageAt(0.8)).toBe('site');
    expect(stageAt(1)).toBe('answer');
    for (const s of STAGES) expect(stageAt(s.stop)).toBe(s.id);
  });
});
