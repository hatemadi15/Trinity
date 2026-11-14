import { describe, expect, it } from 'vitest';
import { HOME } from '../data/home';
import catalogue from '../data/catalogue.json';
import { descentPose, earthSpot, ease, firstFromDisc, firstMoon, globePoint, psSouthKm, psSouthLatLon, reliefKm, STAGES, stageAt, stageOpacity, WORDS_GONE, type Box } from './descentPose';

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

  it('holds the first screen’s Moon still, in place and size, until the first screen’s words have gone', () => {
    const first = { nx: 0.45, ny: 0.05, zoom: 0.6 };
    const at = (p: number) => descentPose(p, 1.6, sizes, first);
    // The words of the first stage are gone by WORDS_GONE: nothing of the Moon's place moves before.
    expect(stageOpacity(STAGES[0], WORDS_GONE)).toBeCloseTo(0, 9);
    for (const p of [0, 0.03, 0.06, 0.09, WORDS_GONE]) {
      expect(at(p).zoom, `p = ${p}`).toBeCloseTo(0.6, 9);
      expect(at(p).shiftX, `p = ${p}`).toBeCloseTo(0.45, 9);
      expect(at(p).shiftY, `p = ${p}`).toBeCloseTo(0.05, 9);
    }
    expect(at(0.3).shiftX).toBeCloseTo(0, 9);
  });

  it('eases every move: slow, then faster, fast, then slow, with no jolt at either end of it', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 9);
    // Speed nil at both ends and greatest in the middle.
    const speed = (t: number) => (ease(t + 1e-4) - ease(t - 1e-4)) / 2e-4;
    expect(speed(1e-4)).toBeLessThan(0.01);
    expect(speed(1 - 1e-4)).toBeLessThan(0.01);
    expect(speed(0.5)).toBeGreaterThan(speed(0.25));
    expect(speed(0.25)).toBeGreaterThan(speed(0.05));
    // The turn starts and settles gently: no sudden spin on the first scroll.
    const spin = (p: number) => descentPose(p, 1.6, sizes).spin;
    expect(Math.abs(spin(0.01) - spin(0))).toBeLessThan(0.01);
    expect(Math.abs(spin(0.82) - spin(0.81))).toBeLessThan(0.01);
    expect(Math.abs(spin(0.42) - spin(0.41))).toBeGreaterThan(0.1);
    // Each step of the scroll moves the zoom by a little, never by a jump.
    let worst = 0;
    for (let p = 0; p < 1; p += 0.001) worst = Math.max(worst, Math.abs(Math.log(descentPose(p + 0.001, 1.6, sizes).zoom / descentPose(p, 1.6, sizes).zoom)));
    expect(worst).toBeLessThan(0.05);
  });
});

/** The first screen's words as a page lays them out: a box from the left edge of the page's column. */
const words = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
const apart = (moon: { cx: number; cy: number; r: number }, b: Box) => {
  // The distance from the disc's centre to the nearest point of the box, less its radius.
  const dx = Math.max(b.x0 - moon.cx, 0, moon.cx - b.x1), dy = Math.max(b.y0 - moon.cy, 0, moon.cy - b.y1);
  return Math.hypot(dx, dy) - moon.r;
};

describe('the first screen’s Moon (the user’s ask: never under the title, the sentence or the buttons)', () => {
  // The windows the first screen was checked at, with the words and the rail as the page lays them out there
  // (measured in Chromium at each width: the eyebrow down to the buttons, and the rail's column of dots).
  const cases: [string, { w: number; h: number; seen: number }, Box, Box][] = [
    ['1920 × 1080', { w: 1920, h: 1080, seen: 1011 }, words(352, 64, 960, 560), words(1869, 446, 1880, 634)],
    ['1440 × 900', { w: 1440, h: 900, seen: 831 }, words(112, 64, 740, 530), words(1389, 356, 1400, 544)],
    ['1280 × 800', { w: 1280, h: 800, seen: 731 }, words(32, 64, 640, 520), words(1229, 306, 1240, 494)],
    ['1024 × 768', { w: 1024, h: 768, seen: 699 }, words(32, 64, 520, 580), words(973, 290, 984, 478)],
    ['768 × 1024', { w: 768, h: 1024, seen: 922 }, words(32, 64, 736, 410), words(717, 418, 728, 606)],
    ['390 × 844', { w: 390, h: 844, seen: 685 }, words(16, 48, 374, 470), words(359, 328, 370, 516)],
    ['844 × 390, a phone on its side', { w: 844, h: 390, seen: 290 }, words(32, 48, 420, 380), words(813, 101, 824, 289)],
  ];
  for (const [name, view, box, rail] of cases) {
    it(`stands clear of the words and the rail at ${name}`, () => {
      const moon = firstMoon(view, box, rail);
      expect(apart(moon, box), 'the words').toBeGreaterThanOrEqual(23);
      expect(apart(moon, rail), 'the rail').toBeGreaterThanOrEqual(0);
      // Within the picture across, and down to its foot.
      expect(moon.cx - moon.r).toBeGreaterThanOrEqual(0);
      expect(moon.cx + moon.r).toBeLessThanOrEqual(view.w);
      expect(moon.cy + moon.r).toBeLessThanOrEqual(view.h);
      const earth = earthSpot(view, moon, box, rail);
      expect(apart(earth, box), 'Earth and the words').toBeGreaterThanOrEqual(0);
      expect(Math.hypot(earth.cx - moon.cx, earth.cy - moon.cy)).toBeGreaterThan(moon.r + earth.r);
    });
  }

  it('stands right of the words on a wide screen, as large as the room there allows, and under them on a tall one', () => {
    const wide = firstMoon(cases[1][1], cases[1][2], cases[1][3]);
    expect(wide.side).toBe('beside');
    expect(wide.r * 2).toBeGreaterThan(500);
    // Whole on the screen before the page scrolls.
    expect(wide.cy + wide.r).toBeLessThanOrEqual(831);
    const phone = firstMoon(cases[5][1], cases[5][2], cases[5][3]);
    expect(phone.side).toBe('below');
    expect(phone.r * 2).toBeGreaterThan(280);
  });

  it('gives the camera the disc it was measured as: its centre in the view’s own measure and the zoom for its size', () => {
    const f = firstFromDisc({ cx: 1080, cy: 450, r: 300 }, 1440, 900);
    expect(f.nx).toBeCloseTo(0.5, 9);
    expect(f.ny).toBeCloseTo(0, 9);
    // 1 unit of the scene is zoom × 450 px: the Moon (radius 1) is 300 px.
    expect(f.zoom * 450).toBeCloseTo(300, 9);
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
