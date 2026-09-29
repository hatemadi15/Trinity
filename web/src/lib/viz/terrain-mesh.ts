import type { Heightmap } from '../data/terrain';

export interface TerrainGeometryOptions {
  /** Quads per side; the mesh has (segments + 1)^2 vertices. */
  segments?: number;
  /** Vertical exaggeration applied to heights (1 = true scale). */
  exaggeration?: number;
  /** Height (m) that maps to y = 0; defaults to the sidecar's site_height_m. */
  relativeTo?: number;
  /** Raster pixel placed at the origin (x = z = 0); defaults to the raster centre ((width - 1) / 2, (height - 1) / 2). */
  centerOn?: { col: number; row: number };
}

export interface TerrainGeometry {
  /** (segments + 1)^2 vertices, xyz in km: +x east, +y up, -z north; row-major from the north row. */
  positions: Float32Array;
  /** Unit normals from central differences of the resampled height grid. */
  normals: Float32Array;
  /** segments^2 quads x 2 triangles, counter-clockwise seen from +y. */
  indices: Uint32Array;
  /** u = 0..1 west to east, v = 1 at the north row (flipY textures put image row 0 at v = 1). */
  uv: Float32Array;
  /** Extent of the mesh in km (pixel-centre to pixel-centre along the longer side). */
  sizeKm: number;
}

/** Bilinear height (m) at a fractional raster pixel, clamped to the raster edges. */
export function heightAtPixel(hm: Heightmap, col: number, row: number): number {
  const { width, height } = hm.meta;
  const h = hm.heightsM;
  const c = Math.min(Math.max(col, 0), width - 1), r = Math.min(Math.max(row, 0), height - 1);
  const c0 = Math.floor(c), r0 = Math.floor(r);
  const c1 = Math.min(c0 + 1, width - 1), r1 = Math.min(r0 + 1, height - 1);
  const fc = c - c0, fr = r - r0;
  const top = h[r0 * width + c0] * (1 - fc) + h[r0 * width + c1] * fc;
  const bottom = h[r1 * width + c0] * (1 - fc) + h[r1 * width + c1] * fc;
  return top * (1 - fr) + bottom * fr;
}

/**
 * Resample a heightmap to a (segments + 1)^2 vertex grid spanning the raster's pixel centres.
 * Scene units are km: x = east, z = -north (row 0 is the most negative z), y = (height - relativeTo) * exaggeration.
 */
export function buildTerrainGeometry(hm: Heightmap, opts: TerrainGeometryOptions = {}): TerrainGeometry {
  const { width, height, cell_m } = hm.meta;
  const segments = Math.max(1, Math.floor(opts.segments ?? 256));
  const exaggeration = opts.exaggeration ?? 1;
  const relativeTo = opts.relativeTo ?? hm.meta.site_height_m;
  const centreCol = opts.centerOn?.col ?? (width - 1) / 2;
  const centreRow = opts.centerOn?.row ?? (height - 1) / 2;

  const side = segments + 1;
  const n = side * side;
  const kmPerPx = cell_m / 1000;
  const colStep = (width - 1) / segments, rowStep = (height - 1) / segments; // raster pixels per segment
  const dx = colStep * kmPerPx, dz = rowStep * kmPerPx; // km per segment
  const yScale = exaggeration / 1000;

  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const y = new Float64Array(n); // heights in scene km, kept in double for the differences

  for (let j = 0; j < side; j++) {
    const row = j * rowStep;
    const z = (row - centreRow) * kmPerPx;
    const v = 1 - j / segments;
    for (let i = 0; i < side; i++) {
      const col = i * colStep;
      const k = j * side + i;
      const yk = (heightAtPixel(hm, col, row) - relativeTo) * yScale;
      y[k] = yk;
      positions[k * 3] = (col - centreCol) * kmPerPx;
      positions[k * 3 + 1] = yk;
      positions[k * 3 + 2] = z;
      uv[k * 2] = i / segments;
      uv[k * 2 + 1] = v;
    }
  }

  // Normal of a heightfield y(x, z) is (-dy/dx, 1, -dy/dz); central differences inside, one-sided at the edges.
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const k = j * side + i;
      const iL = i > 0 ? i - 1 : i, iR = i < segments ? i + 1 : i;
      const jU = j > 0 ? j - 1 : j, jD = j < segments ? j + 1 : j;
      const dydx = (y[j * side + iR] - y[j * side + iL]) / ((iR - iL) * dx);
      const dydz = (y[jD * side + i] - y[jU * side + i]) / ((jD - jU) * dz);
      const inv = 1 / Math.hypot(dydx, 1, dydz);
      normals[k * 3] = -dydx * inv;
      normals[k * 3 + 1] = inv;
      normals[k * 3 + 2] = -dydz * inv;
    }
  }

  // Quad (i, j): a = north-west, b = north-east, c = south-west, d = south-east; (a, c, b) and (b, c, d) face +y.
  const indices = new Uint32Array(segments * segments * 6);
  let p = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
      indices[p++] = a; indices[p++] = c; indices[p++] = b;
      indices[p++] = b; indices[p++] = c; indices[p++] = d;
    }
  }

  return { positions, normals, indices, uv, sizeKm: Math.max(width - 1, height - 1) * kmPerPx };
}
