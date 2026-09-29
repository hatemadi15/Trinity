import { computeSiteMask, type BandInfo, type Coverage, type Samplers } from './horizon';
import { LevelSampler, levelById, type TileManifest, type TileSource } from './tiles';

export type EngineRequest = { id: number; type: 'mask'; lat: number; lon: number; base: string; mastM?: number };

export type MaskResult = {
  mask: Float64Array;
  siteHeightM: number;
  bands: BandInfo[];
  fallbackBands: BandInfo[];
  coverage: Coverage;
  failedTiles: string[];
  ms: number;
};

export type EngineResponse =
  | ({ id: number; type: 'mask' } & MaskResult)
  | { id: number; type: 'error'; message: string };

export interface EngineDeps {
  manifest: (base: string) => Promise<TileManifest>;
  source: (base: string) => TileSource;
}

const samplerCache = new Map<string, Samplers>();

async function samplersFor(base: string, deps: EngineDeps): Promise<Samplers> {
  const cached = samplerCache.get(base);
  if (cached) return cached;
  const manifest = await deps.manifest(base);
  const source = deps.source(base);
  const samplers: Samplers = {
    L0: new LevelSampler(levelById(manifest, 'L0'), source),
    L1: new LevelSampler(levelById(manifest, 'L1'), source),
    L2: new LevelSampler(levelById(manifest, 'L2'), source),
  };
  samplerCache.set(base, samplers);
  return samplers;
}

export async function handleEngineRequest(req: EngineRequest, deps: EngineDeps): Promise<EngineResponse> {
  try {
    const t0 = Date.now();
    const samplers = await samplersFor(req.base, deps);
    const { mask, siteHeightM, bands, fallbackBands, coverage, failedTiles } = await computeSiteMask(req.lat, req.lon, samplers, {
      mastM: req.mastM ?? 2,
    });
    return { id: req.id, type: 'mask', mask, siteHeightM, bands, fallbackBands, coverage, failedTiles, ms: Date.now() - t0 };
  } catch (err) {
    return { id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
