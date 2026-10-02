import { meToWorld, type Basis, type Vec3 } from './frames';

/** The Yale Bright Star Catalogue, brightest first: J2000 unit vectors, visual magnitude and B−V colour. */
export interface Stars { count: number; j2000: Float32Array; vmag: Float32Array; bv: Float32Array }

export function parseStars(bytes: ArrayBuffer, count: number): Stars {
  const all = new Float32Array(bytes);
  const j2000 = new Float32Array(count * 3), vmag = new Float32Array(count), bv = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    j2000.set(all.subarray(i * 5, i * 5 + 3), i * 3);
    vmag[i] = all[i * 5 + 3];
    bv[i] = all[i * 5 + 4];
  }
  return { count, j2000, vmag, bv };
}

/** Writes each star's world position (`radius` from the eye) for a J2000→MOON_ME matrix (row-major) and a site basis. */
export function placeStars(s: Stars, m: number[], b: Basis, radius: number, out: Float32Array): void {
  for (let i = 0; i < s.count; i++) {
    const x = s.j2000[i * 3], y = s.j2000[i * 3 + 1], z = s.j2000[i * 3 + 2];
    const me: Vec3 = [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
    const w = meToWorld(b, me);
    out[i * 3] = w[0] * radius;
    out[i * 3 + 1] = w[1] * radius;
    out[i * 3 + 2] = w[2] * radius;
  }
}

/** Colour stops by B−V: hot blue-white stars to cool orange ones. */
const STOPS: [number, Vec3][] = [
  [-0.4, [0.62, 0.71, 1]],
  [0, [0.8, 0.85, 1]],
  [0.4, [0.98, 0.97, 1]],
  [0.8, [1, 0.9, 0.76]],
  [1.2, [1, 0.8, 0.6]],
  [2, [1, 0.68, 0.45]],
];

export function starColour(bv: number): Vec3 {
  if (bv <= STOPS[0][0]) return STOPS[0][1];
  for (let k = 1; k < STOPS.length; k++) {
    if (bv <= STOPS[k][0]) {
      const [a, ca] = STOPS[k - 1], [c, cb] = STOPS[k], f = (bv - a) / (c - a);
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Point size in pixels (before the pixel ratio) by magnitude. */
export const starSize = (vmag: number): number => Math.max(1.8, 5.6 - vmag * 0.7);
/**
 * Brightness by magnitude: the square root of the star's light, as the eye sees it (five magnitudes are
 * a hundred times the light, ten times as bright), so stars to magnitude 6.5 still show; capped so the
 * brightest do not bloom like the Sun.
 */
export const starGain = (vmag: number): number => Math.min(1.6, Math.pow(10, -0.2 * (vmag - 1)));
