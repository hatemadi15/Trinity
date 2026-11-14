import * as THREE from 'three';
import { descentHeight, dustPuffs, jetAt, jetShare, JET, LANDING, plumeGain, puffAt } from './landing';

/*
 * The landing drawn (landing.ts has its timing): the engine's plume and the dust it blows up, as two points objects that
 * share one program, built with the scene so the program is compiled before the first frame, and drawn only while the
 * landing plays. Each puff is a soft disc sized in metres; their places are worked out here, frame by frame, and sent
 * to the GPU only while they move.
 */

/**
 * The plume's light: a warm white (linear) GLOW times as bright as white at its full brightness (so its middle blooms a
 * little), of which the dust near the engine catches ON_DUST, falling off over REACH_M. Under the bell's mouth three
 * glows that stay with it (CORE: how far down, how wide, how opaque), and on the ground under it, once it is within
 * SPLASH_FROM_M, a glow where the exhaust meets the ground, SPLASH_FLAT times as tall as wide.
 */
const PLUME = {
  RGB: [1, 0.86, 0.66],
  GLOW: 1.8,
  ON_DUST: 0.3,
  REACH_M: 1.6,
  CORE: [
    [0.12, 0.5, 0.85],
    [0.4, 0.7, 0.55],
    [0.8, 0.9, 0.3],
  ],
  SPLASH_FROM_M: 5,
  SPLASH_FLAT: 0.32,
} as const;
/**
 * How much brighter the dust's sunlit part looks towards the Sun (GAIN: fine dust scatters its light forward), and how
 * tightly round it (POWER); and looking away from it (BACK, broadly), where the eye sees its sunlit side.
 */
const FORWARD = { GAIN: 2, POWER: 8, BACK: 1.5 } as const;
/**
 * How ragged each puff is (WISP: 0 a smooth round disc, 1 the dust's), the plume's puffs less so, and how far each puff's
 * shade strays from its cloud's (SHADE, either way).
 */
const WISP = { DUST: 1, PLUME: 0.3, SHADE: 0.15 } as const;
/**
 * How high over the ground a puff's middle must stand so the ground does not cut it (metres): its disc faces the eye, and
 * the ground in front of its lower half would hide that half; at its half height over the ground none of it is behind
 * the ground. A little more, so its soft rim clears the ground's own bumps.
 */
const clear = (size: number, flat: number) => 0.5 * size * flat + 0.02;

export const LANDING_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute float aLight; attribute float aFlat;
uniform float uScale, uForward, uBack; uniform vec3 uSun;
varying float vAlpha, vLight, vFlat, vScatter, vSeed;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAlpha = aAlpha; vLight = aLight; vFlat = aFlat; vSeed = float(gl_VertexID);
  vec4 w = modelMatrix * vec4(position, 1.0), mv = viewMatrix * w;
  // Fine dust looks brighter towards the Sun, as it scatters the Sun's light forward, and a little away from it.
  float c = dot(normalize(w.xyz - cameraPosition), uSun);
  vScatter = 1.0 + uForward * pow(max(c, 0.0), ${FORWARD.POWER.toFixed(1)}) + uBack * c * c * step(c, 0.0);
  gl_Position = projectionMatrix * mv;
  // Its size in metres, on the screen at its distance. One that is not there stands outside the view and draws nothing.
  gl_PointSize = aSize * projectionMatrix[1][1] * uScale / max(-mv.z, 0.05);
  if (aAlpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; }
  #include <logdepthbuf_vertex>
}`;

export const LANDING_FRAG = /* glsl */ `
uniform vec3 uColor, uSunlit, uGlow; uniform float uWisp;
varying float vAlpha, vLight, vFlat, vScatter, vSeed;
#include <logdepthbuf_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  #include <logdepthbuf_fragment>
  // A soft puff, flattened as dust low over the ground looks: opaque in its middle, fading out to nothing at its rim.
  vec2 p = 2.0 * gl_PointCoord - 1.0; p.y /= vFlat;
  float r2 = dot(p, p);
  if (r2 >= 1.0 || vAlpha <= 0.0) discard;
  // Ragged, each in its own way (its number in the cloud picks its pattern), so a cloud of them reads as dust, not balls;
  // thicker and thinner by turns about the same mean, and each a little lighter or darker than the next.
  vec2 q = 1.7 * p + vec2(0.731, 0.317) * vSeed;
  float n = 0.65 * noise(q) + 0.35 * noise(2.3 * q + 5.1);
  float a = vAlpha * (1.0 - r2) * (1.0 - r2) * mix(1.0, 0.25 + 1.5 * n, uWisp);
  float shade = 1.0 + ${(2 * WISP.SHADE).toFixed(2)} * uWisp * (hash(vec2(vSeed, 1.7)) - 0.5);
  gl_FragColor = vec4((uColor + uSunlit * vScatter + uGlow * vLight) * shade, a);
}`;

/** A points object of `n` puffs in the landing's program, `blending` as it is drawn over what is behind it, out of the picture until it plays. */
function puffs(n: number, blending: THREE.Blending, renderOrder: number, wisp: number) {
  const geometry = new THREE.BufferGeometry();
  const attribute = (name: string, size: number) => {
    const a = new THREE.BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, a);
    return a;
  };
  const at = { position: attribute('position', 3), size: attribute('aSize', 1), alpha: attribute('aAlpha', 1), light: attribute('aLight', 1), flat: attribute('aFlat', 1) };
  at.flat.array.fill(1);
  const colour = () => ({ value: new THREE.Color(0, 0, 0) });
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uForward: { value: 0 }, uBack: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uColor: colour(), uSunlit: colour(), uGlow: colour(), uWisp: { value: wisp } },
    vertexShader: LANDING_VERT,
    fragmentShader: LANDING_FRAG,
    transparent: true,
    depthWrite: false,
    blending,
  });
  const points = new THREE.Points(geometry, material);
  // Their places change every frame: a bounding sphere worked out once would cull them wrongly.
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = renderOrder;
  /** Puff `i` at a place, its size, opacity, the plume's light on it and how flat it is. */
  const set = (i: number, x: number, y: number, z: number, size: number, alpha: number, light = 0, flat = 1) => {
    at.position.setXYZ(i, x, y, z);
    at.size.setX(i, size);
    at.alpha.setX(i, alpha);
    at.light.setX(i, light);
    at.flat.setX(i, flat);
  };
  const sent = () => {
    for (const a of Object.values(at)) a.needsUpdate = true;
  };
  return { points, material, at, set, sent };
}

/**
 * The landing's plume and dust for a lander whose spot (the ground under its middle) is `spot`, coming down from `startM`
 * over it, on the ground `groundAt` gives, for a site's `seed`. `apply(ms)` draws them `ms` into the landing; `light`
 * gives the dust the hour's light and the Sun's direction; `scale` the picture's half height in pixels, which sizes the
 * puffs. The plume adds its light to what is behind it; the dust is drawn over what is behind it, the plume's light
 * over the dust, both after the rest of the view's transparent things (the stars, the Sun).
 */
export function buildLanding(o: { spot: { x: number; y: number; z: number }; startM: number; seed: number; groundAt: (x: number, z: number) => number }) {
  const { spot, startM, groundAt } = o;
  const dustOf = dustPuffs(o.seed, startM);
  const dust = puffs(dustOf.length, THREE.NormalBlending, 1, WISP.DUST);
  const plume = puffs(JET.PUFFS + PLUME.CORE.length + 1, THREE.AdditiveBlending, 2, WISP.PLUME);
  const dustMat = dust.material, plumeMat = plume.material;
  dustMat.uniforms.uForward.value = FORWARD.GAIN;
  dustMat.uniforms.uBack.value = FORWARD.BACK;
  (dustMat.uniforms.uGlow.value as THREE.Color).setRGB(PLUME.RGB[0] * PLUME.GLOW * PLUME.ON_DUST, PLUME.RGB[1] * PLUME.GLOW * PLUME.ON_DUST, PLUME.RGB[2] * PLUME.GLOW * PLUME.ON_DUST);
  const splash = JET.PUFFS + PLUME.CORE.length;
  /** Whether the dust drew in the last frame applied: its last frame sends it out of the picture. */
  let dustOn = false;

  const apply = (ms: number) => {
    const h = descentHeight(ms, startM), gain = ms >= 0 ? plumeGain(ms, h) : 0;
    const mouth = spot.y + h + LANDING.NOZZLE_M, gap = mouth - spot.y;
    // The plume: its stream of puffs, the glows under the bell's mouth, and where it meets the ground.
    plume.points.visible = gain > 0;
    if (gain > 0) {
      (plumeMat.uniforms.uColor.value as THREE.Color).setRGB(PLUME.RGB[0] * PLUME.GLOW * gain, PLUME.RGB[1] * PLUME.GLOW * gain, PLUME.RGB[2] * PLUME.GLOW * gain);
      for (let k = 0; k < JET.PUFFS; k++) {
        const p = jetAt(k, jetShare(k, ms), gap), x = spot.x + p.out * Math.cos(p.angle), z = spot.z + p.out * Math.sin(p.angle);
        plume.set(k, x, Math.max(mouth - p.down, groundAt(x, z) + clear(p.size, 1)), z, p.size, p.alpha);
      }
      PLUME.CORE.forEach(([down, size, alpha], i) => plume.set(JET.PUFFS + i, spot.x, Math.max(mouth - Math.min(down, gap), spot.y + clear(size, 1)), spot.z, size, alpha));
      // Brighter and wider the nearer the ground (an ease-in on how near), flat on it.
      const near = 1 - Math.min(1, gap / PLUME.SPLASH_FROM_M), wide = 1 + 2.4 * near;
      plume.set(splash, spot.x, spot.y + clear(wide, PLUME.SPLASH_FLAT), spot.z, wide, 0.8 * near * near, 0, PLUME.SPLASH_FLAT);
      plume.sent();
    }
    // The dust: each puff out over the ground from under the engine, lit by the plume while it burns.
    if (!(ms >= 0 && ms < LANDING.MS) && !dustOn) {
      dust.points.visible = false;
      return;
    }
    // The plume's foot, where its light on the dust comes from.
    const foot = mouth - Math.min(gap, JET.LENGTH_M);
    let alive = 0;
    dustOf.forEach((p, i) => {
      const s = puffAt(p, ms);
      if (!s) {
        dust.at.alpha.setX(i, 0);
        return;
      }
      alive++;
      const x = spot.x + s.r * Math.cos(p.angle), z = spot.z + s.r * Math.sin(p.angle), y = groundAt(x, z) + s.lift + clear(s.size, p.flat);
      const d = Math.hypot(s.r, y - foot) / PLUME.REACH_M;
      dust.set(i, x, y, z, s.size, s.alpha, gain / (1 + d * d), p.flat);
    });
    dust.sent();
    dustOn = alive > 0;
    dust.points.visible = dustOn;
  };

  /** The dust's light at the hour (dustLight): its sunlit part, brighter towards the Sun (`sun`, the way to it), and the rest. */
  const light = (l: { sun: readonly number[]; rest: readonly number[] }, sun: THREE.Vector3) => {
    (dustMat.uniforms.uSunlit.value as THREE.Color).setRGB(l.sun[0], l.sun[1], l.sun[2]);
    (dustMat.uniforms.uColor.value as THREE.Color).setRGB(l.rest[0], l.rest[1], l.rest[2]);
    (dustMat.uniforms.uSun.value as THREE.Vector3).copy(sun).normalize();
  };
  /** Half the drawn picture's height in pixels: a puff a metre wide at a metre's distance is this wide over the tangent of half the view's height. */
  const scale = (halfHeightPx: number) => {
    for (const m of [dustMat, plumeMat]) m.uniforms.uScale.value = halfHeightPx;
  };
  return { plume: plume.points, dust: dust.points, apply, light, scale };
}
