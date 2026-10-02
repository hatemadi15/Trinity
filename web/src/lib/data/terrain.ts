import { psSouthLatLon, psSouthXY } from '../engine/geometry';
import type { Level } from '../engine/shadow';
import { cropHeightmap } from '../viz/terrain-crop';
import { fetchBytes, fetchJson } from './loaders';

/**
 * Sidecar written by pipeline/lunar_pipeline/terrain3d.py next to each `.u16` raster.
 * Raster cell (col, row) is source pixel (col0 + col, row0 + row) of the level's south polar
 * stereographic grid; height_m = min_m + dn * scale_m_per_unit.
 */
export interface HeightmapMeta {
  site_id: string;
  lat: number;
  lon: number;
  kind: 'window' | 'cap' | 'context';
  source: string;
  level: string;
  /** Cell size in metres (for the cap: the downsampled cell). */
  cell_m: number;
  width: number;
  height: number;
  /** Top-left raster cell as a source-grid pixel (may be negative for a window that overhangs the grid). */
  row0: number;
  col0: number;
  min_m: number;
  max_m: number;
  scale_m_per_unit: number;
  site_height_m: number;
  /** Projection origin (the pole) as a source-grid pixel; for the cap already in cap pixels. */
  line_offset_px: number;
  sample_offset_px: number;
  /** The site as a fractional raster pixel (window: near the centre; cap: the pole). */
  site_row_px: number;
  site_col_px: number;
  fill_source?: string | null;
  fill_px?: number;
  factor?: number;
  max_latitude_deg?: number;
  encoding?: string;
  bytes?: number;
  generated_utc?: string;
}

export interface Heightmap {
  meta: HeightmapMeta;
  /** Row-major heights in metres, width * height entries, row 0 = north. */
  heightsM: Float32Array;
}

export interface TerrainWindowEntry {
  site_id: string;
  lat: number;
  lon: number;
  file: string;
  meta: string;
  level: string;
  cell_m: number;
  width: number;
  height: number;
  bytes: number;
  /** For a 20 m window: the 80 m grid around it (manifest version 2), so hills beyond the window still shade it. */
  context?: { file: string; meta: string; cell_m: number; width: number; height: number };
}

export interface TerrainManifest {
  version: number;
  windows: TerrainWindowEntry[];
  cap: { file: string; meta: string };
  globe_texture: string;
  globe_texture_present?: boolean;
  globe_texture_credit?: string;
  encoding?: string;
  projection?: string;
  pixel?: string;
  reference_radius_m?: number;
  generated_utc?: string;
}

/** The sidecar fields that turn raw DNs into metres. */
export type HeightmapQuant = Pick<HeightmapMeta, 'width' | 'height' | 'min_m' | 'scale_m_per_unit'>;

/** The sidecar fields that place raster pixels in the polar-stereographic grid. */
export type HeightmapGeo = Pick<HeightmapMeta, 'cell_m' | 'row0' | 'col0' | 'line_offset_px' | 'sample_offset_px'>;

/** zlib (RFC 1950) little-endian uint16 raster -> metres (same platform DecompressionStream path as tiles). */
export async function decodeHeightmap(bytes: Uint8Array, meta: HeightmapQuant): Promise<Float32Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const n = meta.width * meta.height;
  if (raw.byteLength !== n * 2) throw new Error(`heightmap decoded to ${raw.byteLength} bytes, expected ${n * 2}`);
  // A Uint16Array view needs an even byte offset; copy if the buffer is not aligned.
  const dn = raw.byteOffset % 2 === 0 ? new Uint16Array(raw.buffer, raw.byteOffset, n) : new Uint16Array(raw.slice().buffer);
  const out = new Float32Array(n);
  const lo = meta.min_m, scale = meta.scale_m_per_unit;
  for (let i = 0; i < n; i++) out[i] = lo + dn[i] * scale;
  return out;
}

export async function loadTerrainManifest(base: string): Promise<TerrainManifest> {
  return fetchJson<TerrainManifest>(`${base}/terrain/manifest.json`);
}

export async function loadHeightmap(base: string, file: string, metaFile: string): Promise<Heightmap> {
  const [meta, bytes] = await Promise.all([
    fetchJson<HeightmapMeta>(`${base}/terrain/${metaFile}`),
    fetchBytes(`${base}/terrain/${file}`),
  ]);
  return { meta, heightsM: await decodeHeightmap(bytes, meta) };
}

/** Raster and sidecar file names of a site's precomputed window, or null when the site has none. */
export function windowFileFor(manifest: TerrainManifest, siteId: string): { file: string; meta: string } | null {
  const entry = manifest.windows.find((w) => w.site_id === siteId);
  return entry ? { file: entry.file, meta: entry.meta } : null;
}

/** Raster and sidecar file names of the 80 m context around a site's 20 m window, or null when there is none. */
export function contextFileFor(manifest: TerrainManifest, siteId: string): { file: string; meta: string } | null {
  const context = manifest.windows.find((w) => w.site_id === siteId)?.context;
  return context ? { file: context.file, meta: context.meta } : null;
}

/** Half-size of the cap crop the shadow sweep starts from: ±240 cells of 960 m, about ±230 km, the farthest hills that can still shade a polar site in grazing light. */
export const CAP_SHADOW_HALF_PX = 240;

const toLevel = (hm: Heightmap): Level => ({ heights: hm.heightsM, width: hm.meta.width, height: hm.meta.height, pxM: hm.meta.cell_m, siteCol: hm.meta.site_col_px, siteRow: hm.meta.site_row_px });

/**
 * A site's terrain as shadow levels, coarse to fine: a crop of the south cap around the site, the 80 m
 * context (20 m sites only) and the window. Each keeps its own site pixel, so all share the site-centred
 * map metres the sweep chains them by. Missing grids are left out.
 */
export function shadowLevels(site: { lat: number; lon: number }, window: Heightmap | null, context: Heightmap | null, cap: Heightmap | null): Level[] {
  const levels: Level[] = [];
  if (cap) levels.push(toLevel(cropHeightmap(cap, latLonToPixel(cap.meta, site.lat, site.lon), CAP_SHADOW_HALF_PX)));
  if (context) levels.push(toLevel(context));
  if (window) levels.push(toLevel(window));
  return levels;
}

/** Lat/lon of a (fractional) raster pixel: rows grow southward on the lon 0 meridian, cols eastward. */
export function pixelToLatLon(meta: HeightmapGeo, col: number, row: number): { lat: number; lon: number } {
  const x = (meta.col0 + col - meta.sample_offset_px) * meta.cell_m;
  const y = (meta.line_offset_px - (meta.row0 + row)) * meta.cell_m;
  return psSouthLatLon(x, y);
}

/** Inverse of pixelToLatLon: the fractional raster pixel of a lat/lon (may fall outside the raster). */
export function latLonToPixel(meta: HeightmapGeo, latDeg: number, lonDeg: number): { col: number; row: number } {
  const { x, y } = psSouthXY(latDeg, lonDeg);
  return {
    col: meta.sample_offset_px + x / meta.cell_m - meta.col0,
    row: meta.line_offset_px - y / meta.cell_m - meta.row0,
  };
}

/** URL of the globe colour map, or null without a manifest or when the pipeline recorded the texture as absent. */
export function globeTextureUrl(base: string, manifest: TerrainManifest | null): string | null {
  if (!manifest || manifest.globe_texture_present === false || !manifest.globe_texture) return null;
  return `${base}/terrain/${manifest.globe_texture}`;
}
