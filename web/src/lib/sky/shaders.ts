import { SHADOW_GLSL } from './shadowRule';

/*
 * The stand view's shaders, from the approved mockup: the ground (regolith light, the engine's shadows,
 * metre-scale craters drawn near the eye), Earth (NASA's Blue Marble, lit by the true Sun) and the stars.
 */

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
uniform vec3 uSun, uEarth; uniform float uEarthshine, uDetail, uSunPower; uniform vec2 uHole;
uniform float uLanderOn; uniform vec3 uLanderMin, uLanderMax;
${SHADOW_GLSL}
// The lander's shadow: does the ray towards the Sun pass through its box? (It is drawn, not part of the heights.)
float landerShadow(vec3 p, vec3 L) {
  if (uLanderOn < 0.5) return 1.0;
  vec3 inv = 1.0 / L;
  vec3 t0 = (uLanderMin - p) * inv, t1 = (uLanderMax - p) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  float tin = max(max(lo.x, lo.y), lo.z), tout = min(min(hi.x, hi.y), hi.z);
  return (tout > max(tin, 0.0)) ? 0.0 : 1.0;
}
#include <logdepthbuf_pars_fragment>
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1, 0)), u.x), mix(hash1(i + vec2(0, 1)), hash1(i + vec2(1, 1)), u.x), u.y); }
// Bowl-shaped craters with raised rims, scattered irregularly like a cratered plain (drawn, not measured):
// about six cells in ten hold one, many small and few large, each with its own depth.
float craters(vec2 p, float cell) {
  vec2 g = floor(p / cell), f = p / cell - g; float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)); vec2 rnd = hash2(g + o);
    if (fract(rnd.x * 7.13 + rnd.y * 3.31) > 0.6) continue;
    vec2 c = o + rnd; float rad = mix(0.1, 0.45, pow(fract(rnd.x * 17.31 + rnd.y), 2.2));
    float depth = mix(0.16, 0.3, fract(rnd.y * 5.77 + rnd.x));
    float r = length(f - c) / rad;
    if (r < 1.8) { float bowl = r < 1.0 ? (r * r - 1.0) : 0.0; float rim = 0.32 * exp(-pow((r - 1.0) * 3.2, 2.0)); h += (bowl * depth + rim) * rad * cell; }
  }
  return h;
}
// Rocks: one cell in ten (1.5 m cells) holds a stone 0.1 to 0.5 m across, a little brighter than the dust.
float rocks(vec2 p, out float bright) {
  vec2 g = floor(p / 1.5), f = p / 1.5 - g; vec2 rnd = hash2(g + 41.0); bright = 0.0;
  if (fract(rnd.x * 11.7 + rnd.y * 2.3) > 0.1) return 0.0;
  float rad = mix(0.035, 0.17, rnd.y); float r = length(f - (0.2 + 0.6 * rnd)) / rad;
  if (r >= 1.0) return 0.0;
  bright = 1.0 - r;
  return sqrt(1.0 - r * r) * rad * 1.5 * 0.8;
}
// The dust's fine grain, fading as it shrinks towards a pixel.
float grain(vec2 p, float px) {
  return (vnoise(p * 8.0) - 0.5) * 0.03 * smoothstep(1.5, 4.0, 0.125 / px) + (vnoise(p * 25.0) - 0.5) * 0.012 * smoothstep(1.5, 4.0, 0.04 / px);
}
// Each size fades out as it shrinks towards a pixel (px: metres of ground per pixel), so nothing sparkles.
float detailH(vec2 p, float px) {
  return craters(p, 46.0) * 0.55 * smoothstep(1.5, 4.0, 46.0 / px)
    + craters(p + 17.0, 11.0) * 0.6 * smoothstep(1.5, 4.0, 11.0 / px)
    + craters(p + 93.0, 2.6) * 0.6 * smoothstep(1.5, 4.0, 2.6 / px)
    + (vnoise(p * 0.9) - 0.5) * 0.35 * smoothstep(1.5, 4.0, 1.1 / px)
    + (vnoise(p * 3.7) - 0.5) * 0.12 * smoothstep(1.5, 4.0, 0.27 / px)
    + craters(p + 151.0, 0.7) * 0.5 * smoothstep(1.5, 4.0, 0.7 / px)
    + grain(p, px);
}
void main() {
  #include <logdepthbuf_fragment>
  float px = max(length(fwidth(vWorld.xz)), 1.0e-3); // metres of ground per pixel, taken before any branch or discard
  vec2 m = toMap(vWorld.xz);
  if (abs(m.x) < uHole.x && abs(m.y) < uHole.y) discard; // a finer level draws here
  vec3 N0 = normalize(vNormal), Nn = N0;
  float dist = length(vWorld - cameraPosition);
  float albedoVar = 1.0;
  if (uDetail > 0.5) {
    float w = 1.0 - smoothstep(250.0, 1600.0, dist);
    if (w > 0.0) {
      float e = max(0.15, px); float h0 = detailH(vWorld.xz, px), hx = detailH(vWorld.xz + vec2(e, 0.0), px), hz = detailH(vWorld.xz + vec2(0.0, e), px);
      float b0, bx, bz;
      float r0 = rocks(vWorld.xz, b0), rx = rocks(vWorld.xz + vec2(e, 0.0), bx), rz = rocks(vWorld.xz + vec2(0.0, e), bz);
      float rockW = w * smoothstep(1.5, 4.0, 0.1 / px);
      h0 += r0 * rockW; hx += rx * rockW; hz += rz * rockW;
      Nn = normalize(Nn - vec3((hx - h0) / e, 0.0, (hz - h0) / e) * w * 1.15);
      albedoVar += w * (0.12 * (vnoise(vWorld.xz * 0.21) - 0.5) * smoothstep(1.5, 4.0, 4.8 / px) + 0.25 * max(0.0, h0) / 3.0
        + 0.06 * (vnoise(vWorld.xz * 3.1) - 0.5) * smoothstep(1.5, 4.0, 0.32 / px)) + 0.35 * b0 * rockW;
    }
  }
  albedoVar += 0.1 * (vnoise(vWorld.xz * 0.004) - 0.5);
  vec3 Ls = normalize(uSun), V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(Nn, Ls), 0.0), mu = max(dot(Nn, V), 0.03);
  float alpha = acos(clamp(dot(Ls, V), -1.0, 1.0));
  float phase = exp(-0.82 * alpha);
  float surge = 1.0 + 0.9 / (1.0 + tan(alpha * 0.5) / 0.055); // regolith brightens looking away from the Sun
  float ls = mu0 / (mu0 + mu);                                 // Lommel-Seeliger: no limb darkening on the Moon
  // The shadow ray starts from the measured ground; the drawn craters only shade.
  float vis = mu0 > 0.0 ? sunFraction(vWorld + N0 * 0.4, uSun) * landerShadow(vWorld + N0 * 0.05, Ls) : 0.0;
  vec3 albedo = vec3(0.17, 0.164, 0.156) * albedoVar;
  vec3 col = albedo * vec3(1.0, 0.99, 0.975) * uSunPower * ls * phase * surge * vis;
  vec3 Le = normalize(uEarth); float mue = max(dot(Nn, Le), 0.0);
  col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * mue / (mue + mu);
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
