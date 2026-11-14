import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../store/explore';
import { eph, sites } from '@/test/file-loaders';
import { collectProvenance, provenanceLines } from './provenance';
import { loadDataVersions } from './versions';

const site = (id: string) => sites.find((s) => s.id === id)!;
const custom = { id: 'custom_-89.5000_10.0000', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
const versions = { app: { version: '0.1.0', commit: 'abc123def456' }, data: { sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: { generatedUtc: '2026-09-28T20:53:33+00:00', sha256: '279fad83a151' } } };

describe('collectProvenance', () => {
  it('names the precomputed skyline file, the LOLA grids by distance, the mast, the ephemeris and its span, in UTC', () => {
    const p = collectProvenance({ site: site('de_gerlache_rim_2'), maskMeta: { siteHeightM: 190.33, source: 'featured', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(p.period).toEqual({ startUtc: '2027-01-01T00:00:00Z', endUtc: '2027-01-31T00:00:00Z', days: 30, hours: 720 });
    expect(p.terrain.kind).toBe('featured');
    expect(p.terrain.mask).toBe('the precomputed skyline file masks/de_gerlache_rim_2.json, worked out ahead of time from a 2 m mast in 720 directions');
    expect(p.terrain.grids).toEqual(['LOLA LDEM 20 m (ldem_875s_20m) from 40 m to 6 km', 'LOLA LDEM 80 m (ldem_80s_80m) from 6 to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km']);
    expect(p.terrain.mastM).toBe(2);
    expect(p.ephemeris).toEqual({ name: 'JPL DE440 through NAIF SPICE, the Sun and Earth seen from the Moon', firstUtc: '2024-01-01T00:00:00Z', lastUtc: '2036-12-31T23:00:00Z', stepH: 1 });
    expect(p.versions).toEqual({ app: '0.1.0', commit: 'abc123def456', sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: 'made 2026-09-28T20:53:33+00:00, SHA-256 279fad83a151' });
  });

  it('names the coarser grids north of 87.55° S, the browser for a clicked point or another mast, and no grid for a flat horizon', () => {
    const haworth = collectProvenance({ site: site('haworth'), maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 3, mastM: 5 }, params: { ...DEFAULT_PARAMS, mastM: 5 }, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    expect(haworth.terrain.grids).toEqual(['LOLA LDEM 80 m (ldem_80s_80m) from 40 m to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km']);
    expect(haworth.terrain.mask).toBe('worked out in the browser from the LOLA tiles from a 5 m mast in 720 directions; 3 tiles could not be loaded, so some hills may be missing');
    expect(haworth.site.approximate).toBe(true);
    const point = collectProvenance({ site: custom, maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-03-01T10:00:00', days: 14 }, versions);
    expect(point.site.catalogue).toBe('coordinates picked on the Earthrise map');
    expect(point.period.startUtc).toBe('2027-03-01T10:00:00Z');
    const mare = collectProvenance({ site: site('blue_ghost_m1'), maskMeta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2025-03-02T00:00:00', days: 14 }, { app: { version: null, commit: null }, data: { sites: null, ephemeris: null } });
    expect(mare.terrain.grids).toEqual([]);
    expect(mare.terrain.mask).toBe('none: the site lies outside the polar elevation grids, so its horizon is taken as flat');
    expect(mare.versions).toEqual({ app: null, commit: null, sites: null, ephemeris: null });
  });

  it('lists what the model takes as given, with the settings it ran with', () => {
    const p = collectProvenance({ site: site('haworth'), maskMeta: null, params: { ...DEFAULT_PARAMS, minEarthElDeg: 2, power: { ...DEFAULT_PARAMS.power, initialSocFraction: 0.8 } }, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    const all = p.assumptions.join(' ');
    expect(all).toMatch(/once an hour/);
    expect(all).toMatch(/at least 2° above the skyline/);
    expect(all).toMatch(/not a working radio link/);
    expect(all).toMatch(/starts 80 % full/);
    expect(all).toMatch(/no losses for dust, heat, wiring or ageing/);
  });

  it('says it all in plain lines for the brief and the files', () => {
    const p = collectProvenance({ site: site('de_gerlache_rim_2'), maskMeta: { siteHeightM: 190.33, source: 'featured', failedTiles: 0, mastM: 2 }, params: DEFAULT_PARAMS, eph, startUtc: '2027-01-01T00:00:00', days: 30 }, versions);
    const lines = Object.fromEntries(provenanceLines(p));
    expect(lines['Period (UTC)']).toBe('2027-01-01 00:00 to 2027-01-31 00:00 UTC, 30 days, one value per hour');
    expect(lines.Skyline).toMatch(/^the precomputed skyline file masks\/de_gerlache_rim_2\.json.*; LOLA LDEM 20 m/);
    expect(lines['Sun and Earth']).toBe('JPL DE440 through NAIF SPICE, the Sun and Earth seen from the Moon, hourly from 2024-01-01 00:00 to 2036-12-31 23:00 UTC');
    expect(lines.Versions).toBe('Earthrise 0.1.0, commit abc123def456; site catalogue sites.json version 1, sites_derived.json version 1; Sun and Earth table made 2026-09-28T20:53:33+00:00, SHA-256 279fad83a151');
  });
});

describe('loadDataVersions', () => {
  it("reads the catalogue's and the table's own versions, and says nothing it cannot read", async () => {
    const files: Record<string, unknown> = {
      '/data/sites.json': { version: 1 },
      '/data/sites_derived.json': { version: 1 },
      '/data/ephemeris/moon_me_2024_2036_1h.json': { generated_utc: '2026-09-28T20:53:33+00:00', table_sha256: '279fad83a151b69fb446c826719476d99ac671369416dc0c08fef49565642545' },
    };
    const get = async <T,>(url: string) => {
      if (!(url in files)) throw new Error(`could not load ${url} (HTTP 404)`);
      return files[url] as T;
    };
    expect(await loadDataVersions('/data', get)).toEqual({ sites: 'sites.json version 1, sites_derived.json version 1', ephemeris: { generatedUtc: '2026-09-28T20:53:33+00:00', sha256: '279fad83a151' } });
    delete files['/data/ephemeris/moon_me_2024_2036_1h.json'];
    delete files['/data/sites_derived.json'];
    expect(await loadDataVersions('/data', get)).toEqual({ sites: 'sites.json version 1', ephemeris: null });
  });
});
