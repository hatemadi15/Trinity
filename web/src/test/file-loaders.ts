import zlib from 'node:zlib';
import type { Site } from '@/lib/data/loaders';
import type { HeightmapMeta, TerrainManifest } from '@/lib/data/terrain';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { hasFile, readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import type { Loaders } from '@/lib/store/explore';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
export const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
export const sites: Site[] = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];

/** Store loaders that read the committed data files, for tests that need the real catalogue and the real sky. */
export function fileLoaders(overrides: Partial<Loaders> = {}): Loaders {
  return {
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
    ...overrides,
  };
}

/** Whether the terrain files are in web/public/data/terrain (git-ignored: tests that need them skip without them). */
export const terrainPresent = hasFile('web', 'public', 'data', 'terrain', 'manifest.json');

/**
 * fileLoaders plus the real terrain files, as the browser loads them: the manifest, the cap, the windows. Each
 * raster is inflated with Node's zlib, as jsdom has no DecompressionStream, into metres as decodeHeightmap does.
 */
export function terrainFileLoaders(overrides: Partial<Loaders> = {}): Loaders {
  return fileLoaders({
    loadTerrainManifest: async () => readJson<TerrainManifest>('web', 'public', 'data', 'terrain', 'manifest.json'),
    loadHeightmap: async (file: string, metaFile: string) => {
      const meta = readJson<HeightmapMeta>('web', 'public', 'data', 'terrain', metaFile);
      const raw = zlib.inflateSync(readBytes('web', 'public', 'data', 'terrain', file));
      const dn = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      return { meta, heightsM: Float32Array.from(dn, (v) => meta.min_m + v * meta.scale_m_per_unit) };
    },
    ...overrides,
  });
}
