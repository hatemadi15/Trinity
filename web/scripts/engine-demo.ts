/* Prints the same numbers as `python -m lunar_pipeline.cli report` for a site, computed by the TS engine. */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSiteMask,
  hourlySeries,
  loadEphemeris,
  LevelSampler,
  levelById,
  summarize,
  utcToEt,
  type EphemerisHeader,
  type Samplers,
} from '../src/lib/engine';
import { FsTileSource, readManifest } from '../src/lib/engine/tiles.node';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const siteId = args.get('site') ?? 'shackleton_center_rim_high';
const start = args.get('start') ?? '2025-01-01';
const days = Number(args.get('days') ?? 730);

const root = path.resolve(process.cwd(), '..');
const sites = [
  ...JSON.parse(fs.readFileSync(path.join(root, 'data', 'sites.json'), 'utf8')).sites,
  ...JSON.parse(fs.readFileSync(path.join(root, 'data', 'sites_derived.json'), 'utf8')).sites,
] as { id: string; lat: number; lon: number }[];
const site = sites.find((s) => s.id === siteId);
if (!site) throw new Error(`unknown site ${siteId}; known: ${sites.map((s) => s.id).join(', ')}`);

async function main(target: { id: string; lat: number; lon: number }) {
  const tilesDir = path.join(root, 'data_out', 'tiles');
  const manifest = readManifest(tilesDir);
  const src = new FsTileSource(tilesDir);
  const samplers: Samplers = {
    L0: new LevelSampler(levelById(manifest, 'L0'), src),
    L1: new LevelSampler(levelById(manifest, 'L1'), src),
    L2: new LevelSampler(levelById(manifest, 'L2'), src),
  };
  const t0 = Date.now();
  const { mask, siteHeightM, bands, fallbackBands } = await computeSiteMask(target.lat, target.lon, samplers, { mastM: 2 });
  const maskMs = Date.now() - t0;
  const pyPath = path.join(root, 'data', 'masks', `${target.id}.json`);
  let maskVsPython: number | null = null;
  if (fs.existsSync(pyPath)) {
    const py = JSON.parse(fs.readFileSync(pyPath, 'utf8')).elevation_deg as number[];
    maskVsPython = Math.max(...py.map((v, k) => Math.abs(v - mask[k])));
  }
  const header = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'ephemeris', 'moon_me_2024_2036_1h.json'), 'utf8'),
  ) as EphemerisHeader;
  const eph = loadEphemeris(
    new Uint8Array(fs.readFileSync(path.join(root, 'data', 'ephemeris', 'moon_me_2024_2036_1h.f32'))),
    header,
  );
  const startUtc = start.length === 10 ? `${start}T00:00:00` : start;
  const series = hourlySeries(target, mask, eph, utcToEt(startUtc), days * 24);
  console.log(
    JSON.stringify(
      {
        site_id: target.id,
        lat: target.lat,
        lon: target.lon,
        start_utc: startUtc,
        days,
        site_height_m: Math.round(siteHeightM * 100) / 100,
        mask_ms: maskMs,
        bands,
        fallback_bands: fallbackBands,
        mask_vs_python_max_abs_deg: maskVsPython,
        metrics: summarize(series),
      },
      null,
      1,
    ),
  );
}

main(site).catch((err) => {
  console.error(err);
  process.exit(1);
});
