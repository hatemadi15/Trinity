import { meToWorld, type Basis, type Vec3 } from './frames';

const J2000_MS = Date.parse('2000-01-01T12:00:00Z');
/** TDB minus UTC (32.184 s plus the 37 leap seconds since 2017). */
const TDB_MINUS_UTC_S = 69.184;

/** Fraction of Earth's disc that is lit as seen from the Moon: 0 with the Sun behind Earth, 1 with the Sun behind the viewer. */
export function earthLitFraction(sun: Vec3, earth: Vec3): number {
  const n = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
  const c = (sun[0] * earth[0] + sun[1] * earth[1] + sun[2] * earth[2]) / (n(sun) * n(earth));
  return (1 - c) / 2;
}

/**
 * Angle (degrees) of the Greenwich meridian from the J2000 equinox, by the IAU rotation model SPICE uses for
 * IAU_EARTH: W = 190.147° + 360.9856235° a day of TDB, plus the 90° from the equinox to the model's node,
 * which drifts with the pole's right ascension (−0.641° a century). Greenwich sidereal time differs from it by
 * up to half a degree by the 2030s.
 */
export function greenwichAngleDeg(utcMs: number): number {
  const d = (utcMs + TDB_MINUS_UTC_S * 1000 - J2000_MS) / 86400e3;
  return (((280.147 + 360.9856235 * d - 0.641 * (d / 36525)) % 360) + 360) % 360;
}

/**
 * World directions of the Earth sphere's local axes, matching three's SphereGeometry texture layout:
 * x towards longitude 0, y towards the north pole, z towards longitude 90° W. `m` is the row-major
 * J2000→MOON_ME rotation for the same time.
 */
export function earthAxes(m: number[], b: Basis, utcMs: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const th = (greenwichAngleDeg(utcMs) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const toMe = (v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  return { x: meToWorld(b, toMe([c, s, 0])), y: meToWorld(b, toMe([0, 0, 1])), z: meToWorld(b, toMe([s, -c, 0])) };
}
