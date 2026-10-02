import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { azElOf, enuBasis } from './frames';
import { moonMatrixAt, parseMoonOrientation } from './moonOrientation';
import { parseStars, placeStars, starColour, starGain, starSize } from './stars';

const meta = readJson<{ count: number }>('data', 'sky', 'stars.json');
const stars = parseStars(readBytes('data', 'sky', 'stars.bin').buffer as ArrayBuffer, meta.count);
const moon = parseMoonOrientation(
  readBytes('data', 'sky', 'moon_me_6h.f32').buffer as ArrayBuffer,
  readJson<{ start_utc: string; step_hours: number; count: number }>('data', 'sky', 'moon_me_6h.json'),
);

describe('stars', () => {
  it('reads the catalogue brightest first, Sirius at the top', () => {
    expect(stars.count).toBe(meta.count);
    expect(stars.vmag[0]).toBeCloseTo(-1.46, 2);
    for (let i = 1; i < stars.count; i++) expect(stars.vmag[i]).toBeGreaterThanOrEqual(stars.vmag[i - 1]);
  });

  it('places catalogue stars where SPICE puts them, for two sites and five hours, to 0.01°', () => {
    const { cases } = readJson<{ cases: { lat: number; lon: number; utc: string; stars: { index: number; az_deg: number; el_deg: number }[] }[] }>('data', 'fixtures', 'sky', 'stars_at_sites.json');
    expect(cases.length).toBe(10);
    const out = new Float32Array(stars.count * 3);
    for (const c of cases) {
      placeStars(stars, moonMatrixAt(moon, Date.parse(c.utc + 'Z')), enuBasis(c.lat, c.lon), 1, out);
      for (const s of c.stars) {
        const { az, el } = azElOf([out[s.index * 3], out[s.index * 3 + 1], out[s.index * 3 + 2]]);
        expect(Math.abs(el - s.el_deg), `${c.utc} star ${s.index} el`).toBeLessThan(0.01);
        const dAz = Math.abs(((az - s.az_deg + 540) % 360) - 180) * Math.cos((el * Math.PI) / 180);
        expect(dAz, `${c.utc} star ${s.index} az`).toBeLessThan(0.01);
      }
    }
  });

  it('scales brightness with the square root of a star’s light, as the eye sees it, so the faintest catalogue stars still show', () => {
    expect(starGain(1) / starGain(6)).toBeCloseTo(10, 6); // 5 magnitudes: 100 times the light, 10 times as bright to the eye
    expect(starGain(6)).toBeGreaterThan(0.08);
    expect(starGain(-1.46)).toBeLessThanOrEqual(1.6);
    expect(starSize(6.5)).toBeGreaterThanOrEqual(1.8);
  });

  it('gives brighter stars bigger, brighter points, and colours from blue-white to orange by B−V', () => {
    expect(starSize(-1.46)).toBeGreaterThan(starSize(6));
    expect(starGain(-1.46)).toBeGreaterThan(starGain(6));
    expect(starColour(-0.3)[2]).toBeGreaterThan(starColour(-0.3)[0]);
    expect(starColour(1.6)[0]).toBeGreaterThan(starColour(1.6)[2]);
  });
});
