export type Vec3 = [number, number, number];
export interface Basis { east: Vec3; north: Vec3; up: Vec3 }

const DEG = Math.PI / 180;

/** The site's east, north and up in the Moon-fixed frame (MOON_ME). */
export function enuBasis(latDeg: number, lonDeg: number): Basis {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { east, north, up };
}

/** World direction (x east, y up, z south) of an azimuth (degrees clockwise from north) and an elevation. */
export function dirAzEl(azDeg: number, elDeg: number): Vec3 {
  const a = azDeg * DEG, e = elDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** A Moon-fixed vector in the world frame of the site. */
export function meToWorld(b: Basis, v: Vec3): Vec3 {
  const dot = (u: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return [dot(b.east), dot(b.up), -dot(b.north)];
}

/** Azimuth (0 to 360, clockwise from north) and elevation of a world direction, in degrees. */
export function azElOf(w: Vec3): { az: number; el: number } {
  const len = Math.hypot(w[0], w[1], w[2]);
  return { az: (((Math.atan2(w[0], -w[2]) / DEG) % 360) + 360) % 360, el: Math.asin(w[1] / len) / DEG };
}
