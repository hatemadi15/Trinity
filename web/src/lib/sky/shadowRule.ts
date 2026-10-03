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
 * `uGrowth` come from the quality setting. `uMinLevel` is the level of the mesh being drawn: its rays read
 * that level and coarser ones only, so a coarse mesh is never shaded by fine heights it does not show.
 */
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uH0, uH1, uH2; uniform vec3 uL0, uL1, uL2; uniform vec2 uS0, uS1, uS2; uniform vec2 uCS; uniform int uLevels, uSteps, uMinLevel; uniform float uGrowth;
vec2 toMap(vec2 xz) { float n = -xz.y; return vec2(xz.x * uCS.x + n * uCS.y, -xz.x * uCS.y + n * uCS.x); }
float lev(sampler2D t, vec3 L, vec2 S, vec2 m, out bool inside) {
  float c = L.x + m.x / L.z, r = L.y - m.y / L.z;
  inside = c > 1.0 && r > 1.0 && c < S.x - 2.0 && r < S.y - 2.0;
  return textureLod(t, vec2((c + 0.5) / S.x, (r + 0.5) / S.y), 0.0).r;
}
float heightAt(vec2 xz) {
  vec2 m = toMap(xz); bool ins; float h;
  if (uLevels == 0) return -dot(m, m) / (2.0 * 1737400.0);
  if (uMinLevel <= 0) { h = lev(uH0, uL0, uS0, m, ins); if (ins) return h; }
  if (uLevels > 1 && uMinLevel <= 1) { h = lev(uH1, uL1, uS1, m, ins); if (ins) return h; }
  if (uLevels > 2) { h = lev(uH2, uL2, uS2, m, ins); if (ins) return h; }
  return -1.0e6;
}
float cellAt(vec2 xz) {
  vec2 m = toMap(xz); bool ins;
  if (uLevels == 0) return 20.0;
  if (uMinLevel <= 0) { lev(uH0, uL0, uS0, m, ins); if (ins) return uL0.z; }
  if (uLevels > 1 && uMinLevel <= 1) { lev(uH1, uL1, uS1, m, ins); if (ins) return uL1.z; }
  return uLevels > 2 ? uL2.z : (uLevels > 1 ? uL1.z : uL0.z);
}
// The angle (radians) by which the Sun's centre clears the steepest rise of the ground towards it.
float sunMargin(vec3 p, vec3 sun) {
  float horiz = length(sun.xz); float elSun = atan(sun.y, horiz); vec2 dir = sun.xz / horiz;
  float maxTan = -10.0; float t = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz));
  for (int i = 0; i < ${SHADOW.STEPS}; i++) {
    if (i >= uSteps) break;
    float h = heightAt(p.xz + dir * t); if (h < ${SHADOW.OUTSIDE_BELOW_M.toFixed(1)}) break;
    maxTan = max(maxTan, (h - p.y - ${SHADOW.TOL_M}) / t);
    t *= uGrowth; if (t > ${SHADOW.MAX_M.toFixed(1)}) break;
  }
  return elSun - atan(maxTan);
}
float sunFraction(vec3 p, vec3 sun) { return clamp(sunMargin(p, sun) / (2.0 * ${SHADOW.SUN_RADIUS_RAD}) + 0.5, 0.0, 1.0); }
`;
