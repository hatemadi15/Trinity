import type { Vec3 } from './geometry';

export interface EphemerisHeader {
  t0_et: number;
  step_s: number;
  n: number;
  shape: number[];
  bodies: string[];
  frame: string;
}

/** Hourly Sun/Earth positions (km, MOON_ME) as a flat Float32Array laid out [step][body][xyz]. */
export interface Ephemeris {
  t0Et: number;
  stepS: number;
  n: number;
  data: Float32Array;
}

const FLOATS_PER_STEP = 6;

export function loadEphemeris(bytes: ArrayBuffer | Uint8Array, header: EphemerisHeader): Ephemeris {
  const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const expected = header.n * FLOATS_PER_STEP * 4;
  if (buf.byteLength !== expected) {
    throw new Error(`ephemeris byte length ${buf.byteLength} != expected ${expected} (n=${header.n})`);
  }
  // The file is little-endian; every platform we target is too. Guard anyway.
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('big-endian platforms are not supported');
  return { t0Et: header.t0_et, stepS: header.step_s, n: header.n, data: new Float32Array(buf) };
}

export function rowVectors(eph: Ephemeris, i: number): { sun: Vec3; earth: Vec3 } {
  if (!Number.isInteger(i) || i < 0 || i >= eph.n) throw new RangeError(`row ${i} outside 0..${eph.n - 1}`);
  const d = eph.data, o = i * FLOATS_PER_STEP;
  return { sun: [d[o], d[o + 1], d[o + 2]], earth: [d[o + 3], d[o + 4], d[o + 5]] };
}

export function indexForEt(eph: Ephemeris, et: number): number {
  return Math.round((et - eph.t0Et) / eph.stepS);
}

/** Catmull-Rom interpolation of both body vectors at TDB epoch `et` (same range rule as Python). */
export function interpVectors(eph: Ephemeris, et: number): { sun: Vec3; earth: Vec3 } {
  const x = (et - eph.t0Et) / eph.stepS;
  const n = eph.n;
  if (!(x >= 1 && x <= n - 3)) {
    throw new RangeError(`epoch outside interpolation range (x=${x.toFixed(3)}, valid 1..${n - 3})`);
  }
  let i = Math.floor(x);
  if (i > n - 3) i = n - 3;
  const t = x - i, t2 = t * t, t3 = t2 * t;
  const d = eph.data;
  const out = new Array<number>(FLOATS_PER_STEP);
  for (let k = 0; k < FLOATS_PER_STEP; k++) {
    const p0 = d[(i - 1) * FLOATS_PER_STEP + k], p1 = d[i * FLOATS_PER_STEP + k];
    const p2 = d[(i + 1) * FLOATS_PER_STEP + k], p3 = d[(i + 2) * FLOATS_PER_STEP + k];
    out[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  return { sun: [out[0], out[1], out[2]], earth: [out[3], out[4], out[5]] };
}
