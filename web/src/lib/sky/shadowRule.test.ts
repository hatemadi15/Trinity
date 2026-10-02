import { describe, expect, it } from 'vitest';
import { decodeHeightmap, shadowLevels, type Heightmap, type HeightmapMeta, type TerrainManifest } from '@/lib/data/terrain';
import { hasFile, readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { hourlySeries } from '@/lib/engine/metrics';
import { utcToEt } from '@/lib/engine/time';
import { dirAzEl } from './frames';
import { SHADOW, SHADOW_FAST, SHADOW_GLSL, sunFraction } from './shadowRule';
import { flatField, terrainField } from './terrainField';

const terrain = ['web', 'public', 'data', 'terrain'];
const present = hasFile(...terrain, 'manifest.json') && hasFile(...terrain, 'de_gerlache_rim_2.context.u16');

async function heightmap(file: string, metaFile: string): Promise<Heightmap> {
  const meta = readJson<HeightmapMeta>(...terrain, metaFile);
  return { meta, heightsM: await decodeHeightmap(readBytes(...terrain, file), meta) };
}

describe('the shadow rule', () => {
  it('lights flat ground whenever the Sun’s centre is above the horizon, half the disc at 0°, none below its radius', () => {
    const f = flatField(0);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, 2))).toBe(1);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, -1))).toBe(0);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, 0))).toBeGreaterThan(0.3);
  });

  it('puts a point behind a wall in shadow and the top of the wall in sunlight', () => {
    // A 200 m wall 2 km east of the site, the Sun 3° up in the east: the wall rises 5.7° from the site.
    const n = 401, cell = 20, heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = c >= 300 && c <= 305 ? 200 : 0;
    const f = terrainField([{ heights, width: n, height: n, pxM: cell, siteCol: 200, siteRow: 200 }], 0, 0);
    expect(sunFraction(f, 0, 2, 0, dirAzEl(90, 3))).toBe(0);
    expect(sunFraction(f, 0, 2, 0, dirAzEl(90, 8))).toBe(1);
    expect(sunFraction(f, 2050, 202, 0, dirAzEl(90, 3))).toBe(1);
  });

  it('writes the same constants into the shader, with the steps and their growth set by the quality', () => {
    expect(SHADOW_GLSL).toContain(`i < ${SHADOW.STEPS}`);
    expect(SHADOW_GLSL).toContain(`${SHADOW.TOL_M}`);
    expect(SHADOW_GLSL).toContain('i >= uSteps');
    expect(SHADOW_GLSL).toContain('t *= uGrowth');
    // Both settings reach the far hills: 150 km within their steps.
    for (const q of [SHADOW, SHADOW_FAST]) expect(SHADOW.T0_MIN_M * q.GROWTH ** q.STEPS).toBeGreaterThan(SHADOW.MAX_M);
  });

  it.skipIf(!present)('agrees with the engine at de Gerlache Rim 2 in January 2027 on at least 98.5 % of the hours, and disagrees only while the Sun is partly hidden', async () => {
    const manifest = readJson<TerrainManifest>(...terrain, 'manifest.json');
    const entry = manifest.windows.find((w) => w.site_id === 'de_gerlache_rim_2')!;
    const [window, context, cap] = await Promise.all([
      heightmap(entry.file, entry.meta),
      heightmap(entry.context!.file, entry.context!.meta),
      heightmap(manifest.cap.file, manifest.cap.meta),
    ]);
    const site = { lat: -88.28, lon: -64.31 };
    const field = terrainField(shadowLevels(site, window, context, cap), site.lon, window.meta.site_height_m);
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json'));
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const series = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 720);
    let agree = 0;
    for (let h = 0; h < 720; h++) {
      const ours = sunFraction(field, 0, 2, 0, dirAzEl(series.sunAz[h], series.sunEl[h])) >= 0.5;
      if (ours === series.sunFraction[h] >= 0.5) agree++;
      else {
        expect(series.sunFraction[h], `hour ${h}`).toBeGreaterThan(0.05);
        expect(series.sunFraction[h], `hour ${h}`).toBeLessThan(0.95);
      }
    }
    expect(agree / 720).toBeGreaterThanOrEqual(0.985);
  });
});
