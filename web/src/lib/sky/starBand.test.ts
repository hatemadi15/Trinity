import { describe, expect, it } from 'vitest';
import { bandStars } from './starBand';
import type { Stars } from './stars';

/** A catalogue of stars given by ecliptic longitude and latitude (degrees), magnitude and B−V colour. */
function catalogue(list: [number, number, number, number][]): Stars {
  const e = (23.4393 * Math.PI) / 180;
  const j2000 = new Float32Array(list.length * 3), vmag = new Float32Array(list.length), bv = new Float32Array(list.length);
  list.forEach(([lonDeg, latDeg, m, b], i) => {
    const lon = (lonDeg * Math.PI) / 180, lat = (latDeg * Math.PI) / 180;
    const xe = Math.cos(lat) * Math.cos(lon), ye = Math.cos(lat) * Math.sin(lon), ze = Math.sin(lat);
    // Ecliptic to J2000 equatorial: a turn about x by the obliquity.
    j2000.set([xe, ye * Math.cos(e) - ze * Math.sin(e), ye * Math.sin(e) + ze * Math.cos(e)], i * 3);
    vmag[i] = m;
    bv[i] = b;
  });
  return { count: list.length, j2000, vmag, bv };
}

describe('the band of stars behind the header', () => {
  it('places a star by its height over the south pole (minus its ecliptic latitude) and its longitude from the band’s middle', () => {
    const [s] = bandStars(catalogue([[255, -10, 2, 0.6]]), 1440, 300);
    expect(s.x).toBeCloseTo(0, 2);
    expect(s.y).toBeCloseTo(160, 2);
    const [t] = bandStars(catalogue([[265, -5, 2, 0.6]]), 1440, 300);
    expect(t.x).toBeCloseTo(160, 2);
    expect(t.y).toBeCloseTo(80, 2);
  });

  it('leaves out stars below the horizon, above the band and beyond its ends', () => {
    expect(bandStars(catalogue([[255, 5, 2, 0], [255, -30, 2, 0], [0, -10, 2, 0]]), 1440, 300)).toHaveLength(0);
  });

  it('draws bright stars larger and more opaque, the faint ones first so the bright sit on top, and fades the lowest third', () => {
    const list = bandStars(catalogue([[250, -15, 0.5, 0.6], [260, -15, 5.5, 0.6], [255, -1, 0.5, 0.6]]), 1440, 300);
    expect(list.map((s) => Math.round(s.r * 100) / 100)).toEqual([1.09, 3.19, 3.19]);
    const [faint, bright, low] = list;
    expect(bright.alpha).toBeGreaterThan(faint.alpha);
    expect(faint.alpha).toBeCloseTo(0.16, 3);
    expect(low.alpha).toBeLessThan(bright.alpha / 3);
  });

  it('colours each star by its B−V, blue-white to orange', () => {
    const [hot, cool] = bandStars(catalogue([[250, -15, 2, -0.3], [260, -15, 2, 1.6]]), 1440, 300);
    expect(hot.rgb[2]).toBeGreaterThan(hot.rgb[0]);
    expect(cool.rgb[0]).toBeGreaterThan(cool.rgb[2]);
  });
});
