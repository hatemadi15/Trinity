import { describe, expect, it } from 'vitest';
import { decodeHeightmap, shadowLevels, type Heightmap, type HeightmapMeta, type TerrainManifest } from '../data/terrain';
import { hasFile, readBytes, readJson } from './__tests__/helpers';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { hourlySeries } from './metrics';
import { cast, sunBearingDeg } from './shadow';
import { utcToEt } from './time';

const terrain = ['web', 'public', 'data', 'terrain'];
const present = hasFile(...terrain, 'manifest.json') && hasFile(...terrain, 'de_gerlache_rim_2.context.u16');

async function heightmap(file: string, metaFile: string): Promise<Heightmap> {
  const meta = readJson<HeightmapMeta>(...terrain, metaFile);
  return { meta, heightsM: await decodeHeightmap(readBytes(...terrain, file), meta) };
}

describe.skipIf(!present)('the shadow map agrees with the engine', () => {
  it(
    'at de Gerlache Rim 2 in January 2027: the site is lit when the engine has the Sun up, at least 97 % of the time, and disagrees only near a sunrise or a sunset',
    async () => {
      const manifest = readJson<TerrainManifest>(...terrain, 'manifest.json');
      const entry = manifest.windows.find((w) => w.site_id === 'de_gerlache_rim_2')!;
      const [window, context, cap] = await Promise.all([
        heightmap(entry.file, entry.meta),
        heightmap(entry.context!.file, entry.context!.meta),
        heightmap(manifest.cap.file, manifest.cap.meta),
      ]);
      const site = { lat: -88.28, lon: -64.31 };
      const levels = shadowLevels(site, window, context, cap);
      const fine = levels[levels.length - 1];
      const sitePx = Math.round(fine.siteRow) * fine.width + Math.round(fine.siteCol);

      const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
      const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
      const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
      const series = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 720);
      // The engine has the Sun up when at least half its disc shows: its centre is above the hills.
      const engineLit = (h: number) => series.sunFraction[h] >= 0.5;
      const nearChange = (h: number, within: number) => {
        for (let k = Math.max(0, h - within); k <= Math.min(719, h + within); k++) if (engineLit(k) !== engineLit(h)) return true;
        return false;
      };

      const hours = Array.from({ length: 180 }, (_, k) => k * 4);
      const differ: number[] = [];
      for (const h of hours) {
        const { lit } = cast(levels, sunBearingDeg(site.lon, series.sunAz[h]), series.sunEl[h]);
        if ((lit[sitePx] === 1) !== engineLit(h)) differ.push(h);
      }
      expect(1 - differ.length / hours.length).toBeGreaterThanOrEqual(0.97);
      for (const h of differ) expect(nearChange(h, 3), `hour ${h}`).toBe(true);
    },
    240_000,
  );
});
