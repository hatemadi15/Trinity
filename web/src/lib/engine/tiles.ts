import { R_MOON_M } from './constants';
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

const DEG = Math.PI / 180;

/**
 * Bilinear sampler over one tile level. Load tiles with ensure*() before sampling.
 *
 * Tiles live in a dense array indexed by tile id (ty * tiles_x + tx):
 *   undefined = never loaded (or the last load failed, see `failedTiles()`),
 *   null      = the source reported the tile as absent (cached, never retried),
 *   Int16Array = decoded tile.
 * A load that throws is recorded in `failures` and retried on the next ensure; sampling in the
 * meantime yields NaN (no coverage) instead of throwing.
 */
export class LevelSampler {
  private tiles: (Int16Array | null | undefined)[];
  private failures = new Map<number, string>();
  private pending = new Map<number, Promise<void>>();
  private seen: Uint8Array;
  private resident = 0;

  constructor(readonly level: TileLevel, private source: TileSource) {
    const n = level.tiles_x * level.tiles_y;
    this.tiles = new Array<Int16Array | null | undefined>(n);
    this.seen = new Uint8Array(n);
  }

  pixelFromLatLon(latDeg: number, lonDeg: number): { col: number; row: number } {
    const { x, y } = psSouthXY(latDeg, lonDeg);
    return {
      col: this.level.sample_offset_px + x / this.level.map_scale_m,
      row: this.level.line_offset_px - y / this.level.map_scale_m,
    };
  }

  /** Non-allocating projection of one point into cols[i], rows[i] (same math as pixelFromLatLon). */
  pixelInto(latDeg: number, lonDeg: number, cols: Float64Array, rows: Float64Array, i: number): void {
    const rho = 2 * R_MOON_M * Math.tan(((90 - Math.abs(latDeg)) / 2) * DEG);
    const lon = lonDeg * DEG;
    cols[i] = this.level.sample_offset_px + (rho * Math.sin(lon)) / this.level.map_scale_m;
    rows[i] = this.level.line_offset_px - (rho * Math.cos(lon)) / this.level.map_scale_m;
  }

  latLonFromPixel(col: number, row: number): { lat: number; lon: number } {
    const x = (col - this.level.sample_offset_px) * this.level.map_scale_m;
    const y = (this.level.line_offset_px - row) * this.level.map_scale_m;
    return psSouthLatLon(x, y);
  }

  private tileId(ty: number, tx: number): number {
    return ty * this.level.tiles_x + tx;
  }

  /** Ids of tiles needed for bilinear sampling that are not resident yet (in-grid points only). */
  neededTileIds(cols: ArrayLike<number>, rows: ArrayLike<number>): number[] {
    const T = this.level.tile_size, W = this.level.samples - 1, H = this.level.lines - 1, tilesX = this.level.tiles_x;
    const seen = this.seen, tiles = this.tiles, ids: number[] = [];
    const consider = (id: number) => {
      if (seen[id] || tiles[id] !== undefined) return;
      seen[id] = 1;
      ids.push(id);
    };
    for (let i = 0; i < cols.length; i++) {
      const c0 = Math.floor(cols[i]), r0 = Math.floor(rows[i]);
      if (!(c0 >= 0 && r0 >= 0 && c0 < W && r0 < H)) continue;
      const tx0 = (c0 / T) | 0, tx1 = ((c0 + 1) / T) | 0;
      const ty0 = (r0 / T) | 0, ty1 = ((r0 + 1) / T) | 0;
      consider(ty0 * tilesX + tx0);
      if (tx1 !== tx0) consider(ty0 * tilesX + tx1);
      if (ty1 !== ty0) {
        consider(ty1 * tilesX + tx0);
        if (tx1 !== tx0) consider(ty1 * tilesX + tx1);
      }
    }
    for (const id of ids) seen[id] = 0;
    return ids;
  }

  /** Tile keys ("ty_tx") needed to bilinearly sample the given fractional pixels that are not resident. */
  tilesForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Set<string> {
    const tilesX = this.level.tiles_x;
    return new Set(this.neededTileIds(cols, rows).map((id) => `${(id / tilesX) | 0}_${id % tilesX}`));
  }

  private load(id: number): Promise<void> {
    let job = this.pending.get(id);
    if (job) return job;
    const tilesX = this.level.tiles_x;
    const ty = (id / tilesX) | 0, tx = id % tilesX;
    job = this.source
      .getTileBytes(this.level, ty, tx)
      .then(async (bytes) => {
        const tile = bytes ? await decodeTile(bytes, this.level.tile_size) : null;
        if (this.tiles[id] === undefined && tile) this.resident++;
        this.tiles[id] = tile;
        this.failures.delete(id);
      })
      .catch((err: unknown) => {
        this.failures.set(id, err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        this.pending.delete(id);
      });
    this.pending.set(id, job);
    return job;
  }

  async ensureIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.load(id)));
  }

  async ensureTiles(keys: Iterable<string>): Promise<void> {
    const ids: number[] = [];
    for (const key of keys) {
      const [ty, tx] = key.split('_').map(Number);
      const id = this.tileId(ty, tx);
      if (this.tiles[id] === undefined) ids.push(id);
    }
    await this.ensureIds(ids);
  }

  async ensureForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Promise<void> {
    await this.ensureIds(this.neededTileIds(cols, rows));
  }

  /** Raw DN at an integer pixel; NaN outside the grid, in a missing/failed tile, or at nodata. */
  dn(row: number, col: number): number {
    if (row < 0 || col < 0 || row >= this.level.lines || col >= this.level.samples) return NaN;
    const T = this.level.tile_size;
    const ty = (row / T) | 0, tx = (col / T) | 0;
    const id = ty * this.level.tiles_x + tx;
    const tile = this.tiles[id];
    if (tile === undefined) {
      if (this.failures.has(id)) return NaN;
      throw new Error(`tile ${ty}_${tx} of ${this.level.id} not loaded; call ensureTiles first`);
    }
    if (tile === null) return NaN;
    const v = tile[(row - ty * T) * T + (col - tx * T)];
    return v === this.level.nodata ? NaN : v;
  }

  /** DN * dn_scale_m (metres) at fractional pixels; NaN where any of the 4 neighbours is unavailable. */
  valueBilinear(cols: ArrayLike<number>, rows: ArrayLike<number>): Float64Array {
    const out = new Float64Array(cols.length);
    this.valueBilinearInto(cols, rows, out);
    return out;
  }

  /** Same as valueBilinear but writes into `out` (length >= cols.length). */
  valueBilinearInto(cols: ArrayLike<number>, rows: ArrayLike<number>, out: Float64Array): void {
    const scale = this.level.dn_scale_m, W = this.level.samples - 1, H = this.level.lines - 1;
    const T = this.level.tile_size, tilesX = this.level.tiles_x, nodata = this.level.nodata;
    const tiles = this.tiles, failures = this.failures;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i], row = rows[i];
      const c0 = Math.floor(col), r0 = Math.floor(row);
      if (!(c0 >= 0 && r0 >= 0 && c0 < W && r0 < H)) {
        out[i] = NaN;
        continue;
      }
      const fc = col - c0, fr = row - r0;
      // Fast path: all four neighbours inside one tile.
      const ty = (r0 / T) | 0, tx = (c0 / T) | 0;
      const ly = r0 - ty * T, lx = c0 - tx * T;
      if (ly < T - 1 && lx < T - 1) {
        const id = ty * tilesX + tx;
        const tile = tiles[id];
        if (tile === undefined) {
          if (failures.has(id)) { out[i] = NaN; continue; }
          throw new Error(`tile ${ty}_${tx} of ${this.level.id} not loaded; call ensureTiles first`);
        }
        if (tile === null) { out[i] = NaN; continue; }
        const o = ly * T + lx;
        const a = tile[o], b = tile[o + 1], c = tile[o + T], d = tile[o + T + 1];
        if (a === nodata || b === nodata || c === nodata || d === nodata) { out[i] = NaN; continue; }
        out[i] = ((a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr) * scale;
        continue;
      }
      const a = this.dn(r0, c0), b = this.dn(r0, c0 + 1), c = this.dn(r0 + 1, c0), d = this.dn(r0 + 1, c0 + 1);
      out[i] = ((a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr) * scale;
    }
  }

  async valueAt(latDeg: number, lonDeg: number): Promise<number> {
    const { col, row } = this.pixelFromLatLon(latDeg, lonDeg);
    const cols = new Float64Array([col]), rows = new Float64Array([row]);
    await this.ensureForPixels(cols, rows);
    return this.valueBilinear(cols, rows)[0];
  }

  /** Number of decoded tiles currently resident (each tile_size² × 2 bytes). */
  tileCount(): number {
    return this.resident;
  }

  /** Tiles whose last load attempt threw, as "ty_tx" keys (they are retried on the next ensure). */
  failedTiles(): string[] {
    const tilesX = this.level.tiles_x;
    return [...this.failures.keys()].sort((a, b) => a - b).map((id) => `${(id / tilesX) | 0}_${id % tilesX}`);
  }

  /** Release every resident tile and forget failures. */
  clear(): void {
    this.tiles = new Array<Int16Array | null | undefined>(this.level.tiles_x * this.level.tiles_y);
    this.failures.clear();
    this.resident = 0;
  }
}
