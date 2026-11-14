import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { descentHeight, JET, LANDING, landingStart } from './landing';
import { buildLanding } from './landingMesh';

/** A slope rising 10 % towards the east, under a spot 16 m west of the eye. */
const ground = (x: number, z: number) => 0.1 * x + 0 * z;
const spot = { x: -16, y: ground(-16, 0), z: 0 };
const startM = landingStart(2 - spot.y, 16);
const make = () => buildLanding({ spot, startM, seed: 1234, groundAt: ground });

/** The points of a points object that draw something: their places and their attributes. */
function shown(p: THREE.Points) {
  const g = p.geometry, pos = g.getAttribute('position'), a = g.getAttribute('aAlpha'), size = g.getAttribute('aSize'), light = g.getAttribute('aLight');
  const out: { at: THREE.Vector3; alpha: number; size: number; light: number }[] = [];
  for (let i = 0; i < pos.count; i++) if (a.getX(i) > 0) out.push({ at: new THREE.Vector3().fromBufferAttribute(pos, i), alpha: a.getX(i), size: size.getX(i), light: light.getX(i) });
  return out;
}

describe('the landing’s plume and dust', () => {
  it('draws the plume and the dust as two points objects with one program between them, the plume adding its light, the dust over what is behind it', () => {
    const l = make();
    for (const p of [l.plume, l.dust]) {
      expect(p).toBeInstanceOf(THREE.Points);
      expect(p.material).toBeInstanceOf(THREE.ShaderMaterial);
      // Their places change every frame: never culled by a stale bounding sphere.
      expect(p.frustumCulled).toBe(false);
    }
    const [a, b] = [l.plume.material, l.dust.material] as THREE.ShaderMaterial[];
    // Everything three builds a program from the same, so the two share one: the shaders, the defines, the hooks, the kind of blending.
    expect(a.vertexShader).toBe(b.vertexShader);
    expect(a.fragmentShader).toBe(b.fragmentShader);
    expect(JSON.stringify(a.defines ?? {})).toBe(JSON.stringify(b.defines ?? {}));
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.onBeforeCompile.toString()).toBe(b.onBeforeCompile.toString());
    expect([a.transparent, b.transparent]).toEqual([true, true]);
    expect([a.vertexColors, b.vertexColors]).toEqual([false, false]);
    expect(a.blending).toBe(THREE.AdditiveBlending);
    expect(b.blending).toBe(THREE.NormalBlending);
    // Tested against the depth the ground and the lander write, writing none: the lander and the hills hide what is behind them.
    for (const m of [a, b]) {
      expect(m.depthTest).toBe(true);
      expect(m.depthWrite).toBe(false);
    }
    // Written into the logarithmic depth buffer as the rest of the view is, so the depths compare.
    for (const chunk of ['logdepthbuf_pars_vertex', 'logdepthbuf_vertex']) expect(a.vertexShader).toContain(`#include <${chunk}>`);
    for (const chunk of ['logdepthbuf_pars_fragment', 'logdepthbuf_fragment']) expect(a.fragmentShader).toContain(`#include <${chunk}>`);
    // The plume's light drawn over the dust, and both over the rest of the view's transparent things (the stars, the Sun).
    expect(l.plume.renderOrder).toBeGreaterThan(l.dust.renderOrder);
    expect(l.dust.renderOrder).toBeGreaterThan(0);
  });

  it('draws nothing until the landing plays, and nothing again once the plume is cut and the dust gone', () => {
    const l = make();
    expect([l.plume.visible, l.dust.visible]).toEqual([false, false]);
    // High up: the plume burns, no dust yet.
    l.apply(0);
    expect([l.plume.visible, l.dust.visible]).toEqual([true, false]);
    l.apply(LANDING.DESCENT_MS - 100);
    expect([l.plume.visible, l.dust.visible]).toEqual([true, true]);
    // Cut at touchdown, the dust still settling.
    l.apply(LANDING.DESCENT_MS + LANDING.PLUME_CUT_MS + 1);
    expect([l.plume.visible, l.dust.visible]).toEqual([false, true]);
    l.apply(LANDING.MS);
    expect([l.plume.visible, l.dust.visible]).toEqual([false, false]);
    l.apply(LANDING.MS + 10000);
    expect([l.plume.visible, l.dust.visible]).toEqual([false, false]);
    // Played back from the start, it draws again.
    l.apply(0);
    expect(l.plume.visible).toBe(true);
  });

  it('streams the plume straight down out of the lander’s bell as it comes down, and spreads it over the ground once it meets it', () => {
    const l = make();
    // High up: every puff under the bell's mouth, within a narrow cone round the line straight down from it.
    l.apply(300);
    const mouth = new THREE.Vector3(spot.x, spot.y + descentHeight(300, startM) + LANDING.NOZZLE_M, spot.z);
    const high = shown(l.plume);
    expect(high.length).toBeGreaterThan(JET.PUFFS / 2);
    for (const p of high) {
      const below = mouth.y - p.at.y, aside = Math.hypot(p.at.x - mouth.x, p.at.z - mouth.z);
      expect(below).toBeGreaterThanOrEqual(-1e-6);
      expect(below).toBeLessThanOrEqual(JET.LENGTH_M + 1e-6);
      expect(aside).toBeLessThanOrEqual(0.2 * below + 1e-6);
    }
    // Just before touchdown: none of it under the ground, and some of it out over the ground round the spot.
    l.apply(LANDING.DESCENT_MS - 30);
    const low = shown(l.plume);
    for (const p of low) expect(p.at.y).toBeGreaterThanOrEqual(ground(p.at.x, p.at.z) - 1e-6);
    expect(Math.max(...low.map((p) => Math.hypot(p.at.x - spot.x, p.at.z - spot.z)))).toBeGreaterThan(1.2);
  });

  it('blows the dust out over the ground round the spot, on the slope as on the level, never under it and never as far as the eye', () => {
    const l = make();
    for (const ms of [LANDING.DESCENT_MS - 800, LANDING.DESCENT_MS + 300, LANDING.DESCENT_MS + 1500]) {
      l.apply(ms);
      const dust = shown(l.dust);
      expect(dust.length).toBeGreaterThan(50);
      for (const p of dust) {
        const out = Math.hypot(p.at.x - spot.x, p.at.z - spot.z);
        expect(out).toBeLessThan(12);
        expect(p.at.y).toBeGreaterThanOrEqual(ground(p.at.x, p.at.z));
        expect(p.at.y).toBeLessThan(ground(p.at.x, p.at.z) + 2.5);
        expect(Math.hypot(p.at.x, p.at.z)).toBeGreaterThan(3);
      }
      // All the ways round.
      const east = dust.filter((p) => p.at.x > spot.x).length;
      expect(east / dust.length).toBeGreaterThan(0.3);
      expect(east / dust.length).toBeLessThan(0.7);
    }
  });

  it('stands each puff high enough that the ground in front of it never cuts it: its middle at least half its height over the ground', () => {
    const l = make();
    const flat = (p: THREE.Points, i: number) => p.geometry.getAttribute('aFlat').getX(i);
    for (const ms of [LANDING.DESCENT_MS - 600, LANDING.DESCENT_MS - 30, LANDING.DESCENT_MS + 400, LANDING.DESCENT_MS + 1800]) {
      l.apply(ms);
      for (const p of [l.plume, l.dust]) {
        const pos = p.geometry.getAttribute('position'), size = p.geometry.getAttribute('aSize'), alpha = p.geometry.getAttribute('aAlpha');
        for (let i = 0; i < pos.count; i++) {
          if (!p.visible || alpha.getX(i) <= 0) continue;
          expect(pos.getY(i) - ground(pos.getX(i), pos.getZ(i))).toBeGreaterThanOrEqual(0.5 * size.getX(i) * flat(p, i));
        }
      }
    }
  });

  it('roughens the dust’s puffs, each in its own way, and the plume’s less, so a cloud of them reads as dust and not as balls', () => {
    const l = make();
    const [plume, dust] = [l.plume.material, l.dust.material] as THREE.ShaderMaterial[];
    expect(dust.uniforms.uWisp.value).toBe(1);
    expect(plume.uniforms.uWisp.value).toBeGreaterThan(0);
    expect(plume.uniforms.uWisp.value).toBeLessThan(1);
    // Each puff's pattern from its own number in the cloud.
    expect(dust.vertexShader).toContain('vSeed = float(gl_VertexID)');
  });

  it('lights the dust with the light at the hour, the plume’s warm light on the dust near it while the engine burns, and none once it is cut', () => {
    const l = make();
    const m = l.dust.material as THREE.ShaderMaterial;
    l.light({ sun: [0.2, 0.19, 0.18], rest: [0.01, 0.012, 0.02] }, new THREE.Vector3(1, 0.05, 0).normalize());
    expect(m.uniforms.uSunlit.value.toArray()).toEqual([0.2, 0.19, 0.18]);
    expect(m.uniforms.uColor.value.toArray()).toEqual([0.01, 0.012, 0.02]);
    expect(m.uniforms.uSun.value.x).toBeCloseTo(new THREE.Vector3(1, 0.05, 0).normalize().x, 9);
    l.apply(LANDING.DESCENT_MS - 50);
    const lit = shown(l.dust);
    expect(Math.max(...lit.map((p) => p.light))).toBeGreaterThan(0.2);
    // Near the engine more than far out.
    const near = lit.filter((p) => Math.hypot(p.at.x - spot.x, p.at.z - spot.z) < 1.5), far = lit.filter((p) => Math.hypot(p.at.x - spot.x, p.at.z - spot.z) > 5);
    const mean = (v: { light: number }[]) => v.reduce((a, p) => a + p.light, 0) / v.length;
    expect(mean(near)).toBeGreaterThan(2 * mean(far));
    l.apply(LANDING.DESCENT_MS + LANDING.PLUME_CUT_MS + 50);
    for (const p of shown(l.dust)) expect(p.light).toBe(0);
    // The plume lights itself, warm, brighter as it nears the ground; the Sun does not light it.
    const plume = l.plume.material as THREE.ShaderMaterial;
    l.apply(100);
    const far1 = plume.uniforms.uColor.value.clone();
    l.apply(LANDING.DESCENT_MS - 50);
    const near1 = plume.uniforms.uColor.value.clone();
    expect(near1.r).toBeGreaterThan(1.8 * far1.r);
    expect(near1.r).toBeGreaterThan(near1.b);
    expect(plume.uniforms.uSunlit.value.toArray()).toEqual([0, 0, 0]);
    expect(plume.uniforms.uForward.value).toBe(0);
    expect(plume.uniforms.uBack.value).toBe(0);
  });

  it('brightens the dust’s sunlit part looking towards the Sun, much, and away from it, less, as fine dust scatters the light', () => {
    const m = make().dust.material as THREE.ShaderMaterial;
    expect(m.uniforms.uForward.value).toBeGreaterThan(m.uniforms.uBack.value);
    expect(m.uniforms.uBack.value).toBeGreaterThan(0);
    expect(m.vertexShader).toContain('uBack');
  });

  it('sizes the puffs in metres on the screen: half the picture’s height in pixels, which the renderer gives it', () => {
    const l = make();
    l.scale(675);
    for (const p of [l.plume, l.dust]) expect((p.material as THREE.ShaderMaterial).uniforms.uScale.value).toBe(675);
    expect((l.dust.material as THREE.ShaderMaterial).vertexShader).toMatch(/gl_PointSize = aSize \* projectionMatrix\[1\]\[1\] \* uScale/);
  });

  it('tells the GPU of the puffs’ new places each frame it plays, and only then', () => {
    const l = make();
    const pos = l.dust.geometry.getAttribute('position') as THREE.BufferAttribute, plume = l.plume.geometry.getAttribute('position') as THREE.BufferAttribute;
    const [d0, p0] = [pos.version, plume.version];
    l.apply(LANDING.DESCENT_MS - 200);
    expect(pos.version).toBeGreaterThan(d0);
    expect(plume.version).toBeGreaterThan(p0);
    expect(pos.usage).toBe(THREE.DynamicDrawUsage);
    // Over, the plume and the dust are left as they are: nothing to send.
    l.apply(LANDING.MS);
    const [d1, p1] = [pos.version, plume.version];
    l.apply(LANDING.MS + 500);
    expect([pos.version, plume.version]).toEqual([d1, p1]);
  });
});
