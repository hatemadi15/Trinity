import type { Vec3 } from './frames';
import { cellAt, heightAt, type TerrainField } from './terrainField';

/**
 * The per-pixel shadow rule shared by the ground shader and its TypeScript twin. Samples start beyond the
 * point's own cell and grow by 5 % a step, reaching 150 km in 179 steps; a 0.3 m height tolerance keeps the
 * ground from shadowing itself without lowering the far skyline. At de Gerlache Rim 2 in January 2027 this
 * agrees with the engine on 712 of 720 hours (the misses: the Sun half hidden at sunset and sunrise).
 */
export const SHADOW = { T0_CELLS: 1.3, T0_MIN_M: 24, GROWTH: 1.05, STEPS: 192, MAX_M: 150000, TOL_M: 0.3, SUN_RADIUS_RAD: 0.00466, OUTSIDE_BELOW_M: -5e4 } as const;
/** The fast setting's steps: coarser, the same reach. */
export const SHADOW_FAST = { GROWTH: 1.115, STEPS: 96 } as const;

/**
 * Fraction of the Sun's disc in view from a point (world metres in the site's frame): the steepest rise of
 * the ground towards the Sun against the Sun's elevation, the engine's rule, with the disc's radius giving
 * the penumbra. Samples grow geometrically from just beyond the point's own cell out to 150 km.
 */
export function sunFraction(f: TerrainField, x: number, y: number, z: number, sun: Vec3): number {
  const horiz = Math.hypot(sun[0], sun[2]);
  const elSun = Math.atan2(sun[1], horiz);
  const dx = sun[0] / horiz, dz = sun[2] / horiz;
  let maxTan = -10;
  let t = Math.max(SHADOW.T0_MIN_M, SHADOW.T0_CELLS * cellAt(f, x, z));
  for (let i = 0; i < SHADOW.STEPS; i++) {
    const h = heightAt(f, x + dx * t, z + dz * t);
    if (h < SHADOW.OUTSIDE_BELOW_M) break; // beyond the measured ground
    maxTan = Math.max(maxTan, (h - y - SHADOW.TOL_M) / t);
    t *= SHADOW.GROWTH;
    if (t > SHADOW.MAX_M) break;
  }
  return Math.min(1, Math.max(0, (elSun - Math.atan(maxTan)) / (2 * SHADOW.SUN_RADIUS_RAD) + 0.5));
}

/**
 * The same rule for the ground's fragment shader, over three height textures (finest first); `uSteps` and
 * `uGrowth` come from the quality setting. `uOne` is always 1: a loop whose length depends on a uniform
 * cannot be unrolled, which keeps Windows' shader compiler from spending a minute on it. Each mesh's three slots start
 * at its own level (groundLevels.ts), so its rays read that level and coarser ones only, and a coarse mesh is never
 * shaded by fine heights it does not show.
 */
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uH0, uH1, uH2; uniform vec3 uL0, uL1, uL2; uniform vec2 uS0, uS1, uS2; uniform vec2 uCS; uniform int uLevels, uSteps, uOne; uniform float uGrowth;
vec2 toMap(vec2 xz) { float n = -xz.y; return vec2(xz.x * uCS.x + n * uCS.y, -xz.x * uCS.y + n * uCS.x); }
float lev(sampler2D t, vec3 L, vec2 S, vec2 m, out bool inside) {
  float c = L.x + m.x / L.z, r = L.y - m.y / L.z;
  inside = c > 1.0 && r > 1.0 && c < S.x - 2.0 && r < S.y - 2.0;
  return textureLod(t, vec2((c + 0.5) / S.x, (r + 0.5) / S.y), 0.0).r;
}
// The first of the mesh's slots, from the given one on, that holds the point: slot 0 is the mesh's own level, then the
// next, then the cap, so a coarse mesh never meets fine heights it does not show.
float heightAt(vec2 xz, int from) {
  vec2 m = toMap(xz); bool ins; float h;
  if (uLevels == 0) return -dot(m, m) / (2.0 * 1737400.0);
  if (from <= 0) { h = lev(uH0, uL0, uS0, m, ins); if (ins) return h; }
  if (uLevels > 1 && from <= 1) { h = lev(uH1, uL1, uS1, m, ins); if (ins) return h; }
  if (uLevels > 2) { h = lev(uH2, uL2, uS2, m, ins); if (ins) return h; }
  return -1.0e6;
}
float cellAt(vec2 xz, int from) {
  vec2 m = toMap(xz); bool ins;
  if (uLevels == 0) return 20.0;
  if (from <= 0) { lev(uH0, uL0, uS0, m, ins); if (ins) return uL0.z; }
  if (uLevels > 1 && from <= 1) { lev(uH1, uL1, uS1, m, ins); if (ins) return uL1.z; }
  return uLevels > 2 ? uL2.z : (uLevels > 1 ? uL1.z : uL0.z);
}
// The ground's normal in the world from one slot's heights (map metres m), its slope taken across k cells either way.
vec3 slopeNormal(sampler2D t, vec3 L, vec2 S, vec2 m, float k) {
  bool ins; float c = L.z * k;
  float gx = (lev(t, L, S, m + vec2(c, 0.0), ins) - lev(t, L, S, m - vec2(c, 0.0), ins)) / (2.0 * c);
  float gy = (lev(t, L, S, m + vec2(0.0, c), ins) - lev(t, L, S, m - vec2(0.0, c), ins)) / (2.0 * c);
  // The map's slope turned into the world as worldOf turns map metres: x = mx cos - my sin, z = -(mx sin + my cos).
  vec2 g = vec2(gx * uCS.x - gy * uCS.y, -(gx * uCS.y + gy * uCS.x));
  return normalize(vec3(-g.x, 1.0, -g.y));
}
// The angles (radians) by which the Sun's centre clears the steepest rise of the ground towards it: over the mesh's
// own slots (x) and, with both, over the next level's on (y), from the next level's own ground under the point, as its
// mesh would see it. A level's edge fades its shadows into the next level's (groundLevels.ts edgeOf). One march for
// both, so the loop is written once: wherever slot 0 holds a point, the coarser slots do too.
vec2 sunMargins(vec3 p, vec3 sun, bool both) {
  float horiz = length(sun.xz); float elSun = atan(sun.y, horiz); vec2 dir = sun.xz / horiz;
  float maxA = -10.0, maxB = -10.0; float t = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz, 0));
  float yB = p.y, tB = 1.0e9;
  if (both) { yB = heightAt(p.xz, 1) + (p.y - heightAt(p.xz, 0)); tB = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz, 1)); }
  for (int i = 0; i < ${SHADOW.STEPS} * uOne; i++) {
    if (i >= uSteps) break;
    vec2 q = p.xz + dir * t;
    float h = heightAt(q, 0); if (h < ${SHADOW.OUTSIDE_BELOW_M.toFixed(1)}) break;
    maxA = max(maxA, (h - p.y - ${SHADOW.TOL_M}) / t);
    if (t >= tB) maxB = max(maxB, (heightAt(q, 1) - yB - ${SHADOW.TOL_M}) / t);
    t *= uGrowth; if (t > ${SHADOW.MAX_M.toFixed(1)}) break;
  }
  return vec2(elSun - atan(maxA), elSun - atan(maxB));
}
`;

/** How much wider than tall the drawn bumps (craters and stones) are taken to be, for hiddenShadowShare. */
const BUMP_WIDTH = 3;

/**
 * The share (0 to 1) of a drawn bump's shadow that the bump itself hides from the eye. The drawn craters and
 * stones are shading on the ground, not shapes, so nothing would hide their shadows; a real bump does. With
 * the Sun behind you, a sight line flatter than the Sun's rays (a far point) sees none of the shadow beyond
 * each bump, and a steeper one (a near point) misses tan(Sun's height) / tan(sight line's dip) of it. Looking
 * past a bump's side, the eye sees round it: the share falls as the plan angle's sine grows against the
 * bump's width. All three are taken over the ground's own surface: `tanSun`, the Sun's height above it;
 * `tanDip`, the sight line's; `cosPlan`, the cosine of the angle, along the ground, between the ways to the
 * eye and to the Sun. This is why photographs taken with the Sun behind the camera show bright, nearly
 * shadowless ground.
 */
export function hiddenShadowShare(tanSun: number, tanDip: number, cosPlan: number): number {
  if (cosPlan <= 0 || tanSun <= 0) return 0;
  const sinPlan = Math.sqrt(Math.max(0, 1 - cosPlan * cosPlan));
  return Math.min(1, tanSun / Math.max(tanDip, 1e-4), (BUMP_WIDTH * tanSun) / Math.max(sinPlan, 1e-4));
}

/** hiddenShadowShare for the ground shader. */
export const HIDE_GLSL = /* glsl */ `
float hiddenShadowShare(float tanSun, float tanDip, float cosPlan) {
  if (cosPlan <= 0.0 || tanSun <= 0.0) return 0.0;
  float sinPlan = sqrt(max(0.0, 1.0 - cosPlan * cosPlan));
  return min(1.0, min(tanSun / max(tanDip, 1.0e-4), ${BUMP_WIDTH.toFixed(1)} * tanSun / max(sinPlan, 1.0e-4)));
}
`;
