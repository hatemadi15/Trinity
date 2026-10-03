import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Series } from '@/lib/engine/metrics';
import type { SkyAssets } from '@/lib/data/sky';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { LANDER, LEG_ENDS } from './landerShape';
import { BOULDERS } from './boulders';
import { dirAzEl } from './frames';
import { bounceShare, buildScene, lookUpTarget, shadowOnGround, toTextureHeights, type StandScene } from './standRenderer';
import { flatField, heightAt, terrainField } from './terrainField';

const series = {
  i0: 0,
  hours: 3,
  sunAz: Float64Array.from([300, 301, 302]),
  sunEl: Float64Array.from([2, 1, -1]),
  earthAz: Float64Array.from([70, 70, 70]),
  earthEl: Float64Array.from([4, 4, 4]),
  sunFraction: Float64Array.from([1, 0.4, 0]),
  earthVisible: Uint8Array.from([1, 1, 1]),
  sunAu: Float64Array.from([1, 1, 1]),
} as Series;
const sky: SkyAssets = {
  stars: { count: 2, j2000: Float32Array.from([1, 0, 0, 0, 0, 1]), vmag: Float32Array.from([1, 5]), bv: Float32Array.from([0, 1]) },
  moon: { startMs: Date.parse('2024-01-01T00:00:00Z'), stepMs: 6 * 3600e3, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) },
  earthDayUrl: 'day.jpg',
  earthCloudsUrl: 'clouds.jpg',
};
const flat = (o: Partial<StandScene> = {}): StandScene => ({
  field: flatField(-64.31),
  mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) },
  series,
  startUtc: '2027-01-01T00:00:00',
  site: { lat: -88.28, lon: -64.31 },
  mastM: 2,
  sky,
  ...o,
});
const elevationDeg = (v: THREE.Vector3) => THREE.MathUtils.radToDeg(Math.asin(v.clone().normalize().y));

/** Three square levels of constant height, coarse to fine, as `shadowLevels` returns them. */
function levels() {
  const level = (n: number, cell: number, h: number) => ({ heights: new Float32Array(n * n).fill(h), width: n, height: n, pxM: cell, siteCol: (n - 1) / 2, siteRow: (n - 1) / 2 });
  return [level(481, 960, 100), level(512, 80, 100), level(1024, 20, 100)];
}

describe('the stand scene', () => {
  it('puts the Sun, Earth and stars on the sky sphere, in the directions of the hour', () => {
    const s = buildScene(flat());
    s.update(0);
    expect(elevationDeg(s.parts.sun.position)).toBeCloseTo(2, 1);
    expect(elevationDeg(new THREE.Vector3().setFromMatrixPosition(s.parts.earth.matrix))).toBeCloseTo(4, 1);
    expect(s.parts.stars.geometry.getAttribute('position').count).toBe(2);
    s.update(2);
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms.uSun.value as THREE.Vector3;
    expect([u.x, u.y, u.z].every(Number.isFinite)).toBe(true);
    expect(elevationDeg(u)).toBeCloseTo(-1, 1);
  });

  it('dims the Sun’s glare as the hills cover the disc, and shows none when they hide it', () => {
    const s = buildScene(flat());
    s.update(0);
    expect((s.parts.glare.material as THREE.SpriteMaterial).opacity).toBeCloseTo(1, 6);
    s.update(1);
    expect((s.parts.glare.material as THREE.SpriteMaterial).opacity).toBeCloseTo(0.4, 6);
    s.update(2);
    expect((s.parts.glare.material as THREE.SpriteMaterial).opacity).toBe(0);
  });

  it('stands the eye on the ground at the site, the mast’s height up', () => {
    const lv = levels();
    const field = terrainField(lv, -64.31, 90);
    const s = buildScene(flat({ field }));
    expect(s.camera.position.y).toBeCloseTo(heightAt(field, 0, 0) + 2, 6);
  });

  it('draws each level as a ring around the finer one, with no gap between them', () => {
    const s = buildScene(flat({ field: terrainField(levels(), -64.31, 100) }));
    expect(s.parts.ground).toHaveLength(3);
    const reach = s.parts.ground.map((g) => {
      const p = g.geometry.getAttribute('position');
      let r = 0;
      for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
      return r / Math.SQRT2; // the half width of the square, in any orientation within a cell
    });
    const holes = s.parts.ground.map((g) => ((g.material as THREE.ShaderMaterial).uniforms.uHole.value as THREE.Vector2).x);
    expect(holes[0]).toBe(0);
    for (let i = 1; i < 3; i++) {
      expect(holes[i]).toBeGreaterThan(0);
      expect(holes[i]).toBeLessThan(reach[i - 1]);
    }
    expect(reach[2]).toBeGreaterThan(120000);
  });

  it('lets an 80 m window reach 20 km and the cap 125 km when a site has no 20 m window', () => {
    const level = (n: number, cell: number) => ({ heights: new Float32Array(n * n), width: n, height: n, pxM: cell, siteCol: (n - 1) / 2, siteRow: (n - 1) / 2 });
    const s = buildScene(flat({ field: terrainField([level(481, 960), level(1024, 80)], 0, 0) }));
    const reach = s.parts.ground.map((g) => {
      const p = g.geometry.getAttribute('position');
      let r = 0;
      for (let i = 0; i < p.count; i++) r = Math.max(r, Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
      return r;
    });
    expect(reach[0]).toBeGreaterThan(20000);
    expect(reach[1]).toBeGreaterThan(120000);
  });

  it('uses the full shadow steps and the drawn detail at full quality, fewer steps and no detail at fast', () => {
    const uniforms = (q: 'full' | 'fast') => (buildScene(flat({ quality: q, field: terrainField(levels(), 0, 100) })).parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    expect(uniforms('full').uSteps.value).toBe(SHADOW.STEPS);
    expect(uniforms('full').uGrowth.value).toBe(SHADOW.GROWTH);
    expect(uniforms('full').uDetail.value).toBe(1);
    expect(uniforms('fast').uSteps.value).toBe(SHADOW_FAST.STEPS);
    expect(uniforms('fast').uGrowth.value).toBe(SHADOW_FAST.GROWTH);
    expect(uniforms('fast').uDetail.value).toBe(0);
  });

  it('puts the labels over the bodies, where the camera looks', () => {
    const s = buildScene(flat());
    s.update(0);
    s.setView(300, 2, 46, 16 / 9);
    const l = s.labels();
    expect(l.sun.visible).toBe(true);
    expect(l.sun.x).toBeCloseTo(0.5, 2);
    expect(l.sun.y).toBeLessThan(0.49); // lifted above the Sun's glare
    expect(l.earth.visible).toBe(false); // 130° away, out of the camera's view
  });

  it('rests the label of a body below the skyline on the skyline, where it is hidden, not down in the ground', () => {
    const low = { ...series, earthEl: Float64Array.from([-3, -3, -3]) } as Series;
    const s = buildScene(flat({ series: low }));
    s.update(0);
    s.setView(70, 0, 60, 16 / 9);
    const e = s.labels().earth;
    expect(e.visible).toBe(true);
    expect(e.y).toBeGreaterThan(0.45);
    expect(e.y).toBeLessThan(0.5); // just above the level skyline, not 3° below it
  });

  it('names the lander where it stands, above its top', () => {
    const s = buildScene(flat({ lander: { azDeg: 60, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    s.setView(60, 0, 40, 16 / 9);
    const l = s.labels().lander!;
    expect(l.visible).toBe(true);
    expect(l.x).toBeCloseTo(0.5, 1);
    expect(l.y).toBeLessThan(0.5);
    expect(buildScene(flat()).labels().lander).toBeNull();
  });

  it('hides a label behind the lander', () => {
    const behind = buildScene(flat({ lander: { azDeg: 300, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    behind.update(0);
    behind.setView(300, 2, 60, 16 / 9);
    expect(behind.labels().sun.visible).toBe(false);
    const aside = buildScene(flat({ lander: { azDeg: 60, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    aside.update(0);
    aside.setView(300, 2, 60, 16 / 9);
    expect(aside.labels().sun.visible).toBe(true);
  });

  it('traces each mesh’s shadows in its own level or coarser ones, so the coarse ground never meets the fine heights it does not show', () => {
    const s = buildScene(flat({ field: terrainField(levels(), 0, 100) }));
    expect(s.parts.ground.map((g) => (g.material as THREE.ShaderMaterial).uniforms.uMinLevel.value)).toEqual([0, 1, 2]);
  });

  it('stores heights outside every level as a finite value below the shadow rule’s cut-off, in half floats too', () => {
    const out = toTextureHeights(Float32Array.from([12.5, -1e6]), true) as Uint16Array;
    expect(THREE.DataUtils.fromHalfFloat(out[0])).toBeCloseTo(12.5, 2);
    const outside = THREE.DataUtils.fromHalfFloat(out[1]);
    expect(Number.isFinite(outside)).toBe(true);
    expect(outside).toBeLessThan(SHADOW.OUTSIDE_BELOW_M);
  });

  it('stands a lander on the ground beside the site for scale, its light on while it has power', () => {
    const powered = Uint8Array.from([1, 1, 0]);
    const field = terrainField(levels(), -64.31, 90);
    const s = buildScene(flat({ field, lander: { azDeg: 90, distM: 9, powered } }));
    const lander = s.parts.lander!;
    expect(lander).toBeTruthy();
    expect(lander.position.x).toBeCloseTo(9, 6); // due east
    expect(lander.position.z).toBeCloseTo(0, 6);
    expect(lander.position.y).toBeCloseTo(heightAt(field, 9, 0), 6);
    s.update(0);
    expect(s.parts.landerLight!.color.getHex()).not.toBe(0x000000);
    s.update(2);
    // Off: a dark bead, not the green.
    expect(s.parts.landerLight!.color.getHex()).toBe(0x2b2e2c);
    // Its shadow on the ground: the shader casts it from the lander's drawn shape, placed and turned with it.
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    expect(u.uLanderOn.value).toBe(1);
    const c = u.uLanderCenter.value as THREE.Vector3;
    expect(c.x).toBeCloseTo(9, 6);
    expect(c.y).toBeCloseTo(heightAt(field, 9, 0), 6);
    expect(u.uLanderMin).toBeUndefined();
    const cs = u.uLanderCS.value as THREE.Vector2;
    expect(cs.x).toBeCloseTo(Math.cos(lander.rotation.y), 9);
    expect(cs.y).toBeCloseTo(Math.sin(lander.rotation.y), 9);
  });

  it('builds the lander from the same numbers its shadow is cast from', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    const meshes: THREE.Mesh[] = [];
    s.parts.lander!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const cyl = (m: THREE.Mesh) => (m.geometry instanceof THREE.CylinderGeometry ? m.geometry.parameters : null);
    // An eight-sided body, not a box.
    const body = meshes.find((m) => cyl(m)?.radialSegments === 8 && cyl(m)?.radiusTop === LANDER.body.r);
    expect(body).toBeTruthy();
    expect(body!.position.y).toBeCloseTo((LANDER.body.y0 + LANDER.body.y1) / 2, 6);
    // A pad under each foot, on the diagonals.
    for (const { foot } of LEG_ENDS) {
      expect(meshes.some((m) => cyl(m)?.radiusBottom === LANDER.legs.padR && Math.abs(m.position.x - foot[0]) < 1e-6 && Math.abs(m.position.z - foot[2]) < 1e-6)).toBe(true);
    }
    // The engine's bell under the body, and the panel where its shadow is cast from.
    expect(meshes.some((m) => cyl(m)?.radiusBottom === LANDER.bell.r)).toBe(true);
    const panel = meshes.find((m) => m.geometry instanceof THREE.BoxGeometry && m.geometry.parameters.width === LANDER.panel.size[0]);
    expect(panel!.position.y).toBeCloseTo(LANDER.panel.c[1], 6);
    expect(panel!.rotation.y).toBeCloseTo((LANDER.panel.yawDeg * Math.PI) / 180, 6);
  });

  it('turns the lander so the Sun lights one of the faces the eye sees', () => {
    const s = buildScene(flat({ lander: { azDeg: 340, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    // Its +x face looks 70° to the left of the Sun the view opens on (300°), towards the eye's side of the Sun.
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(s.parts.lander!.quaternion);
    const az = (THREE.MathUtils.radToDeg(Math.atan2(x.x, -x.z)) + 360) % 360;
    expect(az).toBeCloseTo(230, 6);
  });

  it('draws no lander, and no lander shadow, when none is given', () => {
    const s = buildScene(flat());
    expect(s.parts.lander).toBeNull();
    expect((s.parts.ground[0].material as THREE.ShaderMaterial).uniforms.uLanderOn.value).toBe(0);
  });

  it('lets Earth light the ground at night, like a long exposure, more than by day', () => {
    const night = { ...series, sunFraction: Float64Array.from([1, 0, 0]), sunEl: Float64Array.from([2, -1, -1]), sunAz: Float64Array.from([250, 250, 250]) } as Series;
    const s = buildScene(flat({ series: night }));
    const shine = () => (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms.uEarthshine.value as number;
    s.update(0);
    const day = shine();
    s.update(1);
    expect(shine()).toBeGreaterThan(3 * day);
  });

  it('names the bright stars where they stand in the sky', () => {
    const named = { ...sky, names: [{ index: 0, name: 'Sirius' }] };
    const s = buildScene(flat({ sky: named }));
    s.update(0);
    // Star 0 sits along J2000 x; with the identity rotation that is the site's own sky: find it and look at it.
    const p = s.parts.stars.geometry.getAttribute('position');
    const d = new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).normalize();
    const az = (THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) + 360) % 360, el = THREE.MathUtils.radToDeg(Math.asin(d.y));
    s.setView(az, el, 60, 16 / 9);
    const star = s.labels().stars.find((x) => x.name === 'Sirius')!;
    expect(star.x).toBeCloseTo(0.5, 2);
    expect(star.visible).toBe(el > 0);
  });

  it('draws the Southern Cross between its four stars, and names it', () => {
    const four = { count: 4, j2000: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0.6, 0.8, 0]), vmag: Float32Array.from([1, 1, 1, 1]), bv: Float32Array.from([0, 0, 0, 0]) };
    const names = [{ index: 0, name: 'Acrux' }, { index: 1, name: 'Mimosa' }, { index: 2, name: 'Gacrux' }, { index: 3, name: 'Imai' }];
    const s = buildScene(flat({ sky: { ...sky, stars: four, names } }));
    s.update(0);
    expect(s.parts.cross).not.toBeNull();
    expect(s.parts.cross!.geometry.getAttribute('position').count).toBe(4);
    expect(s.labels().stars.map((x) => x.name)).toContain('Southern Cross');
    expect(buildScene(flat()).parts.cross).toBeNull();
  });

  it('finds where to look up: the middle of the Southern Cross, where the scene draws it, or nothing without its stars', () => {
    const four = { count: 4, j2000: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0.6, 0.8, 0]), vmag: Float32Array.from([1, 1, 1, 1]), bv: Float32Array.from([0, 0, 0, 0]) };
    const names = [{ index: 0, name: 'Acrux' }, { index: 1, name: 'Mimosa' }, { index: 2, name: 'Gacrux' }, { index: 3, name: 'Imai' }];
    const withCross = { ...sky, stars: four, names };
    const scene = flat({ sky: withCross });
    const s = buildScene(scene);
    s.update(5);
    const p = s.parts.stars.geometry.getAttribute('position');
    const mid = new THREE.Vector3();
    for (let k = 0; k < 4; k++) mid.add(new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)).normalize());
    mid.normalize();
    const t = lookUpTarget(withCross, scene.site.lat, scene.site.lon, Date.parse(scene.startUtc + 'Z') + 5 * 3600e3)!;
    expect(t).not.toBeNull();
    const d = dirAzEl(t.az, t.el);
    expect(new THREE.Vector3(...d).angleTo(mid)).toBeLessThan(1e-4);
    expect(lookUpTarget(sky, scene.site.lat, scene.site.lon, Date.parse(scene.startUtc + 'Z'))).toBeNull();
  });

  it('gives the screen positions of the lander’s panel, dish and power light, for their names when the view is close', () => {
    const s = buildScene(flat({ lander: { azDeg: 0, distM: 12, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    s.setView(0, 4, 36, 16 / 9);
    const parts = s.labels().parts!;
    for (const k of ['panel', 'dish', 'lamp'] as const) {
      expect(parts[k].visible).toBe(true);
      expect(Math.abs(parts[k].x - 0.5)).toBeLessThan(0.2);
    }
    // The panel stands above the power light.
    expect(parts.panel.y).toBeLessThan(parts.lamp.y);
    expect(buildScene(flat()).labels().parts).toBeNull();
  });

  it('draws the Sun as a hard disc with only a small glow and no starburst: there is no air to scatter its light', () => {
    const s = buildScene(flat());
    const sprites = s.root.children.filter((o) => (o as THREE.Sprite).isSprite);
    expect(sprites).toHaveLength(2);
    expect(s.parts.glare.scale.x / s.parts.sun.scale.x).toBeLessThan(6);
  });

  it('stands your own shadow on the ground under the eye', () => {
    const field = terrainField(levels(), -64.31, 90);
    const s = buildScene(flat({ field }));
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    const v = u.uViewer.value as THREE.Vector3;
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
    expect(v.y).toBeCloseTo(heightAt(field, 0, 0), 6);
  });

  it('smooths single-row seams in the heights over three cells each way, so they do not ripple the light', () => {
    // A flat level with one row 2 m higher: the steepest normal anywhere stays within 2 m / (12 cells)
    const n = 64, cell = 20, heights = new Float32Array(n * n).fill(100);
    for (let c = 0; c < n; c++) heights[32 * n + c] = 102;
    const level = { heights, width: n, height: n, pxM: cell, siteCol: (n - 1) / 2, siteRow: (n - 1) / 2 };
    const s = buildScene(flat({ field: terrainField([level], -64.31, 100) }));
    const nor = s.parts.ground[0].geometry.getAttribute('normal');
    let worst = 0;
    for (let i = 0; i < nor.count; i++) worst = Math.max(worst, Math.hypot(nor.getX(i), nor.getZ(i)) / nor.getY(i));
    // (plus the Moon's own curve, which the site's frame drops by r² / 2R: a slope of 0.0004 640 m out)
    expect(worst).toBeLessThanOrEqual(2 / (12 * cell) + 0.0005);
  });

  it('lets the stars come out as the view looks up away from the dazzling ground, as a camera would expose for the sky', () => {
    const s = buildScene(flat());
    s.update(0);
    s.setView(250, 0, 60, 16 / 9);
    const ahead = s.starMaterial.uniforms.uGain.value as number;
    s.setView(250, 40, 60, 16 / 9);
    const up = s.starMaterial.uniforms.uGain.value as number;
    expect(up).toBeGreaterThan(2 * ahead);
    expect(up).toBeCloseTo(1.6, 6);
  });

  it('marks your own shadow, and how long it is, while the Sun is up', () => {
    const s = buildScene(flat());
    s.update(0);
    // Facing away from the Sun (at 300 degrees), looking down a little: the shadow lies ahead.
    s.setView(120, -8, 60, 16 / 9);
    const sh = s.labels().shadow!;
    expect(sh.visible).toBe(true);
    // A person 1.8 m tall at a 2 degree Sun.
    expect(sh.lengthM).toBeCloseTo(1.8 / Math.tan((2 * Math.PI) / 180), 0);
    // With none of the Sun in view there is no shadow.
    s.update(2);
    expect(s.labels().shadow).toBeNull();
  });

  it('keeps a light on the lander when neither the Sun nor Earth lights it, so its shape still shows, and only a faint one by day', () => {
    const dark = { ...series, sunFraction: Float64Array.from([0, 0, 0]), sunEl: Float64Array.from([-1, -1, -1]), earthEl: Float64Array.from([-3, -3, -3]), earthVisible: Uint8Array.from([0, 0, 0]) } as Series;
    const s = buildScene(flat({ series: dark, lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([0, 0, 0]) } }));
    s.update(0);
    expect(s.parts.landerFill!.intensity).toBeGreaterThanOrEqual(0.45);
    // A light that is off still shows as a dark bead, not as nothing.
    expect(s.parts.landerLight!.color.getHex()).not.toBe(0x000000);
    // By day the night's floor goes: what is left is the faint fill and Earth's light.
    const day = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    day.update(0);
    expect(day.parts.landerFill!.intensity).toBeLessThan(s.parts.landerFill!.intensity - 0.15);
  });

  it('stops the exposure down looking down-Sun at the sunlit ground, as a camera would, but not towards the Sun, looking up or at night', () => {
    const s = buildScene(flat());
    s.update(0);
    // The Sun is at 300 degrees: facing it, the exposure is as set.
    s.setView(300, 2, 60, 16 / 9);
    expect(s.exposure()).toBeCloseTo(1, 2);
    // Down-Sun the regolith shines back towards the Sun: the camera takes in about a third of the light.
    s.setView(120, -8, 60, 16 / 9);
    expect(s.exposure()).toBeLessThan(0.5);
    expect(s.exposure()).toBeGreaterThanOrEqual(0.35);
    // Looking up, the sky fills the view.
    s.setView(120, 45, 60, 16 / 9);
    expect(s.exposure()).toBeCloseTo(1, 2);
    // At night there is no sunlit ground to stop down for.
    s.update(2);
    s.setView(120, -8, 60, 16 / 9);
    expect(s.exposure()).toBe(1);
  });

  it('shows only the brightest stars by day while the view takes in the sunlit ground', () => {
    const s = buildScene(flat());
    s.update(0);
    s.setView(300, 0, 60, 16 / 9);
    expect(s.starMaterial.uniforms.uGain.value as number).toBeLessThanOrEqual(0.2);
  });

  it('sets boulders round the eye, clear of the lander, and hands their shadows to the ground', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 16, powered: Uint8Array.from([1, 1, 0]) } }));
    const rocks = s.parts.boulders.children;
    expect(rocks.length).toBe(BOULDERS.COUNT);
    for (const r of rocks) expect(Math.hypot(r.position.x - 16, r.position.z)).toBeGreaterThan(4);
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    expect(u.uRockCount.value).toBe(rocks.length);
    expect((u.uRocks.value as THREE.Vector4[])[0].x).toBeCloseTo(rocks[0].position.x, 6);
    // Lit by the scene's lights even with no lander.
    const bare = buildScene(flat());
    expect(bare.parts.boulders.children.length).toBe(BOULDERS.COUNT);
    expect(bare.root.children.some((c) => c instanceof THREE.DirectionalLight)).toBe(true);
    bare.update(0);
    expect((bare.root.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight).intensity).toBeGreaterThan(0);
  });

  it('scatters less light into the shadows the lower the Sun: 1.5 % of it from 8 degrees up, a third of that below', () => {
    expect(bounceShare(10)).toBeCloseTo(0.015, 9);
    expect(bounceShare(8)).toBeCloseTo(0.015, 9);
    expect(bounceShare(2.5)).toBeCloseTo(0.015 * Math.max(0.3, Math.sin((2.5 * Math.PI) / 180) / Math.sin((8 * Math.PI) / 180)), 9);
    expect(bounceShare(0.5)).toBeCloseTo(0.015 * 0.3, 9);
    const s = buildScene(flat());
    s.update(0);
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    expect(u.uBounce.value).toBeCloseTo(bounceShare(2), 9);
  });

  it('lights the ground faintly at night when neither the Sun nor Earth does, and not by day', () => {
    const dark = { ...series, sunFraction: Float64Array.from([0, 0, 0]), sunEl: Float64Array.from([-1, -1, -1]), earthEl: Float64Array.from([-3, -3, -3]), earthVisible: Uint8Array.from([0, 0, 0]) } as Series;
    const night = buildScene(flat({ series: dark }));
    night.update(0);
    expect((night.parts.ground[0].material as THREE.ShaderMaterial).uniforms.uNight.value).toBeGreaterThanOrEqual(0.3);
    const day = buildScene(flat());
    day.update(0);
    expect((day.parts.ground[0].material as THREE.ShaderMaterial).uniforms.uNight.value).toBe(0);
  });

  it('draws the Sun\u2019s disc at its true size, 0.53 degrees, so Earth beside it is plainly four times wider', () => {
    const s = buildScene(flat());
    s.update(0);
    // The disc fills 92 % of its sprite.
    const discDeg = (2 * Math.atan((0.92 * s.parts.sun.scale.x) / 2 / s.parts.sun.position.length()) * 180) / Math.PI;
    expect(discDeg).toBeCloseTo(0.533, 2);
    expect(s.parts.glare.scale.x / s.parts.sun.scale.x).toBeLessThanOrEqual(4.2);
  });

  it('strews pebbles round the eye as shapes the light catches', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 16, powered: Uint8Array.from([1, 1, 0]) } }));
    expect((s.parts.pebbles as THREE.InstancedMesh).count).toBeGreaterThan(200);
  });

  it('measures your shadow along the real ground: shorter up a slope, longer down one, the level length on the flat', () => {
    const tan = (d: number) => Math.tan((d * Math.PI) / 180);
    const level = 1.8 / tan(2.5);
    expect(shadowOnGround(() => 0, 2.5)).toBeCloseTo(level, 0);
    // Rising 2.5 degrees along the shadow: the Sun's ray from your head meets the ground at 1.8 / (tan 2.5 + tan 2.5).
    const up = shadowOnGround((d) => d * tan(2.5), 2.5);
    expect(up).toBeCloseTo(1.8 / (2 * tan(2.5)) / Math.cos((2.5 * Math.PI) / 180), 0);
    expect(shadowOnGround((d) => -d * tan(1), 2.5)).toBeGreaterThan(level * 1.3);
    // Never longer than 500 m.
    expect(shadowOnGround((d) => -d * tan(3), 2.5)).toBe(500);
  });
});
