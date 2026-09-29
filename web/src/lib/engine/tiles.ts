import { psSouthLatLon, psSouthXY } from './geometry';

export interface TileLevel {
  id: string;
  map_scale_m: number;
  lines: number;
  samples: number;
  line_offset_px: number;
  sample_offset_px: number;
  max_latitude_deg: number;
  dn_scale_m: number;
  tile_size: number;
  tiles_x: number;
  tiles_y: number;
  nodata: number;
  path: string;
  source?: string;
}

export interface TileManifest {
  version: number;
  reference_radius_m: number;
  levels: TileLevel[];
}

export interface TileSource {
  /** Raw zlib bytes of one tile, or null when the tile does not exist / cannot be fetched. */
  getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null>;
}

export function levelById(manifest: TileManifest, id: string): TileLevel {
  const level = manifest.levels.find((l) => l.id === id);
  if (!level) throw new Error(`tile level ${id} not in manifest`);
  return level;
}

export function tilePath(level: TileLevel, ty: number, tx: number): string {
  return level.path.replace('{y}', String(ty)).replace('{x}', String(tx));
}

/** zlib (RFC 1950) -> little-endian int16 tile. Uses the platform DecompressionStream. */
export async function decodeTile(bytes: Uint8Array, tileSize: number): Promise<Int16Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const expected = tileSize * tileSize * 2;
  if (raw.byteLength !== expected) throw new Error(`tile decoded to ${raw.byteLength} bytes, expected ${expected}`);
  return new Int16Array(raw.buffer, raw.byteOffset, tileSize * tileSize);
}

/** In-memory grid exposed as tiles (tests). `missing` keys are reported as absent tiles. */
export class MemoryTileSource implements TileSource {
  constructor(private level: TileLevel, private grid: Int16Array, private missing: Set<string> = new Set()) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    if (this.missing.has(`${ty}_${tx}`)) return null;
    const T = level.tile_size;
    const block = new Int16Array(T * T).fill(level.nodata);
    for (let r = 0; r < T; r++) {
      const gr = ty * T + r;
      if (gr >= this.level.lines) break;
      for (let c = 0; c < T; c++) {
        const gc = tx * T + c;
        if (gc >= this.level.samples) break;
        block[r * T + c] = this.grid[gr * this.level.samples + gc];
      }
    }
    // Encode with a stored (uncompressed) zlib stream so tests need no compressor.
    return zlibStored(new Uint8Array(block.buffer));
  }
}

/** Wrap raw bytes in a valid zlib stream using stored deflate blocks (no compression). */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const MAX = 65_535;
  for (let off = 0; off < raw.length || (off === 0 && raw.length === 0); off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = len & 0xff; head[2] = len >> 8; head[3] = ~len & 0xff; head[4] = (~len >> 8) & 0xff;
    blocks.push(head, raw.subarray(off, off + len));
    if (raw.length === 0) break;
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  const adler = new Uint8Array([(b >> 8) & 0xff, b & 0xff, (a >> 8) & 0xff, a & 0xff]);
  const total = 2 + blocks.reduce((n, x) => n + x.length, 0) + 4;
  const out = new Uint8Array(total);
  out[0] = 0x78; out[1] = 0x01;
  let p = 2;
  for (const x of blocks) { out.set(x, p); p += x.length; }
  out.set(adler, p);
  return out;
}

/** Bilinear sampler over one tile level. Load tiles with ensure*() before sampling. */
export class LevelSampler {
  private tiles = new Map<string, Int16Array | null>();
  private pending = new Map<string, Promise<void>>();

  constructor(readonly level: TileLevel, private source: TileSource) {}

  pixelFromLatLon(latDeg: number, lonDeg: number): { col: number; row: number } {
    const { x, y } = psSouthXY(latDeg, lonDeg);
    return {
      col: this.level.sample_offset_px + x / this.level.map_scale_m,
      row: this.level.line_offset_px - y / this.level.map_scale_m,
    };
  }

  latLonFromPixel(col: number, row: number): { lat: number; lon: number } {
    const x = (col - this.level.sample_offset_px) * this.level.map_scale_m;
    const y = (this.level.line_offset_px - row) * this.level.map_scale_m;
    return psSouthLatLon(x, y);
  }

  /** Tile keys needed to bilinearly sample the given fractional pixels (only in-grid ones). */
  tilesForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Set<string> {
    const T = this.level.tile_size, keys = new Set<string>();
    for (let i = 0; i < cols.length; i++) {
      const c0 = Math.floor(cols[i]), r0 = Math.floor(rows[i]);
      if (!(c0 >= 0 && r0 >= 0 && c0 < this.level.samples - 1 && r0 < this.level.lines - 1)) continue;
      const tx0 = Math.floor(c0 / T), tx1 = Math.floor((c0 + 1) / T);
      const ty0 = Math.floor(r0 / T), ty1 = Math.floor((r0 + 1) / T);
      keys.add(`${ty0}_${tx0}`);
      if (tx1 !== tx0) keys.add(`${ty0}_${tx1}`);
      if (ty1 !== ty0) { keys.add(`${ty1}_${tx0}`); if (tx1 !== tx0) keys.add(`${ty1}_${tx1}`); }
    }
    return keys;
  }

  async ensureTiles(keys: Iterable<string>): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of keys) {
      if (this.tiles.has(key)) continue;
      let job = this.pending.get(key);
      if (!job) {
        const [ty, tx] = key.split('_').map(Number);
        job = this.source
          .getTileBytes(this.level, ty, tx)
          .then(async (bytes) => { this.tiles.set(key, bytes ? await decodeTile(bytes, this.level.tile_size) : null); })
          .catch(() => { this.tiles.set(key, null); })
          .finally(() => { this.pending.delete(key); });
        this.pending.set(key, job);
      }
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  async ensureForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Promise<void> {
    await this.ensureTiles(this.tilesForPixels(cols, rows));
  }

  /** Raw DN at an integer pixel; NaN outside the grid, in a missing tile, or at nodata. */
  dn(row: number, col: number): number {
    if (row < 0 || col < 0 || row >= this.level.lines || col >= this.level.samples) return NaN;
    const T = this.level.tile_size;
    const ty = Math.floor(row / T), tx = Math.floor(col / T);
    const tile = this.tiles.get(`${ty}_${tx}`);
    if (tile === undefined) throw new Error(`tile ${ty}_${tx} of ${this.level.id} not loaded; call ensureTiles first`);
    if (tile === null) return NaN;
    const v = tile[(row - ty * T) * T + (col - tx * T)];
    return v === this.level.nodata ? NaN : v;
  }

  /** DN * dn_scale_m (metres) at fractional pixels; NaN where any of the 4 neighbours is unavailable. */
  valueBilinear(cols: ArrayLike<number>, rows: ArrayLike<number>): Float64Array {
    const out = new Float64Array(cols.length).fill(NaN);
    const scale = this.level.dn_scale_m;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i], row = rows[i];
      const c0 = Math.floor(col), r0 = Math.floor(row);
      if (!(c0 >= 0 && r0 >= 0 && c0 < this.level.samples - 1 && r0 < this.level.lines - 1)) continue;
      const fc = col - c0, fr = row - r0;
      const a = this.dn(r0, c0), b = this.dn(r0, c0 + 1), c = this.dn(r0 + 1, c0), d = this.dn(r0 + 1, c0 + 1);
      const top = a * (1 - fc) + b * fc, bottom = c * (1 - fc) + d * fc;
      out[i] = (top * (1 - fr) + bottom * fr) * scale;
    }
    return out;
  }

  async valueAt(latDeg: number, lonDeg: number): Promise<number> {
    const { col, row } = this.pixelFromLatLon(latDeg, lonDeg);
    const cols = new Float64Array([col]), rows = new Float64Array([row]);
    await this.ensureForPixels(cols, rows);
    return this.valueBilinear(cols, rows)[0];
  }
}
