import { computeSiteMask, type BandInfo, type Coverage, type Samplers } from './horizon';
import { LevelSampler, levelById, type TileManifest, type TileSource } from './tiles';

export type EngineRequest = { id: number; type: 'mask'; lat: number; lon: number; base: string; mastM?: number };

export type MaskResult = {
  mask: Float64Array;
  siteHeightM: number;
  /** The grid the site's own height came from: the first band's, unless its tile there was missing. */
  siteGrid: string;
  bands: BandInfo[];
  fallbackBands: BandInfo[];
  coverage: Coverage;
  /** Tiles this skyline needed whose load failed, and tiles the server does not have (404), as "L1/ty_tx". */
  failedTiles: string[];
  absentTiles: string[];
  /** The tile set the skyline was traced through: its manifest's version and when it was cut. */
  terrain: { version: number; generatedUtc: string | null };
  ms: number;
};

export type EngineResponse =
  | ({ id: number; type: 'mask' } & MaskResult)
  | { id: number; type: 'error'; message: string };

export interface EngineDeps {
  manifest: (base: string) => Promise<TileManifest>;
  source: (base: string) => TileSource;
}

const samplerCache = new Map<string, { samplers: Samplers; terrain: MaskResult['terrain'] }>();

async function samplersFor(base: string, deps: EngineDeps): Promise<{ samplers: Samplers; terrain: MaskResult['terrain'] }> {
  const cached = samplerCache.get(base);
  if (cached) return cached;
  const manifest = await deps.manifest(base);
  const source = deps.source(base);
  const samplers: Samplers = {
    L0: new LevelSampler(levelById(manifest, 'L0'), source),
    L1: new LevelSampler(levelById(manifest, 'L1'), source),
    L2: new LevelSampler(levelById(manifest, 'L2'), source),
  };
  const entry = { samplers, terrain: { version: manifest.version, generatedUtc: manifest.generated_utc ?? null } };
  samplerCache.set(base, entry);
  return entry;
}

export async function handleEngineRequest(req: EngineRequest, deps: EngineDeps): Promise<EngineResponse> {
  try {
    const t0 = Date.now();
    const { samplers, terrain } = await samplersFor(req.base, deps);
    const r = await computeSiteMask(req.lat, req.lon, samplers, { mastM: req.mastM ?? 2 });
    return { id: req.id, type: 'mask', ...r, terrain, ms: Date.now() - t0 };
  } catch (err) {
    return { id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
