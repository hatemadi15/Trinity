import { BOULDER_GLSL } from './boulders';
import { LANDER_GLSL } from './landerShape';
import { HIDE_GLSL, hiddenShadowShare, SHADOW, SHADOW_GLSL } from './shadowRule';

/*
 * The stand view's shaders, from the approved mockup: the ground (regolith light, the engine's shadows,
 * metre-scale craters and rocks drawn near the eye, with their own long shadows, and the lander's shadow),
 * Earth (NASA's Blue Marble, lit by the true Sun) and the stars.
 */

/**
 * The drawn craters' look by age, each pair from worn (age 0) to fresh (age 1), in the crater's radii: how deep its
 * bowl is from the rim's crest (DEPTH: a twentieth to a fifth of its width, as on the Moon), how high its rim stands
 * over the plain round it (RIM), over how much of the radius either side of the crest bowl and rim are rounded into
 * each other (CREST), and how far the rim wanders in and out round the crater, all told (WANDER). A crater's age is a
 * random number to the power AGE_POWER, so most craters are worn and only a few fresh: about one in nine is older
 * than 0.7. Its ejecta reaches OUT radii from its middle, and there the crater has fallen to nothing.
 */
export const CRATER = { DEPTH: [0.1, 0.42], RIM: [0.015, 0.075], CREST: [0.45, 0.12], WANDER: [0.3, 0.12], AGE_POWER: 3, OUT: 1.8 } as const;

/** A number for the shaders, to three places. */
const f3 = (x: number) => x.toFixed(3);

/**
 * A crater's relief, in its radii, at r radii from its middle (the ground shader's craterShape): a bowl `depth` deep
 * from the rim's crest, a rim `rim` high over the plain, the two rounded into each other over `crest` radii either side
 * of the crest, and outside it the ejecta thinning to nothing, with no slope left, at CRATER.OUT radii. Its height and
 * its slope run on smoothly everywhere: no crater ends in an edge, which would draw as a thin ring.
 */
export function craterShape(r: number, depth: number, rim: number, crest: number): number {
  const x = Math.min(1, Math.max(0, (r - 1) / (CRATER.OUT - 1))), apron = rim * (1 - x * x) ** 2;
  const t = Math.min(1, Math.max(0, (r - 1 + crest) / (2 * crest))), w = t * t * (3 - 2 * t);
  return (rim + depth * (r * r - 1)) * (1 - w) + apron * w;
}

/** A crater's look at an age, 0 worn to 1 fresh (CRATER), as the ground shader draws it before its own variations. */
export function craterLook(age: number): { depth: number; rim: number; crest: number; wander: number } {
  const at = ([worn, fresh]: readonly [number, number]) => worn + (fresh - worn) * age;
  return { depth: at(CRATER.DEPTH), rim: at(CRATER.RIM), crest: at(CRATER.CREST), wander: at(CRATER.WANDER) };
}

/**
 * Where the eye comes round from looking down-Sun to looking across it, the share of the drawn bumps' shadows they
 * hide from it (hiddenShadowShare) fades out: from the cosine HIDE_FADE (60 degrees round, along the ground) to none
 * at 0 (square to the Sun's way). That share is not small there, and would otherwise drop to nothing at once along a
 * straight line through the ground under the eye: the near ground smooth on one side of it and pitted on the other.
 */
export const HIDE_FADE = 0.5;

/** The share of the drawn bumps' shadows hidden from the eye, as the ground shader takes it (see HIDE_FADE). */
export function hiddenShare(tanSun: number, tanDip: number, cosPlan: number): number {
  const x = Math.min(1, Math.max(0, cosPlan / HIDE_FADE));
  return hiddenShadowShare(tanSun, tanDip, cosPlan) * x * x * (3 - 2 * x);
}

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const GROUND_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld; varying vec3 vNormal;
uniform vec3 uSun, uEarth; uniform float uEarthshine, uDetail, uFarDetail, uSunPower; uniform vec2 uHole;
uniform float uLanderOn, uSunUp, uBounce, uNight, uFarCut, uPixel; uniform vec3 uLanderCenter; uniform vec2 uLanderCS; uniform vec3 uViewer;
${SHADOW_GLSL}
${HIDE_GLSL}
${BOULDER_GLSL}
${LANDER_GLSL}
// Into the lander's own frame (it stands turned about the vertical by the angle whose cos and sin are uLanderCS).
vec3 toLander(vec3 v) { return vec3(v.x * uLanderCS.x - v.z * uLanderCS.y, v.y, v.x * uLanderCS.y + v.z * uLanderCS.x); }
#include <logdepthbuf_pars_fragment>
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1, 0)), u.x), mix(hash1(i + vec2(0, 1)), hash1(i + vec2(1, 1)), u.x), u.y); }
// Two random numbers for a cell, from its place, without sines: they stay random for the large cell numbers far
// over the cap, where a sine's precision gives out and its values start to repeat in rows.
vec2 cellHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
// A crater's relief, in its radii, at r radii from its middle (craterShape in shaders.ts): a bowl depth deep from the
// rim's crest, a rim rim high over the plain round it, the two rounded into each other over crest radii either side
// of the crest, and outside it the rim's ejecta thinning to nothing, with no slope left, at ${f3(CRATER.OUT)} radii.
// Nowhere an edge, so no crater draws as a thin ring.
float craterShape(float r, float depth, float rim, float crest) {
  float x = clamp((r - 1.0) / ${f3(CRATER.OUT - 1)}, 0.0, 1.0), apron = rim * (1.0 - x * x) * (1.0 - x * x);
  return mix(rim + depth * (r * r - 1.0), apron, smoothstep(1.0 - crest, 1.0 + crest, r));
}
// Craters scattered irregularly over a plain (drawn, not measured), in cells cell metres wide: about presence of
// the cells hold one, many small and few large, of every age (CRATER): most worn, shallow and soft, a few fresh,
// deep and sharp. Each rim wanders in and out round its crater and stands higher in some places than others, so no
// crater is a perfect circle and their shadows have ragged edges. seed tells the layers apart.
float craterField(vec2 p, float cell, float presence, float seed) {
  vec2 g = floor(p / cell), f = p / cell - g; float h = 0.0;
  for (int j = -uOne; j <= uOne; j++) for (int i = -uOne; i <= uOne; i++) {
    vec2 o = vec2(float(i), float(j)); vec2 rnd = cellHash(g + o + seed);
    if (fract(rnd.x * 7.13 + rnd.y * 3.31) > presence) continue;
    float rad = mix(0.1, 0.45, pow(fract(rnd.x * 17.31 + rnd.y), 2.2));
    vec2 d = f - o - rnd; float dl = length(d);
    // Out of its reach, however far its rim wanders out.
    if (dl > rad * ${f3(CRATER.OUT * (1 + CRATER.WANDER[0] / 2))}) continue;
    float age = pow(fract(rnd.x * 21.7 + rnd.y * 4.3), ${CRATER.AGE_POWER.toFixed(1)});
    float wander = vnoise(d / max(dl, 1.0e-5) * 1.5 + rnd * 37.0);
    float r = dl / (rad * (1.0 + mix(${f3(CRATER.WANDER[0])}, ${f3(CRATER.WANDER[1])}, age) * (wander - 0.5)));
    float rim = mix(${f3(CRATER.RIM[0])}, ${f3(CRATER.RIM[1])}, age);
    rim *= 0.6 + 0.8 * wander;
    float depth = mix(${f3(CRATER.DEPTH[0])}, ${f3(CRATER.DEPTH[1])}, age) * (0.8 + 0.4 * fract(rnd.y * 5.77 + rnd.x));
    h += craterShape(r, depth, rim, mix(${f3(CRATER.CREST[0])}, ${f3(CRATER.CREST[1])}, age)) * rad * cell;
  }
  return h;
}
// The near ground's craters: more than half the cells hold one, most of them worn and faint.
float craters(vec2 p, float cell) { return craterField(p, cell, 0.55, 0.0); }
// Stones, each a lumpy low dome a little brighter than the dust, in two layers: rocks (about one cell in six
// of 1.5 m holds one 0.1 to 0.6 m across, few of them large) and pebbles (two cells in five of 0.6 m hold one
// 3 to 14 cm across). r0 and r1 are the smallest and largest radius in metres; seed tells the layers apart. Each
// stands a quarter of a cell or more in from its cell's edges, so none is cut off straight along one.
float stones(vec2 p, float cell, float seed, float presence, float r0, float r1, out float bright) {
  vec2 g = floor(p / cell), f = p / cell - g; vec2 rnd = hash2(g + seed); bright = 0.0;
  if (fract(rnd.x * 11.7 + rnd.y * 2.3) > presence) return 0.0;
  vec2 v = f - (0.25 + 0.5 * rnd);
  // Lumpy: the outline swells and dents with the direction from the stone's centre.
  float lump = 1.0 + 0.35 * (vnoise(normalize(v + 1.0e-5) * 1.7 + rnd * 23.0) - 0.5);
  float rad = mix(r0, r1, rnd.y * rnd.y) * lump; float r = length(v) * cell / rad;
  if (r >= 1.0) return 0.0;
  bright = 1.0 - r;
  return sqrt(1.0 - r * r) * rad * 0.8;
}
// The dust's fine grain, fading as it shrinks towards a pixel.
float grain(vec2 p, float px) {
  return (vnoise(p * 8.0) - 0.5) * 0.03 * smoothstep(1.5, 4.0, 0.125 / px) + (vnoise(p * 25.0) - 0.5) * 0.012 * smoothstep(1.5, 4.0, 0.04 / px);
}
// The big craters alone: from more than 9 m off, only they rise high enough to shade a point.
float bigH(vec2 p, float px) {
  float h = craters(p, 46.0) * 0.6 * smoothstep(1.5, 4.0, 46.0 / px);
  float k = smoothstep(1.5, 4.0, 11.0 / px);
  if (k > 0.0) h += craters(p + 17.0, 11.0) * 0.7 * k;
  return h;
}
// Each size fades out as it shrinks towards a pixel (px: metres of ground per pixel), so nothing sparkles;
// a size already faded away is not worked out at all.
float detailH(vec2 p, float px) {
  float h = bigH(p, px) + grain(p, px);
  float k = smoothstep(1.5, 4.0, 2.6 / px);
  if (k > 0.0) h += craters(p + 93.0, 2.6) * 0.6 * k + (vnoise(p * 0.9) - 0.5) * 0.12 * smoothstep(1.5, 4.0, 1.1 / px);
  k = smoothstep(1.5, 4.0, 0.7 / px);
  if (k > 0.0) h += (vnoise(p * 3.7) - 0.5) * 0.12 * smoothstep(1.5, 4.0, 0.27 / px) + craters(p + 151.0, 0.7) * 0.5 * k;
  return h;
}
// The drawn ground's steepest rise towards the Sun (as a slope) from a point at drawn height h0, along d:
// every size of crater out to 9 m, then the big ones out to 120 m. At a 2 degree Sun a rim 0.3 m high throws
// a shadow 9 m long, so most bowls lie in the dark, as in photographs taken on the Moon at a low Sun.
float detailRise(vec2 p, float h0, vec2 d, float px) {
  float rise = -1.0, t = 0.1;
  for (int i = 0; i < 16 * uOne; i++) { rise = max(rise, (detailH(p + d * t, px) - h0) / t); t *= 1.33; }
  for (int i = 0; i < 12 * uOne; i++) { rise = max(rise, (bigH(p + d * t, px) - h0) / t); t *= 1.24; }
  return rise;
}
// The far ground's craters: fewer than the near ground's (a quarter of the cells hold one), so from the air the
// ground reads as cratered rather than stamped, or as bubble wrap.
float farCraters(vec2 p, float cell) { return craterField(p, cell, 0.25, 7.0); }
// Seen from afar (the flight over the cap, the far hills from the eye): craters from about 20 m to about 1.5 km
// across, drawn too, below what the measured cells show (960 m on the cap). Each size fades in once it spans a few
// pixels, so nothing sparkles, and they only shade: the shadows still come from the measured ground.
float farH(vec2 p, float px) {
  float h = 0.0, k = smoothstep(1.5, 4.0, 800.0 / px);
  if (k > 0.0) h += farCraters(p + 577.0, 800.0) * k;
  k = smoothstep(1.5, 4.0, 200.0 / px);
  if (k > 0.0) h += farCraters(p + 919.0, 200.0) * k;
  k = smoothstep(1.5, 4.0, 50.0 / px);
  if (k > 0.0) h += farCraters(p + 1307.0, 50.0) * k;
  return h;
}
// A layer of stones' own shadows: cell by cell along the ray towards the Sun (the cells stones() lays that
// layer out in), each stone a low dome on the drawn ground, its shadow faded out between 0.6 and 1 times reach
// metres along the ray. The march goes on a cell and a half beyond that, so every stone whose shadow still shows
// is reached: none stops along the edge of a cell that drops out of the march. Returns the least angle by which
// the ray clears one (negative through it); grow (0 to 1) fades the stones in as they grow larger than a pixel.
float rockMargin(vec2 p, float h0, vec2 d, float tanEff, float px, float grow, float cell, float seed, float presence, float r0, float r1, float reach) {
  float res = 1.0;
  if (grow <= 0.0) return res;
  vec2 g = floor(p / cell), st = sign(d), inv = 1.0 / max(abs(d), vec2(1.0e-5));
  vec2 next = ((g + max(st, 0.0)) * cell - p) * st * inv, delta = cell * inv;
  for (int i = 0; i < 14 * uOne; i++) {
    vec2 rnd = hash2(g + seed);
    if (fract(rnd.x * 11.7 + rnd.y * 2.3) <= presence) {
      float rad = mix(r0, r1, rnd.y * rnd.y);
      vec2 v = (g + 0.25 + 0.5 * rnd) * cell - p;
      float tc = dot(v, d), e = abs(v.x * d.y - v.y * d.x);
      if (tc > 0.05 && e < rad + 0.5) {
        float top = detailH(p + v, px) + 0.8 * rad * grow * sqrt(max(0.0, 1.0 - e * e / (rad * rad)));
        res = min(res, mix(max(h0 + tc * tanEff - top, e - rad) / tc, 1.0, smoothstep(0.6 * reach, reach, tc)));
      }
    }
    if (next.x < next.y) { g.x += st.x; next.x += delta.x; } else { g.y += st.y; next.y += delta.y; }
    if (min(next.x, next.y) > reach + 1.5 * cell) break;
  }
  return res;
}
// The angle by which the ray p + t L clears a capsule (the segment a to a + v, radius r): from the nearest
// points of the ray and the segment, refined twice.
float capsuleClear(vec3 p, vec3 L, vec3 a, vec3 v, float r) {
  float t = max(dot(a + 0.5 * v - p, L), 0.05), s = 0.5;
  for (int k = 0; k < 2 * uOne; k++) {
    s = clamp(dot(p + L * t - a, v) / dot(v, v), 0.0, 1.0);
    t = max(dot(a + v * s - p, L), 0.05);
  }
  return (length(p + L * t - a - v * s) - r) / t;
}
// Your own shadow: an astronaut 1.8 m tall standing where the view stands (uViewer, the ground under the
// eye), square to the Sun, so the shadow shows two legs apart, a body with a backpack behind it, two arms and
// a round helmet; the angle by which the ray towards the Sun clears them. At a 2 degree Sun it reaches some
// 50 m on level ground.
float viewerClearance(vec3 p, vec3 L) {
  if (length(p.xz - uViewer.xz) > 140.0 || dot(uViewer.xz - p.xz, L.xz) <= 0.0) return 1.0;
  vec3 side = normalize(vec3(-L.z, 0.0, L.x)), up = vec3(0.0, 1.0, 0.0), away = -normalize(vec3(L.x, 0.0, L.z));
  float m = capsuleClear(p, L, uViewer + side * 0.14 + up * 0.05, up * 0.85, 0.08);         // legs, apart
  m = min(m, capsuleClear(p, L, uViewer - side * 0.14 + up * 0.05, up * 0.85, 0.08));
  m = min(m, capsuleClear(p, L, uViewer + up * 0.95, up * 0.5, 0.19));                      // body
  m = min(m, capsuleClear(p, L, uViewer + away * 0.18 + up * 1.05, up * 0.45, 0.23));       // backpack, behind
  m = min(m, capsuleClear(p, L, uViewer + side * 0.26 + up * 0.85, up * 0.55, 0.07));       // arms
  m = min(m, capsuleClear(p, L, uViewer - side * 0.26 + up * 0.85, up * 0.55, 0.07));
  m = min(m, capsuleClear(p, L, uViewer + up * 1.6, up * 0.02, 0.16));                      // helmet
  return m;
}
// A shadow's margin (radians by which the Sun's centre clears what would hide it) as light: spread over the
// Sun's disc, or over the margin's change across one pixel where that is wider, so far edges never stair-step.
// The margin is first held within about ten widths of the Sun either way, which keeps every edge as it was: where
// it jumps from one clear value to another (as where your own shadow's reach ends, on the line square to the Sun
// under your feet), its change across the pixel would otherwise half darken a line one pixel wide.
float soft(float m) { m = clamp(m, -0.05, 0.05); return clamp(m / max(${(2 * SHADOW.SUN_RADIUS_RAD).toFixed(5)}, fwidth(m)) + 0.5, 0.0, 1.0); }
void main() {
  #include <logdepthbuf_fragment>
  float px = max(length(fwidth(vWorld.xz)), 1.0e-3); // metres of ground per pixel, taken before any branch or discard
  vec2 m = toMap(vWorld.xz);
  if (abs(m.x) < uHole.x && abs(m.y) < uHole.y) discard; // a finer level draws here
  if (dot(m, m) > uFarCut * uFarCut) discard; // beyond this the globe, or the far skyline, draws
  vec3 N0 = normalize(vNormal), Nn = N0;
  // The flight level's light from its own heights, per pixel: its mesh, at every other cell, would soften the relief.
  if (uPixel > 0.5) N0 = slopeNormal(uH0, uL0, uS0, m, 1.0);
  Nn = N0;
  vec3 Ls = normalize(uSun), V = normalize(cameraPosition - vWorld);
  float dist = length(vWorld - cameraPosition);
  // The shadows, as margins: the measured ground's (its ray starts from the measured ground, not the drawn
  // craters), the lander's (from its drawn shape), and the drawn craters' and rocks' near the eye.
  float mTerrain = -1.0, mLander = 1.0, mViewer = 1.0, mBoulders = 1.0, mDetail = 1.0, wDetail = 0.0;
  bool facing = dot(N0, Ls) > 0.0;
  if (facing) {
    mTerrain = sunMargin(vWorld + N0 * 0.4, uSun);
    if (uLanderOn > 0.5) mLander = landerClearance(toLander(vWorld + N0 * 0.05 - uLanderCenter), toLander(Ls));
    mViewer = viewerClearance(vWorld + N0 * 0.05, Ls);
    if (length(vWorld.xz) < 140.0) mBoulders = rocksClearance(vWorld + N0 * 0.05, Ls);
  }
  float albedoVar = 1.0;
  // Looking down-Sun the drawn bumps would hide their own shadows and the sides they turn from the Sun, as
  // real ones do: over the measured ground's surface, how much of each is out of the eye's sight (hiddenShare),
  // fading to none as the eye comes round square to the Sun, where the share would otherwise drop to nothing at
  // once along a straight line through the ground under the eye.
  float sv = dot(V, N0), ss = dot(Ls, N0);
  vec3 vAlong = V - N0 * sv, sAlong = Ls - N0 * ss;
  float cosPlan = dot(vAlong, sAlong) / max(length(vAlong) * length(sAlong), 1.0e-5);
  float hide = hiddenShadowShare(ss / max(length(sAlong), 1.0e-5), sv / max(length(vAlong), 1.0e-5), cosPlan) * smoothstep(0.0, ${HIDE_FADE.toFixed(2)}, cosPlan);
  if (uDetail > 0.5) {
    // Near the eye only, and not seen from above (the flight's last metres), where they read as bubble wrap.
    float w = (1.0 - smoothstep(250.0, 1600.0, dist)) * (1.0 - smoothstep(20.0, 120.0, cameraPosition.y - vWorld.y));
    if (w > 0.0) {
      float e = max(0.15, px); float h0 = detailH(vWorld.xz, px), hx = detailH(vWorld.xz + vec2(e, 0.0), px), hz = detailH(vWorld.xz + vec2(0.0, e), px);
      float b0, bx, bz, c0, cx, cz;
      float rockW = w * smoothstep(1.5, 4.0, 0.1 / px), pebbleW = w * smoothstep(1.5, 4.0, 0.03 / px);
      h0 += stones(vWorld.xz, 1.5, 41.0, 0.18, 0.05, 0.3, b0) * rockW + stones(vWorld.xz, 0.6, 73.0, 0.4, 0.015, 0.07, c0) * pebbleW;
      hx += stones(vWorld.xz + vec2(e, 0.0), 1.5, 41.0, 0.18, 0.05, 0.3, bx) * rockW + stones(vWorld.xz + vec2(e, 0.0), 0.6, 73.0, 0.4, 0.015, 0.07, cx) * pebbleW;
      hz += stones(vWorld.xz + vec2(0.0, e), 1.5, 41.0, 0.18, 0.05, 0.3, bz) * rockW + stones(vWorld.xz + vec2(0.0, e), 0.6, 73.0, 0.4, 0.015, 0.07, cz) * pebbleW;
      Nn = normalize(Nn - vec3((hx - h0) / e, 0.0, (hz - h0) / e) * w * 1.15 * (1.0 - hide));
      albedoVar += w * (0.12 * (vnoise(vWorld.xz * 0.21) - 0.5) * smoothstep(1.5, 4.0, 4.8 / px) + 0.25 * max(0.0, h0) / 3.0
        + 0.06 * (vnoise(vWorld.xz * 3.1) - 0.5) * smoothstep(1.5, 4.0, 0.32 / px)
        // Grit: the dust's fine grain, a few centimetres across, close to the eye.
        + 0.08 * (vnoise(vWorld.xz * 23.0) - 0.5) * smoothstep(1.5, 4.0, 0.05 / px)) + 0.35 * b0 * rockW + 0.25 * c0 * pebbleW;
      // Not worked out where the measured ground already hides the whole Sun.
      if (facing && mTerrain > -${(3 * SHADOW.SUN_RADIUS_RAD).toFixed(5)}) {
        // Judged against the measured ground's own slope towards the Sun.
        vec2 dS = normalize(Ls.xz); float tanEl = Ls.y / max(length(Ls.xz), 1.0e-4);
        float tanEff = tanEl + (N0.x * dS.x + N0.z * dS.y) / max(N0.y, 0.25);
        float mRocks = rockMargin(vWorld.xz, h0, dS, tanEff, px, smoothstep(1.5, 4.0, 0.3 / px), 1.5, 41.0, 0.18, 0.05, 0.3, 9.0);
        float mPebbles = rockMargin(vWorld.xz, h0, dS, tanEff, px, smoothstep(1.5, 4.0, 0.09 / px), 0.6, 73.0, 0.4, 0.015, 0.07, 2.5);
        mDetail = min(atan(tanEff) - atan(detailRise(vWorld.xz, h0, dS, px)), min(mRocks, mPebbles));
        wDetail = w;
      }
    }
  }
  // From afar, farH's craters on every level of the measured ground, faded in as the near ones fade out (by 1600 m).
  float wFar = smoothstep(800.0, 2400.0, dist);
  if (uFarDetail > 0.5 && wFar > 0.0) {
    float e = max(px, 1.0), f0 = farH(vWorld.xz, px), fx = farH(vWorld.xz + vec2(e, 0.0), px), fz = farH(vWorld.xz + vec2(0.0, e), px);
    Nn = normalize(Nn - vec3((fx - f0) / e, 0.0, (fz - f0) / e) * wFar * (1.0 - hide));
  }
  albedoVar += 0.1 * (vnoise(vWorld.xz * 0.004) - 0.5);
  float mu0 = max(dot(Nn, Ls), 0.0), mu = max(dot(Nn, V), 0.03);
  float alpha = acos(clamp(dot(Ls, V), -1.0, 1.0));
  float phase = exp(-0.82 * alpha);
  float surge = 1.0 + 0.45 / (1.0 + tan(alpha * 0.5) / 0.055); // regolith brightens looking away from the Sun
  float ls = mu0 / (mu0 + mu);                                 // Lommel-Seeliger: no limb darkening on the Moon
  // Outside every branch, where the pixel's neighbours are known: the margins turn into light.
  float vis = soft(mTerrain) * soft(mLander) * soft(mViewer) * soft(mBoulders);
  vis *= mix(1.0, mix(soft(mDetail), 1.0, hide), wDetail);
  vec3 albedo = vec3(0.17, 0.164, 0.156) * albedoVar;
  vec3 col = albedo * vec3(1.0, 0.99, 0.975) * uSunPower * ls * phase * surge * vis;
  vec3 Le = normalize(uEarth); float mue = max(dot(Nn, Le), 0.0);
  // Earth sits low here, so its light grazes the ground: the slopes facing it shine, and the earthlit slopes
  // around scatter only a faint glow over the rest (slopes facing away stay dark).
  col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * 0.9 * mue / (mue + mu);
  col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * 0.07;
  // By day the sunlit dust around scatters a little light into the shadows, the less the lower the Sun
  // (uBounce, from bounceShare): at a Sun a few degrees up they are nearly black, as in the photographs.
  col += albedo * vec3(1.0, 0.99, 0.975) * uSunPower * uBounce * uSunUp;
  // At night with neither the Sun nor Earth up, a faint light that stands for eyes adapting to the dark (the
  // lander gets the same), so the ground still shows under it.
  col += albedo * vec3(0.62, 0.63, 0.66) * uNight;
  gl_FragColor = vec4(col, 1.0);
}`;

export const EARTH_VERT = /* glsl */ `
varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const EARTH_FRAG = /* glsl */ `
uniform sampler2D uDay, uClouds; uniform vec3 uSun; uniform float uMaps; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN), l = normalize(uSun), v = normalize(cameraPosition - vW);
  float d = dot(n, l); float lit = smoothstep(-0.06, 0.2, d);
  vec3 day = uMaps > 0.5 ? texture2D(uDay, vUv).rgb : vec3(0.1, 0.25, 0.55); float cl = uMaps > 0.5 ? texture2D(uClouds, vUv).r : 0.3;
  vec3 base = mix(day * vec3(0.92, 0.98, 1.08), vec3(1.0), cl * 0.92);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  gl_FragColor = vec4(base * lit * 0.95 + vec3(0.28, 0.5, 1.0) * rim * smoothstep(-0.25, 0.35, d) * 0.5, 1.0);
}`;

export const STAR_VERT = /* glsl */ `
attribute float size; varying vec3 vC; uniform float uPx;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPx;
  #include <logdepthbuf_vertex>
}`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vC; uniform float uGain;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  // Kept below the bloom threshold (0.985): only the Sun blooms.
  vec2 p = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(p)); gl_FragColor = vec4(min(vC * a * uGain, vec3(0.95)), a);
}`;
