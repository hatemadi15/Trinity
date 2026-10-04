import type { GlobeHeights } from '../sky/globe';
import { fetchBytes, fetchJson } from './loaders';
import { decodeHeightmap, type HeightmapQuant } from './terrain';

/** Written by the pipeline's `globe` command (pipeline/lunar_pipeline/globe.py). */
export interface GlobeManifest {
  version: number;
  color: { '1k': string; '4k': string };
  normal: { '1k': string; '4k': string };
  heights: { file: string; meta: string };
  /** Brings the colour map's mean brightness round the south pole to the stand view's regolith albedo. */
  albedo_scale: number;
  radius_m: number;
  credit: string;
}

/** The Moon from space: the small maps to draw at once, the large ones when they come, and the heights. */
export interface GlobeAssets {
  color: { low: string; high: string };
  normal: { low: string; high: string };
  heights: GlobeHeights;
  albedoScale: number;
  credit: string;
}

export async function loadGlobeAssets(base: string): Promise<GlobeAssets> {
  const m = await fetchJson<GlobeManifest>(`${base}/globe/manifest.json`);
  const [meta, bytes] = await Promise.all([fetchJson<HeightmapQuant>(`${base}/globe/${m.heights.meta}`), fetchBytes(`${base}/globe/${m.heights.file}`)]);
  const url = (f: string) => `${base}/globe/${f}`;
  return {
    color: { low: url(m.color['1k']), high: url(m.color['4k']) },
    normal: { low: url(m.normal['1k']), high: url(m.normal['4k']) },
    heights: { width: meta.width, height: meta.height, metres: await decodeHeightmap(bytes, meta) },
    albedoScale: m.albedo_scale,
    credit: m.credit,
  };
}
