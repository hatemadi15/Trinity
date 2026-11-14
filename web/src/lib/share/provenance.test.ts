import { describe, expect, it } from 'vitest';
import { ENERGY_ONLY, POWER_ASSUMPTIONS } from '@/components/PowerScope';
import { featuredReport } from '../engine/completeness';
import { DEFAULT_PARAMS } from '../store/explore';
import { eph, sites } from '@/test/file-loaders';
import { collectProvenance, provenanceLines, settingsLine } from './provenance';
import { loadDataVersions } from './versions';

const site = (id: string) => sites.find((s) => s.id === id)!;
const custom = { id: 'custom_-89.5000_10.0000', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
const versions = { app: { version: '0.1.0', commit: 'abc123def456' }, data: { data: '2026-11-14-a120b7a9', sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: { generatedUtc: '2026-09-28T20:53:33+00:00', sha256: '279fad83a151' }, terrain: { version: '3', generatedUtc: '2026-11-12T09:07:07+00:00' } } };

describe('collectProvenance', () => {
  it('names the precomputed skyline file, the LOLA grids by distance, the mast, the ephemeris and its span, in UTC', () => {
    const p = collectProvenance({ site: site('de_gerlache_rim_2'), maskMeta: { siteHeightM: 190.33, source: 'featured', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(p.period).toEqual({ startUtc: '2027-01-01T00:00:00Z', endUtc: '2027-01-31T00:00:00Z', days: 30, hours: 720 });
    expect(p.terrain.kind).toBe('featured');
    expect(p.terrain.mask).toBe('the precomputed skyline file masks/de_gerlache_rim_2.json, worked out ahead of time from a 2 m mast in 720 directions');
    expect(p.terrain.grids).toEqual(['LOLA LDEM 20 m (ldem_875s_20m) from 40 m to 6 km', 'LOLA LDEM 80 m (ldem_80s_80m) from 6 to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km']);
    expect(p.terrain.mastM).toBe(2);
    expect(p.ephemeris).toEqual({ name: 'JPL DE440 through NAIF SPICE, the Sun and Earth seen from the Moon', firstUtc: '2024-01-01T00:00:00Z', lastUtc: '2036-12-31T23:00:00Z', stepH: 1 });
    expect(p.versions).toEqual({ app: '0.1.0', commit: 'abc123def456', data: '2026-11-14-a120b7a9', sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: 'made 2026-09-28T20:53:33+00:00, SHA-256 279fad83a151', terrain: 'version 3, made 2026-11-12' });
  });

  it('names the coarser grids north of 87.55° S, the browser for a clicked point or another mast, and no grid for a flat horizon', () => {
    const haworth = collectProvenance({ site: site('haworth'), maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 3, mastM: 5 }, params: { ...DEFAULT_PARAMS, mastM: 5 }, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(haworth.terrain.grids).toEqual(['LOLA LDEM 80 m (ldem_80s_80m) from 40 m to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km']);
    expect(haworth.terrain.mask).toBe('worked out in the browser from the LOLA tiles from a 5 m mast in 720 directions; 3 tiles could not be loaded, so some hills may be missing');
    expect(haworth.site.approximate).toBe(true);
    const point = collectProvenance({ site: custom, maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-03-01T10:00:00', days: 14 }, versions);
    expect(point.site.catalogue).toBe('coordinates picked on the Earthrise map');
    expect(point.period.startUtc).toBe('2027-03-01T10:00:00Z');
    const mare = collectProvenance({ site: site('blue_ghost_m1'), maskMeta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2025-03-02T00:00:00', days: 14 }, { app: { version: null, commit: null }, data: { data: null, sites: null, ephemeris: null, terrain: null } });
    expect(mare.terrain.grids).toEqual([]);
    expect(mare.terrain.mask).toBe('none: the site lies outside the polar elevation grids, so its horizon is taken as flat');
    expect(mare.versions).toEqual({ app: null, commit: null, data: null, sites: null, ephemeris: null, terrain: null });
    expect(Object.fromEntries(provenanceLines(mare)).Versions).toBe('Earthrise (a development build)');
  });

  it('lists what the model takes as given, with the settings it ran with', () => {
    const p = collectProvenance({ site: site('haworth'), maskMeta: null, params: { ...DEFAULT_PARAMS, minEarthElDeg: 2, power: { ...DEFAULT_PARAMS.power, initialSocFraction: 0.8 } }, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    const all = p.assumptions.join(' ');
    expect(all).toMatch(/once an hour/);
    expect(all).toMatch(/at least 2° above the skyline/);
    expect(all).toMatch(/not a working radio link/);
    expect(all).toMatch(/starts 80 % full/);
    // The power model's scope in the words the lander dialog, the numbers and the brief use, with its energy-only line.
    for (const line of POWER_ASSUMPTIONS) expect(p.assumptions).toContain(line);
    expect(p.assumptions).toContain(ENERGY_ONLY);
    expect(all).not.toMatch(/dust, heat, wiring|charging losses|survives a night/);
  });

  it('says it all in plain lines for the brief and the files', () => {
    const p = collectProvenance({ site: site('de_gerlache_rim_2'), maskMeta: { siteHeightM: 190.33, source: 'featured', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    const lines = Object.fromEntries(provenanceLines(p));
    expect(lines['Period (UTC)']).toBe('2027-01-01 00:00 to 2027-01-31 00:00 UTC, 30 days, one value per hour');
    expect(lines.Settings).toBe('panel turns to the Sun (vertical_tracking), 4 m², 30 % efficient; load 200 W; battery 2000 Wh, 100 % full at landing; mast 2 m; Earth counts whenever it is above the skyline');
    expect(settingsLine({ ...DEFAULT_PARAMS, minEarthElDeg: 1.5, mastM: 5, power: { ...DEFAULT_PARAMS.power, panel: 'vertical', panelAzimuthDeg: 90, efficiency: 33.3 / 100 } })).toBe(
      'panel upright, facing 90° from north (vertical), 4 m², 33.3 % efficient; load 200 W; battery 2000 Wh, 100 % full at landing; mast 5 m; Earth counts from 1.5° above the skyline',
    );
    expect(lines.Skyline).toMatch(/^the precomputed skyline file masks\/de_gerlache_rim_2\.json.*; LOLA LDEM 20 m/);
    // The catalogue says how near a region's centre is; the line does not say it twice.
    expect(lines.Site).toBe(`de Gerlache Rim 2 (de_gerlache_rim_2) at 88.2800° S, 64.3100° W: ${sites.find((x) => x.id === 'de_gerlache_rim_2')!.source}`);
    expect(lines.Skyline).toMatch(/; site 190 m above the Moon's mean radius$/);
    const low = collectProvenance({ site: custom, maskMeta: { siteHeightM: -334.4, source: 'computed', failedTiles: 0, mastM: 5 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-03-01T00:00:00', days: 14 }, versions);
    const lowLines = Object.fromEntries(provenanceLines(low));
    expect(lowLines.Site).toBe('Custom site -89.500°, 10.000° (custom_-89.5000_10.0000) at 89.5000° S, 10.0000° E: coordinates picked on the Earthrise map');
    expect(lowLines.Skyline).toMatch(/; site 334 m below the Moon's mean radius$/);
    expect(lines['Sun and Earth']).toBe('JPL DE440 through NAIF SPICE, the Sun and Earth seen from the Moon, hourly from 2024-01-01 00:00 to 2036-12-31 23:00 UTC');
    expect(lines.Versions).toBe('Earthrise 0.1.0, commit abc123def456; data version 2026-11-14-a120b7a9; site catalogue sites.json version 1, sites_derived.json version 1; Sun and Earth table made 2026-09-28T20:53:33+00:00, SHA-256 279fad83a151; terrain files version 3, made 2026-11-12');
  });
});

describe('loadDataVersions', () => {
  it("reads the catalogue's and the table's own versions, and says nothing it cannot read", async () => {
    const files: Record<string, unknown> = {
      '/data/sites.json': { version: 1 },
      '/data/sites_derived.json': { version: 1 },
      '/data/ephemeris/moon_me_2024_2036_1h.json': { generated_utc: '2026-09-28T20:53:33+00:00', table_sha256: '279fad83a151b69fb446c826719476d99ac671369416dc0c08fef49565642545' },
      '/data/manifest.json': { format: 1, data_version: '2026-11-14-a120b7a9', groups: [] },
      '/data/terrain/manifest.json': { version: 3, generated_utc: '2026-11-12T09:07:07+00:00' },
    };
    const get = async <T,>(url: string) => {
      if (!(url in files)) throw new Error(`could not load ${url} (HTTP 404)`);
      return files[url] as T;
    };
    expect(await loadDataVersions('/data', get)).toEqual({ data: '2026-11-14-a120b7a9', sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: { generatedUtc: '2026-09-28T20:53:33+00:00', sha256: '279fad83a151' }, terrain: { version: '3', generatedUtc: '2026-11-12T09:07:07+00:00' } });
    delete files['/data/manifest.json'];
    delete files['/data/terrain/manifest.json'];
    delete files['/data/ephemeris/moon_me_2024_2036_1h.json'];
    delete files['/data/sites_derived.json'];
    expect(await loadDataVersions('/data', get)).toEqual({ data: null, sites: 'sites.json version 1', ephemeris: null, terrain: null });
  });
});

describe('a skyline with its terrain report', () => {
  it("adds the report's record when the store carries one: when and how a file was made, the tile set, and how far it can be trusted", () => {
    const featured = {
      siteHeightM: 190.33,
      source: 'featured' as const,
      failedTiles: 0,
      mastM: 2,
      terrain: featuredReport({ site_id: 'de_gerlache_rim_2', mast_m: 2, fallback_bands: [], generated_utc: '2026-09-29T03:52:21+00:00', method: 'Barker et al. 2021 nested-grid horizon' }),
    };
    const p = collectProvenance({ site: site('de_gerlache_rim_2'), maskMeta: featured, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(p.terrain.quality).toBe('complete');
    expect(p.terrain.mask).toBe('the precomputed skyline file masks/de_gerlache_rim_2.json, worked out ahead of time from a 2 m mast in 720 directions, made 2026-09-29 by Barker et al. 2021 nested-grid horizon');
    expect(Object.fromEntries(provenanceLines(p)).Skyline).toMatch(/; its terrain record: complete$/);
    const computed = {
      siteHeightM: 10,
      source: 'computed' as const,
      failedTiles: 0,
      mastM: 5,
      terrain: { source: { kind: 'computed' as const, version: 1, generatedUtc: '2026-11-12T09:07:07+00:00' }, mastM: 5, findings: null, quality: 'degraded' as const, reasons: [{ kind: 'site-grid' as const, grid: 'L1', planned: 'L0' }] },
    };
    const q = collectProvenance({ site: site('haworth'), maskMeta: computed, params: { ...DEFAULT_PARAMS, mastM: 5 }, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(q.terrain.mask).toBe('worked out in the browser from the LOLA tiles (tile set version 1, cut 2026-11-12) from a 5 m mast in 720 directions');
    expect(q.terrain.quality).toBe('degraded');
    // Without a report, as before.
    const r = collectProvenance({ site: site('haworth'), maskMeta: { siteHeightM: 10, source: 'featured', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(r.terrain.quality).toBeNull();
    expect(Object.fromEntries(provenanceLines(r)).Skyline).not.toMatch(/terrain record/);
  });
});

