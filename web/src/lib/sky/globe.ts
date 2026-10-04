import * as THREE from 'three';
import { R_MOON_M } from '../engine/constants';
import type { GlobeAssets } from '../data/globe';
import type { Basis, Vec3 } from './frames';
import { SHADOW } from './shadowRule';
import { cachedTexture } from './textureCache';

/** Heights at 4 pixels a degree: row 0 at the north pole's edge, column 0 at 180° W, pixel centres. */
export interface GlobeHeights { width: number; height: number; metres: Float32Array }

/**
 * The globe's mesh (512 by 256 cells) and its shadow march: 28 samples from 2.5 km, growing 18 % a step, out
 * to about 220 km, the engine's rule over the globe's heights. The measured ground draws within 200 km of the
 * site, so the globe leaves that out.
 */
export const GLOBE = { SEG_LON: 512, SEG_LAT: 256, STEPS: 28, T0_M: 2500, GROWTH: 1.18, CUT_M: 200000 } as const;

/** A unit sphere in the Moon-fixed frame (x to 0° longitude, z north); u from 180° W, v from the south pole. */
export function globeGeometry(segLon: number = GLOBE.SEG_LON, segLat: number = GLOBE.SEG_LAT): THREE.BufferGeometry {
  const cols = segLon + 1, rows = segLat + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2), idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    const v = r / segLat, lat = (v - 0.5) * Math.PI;
    for (let c = 0; c < cols; c++) {
      const u = c / segLon, lon = (u - 0.5) * 2 * Math.PI, k = r * cols + c;
      pos.set([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)], k * 3);
      uv.set([u, v], k * 2);
      if (r < segLat && c < segLon) idx.push(k, k + 1, k + cols + 1, k, k + cols + 1, k + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Moon-fixed metres from the Moon's centre into the site's world frame (x east, y up, z south, origin on the site's ground). */
export function moonToWorld(b: Basis, siteHeightM: number): THREE.Matrix4 {
  const [e, u, n] = [b.east, b.up, b.north];
  return new THREE.Matrix4().set(e[0], e[1], e[2], 0, u[0], u[1], u[2], -(R_MOON_M + siteHeightM), -n[0], -n[1], -n[2], 0, 0, 0, 0, 1);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Height (m) at a Moon-fixed unit direction: bilinear, wrapping in longitude, as the shader samples it. */
export function globeHeightAt(h: GlobeHeights, d: Vec3): number {
  const lat = Math.asin(clamp(d[2], -1, 1)), lon = Math.atan2(d[1], d[0]);
  const x = (lon / (2 * Math.PI) + 0.5) * h.width - 0.5, y = (0.5 - lat / Math.PI) * h.height - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (c: number, r: number) => h.metres[clamp(r, 0, h.height - 1) * h.width + (((c % h.width) + h.width) % h.width)];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/**
 * The angle (radians) by which the Sun's centre clears the steepest rise of the ground towards it, from the
 * point at unit direction `up`, over the globe's heights: the engine's rule, as the globe's shader works it out.
 */
export function globeMargin(h: GlobeHeights, up: Vec3, sun: Vec3): number {
  const s = sun[0] * up[0] + sun[1] * up[1] + sun[2] * up[2], el = Math.asin(clamp(s, -1, 1));
  const t: Vec3 = [sun[0] - up[0] * s, sun[1] - up[1] * s, sun[2] - up[2] * s], tl = Math.hypot(t[0], t[1], t[2]);
  if (tl < 1e-5) return el;
  const r0 = R_MOON_M + globeHeightAt(h, up);
  let best = -Infinity, d: number = GLOBE.T0_M;
  for (let i = 0; i < GLOBE.STEPS; i++) {
    const a = d / R_MOON_M, c = Math.cos(a), sn = Math.sin(a) / tl;
    const q: Vec3 = [up[0] * c + t[0] * sn, up[1] * c + t[1] * sn, up[2] * c + t[2] * sn];
    const rq = R_MOON_M + globeHeightAt(h, q);
    best = Math.max(best, Math.atan2(rq * c - r0, rq * Math.sin(a)));
    d *= GLOBE.GROWTH;
  }
  return el - best;
}

/** The heights as a texture, rows turned so its first row is the south pole's, as the maps' v runs. */
export function heightsTexture(h: GlobeHeights, half: boolean): THREE.DataTexture {
  const flipped = new Float32Array(h.metres.length);
  for (let r = 0; r < h.height; r++) flipped.set(h.metres.subarray(r * h.width, (r + 1) * h.width), (h.height - 1 - r) * h.width);
  const data = half ? Uint16Array.from(flipped, (v) => THREE.DataUtils.toHalfFloat(v)) : flipped;
  const t = new THREE.DataTexture(data, h.width, h.height, THREE.RedFormat, half ? THREE.HalfFloatType : THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const SUN_R = SHADOW.SUN_RADIUS_RAD.toFixed(5);

export const GLOBE_VERT = /* glsl */ `
uniform sampler2D uHeights; uniform float uRadius;
varying vec3 vDir; varying vec2 vUv; varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize(position); vUv = uv;
  vec4 w = modelMatrix * vec4(vDir * (uRadius + textureLod(uHeights, uv, 0.0).r), 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const GLOBE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor, uNormal, uHeights;
uniform float uColorOn, uNormalOn, uRadius, uAlbedoScale, uSunPower, uEarthshine, uCut;
uniform vec3 uSun, uSunMe, uEarthMe, uSiteMe; uniform mat3 uToWorld;
varying vec3 vDir; varying vec2 vUv; varying vec3 vWorld;
#include <logdepthbuf_pars_fragment>
float hAt(vec3 d) { return textureLod(uHeights, vec2(atan(d.y, d.x) / 6.2831853 + 0.5, asin(clamp(d.z, -1.0, 1.0)) / 3.1415927 + 0.5), 0.0).r; }
// The engine's rule over the globe's heights: the steepest rise of the ground towards the Sun against its height.
float margin(vec3 up, vec3 sun) {
  float s = dot(sun, up); float el = asin(clamp(s, -1.0, 1.0));
  vec3 t = sun - up * s; float tl = length(t);
  if (tl < 1.0e-5) return el;
  t /= tl; float r0 = uRadius + hAt(up), best = -10.0, d = ${GLOBE.T0_M.toFixed(1)};
  for (int i = 0; i < ${GLOBE.STEPS}; i++) {
    float a = d / uRadius; float rq = uRadius + hAt(up * cos(a) + t * sin(a));
    best = max(best, atan(rq * cos(a) - r0, rq * sin(a)));
    d *= ${GLOBE.GROWTH};
  }
  return el - best;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vDir);
  // Before any branch or discard: its change across a pixel softens the far shadows' edges.
  float m = margin(up, normalize(uSunMe)); float fw = fwidth(m);
  if (dot(up, uSiteMe) > uCut) discard; // the measured ground draws here
  float lon = atan(up.y, up.x);
  vec3 east = normalize(vec3(-sin(lon), cos(lon), 0.0)), north = cross(up, east);
  vec3 nt = uNormalOn > 0.5 ? texture2D(uNormal, vUv).xyz * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 nMe = normalize(east * nt.x + north * nt.y + up * nt.z);
  vec3 N = normalize(uToWorld * nMe), L = normalize(uSun), V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(N, L), 0.0), mu = max(dot(N, V), 0.03);
  float alpha = acos(clamp(dot(L, V), -1.0, 1.0));
  float phase = exp(-0.82 * alpha), surge = 1.0 + 0.45 / (1.0 + tan(alpha * 0.5) / 0.055);
  float vis = clamp(m / max(2.0 * ${SUN_R}, fw) + 0.5, 0.0, 1.0);
  vec3 albedo = uColorOn > 0.5 ? texture2D(uColor, vUv).rgb * uAlbedoScale : vec3(0.17);
  vec3 col = albedo * vec3(1.0, 0.99, 0.975) * uSunPower * (mu0 / (mu0 + mu)) * phase * surge * vis;
  // Earthshine: the night side faintly lit by Earth, more as Earth is fuller.
  col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * max(dot(nMe, normalize(uEarthMe)), 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Globe {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** The Sun's and Earth's directions in the world frame, and Earth's lit share for its light on the night side. */
  setLight(sunWorld: Vec3, earthWorld: Vec3, earthLit: number): void;
  /** Whether the measured ground draws round the site, and the globe leaves its patch out. */
  setCut(on: boolean): void;
  dispose(): void;
}

/**
 * The Moon round the measured ground: the colour map and the relief (the small maps at once, the large ones
 * when they come), lit as the ground is lit (regolith photometry, the engine's shadow rule over its own
 * heights), placed by the site's frame. `cutM` leaves out what lies within that distance of the site (the
 * measured ground draws there); 0 leaves nothing out.
 */
export function buildGlobe(o: { basis: Basis; siteHeightM: number; assets: GlobeAssets; halfFloat: boolean; cutM: number }): Globe {
  const toWorld = moonToWorld(o.basis, o.siteHeightM);
  const rot = new THREE.Matrix3().setFromMatrix4(toWorld), back = rot.clone().transpose();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null },
      uNormal: { value: null },
      uHeights: { value: heightsTexture(o.assets.heights, o.halfFloat) },
      uColorOn: { value: 0 },
      uNormalOn: { value: 0 },
      uRadius: { value: R_MOON_M },
      uAlbedoScale: { value: o.assets.albedoScale },
      uSunPower: { value: 3.4 },
      uEarthshine: { value: 0 },
      uCut: { value: o.cutM > 0 ? Math.cos(o.cutM / R_MOON_M) : 2 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uSunMe: { value: new THREE.Vector3(1, 0, 0) },
      uEarthMe: { value: new THREE.Vector3(0, 1, 0) },
      uSiteMe: { value: new THREE.Vector3(...o.basis.up) },
      uToWorld: { value: rot },
    },
    vertexShader: GLOBE_VERT,
    fragmentShader: GLOBE_FRAG,
  });
  const mesh = new THREE.Mesh(globeGeometry(), material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(toWorld);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.frustumCulled = false;
  if (typeof document !== 'undefined') {
    // The small maps first, the large ones over them when they arrive.
    const stream = (urls: { low: string; high: string }, srgb: boolean, map: 'uColor' | 'uNormal', on: 'uColorOn' | 'uNormalOn') => {
      const high = cachedTexture(urls.high, srgb).texture;
      for (const url of [urls.low, urls.high]) {
        const t = cachedTexture(url, srgb);
        void t.ready.then(
          () => {
            if (url === urls.low && material.uniforms[map].value === high) return; // the large one came first
            material.uniforms[map].value = t.texture;
            material.uniforms[on].value = 1;
          },
          () => {},
        );
      }
    };
    stream(o.assets.color, true, 'uColor', 'uColorOn');
    stream(o.assets.normal, false, 'uNormal', 'uNormalOn');
  }
  const v = new THREE.Vector3();
  return {
    mesh,
    material,
    setLight(sunWorld, earthWorld, earthLit) {
      material.uniforms.uSun.value.set(...sunWorld);
      material.uniforms.uSunMe.value.copy(v.set(...sunWorld).applyMatrix3(back)).normalize();
      material.uniforms.uEarthMe.value.copy(v.set(...earthWorld).applyMatrix3(back)).normalize();
      material.uniforms.uEarthshine.value = 0.03 * earthLit;
    },
    setCut(on) {
      material.uniforms.uCut.value = on && o.cutM > 0 ? Math.cos(o.cutM / R_MOON_M) : 2;
    },
    dispose() {
      mesh.geometry.dispose();
      (material.uniforms.uHeights.value as THREE.Texture).dispose();
      material.dispose();
    },
  };
}
