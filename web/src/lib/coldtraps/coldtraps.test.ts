import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { psSouthXY } from '@/lib/engine/geometry';
import { coldTrapShort, coldTrapSite, coldTrapWords, decodeMask, overlayFor, overlayRect, type ColdOverlayDoc, type ColdTrapDoc, type ColdTrapSite } from './coldtraps';

const doc = readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json');
const overlay = readJson<ColdOverlayDoc>('data', 'coldtraps', 'overlay.json');
const NBSP = ' ';
const plain = (s: string | null) => (s ?? '').replaceAll(NBSP, ' ');

/** A covered site with no cold ground, to vary one figure at a time. */
function site(over: Partial<ColdTrapSite> & { cold5?: number; half5?: number } = {}): ColdTrapSite {
  const { cold5 = 0, half5 = 0, ...rest } = over;
  const areas = (cold: number, half: number) => ({
    covered_share: 1,
    below_110K_km2: cold,
    below_100K_km2: cold,
    below_120K_km2: cold,
    ice_surface_km2: cold,
    ice_surface_all_year_km2: cold,
    ice_within_0_5m_km2: half,
    ice_within_1m_km2: half,
    psr_km2: 0,
  });
  return {
    site_id: 'x',
    name: 'X',
    lat: -89,
    lon: 0,
    covered: true,
    within_km: { '1': areas(0, 0), '5': areas(cold5, half5) },
    nearest: { below_110K: null, ice_surface: null, ice_within_0_5m: null, psr: null },
    ...rest,
  };
}

/** The rules every cold-trap sentence keeps: ice only ever as "ice could last", and no chance or finding claimed. */
function keepsTheRules(text: string) {
  expect(text, text).not.toMatch(/probab|likel|detect|confirm|discover/i);
  for (const m of text.matchAll(/\bice\b/gi)) expect(text.slice(m.index, m.index + 14), text).toBe('ice could last');
}

describe('the cold-trap line where a site is described', () => {
  it('gives the cold ground within 5 km, the nearest, and the slope on a straight line there', () => {
    const c = site({ cold5: 11.52, nearest: { below_110K: { km: 2.68, slope_max_deg: 36.4 }, ice_surface: null, ice_within_0_5m: null, psr: null } });
    expect(plain(coldTrapWords(c))).toBe(
      'Modelled cold traps: within 5 km, 11.5 km² stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model, conditions where ice could last; the nearest is 2.7 km away, with slopes up to 36° on a straight line there.',
    );
  });

  it('says so when the site itself lies on the cold ground, and when all the ground within 5 km is cold', () => {
    const here = site({ cold5: 1.91, nearest: { below_110K: { km: 0.01, slope_max_deg: 14.2 }, ice_surface: null, ice_within_0_5m: null, psr: null } });
    expect(plain(coldTrapWords(here))).toBe('Modelled cold traps: within 5 km, 1.9 km² stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model, conditions where ice could last, the site itself included.');
    const floor = site({ cold5: 78.54, nearest: { below_110K: { km: 0.01, slope_max_deg: 3.1 }, ice_surface: null, ice_within_0_5m: null, psr: null } });
    expect(plain(coldTrapWords(floor))).toBe('Modelled cold traps: all the ground within 5 km stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model, conditions where ice could last.');
  });

  it('names the nearest cold ground beyond 5 km, and says when there is none within the search', () => {
    const far = site({ nearest: { below_110K: { km: 7.83, slope_max_deg: 14.4 }, ice_surface: null, ice_within_0_5m: null, psr: null } });
    expect(plain(coldTrapWords(far))).toBe('Modelled cold traps: no ground within 5 km stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model; the nearest that does, with conditions where ice could last, is 7.8 km away.');
    expect(plain(coldTrapWords(site()))).toBe('Modelled cold traps: no ground within 10 km stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model, so none has conditions where ice could last on the surface.');
  });

  it('says the model does not reach a polar site north of 80° S, and gives nothing for a site it does not list', () => {
    expect(coldTrapWords({ site_id: 'c', name: 'C', lat: -69.4, lon: 32, covered: false, reason: 'north of 80° S' })).toBe('NASA’s Diviner model of the polar cold traps ends near 80° S, so it does not reach this site.');
    expect(coldTrapWords(null)).toBeNull();
  });

  it('adds, in full, the ground where ice could last within half a metre and what the figures do not show', () => {
    const c = site({ cold5: 11.52, half5: 33.22, nearest: { below_110K: { km: 2.68, slope_max_deg: 36.4 }, ice_surface: null, ice_within_0_5m: null, psr: null } });
    expect(plain(coldTrapWords(c, { full: true }))).toMatch(
      /there\. On 33\.2 km² within 5 km, ice could last at the surface or within half a metre below it\. These are modelled conditions where ice could last, not a finding that any is there, how much or how deep\.$/,
    );
    expect(plain(coldTrapWords(site(), { full: true }))).toMatch(/Within 5 km, no ground has conditions where ice could last within half a metre of the surface\./);
  });

  it('keeps a number and its unit together', () => {
    const text = coldTrapWords(site({ cold5: 11.52, nearest: { below_110K: { km: 2.68, slope_max_deg: 36.4 }, ice_surface: null, ice_within_0_5m: null, psr: null } }))!;
    expect(text).toContain(`11.5${NBSP}km²`);
    expect(text).toContain(`2.7${NBSP}km away`);
    expect(text).toContain(`110${NBSP}K`);
  });

  it('words every polar site of the committed layer by the rules, with ice only ever as conditions where it could last', () => {
    const polar = doc.sites;
    expect(polar.length).toBe(21);
    for (const c of polar) {
      for (const text of [coldTrapWords(c), coldTrapWords(c, { full: true }), coldTrapShort(c)]) if (text) keepsTheRules(text);
      expect(coldTrapWords(c)).toBeTruthy();
    }
  });

  it('reads the committed figures for the Shackleton rim summit', () => {
    const rim = coldTrapSite(doc, 'shackleton_center_rim_high')!;
    expect(plain(coldTrapWords(rim))).toBe(
      'Modelled cold traps: within 5 km, 11.5 km² stays below 110 K (−163 °C) all year in NASA’s Diviner temperature model, conditions where ice could last; the nearest is 2.7 km away, with slopes up to 36° on a straight line there.',
    );
    expect(coldTrapSite(doc, 'apollo_11')).toBeNull();
  });
});

describe('the short line on the site list', () => {
  it('gives the cold ground within 5 km in one short phrase', () => {
    expect(plain(coldTrapShort(site({ cold5: 11.52 })))).toBe('Modelled cold traps, where ice could last: 11.5 km² within 5 km');
    expect(plain(coldTrapShort(site({ cold5: 78.54 })))).toBe('Modelled cold traps, where ice could last: all the ground within 5 km');
    expect(plain(coldTrapShort(site({ cold5: 0.03 })))).toBe('Modelled cold traps, where ice could last: under 0.1 km² within 5 km');
    expect(plain(coldTrapShort(site()))).toBe('Modelled cold traps, where ice could last: none within 5 km');
    expect(coldTrapShort({ site_id: 'c', name: 'C', lat: -69.4, lon: 32, covered: false })).toBeNull();
  });
});

describe('the cold-ground layer for the shadow map', () => {
  it('unpacks rows of bits, most significant first', () => {
    // A 10 by 3 mask with cells 2 to 4 of the middle row set, as the pipeline packs it.
    const mask = decodeMask({ site_id: 'x', x0_m: 0, y0_m: 0, cell_m: 10, width: 10, height: 3, bits: 'AA4AAA==' });
    expect([...mask].flatMap((v, i) => (v ? [i] : []))).toEqual([12, 13, 14]);
  });

  it('places the layer on the terrain window it was cut for', () => {
    const entry = overlayFor(overlay, 'connecting_ridge')!;
    // The site's 20 m terrain window, as web/public/data/terrain/connecting_ridge.json describes it.
    const meta = { cell_m: 20, width: 1024, height: 1024, row0: 3891, col0: 2927, line_offset_px: 3791.5, sample_offset_px: 3791.5 };
    const rect = overlayRect(entry, meta);
    expect(rect.left).toBeCloseTo(0, 6);
    expect(rect.top).toBeCloseTo(0, 6);
    expect(rect.width).toBeCloseTo(1, 6);
    expect(rect.height).toBeCloseTo(1, 6);
    // A window half as wide, with the same corner: the layer reaches twice as far.
    const half = overlayRect(entry, { ...meta, width: meta.width / 2, height: meta.height / 2 });
    expect(half.width).toBeCloseTo(2, 6);
    expect(overlayFor(overlay, 'apollo_11')).toBeNull();
  });

  it('has cold ground in the layer where the site figures have it', () => {
    // The share of the layer's cells within 5 km of the site that are cold, against the site's own figure.
    const coldShare = (id: string) => {
      const e = overlayFor(overlay, id)!;
      const c = coldTrapSite(doc, id)!;
      const mask = decodeMask(e);
      const { x, y } = psSouthXY(c.lat, c.lon);
      let n = 0;
      let cold = 0;
      for (let r = 0; r < e.height; r++)
        for (let k = 0; k < e.width; k++) {
          if (Math.hypot(e.x0_m + (k + 0.5) * e.cell_m - x, e.y0_m - (r + 0.5) * e.cell_m - y) > 5000) continue;
          n++;
          cold += mask[r * e.width + k];
        }
      return { layer: cold / n, figures: c.within_km!['5'].below_110K_km2 / (Math.PI * 25) };
    };
    for (const id of ['shackleton_center', 'shackleton_center_rim_high', 'connecting_ridge', 'im1_odysseus', 'haworth']) {
      const { layer, figures } = coldShare(id);
      expect(Math.abs(layer - figures), id).toBeLessThan(0.03);
    }
    expect(coldShare('shackleton_center').layer).toBe(1);
    expect(coldShare('im1_odysseus').layer).toBe(0);
  });
});
