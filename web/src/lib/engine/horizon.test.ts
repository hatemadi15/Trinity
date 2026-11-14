import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { R_MOON_M } from './constants';
import { bandsForSite, COVERAGE_CELL_M, computeSiteMask, HIGHEST_TERRAIN_M, horizonMask, horizonMaskWithStats, type Samplers } from './horizon';
import { LevelSampler, levelById, MemoryTileSource, type TileLevel } from './tiles';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

function syntheticLevel(size: number, scale: number): TileLevel {
  return {
    id: 'T', map_scale_m: scale, lines: size, samples: size, line_offset_px: (size - 1) / 2,
    sample_offset_px: (size - 1) / 2, max_latitude_deg: -89, dn_scale_m: 0.5, tile_size: 512,
    tiles_x: Math.ceil(size / 512), tiles_y: Math.ceil(size / 512), nodata: -32768, path: 'T/{y}_{x}.bin',
  };
}
const SITE = { lat: -89.9, lon: 45.0 };

function paintRing(grid: Int16Array, level: TileLevel, sampler: LevelSampler, rIn: number, rOut: number, dn: number) {
  const { col, row } = sampler.pixelFromLatLon(SITE.lat, SITE.lon);
  for (let r = 0; r < level.lines; r++)
    for (let c = 0; c < level.samples; c++) {
      const d = Math.hypot(c - col, r - row) * level.map_scale_m;
      if (d >= rIn && d <= rOut) grid[r * level.samples + c] = dn;
    }
}

describe('horizonMask on synthetic terrain', () => {
  it('flat sphere from a 2 m mast gives the analytic slightly negative skyline', async () => {
    const level = syntheticLevel(1024, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(1024 * 1024)));
    const mask = await horizonMask(SITE.lat, SITE.lon, [{ sampler: s, rMinM: 40, rMaxM: 8000, stepM: 10 }], { mastM: 2 });
    let expected = -90;
    for (let d = 40; d < 8000; d += 10) {
      const el = (Math.atan2(R_MOON_M * Math.cos(d / R_MOON_M) - (R_MOON_M + 2), R_MOON_M * Math.sin(d / R_MOON_M)) * 180) / Math.PI;
      expected = Math.max(expected, el);
    }
    expect(expected).toBeGreaterThan(-0.12);
    expect(expected).toBeLessThan(-0.05);
    expect(mask.length).toBe(720);
    for (const v of mask) expect(Math.abs(v - expected)).toBeLessThan(0.01);
  });
  it('a 1000 m ring wall 5 km away gives 11.2 deg all around', async () => {
    const level = syntheticLevel(1024, 20);
    const grid = new Int16Array(1024 * 1024);
    const s = new LevelSampler(level, new MemoryTileSource(level, grid));
    paintRing(grid, level, s, 5000, 5100, 2000);
    const mask = await horizonMask(SITE.lat, SITE.lon, [{ sampler: s, rMinM: 40, rMaxM: 8000, stepM: 10 }], { mastM: 2 });
    const delta = 5000 / R_MOON_M;
    const expected = (Math.atan2((R_MOON_M + 1000) * Math.cos(delta) - (R_MOON_M + 2), (R_MOON_M + 1000) * Math.sin(delta)) * 180) / Math.PI;
    expect(expected).toBeCloseTo(11.2, 1);
    for (const v of mask) expect(Math.abs(v - expected)).toBeLessThan(0.15);
  });
  it('bandsForSite rejects sites north of 60S', () => {
    const level = syntheticLevel(8, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(64)));
    const samplers: Samplers = { L0: s, L1: s, L2: s };
    expect(() => bandsForSite(-59.9, samplers)).toThrow(/no DEM coverage/);
    expect(bandsForSite(-89, samplers).map((b) => b.stepM)).toEqual([10, 40, 120]);
    expect(bandsForSite(-84, samplers).map((b) => b.stepM)).toEqual([20, 120]);
  });
});

const tilesPresent = hasFile('data_out', 'tiles', 'manifest.json');

describe.skipIf(!tilesPresent)('mask parity with the Python pipeline', () => {
  it('reproduces every committed mask to 0.01 deg, including the IM-1 fallback band', async () => {
    const dir = repoPath('data_out', 'tiles');
    const manifest = readManifest(dir);
    const src = new FsTileSource(dir);
    const samplers: Samplers = {
      L0: new LevelSampler(levelById(manifest, 'L0'), src),
      L1: new LevelSampler(levelById(manifest, 'L1'), src),
      L2: new LevelSampler(levelById(manifest, 'L2'), src),
    };
    const files = fs.readdirSync(repoPath('data', 'masks')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(21);
    for (const f of files) {
      const py = readJson<{ site_id: string; lat: number; lon: number; site_height_m: number; elevation_deg: number[]; fallback_bands: { r_min_m: number }[] }>('data', 'masks', f);
      const ts = await computeSiteMask(py.lat, py.lon, samplers, { mastM: 2 });
      expect(ts.siteHeightM).toBeCloseTo(py.site_height_m, 1);
      let worst = 0;
      for (let k = 0; k < 720; k++) worst = Math.max(worst, Math.abs(ts.mask[k] - py.elevation_deg[k]));
      expect(worst, `${py.site_id} max |dEl| = ${worst}`).toBeLessThan(0.01);
      expect(ts.fallbackBands.length).toBe(py.fallback_bands.length);
      if (py.fallback_bands.length) expect(ts.fallbackBands[0].rMinM).toBeCloseTo(py.fallback_bands[0].r_min_m, 6);
    }
  }, 600_000);
});

describe('coverage reporting', () => {
  it('computeSiteMask reports samples outside the grid and failed tiles', async () => {
    const small = syntheticLevel(256, 20); // +-2.56 km around the pole; rings beyond it are outside the grid
    const s = new LevelSampler(small, new MemoryTileSource(small, new Int16Array(256 * 256)));
    const samplers: Samplers = { L0: s, L1: s, L2: s };
    const res = await computeSiteMask(-89.95, 0, samplers, { mastM: 2 });
    expect(res.coverage.samples).toBeGreaterThan(0);
    expect(res.coverage.missing).toBeGreaterThan(0);
    expect(res.coverage.missing).toBeLessThan(res.coverage.samples);
    expect(res.failedTiles).toEqual([]);
  });
});

describe.skipIf(!tilesPresent)('mask performance on real tiles', () => {
  it('computes a warm mask in well under two seconds', async () => {
    const dir = repoPath('data_out', 'tiles');
    const manifest = readManifest(dir);
    const src = new FsTileSource(dir);
    const samplers: Samplers = {
      L0: new LevelSampler(levelById(manifest, 'L0'), src),
      L1: new LevelSampler(levelById(manifest, 'L1'), src),
      L2: new LevelSampler(levelById(manifest, 'L2'), src),
    };
    const site = readJson<{ lat: number; lon: number }>('data', 'masks', 'shackleton_center_rim_high.json');
    await computeSiteMask(site.lat, site.lon, samplers, { mastM: 2 }); // cold: tile IO + decode
    // Wall time inside a parallel test run is noisy, so the best of three warm runs is what must be fast.
    let warmMs = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = Date.now();
      await computeSiteMask(site.lat, site.lon, samplers, { mastM: 2 });
      warmMs = Math.min(warmMs, Date.now() - t0);
    }
    expect(warmMs, `warm mask took ${warmMs} ms`).toBeLessThan(3000);
  }, 120_000);
});

describe('what the march found: coverage, where it is missing, and what that can do to the skyline', () => {
  /** A flat grid of `size` pixels of `scale` metres centred on the pole, with tiles listed in `missing` absent. */
  function flat(size: number, scale: number, missing: string[] = [], fill = 0) {
    const level = { ...syntheticLevel(size, scale), id: `G${scale}` };
    return new LevelSampler(level, new MemoryTileSource(level, new Int16Array(size * size).fill(fill), new Set(missing)));
  }
  const POLE = { lat: -90, lon: 0 };

  it('counts a ray step as covered when any grid has terrain there, so a coarser band that fills a finer one leaves nothing missing', async () => {
    const fine = flat(256, 20); // 2.5 km out from the site
    const coarse = flat(512, 40); // 10 km out
    const bands = [
      { sampler: fine, rMinM: 40, rMaxM: 8_000, stepM: 10 },
      { sampler: coarse, rMinM: 2_000, rMaxM: 8_000, stepM: 40 },
    ];
    const { coverage } = await horizonMaskWithStats(POLE.lat, POLE.lon, bands, { mastM: 2 });
    expect(coverage.samples).toBe(720 * Math.ceil(8_000 / COVERAGE_CELL_M));
    expect(coverage.missing).toBe(0);
    expect(coverage.openAzimuths).toBe(0);
    expect(coverage.nearestMissingM).toBeNull();
    // Without the coarser band, the fine grid runs out 2.5 km away in every direction.
    const alone = await horizonMaskWithStats(POLE.lat, POLE.lon, bands.slice(0, 1), { mastM: 2 });
    expect(alone.coverage.missing).toBeGreaterThan(0);
    // Steps are 120 m long: the first step with no terrain at all starts within a step of the grid's edge.
    expect(alone.coverage.nearestMissingM).toBeGreaterThan(2_550 - 120);
    expect(alone.coverage.nearestMissingM).toBeLessThan(2_550 + 120);
  });

  it('an absent tile within range leaves its ray steps without terrain, and opens the directions where a hill could stand there', async () => {
    // 1024 px of 20 m in tiles of 512 px: the four tiles meet at the site, and tile 1_1, a quarter of the ground, is absent.
    const s = flat(1024, 20, ['1_1']);
    // The site's own height needs all four tiles; it is given, as computeSiteMask would read it from a coarser grid.
    const { mask, coverage } = await horizonMaskWithStats(POLE.lat, POLE.lon, [{ sampler: s, rMinM: 40, rMaxM: 10_000, stepM: 10 }], { mastM: 2, siteHeightM: 0 });
    expect(coverage.absentTiles).toEqual(['G20/1_1']);
    expect(coverage.failedTiles).toEqual([]);
    expect(coverage.missing).toBeGreaterThan(0);
    expect(coverage.missing).toBeLessThan(coverage.samples);
    // The flat ground gives a skyline just below level; any hill in the gap would stand above it.
    expect(Math.max(...mask)).toBeLessThan(0);
    // A quarter of the 720 rays, and a few more beside it, whose first steps sample the absent tile's edge pixels.
    expect(coverage.openAzimuths).toBeGreaterThanOrEqual(180);
    expect(coverage.openAzimuths).toBeLessThan(220);
    expect(coverage.nearestMissingM).toBe(0);
    expect(coverage.ranges.map((r) => [r.fromM, r.toM])).toEqual([
      [0, 6_000],
      [6_000, 100_000],
      [100_000, 220_000],
    ]);
    expect(coverage.ranges[0].missing).toBeGreaterThan(0);
    expect(coverage.ranges[2].samples).toBe(0);
  });

  it('terrain missing far beyond a high skyline cannot open a direction: no hill there could reach above it', async () => {
    // A 300 m grid 150 km out from the site with a 1000 m wall 5 km away (an 11 degree skyline); past 150 km there is no map.
    const level = { ...syntheticLevel(1000, 300), id: 'W' };
    const grid = new Int16Array(1000 * 1000);
    const s = new LevelSampler(level, new MemoryTileSource(level, grid));
    for (let r = 0; r < 1000; r++)
      for (let c = 0; c < 1000; c++) {
        const d = Math.hypot(c - 499.5, r - 499.5) * 300;
        if (d >= 5_000 && d <= 5_700) grid[r * 1000 + c] = 2_000; // DN of 0.5 m
      }
    const { mask, coverage } = await horizonMaskWithStats(POLE.lat, POLE.lon, [{ sampler: s, rMinM: 40, rMaxM: 220_000, stepM: 300 }], { mastM: 2 });
    expect(Math.min(...mask)).toBeGreaterThan(9);
    expect(coverage.missing).toBeGreaterThan(0);
    expect(coverage.nearestMissingM).toBeGreaterThanOrEqual(149_000);
    expect(coverage.openAzimuths).toBe(0);
    expect(coverage.ranges[2].missing).toBe(coverage.missing);
  });

  it('bounds a hill it cannot see by the highest ground on the Moon', () => {
    // LOLA's highest point stands 10,786 m above the 1737.4 km sphere: no lunar hill can stand taller.
    expect(HIGHEST_TERRAIN_M).toBe(10_786);
  });
});
