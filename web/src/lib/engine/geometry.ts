import { R_MOON_M } from './constants';

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Wrap longitude into (-180, 180]. */
export function normalizeLon(lonDeg: number): number {
  const l = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return l === -180 ? 180 : l;
}

/** Wrap an angle into [0, 360). `x % 360` can return exactly 360 for tiny negatives; fmod-style avoids it. */
export function wrapAz(deg: number): number {
  const w = (deg % 360) + 360;
  return w % 360;
}

export function siteVectorKm(latDeg: number, lonDeg: number, heightM = 0): Vec3 {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const r = (R_MOON_M + heightM) / 1000;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

export function enuBasis(latDeg: number, lonDeg: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/**
 * Topocentric azimuth (deg clockwise from north, [0, 360)) and elevation (deg) of a body given
 * by its MOON_ME position vector (km, Moon-centred). The site offset is subtracted (parallax).
 */
export function azElFromBodyVector(body: ArrayLike<number>, latDeg: number, lonDeg: number, heightM = 0): { az: number; el: number } {
  const p = siteVectorKm(latDeg, lonDeg, heightM);
  const dx = body[0] - p[0], dy = body[1] - p[1], dz = body[2] - p[2];
  const { east, north, up } = enuBasis(latDeg, lonDeg);
  const de = dx * east[0] + dy * east[1] + dz * east[2];
  const dn = dx * north[0] + dy * north[1] + dz * north[2];
  const du = dx * up[0] + dy * up[1] + dz * up[2];
  return { az: wrapAz(Math.atan2(de, dn) * RAD), el: Math.atan2(du, Math.hypot(de, dn)) * RAD };
}

/** South polar stereographic (sphere, true scale at the pole): x = ρ sin λ, y = ρ cos λ. */
export function psSouthXY(latDeg: number, lonDeg: number): { x: number; y: number } {
  const rho = 2 * R_MOON_M * Math.tan(((90 - Math.abs(latDeg)) / 2) * DEG);
  const lon = lonDeg * DEG;
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) };
}

export function psSouthLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  return { lat: -90 + 2 * Math.atan(rho / (2 * R_MOON_M)) * RAD, lon: Math.atan2(x, y) * RAD };
}
