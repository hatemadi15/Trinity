import type { Vec3 } from './frames';
import { SHADOW } from './shadowRule';

/**
 * The lander's shape, in its own frame (metres; the origin on the ground under its centre, y up, +x the face
 * that looks towards the azimuth it is turned to). The drawn lander is built from these numbers and the
 * ground shader casts its shadow from them, so the shadow always matches what is drawn. It is drawn for
 * scale, not measured: a small solar lander of the kind that flies to the Moon's south pole. Every part whose
 * shadow would be over about 10 cm across is in the shadow's shape (landerSdf, LANDER_GLSL); the legs, pads, tanks
 * and thruster pods, alike on the four sides, are worked out once, in one eighth of the lander (fold), so the
 * shader does no more work for them than for one leg.
 */
export const LANDER = {
  /** An eight-sided body, its flat faces towards ±x, ±z and the diagonals; `r` reaches its corners. */
  body: { r: 0.9, y0: 0.85, y1: 1.95 },
  /** The deck on top, a little wider than the body. */
  deck: { r: 0.97, y0: 1.95, y1: 2.01 },
  /** The main engine's bell under the body. */
  bell: { r: 0.24, y0: 0.55, y1: 0.85 },
  /**
   * Four inverted-tripod legs on the diagonals. Each a main strut (radius r, a shock absorber: a sleeve over its upper
   * part, a piston below) from high on the body's diagonal face (`top`: distance out, height) to the ball joint over
   * its foot (`foot`); two side struts (radius sideR) from its knee, `knee` of the way up from the foot, to the body's
   * lower corners either side of the diagonal (`corner`: distance out, height, 22.5° either side); and a dish-shaped
   * pad under the foot, padR across and padH high.
   */
  legs: { top: [0.8, 1.15], foot: [1.85, 0.1], r: 0.045, knee: 0.22, corner: [0.86, 0.88], sideR: 0.024, padR: 0.25, padH: 0.07 },
  /** Four propellant tanks, balls of radius r hung under the body between the legs: `out` from the middle towards ±x and ±z, at height y. */
  tanks: { out: 0.5, y: 0.65, r: 0.19 },
  /**
   * Four reaction-thruster pods, one at the top of each diagonal face, over its leg: their middles `out` from the
   * lander's middle at height y, each a block (size: out, up, across) with three nozzles, down and to either side.
   */
  pods: { out: 0.881, y: 1.9, size: [0.1, 0.1, 0.14] },
  /** The solar panel, upright on a mast from the deck, turned 20° about the vertical towards +x. */
  panel: { c: [0, 2.78, 0] as Vec3, size: [1.9, 1.25, 0.04] as Vec3, yawDeg: 20, mastR: 0.035 },
  /** Payloads on the deck, of several sizes. */
  boxes: [
    { c: [-0.42, 2.18, 0.42] as Vec3, size: [0.45, 0.34, 0.4] as Vec3 },
    { c: [0.48, 2.13, 0.45] as Vec3, size: [0.35, 0.24, 0.35] as Vec3 },
    { c: [0.12, 2.09, 0.66] as Vec3, size: [0.24, 0.16, 0.2] as Vec3 },
    { c: [-0.05, 2.08, -0.66] as Vec3, size: [0.32, 0.14, 0.22] as Vec3 },
  ],
  /** The antenna: a mast with a dish on top (its shadow is cast as a ball). */
  antenna: { x: 0.6, z: -0.6, y1: 3.0, r: 0.03, dishR: 0.34 },
  /** A camera on a short mast. */
  camera: { x: -0.6, z: -0.5, y1: 2.6, r: 0.04 },
  /**
   * Drawn only, each under 10 cm across: a star tracker, a block `size` across with a baffle (radius baffleR, baffleL
   * long) looking up and out; and an omni antenna, a thin mast from the deck up to y1 with a cone tipR across on top.
   */
  tracker: { c: [0.7, 2.055, 0.05] as Vec3, size: 0.09, baffleR: 0.035, baffleL: 0.12 },
  omni: { x: -0.74, z: 0.12, y1: 2.42, r: 0.01, tipR: 0.032 },
  /** A ball round all of it, for the quick test of whether a ray comes near. */
  bound: { c: [0, 1.7, 0] as Vec3, r: 2.8 },
} as const;

const S2 = Math.SQRT1_2;
/** A point `share` of the way from a to b. */
const lerp3 = (a: Vec3, b: Vec3, share: number): Vec3 => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share];

/**
 * The legs' ends, on the four diagonals of the lander's frame: the main strut's top and foot, its knee, and the two
 * lower corners of the body its side struts go to (22.5° either side of its diagonal).
 */
export const LEG_ENDS: { top: Vec3; foot: Vec3; knee: Vec3; corners: [Vec3, Vec3] }[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
].map(([sx, sz]) => {
  const [tr, ty] = LANDER.legs.top, [fr, fy] = LANDER.legs.foot, [cr, cy] = LANDER.legs.corner;
  const top: Vec3 = [tr * S2 * sx, ty, tr * S2 * sz], foot: Vec3 = [fr * S2 * sx, fy, fr * S2 * sz];
  // The corners either side of the diagonal, at 45° ± 22.5° from the axes, in this leg's quarter.
  const a = Math.cos(Math.PI / 8) * cr, b = Math.sin(Math.PI / 8) * cr;
  return { top, foot, knee: lerp3(foot, top, LANDER.legs.knee), corners: [[a * sx, cy, b * sz], [b * sx, cy, a * sz]] };
});

/** The tanks' middles, towards +x, +z, -x and -z. */
export const TANKS: Vec3[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
].map(([sx, sz]) => [LANDER.tanks.out * sx, LANDER.tanks.y, LANDER.tanks.out * sz]);

/** The thruster pods' middles, on the diagonals at 45°, 135°, 225° and 315° from +x towards +z, over the legs. */
export const PODS: Vec3[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
].map(([sx, sz]) => [LANDER.pods.out * S2 * sx, LANDER.pods.y, LANDER.pods.out * S2 * sz]);

const len3 = (x: number, y: number, z: number) => Math.hypot(x, y, z);
/** A box's signed distance, the box centred on the origin with half-sizes h. */
function box(x: number, y: number, z: number, hx: number, hy: number, hz: number): number {
  const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
/** An upright eight-sided prism: two squares, one turned 45°, cut each other into an octagon. */
function octagon(p: Vec3, r: number, y0: number, y1: number): number {
  const a = r * Math.cos(Math.PI / 8), hy = (y1 - y0) / 2, y = p[1] - (y0 + y1) / 2;
  const u = (p[0] + p[2]) / Math.SQRT2, w = (p[2] - p[0]) / Math.SQRT2;
  return Math.max(box(p[0], y, p[2], a, hy, a), box(u, y, w, a, hy, a));
}
function capsule(p: Vec3, a: Vec3, b: Vec3, r: number): number {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)));
  return len3(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
}
/** An upright cylinder over (cx, cz), from y0 to y1. */
function cylinder(p: Vec3, cx: number, cz: number, y0: number, y1: number, r: number): number {
  const dx = Math.hypot(p[0] - cx, p[2] - cz) - r, dy = Math.abs(p[1] - (y0 + y1) / 2) - (y1 - y0) / 2;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/**
 * A point folded into the eighth of the lander between +x and the +x+z diagonal (x ≥ z ≥ 0): the lander's legs, pads,
 * tanks and pods are alike in all eight, each lying in one of them or across the line between two, so the distance to
 * the one in that eighth is the distance to the nearest of them all.
 */
const fold = (p: Vec3): Vec3 => [Math.max(Math.abs(p[0]), Math.abs(p[2])), p[1], Math.min(Math.abs(p[0]), Math.abs(p[2]))];
/** The leg on the +x+z diagonal and the tank towards +x: the ones in that eighth. */
const LEG = LEG_ENDS[0], TANK = TANKS[0];

/** The distance from a point to the lander's surface (metres, in its frame), negative inside it. */
export function landerSdf(p: Vec3): number {
  const L = LANDER;
  let d = octagon(p, L.body.r, L.body.y0, L.body.y1);
  d = Math.min(d, octagon(p, L.deck.r, L.deck.y0, L.deck.y1));
  d = Math.min(d, cylinder(p, 0, 0, L.bell.y0, L.bell.y1, L.bell.r));
  // The legs, pads, tanks and pods, in the folded eighth: the main strut, the side strut on this side of the diagonal
  // (the other is its mirror image), the pad, the tank towards +x, and the pod on the diagonal, in the diagonal's own
  // frame (out along it, up, across it).
  const q = fold(p);
  d = Math.min(d, capsule(q, LEG.top, LEG.foot, L.legs.r));
  d = Math.min(d, capsule(q, LEG.knee, LEG.corners[0], L.legs.sideR));
  d = Math.min(d, cylinder(q, LEG.foot[0], LEG.foot[2], 0, L.legs.padH, L.legs.padR));
  d = Math.min(d, len3(q[0] - TANK[0], q[1] - TANK[1], q[2] - TANK[2]) - L.tanks.r);
  d = Math.min(d, box((q[0] + q[2]) * S2 - L.pods.out, q[1] - L.pods.y, (q[2] - q[0]) * S2, L.pods.size[0] / 2, L.pods.size[1] / 2, L.pods.size[2] / 2));
  // The panel, turned about the vertical: into its own frame, then a thin box.
  const yaw = (L.panel.yawDeg * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const qx = p[0] - L.panel.c[0], qy = p[1] - L.panel.c[1], qz = p[2] - L.panel.c[2];
  d = Math.min(d, box(qx * c - qz * s, qy, qx * s + qz * c, L.panel.size[0] / 2, L.panel.size[1] / 2, L.panel.size[2] / 2));
  d = Math.min(d, capsule(p, [0, L.deck.y1, 0], [0, L.panel.c[1], 0], L.panel.mastR));
  for (const b of L.boxes) d = Math.min(d, box(p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2], b.size[0] / 2, b.size[1] / 2, b.size[2] / 2));
  d = Math.min(d, capsule(p, [L.antenna.x, L.deck.y1, L.antenna.z], [L.antenna.x, L.antenna.y1, L.antenna.z], L.antenna.r));
  d = Math.min(d, len3(p[0] - L.antenna.x, p[1] - L.antenna.y1, p[2] - L.antenna.z) - L.antenna.dishR * 0.65);
  d = Math.min(d, capsule(p, [L.camera.x, L.deck.y1, L.camera.z], [L.camera.x, L.camera.y1, L.camera.z], L.camera.r));
  return d;
}

/**
 * The angle (radians) by which the ray from a point towards the Sun (L, a unit vector) clears the lander,
 * both in the lander's frame: the least of the distance to the lander over the distance along the ray,
 * negative when the ray passes through it. Rays that miss the ball round it clear it by 1.
 */
export function landerClearance(p: Vec3, L: Vec3): number {
  const [cx, cy, cz] = LANDER.bound.c;
  const ox = p[0] - cx, oy = p[1] - cy, oz = p[2] - cz;
  const dist = len3(ox, oy, oz);
  // A ball a little larger farther off, so rays that pass just outside it still get their soft edge.
  const R = LANDER.bound.r + 0.01 * dist;
  const b = ox * L[0] + oy * L[1] + oz * L[2], disc = b * b - (dist * dist - R * R);
  if (disc < 0) return 1;
  const t1 = -b + Math.sqrt(disc);
  if (t1 <= 0) return 1;
  let t = Math.max(-b - Math.sqrt(disc), 0.02), res = 1;
  for (let i = 0; i < 72 && t < t1; i++) {
    const h = landerSdf([p[0] + L[0] * t, p[1] + L[1] * t, p[2] + L[2] * t]);
    res = Math.min(res, h / t);
    if (res < -SHADOW.SUN_RADIUS_RAD) break;
    t += Math.max(Math.abs(h), 0.01);
  }
  return res;
}

/** How much of the Sun's disc a point sees past the lander (0 to 1): the disc's radius gives the soft edge. */
export const landerSunVisible = (p: Vec3, L: Vec3): number => Math.min(1, Math.max(0, 0.5 + landerClearance(p, L) / (2 * SHADOW.SUN_RADIUS_RAD)));

const f = (n: number) => n.toFixed(3);
const v3 = (a: readonly number[]) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;
const yawRad = (LANDER.panel.yawDeg * Math.PI) / 180;

/** The same shape and the same clearance for the ground's fragment shader, written out from the numbers above. */
export const LANDER_GLSL = /* glsl */ `
float ldBox(vec3 p, vec3 h) { vec3 q = abs(p) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float ldOct(vec3 p, float r, float y0, float y1) {
  vec3 h = vec3(r * 0.92388, 0.5 * (y1 - y0), r * 0.92388); p.y -= 0.5 * (y0 + y1);
  return max(ldBox(p, h), ldBox(vec3((p.x + p.z) * 0.70711, p.y, (p.z - p.x) * 0.70711), h));
}
float ldCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float ldCyl(vec3 p, vec2 c, float y0, float y1, float r) {
  vec2 d = vec2(length(p.xz - c) - r, abs(p.y - 0.5 * (y0 + y1)) - 0.5 * (y1 - y0));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float landerSdf(vec3 p) {
  float d = ldOct(p, ${f(LANDER.body.r)}, ${f(LANDER.body.y0)}, ${f(LANDER.body.y1)});
  d = min(d, ldOct(p, ${f(LANDER.deck.r)}, ${f(LANDER.deck.y0)}, ${f(LANDER.deck.y1)}));
  d = min(d, ldCyl(p, vec2(0.0), ${f(LANDER.bell.y0)}, ${f(LANDER.bell.y1)}, ${f(LANDER.bell.r)}));
  // The legs, pads, tanks and pods, alike on all sides: worked out once, in the eighth between +x and the diagonal.
  vec3 q = vec3(max(abs(p.x), abs(p.z)), p.y, min(abs(p.x), abs(p.z)));
  d = min(d, ldCap(q, ${v3(LEG.top)}, ${v3(LEG.foot)}, ${f(LANDER.legs.r)}));
  d = min(d, ldCap(q, ${v3(LEG.knee)}, ${v3(LEG.corners[0])}, ${f(LANDER.legs.sideR)}));
  d = min(d, ldCyl(q, vec2(${f(LEG.foot[0])}, ${f(LEG.foot[2])}), 0.0, ${f(LANDER.legs.padH)}, ${f(LANDER.legs.padR)}));
  d = min(d, length(q - ${v3(TANK)}) - ${f(LANDER.tanks.r)});
  d = min(d, ldBox(vec3((q.x + q.z) * 0.70711 - ${f(LANDER.pods.out)}, q.y - ${f(LANDER.pods.y)}, (q.z - q.x) * 0.70711), ${v3(LANDER.pods.size.map((s) => s / 2))}));
  q = p - ${v3(LANDER.panel.c)};
  d = min(d, ldBox(vec3(q.x * ${f(Math.cos(yawRad))} - q.z * ${f(Math.sin(yawRad))}, q.y, q.x * ${f(Math.sin(yawRad))} + q.z * ${f(Math.cos(yawRad))}), ${v3(LANDER.panel.size)} * 0.5));
  d = min(d, ldCap(p, vec3(0.0, ${f(LANDER.deck.y1)}, 0.0), vec3(0.0, ${f(LANDER.panel.c[1])}, 0.0), ${f(LANDER.panel.mastR)}));
${LANDER.boxes.map((b) => `  d = min(d, ldBox(p - ${v3(b.c)}, ${v3(b.size)} * 0.5));`).join('\n')}
  d = min(d, ldCap(p, vec3(${f(LANDER.antenna.x)}, ${f(LANDER.deck.y1)}, ${f(LANDER.antenna.z)}), vec3(${f(LANDER.antenna.x)}, ${f(LANDER.antenna.y1)}, ${f(LANDER.antenna.z)}), ${f(LANDER.antenna.r)}));
  d = min(d, length(p - vec3(${f(LANDER.antenna.x)}, ${f(LANDER.antenna.y1)}, ${f(LANDER.antenna.z)})) - ${f(LANDER.antenna.dishR * 0.65)});
  d = min(d, ldCap(p, vec3(${f(LANDER.camera.x)}, ${f(LANDER.deck.y1)}, ${f(LANDER.camera.z)}), vec3(${f(LANDER.camera.x)}, ${f(LANDER.camera.y1)}, ${f(LANDER.camera.z)}), ${f(LANDER.camera.r)}));
  return d;
}
float landerClearance(vec3 p, vec3 L) {
  vec3 o = p - ${v3(LANDER.bound.c)}; float dist = length(o);
  float R = ${f(LANDER.bound.r)} + 0.01 * dist;
  float b = dot(o, L), disc = b * b - (dist * dist - R * R);
  if (disc < 0.0) return 1.0;
  float t1 = -b + sqrt(disc);
  if (t1 <= 0.0) return 1.0;
  float t = max(-b - sqrt(disc), 0.02), res = 1.0;
  for (int i = 0; i < 72 * uOne; i++) {
    if (t >= t1) break;
    float h = landerSdf(p + L * t);
    res = min(res, h / t);
    if (res < -${SHADOW.SUN_RADIUS_RAD}) break;
    t += max(abs(h), 0.01);
  }
  return res;
}
`;
