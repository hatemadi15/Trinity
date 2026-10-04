import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Series } from '@/lib/engine/metrics';
import type { SkyAssets } from '@/lib/data/sky';
import type { GlobeAssets } from '@/lib/data/globe';
import { R_MOON_M } from '@/lib/engine/constants';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { LANDER, LEG_ENDS } from './landerShape';
import { BOULDERS } from './boulders';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { bounceShare, buildScene, lookUpTarget, shadowOnGround, toTextureHeights, type StandScene } from './standRenderer';
import { flatField, heightAt, meshHeightAt, terrainField } from './terrainField';

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

  it('names a body behind the lander over the lander\u2019s top, at the body\u2019s own azimuth, so where it went still shows', () => {
    const behind = buildScene(flat({ lander: { azDeg: 300, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    behind.update(0);
    behind.setView(300, 2, 60, 16 / 9);
    const l = behind.labels();
    expect(l.sun.visible).toBe(true);
    expect(l.sun.x).toBeCloseTo(0.5, 2);
    // Above the lander: its name's spot is over its top.
    expect(l.sun.y).toBeLessThanOrEqual(l.lander!.y + 1e-9);
    // Clear of the lander, the label stays over the body itself.
    const aside = buildScene(flat({ lander: { azDeg: 60, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    aside.update(0);
    aside.setView(300, 2, 60, 16 / 9);
    const a = aside.labels();
    expect(a.sun.visible).toBe(true);
    expect(a.sun.y).toBeGreaterThan(l.sun.y);
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
    expect(lander.position.y).toBeCloseTo(meshHeightAt(field, 9, 0), 6);
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
    expect(c.y).toBeCloseTo(meshHeightAt(field, 9, 0), 6);
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
    // The Sun's disc and its glare travel with the sky, round the camera.
    const sprites = s.parts.sky.children.filter((o) => (o as THREE.Sprite).isSprite);
    expect(sprites).toHaveLength(2);
    // A faint glare four diameters out, no wider.
    expect(s.parts.glare.scale.x / s.parts.sun.scale.x).toBeLessThanOrEqual(7.5);
  });

  it('stands your own shadow on the ground under the eye', () => {
    const field = terrainField(levels(), -64.31, 90);
    const s = buildScene(flat({ field }));
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    const v = u.uViewer.value as THREE.Vector3;
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
    expect(v.y).toBeCloseTo(meshHeightAt(field, 0, 0), 6);
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
    expect(s.parts.landerFill!.intensity).toBeGreaterThanOrEqual(0.35);
    // Neutral grey, not Earth's blue: Earth is down.
    const c = s.parts.landerFill!.color;
    expect(Math.abs(c.r - c.b)).toBeLessThan(0.08);
    // A light that is off still shows as a dark bead, not as nothing.
    expect(s.parts.landerLight!.color.getHex()).not.toBe(0x000000);
    // By day the night's floor goes: what is left is the faint fill and Earth's light.
    const day = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    day.update(0);
    expect(day.parts.landerFill!.intensity).toBeLessThan(s.parts.landerFill!.intensity - 0.15);
  });

  it('stops the exposure down looking down-Sun at the sunlit ground and with the Sun in the frame, as a camera would, but not looking up or at night', () => {
    const s = buildScene(flat());
    s.update(0);
    // The Sun is at 300 degrees: facing it, the camera stops down for the Sun in the frame, so the ground
    // before it is backlit and dark.
    s.setView(300, 2, 60, 16 / 9);
    expect(s.exposure()).toBeCloseTo(0.6, 2);
    // Across the light, with the Sun out of the frame, as set.
    s.setView(30, 2, 60, 16 / 9);
    expect(s.exposure()).toBeGreaterThan(0.7);
    // The Sun near the edge of the frame barely stops it down: the glare is in the corner, not the middle.
    s.setView(300 - 40, 2, 60, 16 / 9);
    expect(s.exposure()).toBeGreaterThan(0.9);
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

  it('shows no stars by day while the view takes in the sunlit ground, as a camera set for it would not', () => {
    const s = buildScene(flat());
    s.update(0);
    s.setView(300, 0, 60, 16 / 9);
    expect(s.starMaterial.uniforms.uGain.value as number).toBeLessThanOrEqual(0.02);
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
    // A faint glare reaches four diameters out; its bright core stays at the disc.
    expect(s.parts.glare.scale.x / s.parts.sun.scale.x).toBeLessThanOrEqual(7.5);
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

  it('leaves the lander\u2019s side away from a low Sun nearly dark by day: little fill from the dust and none from Earth\u2019s blue', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    const lights = s.root.children.filter((o) => (o as THREE.Light).isLight) as THREE.Light[];
    const hemi = lights.find((l) => l instanceof THREE.HemisphereLight)!;
    expect(hemi.intensity).toBeLessThanOrEqual(0.1);
    expect(s.parts.landerFill!.intensity).toBeLessThanOrEqual(0.06);
  });

  it('dresses the lander in gold foil with a broad sheen and stands it on matte pads, so neither an edge nor a foot glints like a lamp', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    const mats = new Set<THREE.MeshStandardMaterial>();
    s.parts.lander!.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) if (x instanceof THREE.MeshStandardMaterial) mats.add(x);
    });
    // Metal, but rough enough that a facet catching the low Sun shows a soft sheen, not a bright line that
    // two readers took for the power light.
    expect([...mats].some((m) => m.name === 'foil' && m.metalness >= 0.7 && m.roughness >= 0.5)).toBe(true);
    expect([...mats].some((m) => m.name === 'pad' && m.metalness <= 0.25)).toBe(true);
  });

  it('puts the power light on the face of the lander the eye sees, and makes it glow while the lander has power', () => {
    // The lander 40 degrees left of the Sun, turned as the view turns it: its +x face 75 degrees left of the Sun.
    const s = buildScene(flat({ lander: { azDeg: 260, distM: 16, powered: Uint8Array.from([1, 1, 0]), faceAzDeg: 225 } }));
    s.update(0);
    s.setView(260, 0, 36, 16 / 9);
    const lander = s.parts.lander!;
    let lamp: THREE.Mesh | null = null;
    lander.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m === s.parts.landerLight) lamp = o as THREE.Mesh;
    });
    expect(lamp).toBeTruthy();
    const at = new THREE.Vector3().setFromMatrixPosition(lamp!.matrixWorld);
    const eye = new THREE.Vector3(0, heightAt(flatField(-64.31), 0, 0) + 2, 0);
    // On the near side: nearer the eye than the lander's middle by most of the body's width.
    expect(at.distanceTo(eye)).toBeLessThan(lander.position.distanceTo(eye) - 0.6);
    // Its name points at it.
    const p = at.clone().project(s.camera);
    const spot = s.labels().parts!.lamp;
    expect(spot.x).toBeCloseTo((p.x + 1) / 2, 6);
    // Lit, it glows (brighter than white, so the camera's bloom catches it); off, a dark bead.
    expect(s.parts.landerLight!.color.g).toBeGreaterThan(1);
    s.update(2);
    expect(s.parts.landerLight!.color.getHex()).toBe(0x2b2e2c);
  });

  it('works out the level length of your shadow from the Sun\u2019s height as the view shows it, so the sum can be checked', () => {
    // The Sun 2.46 degrees up, shown as 2.5: 1.8 m / tan 2.5 degrees, about 41 m, not 1.8 / tan 2.46.
    const shown = { ...series, sunEl: Float64Array.from([2.46, 1, -1]) } as Series;
    const s = buildScene(flat({ series: shown }));
    s.update(0);
    s.setView(120, -8, 60, 16 / 9);
    expect(s.labels().shadow!.levelM).toBeCloseTo(1.8 / Math.tan((2.5 * Math.PI) / 180), 6);
  });

  it('lets the shiny foil mirror only a little of the dust round it by day, so the side away from the Sun stays dark', () => {
    const s = buildScene(flat({ lander: { azDeg: 90, distM: 9, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    expect(s.root.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('stands the eye, the lander and the rocks on the drawn ground, so the eye is never under it, even on the cap\u2019s 960 m cells', () => {
    // A saddle under the eye: the drawn triangles stand 20 m above the smooth height at the site.
    const n = 41, heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = (c + r) % 2 === 0 ? 0 : 40;
    const field = terrainField([{ heights, width: n, height: n, pxM: 960, siteCol: 20.5, siteRow: 20.5 }], -64.31, 0);
    const s = buildScene(flat({ field, lander: { azDeg: 90, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    expect(s.camera.position.y).toBeCloseTo(meshHeightAt(field, 0, 0) + 2, 6);
    expect(s.parts.lander!.position.y).toBeCloseTo(meshHeightAt(field, 16, 0), 6);
    // A rock sits on the drawn ground where it lies.
    const rock = s.parts.boulders.children[0] as THREE.Mesh;
    expect(rock.position.y).toBeGreaterThan(meshHeightAt(field, rock.position.x, rock.position.z) - 1);
  });

  it('keeps the eye at least a person\u2019s eye height above the ground, whatever the mast', () => {
    const s = buildScene(flat({ mastM: 0 }));
    expect(s.camera.position.y - meshHeightAt(flatField(-64.31), 0, 0)).toBeCloseTo(1.5, 6);
    expect(buildScene(flat({ mastM: 6 })).camera.position.y).toBeCloseTo(6, 6);
  });
});

describe('the guides', () => {
  it('draws the Sun’s and Earth’s paths through the period’s hours, faint through the hills and solid over them, and the level horizon all round', () => {
    const s = buildScene(flat());
    const bands = s.parts.guides.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(bands).toHaveLength(5); // the Sun solid and faint, Earth solid and faint, the level line
    const faint = bands.filter((b) => !(b.material as THREE.MeshBasicMaterial).depthTest);
    expect(faint).toHaveLength(3);
    // The Sun's band passes through the hour's direction: the middle of its first pair of corners.
    const p = bands[0].geometry.getAttribute('position');
    const mid = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2);
    expect(elevationDeg(mid)).toBeCloseTo(2, 2);
    expect(p.count).toBe(2 * series.hours);
  });

  it('rings a Sun the hills hide, where it sits, and none while any of it shows', () => {
    const s = buildScene(flat());
    s.update(2); // none of the Sun in view
    expect(s.parts.markers.sun.visible).toBe(true);
    expect(elevationDeg(s.parts.markers.sun.position)).toBeCloseTo(-1, 1);
    s.update(0);
    expect(s.parts.markers.sun.visible).toBe(false);
  });

  it('hides the guides with the words', () => {
    const s = buildScene(flat());
    s.setGuides(false);
    expect(s.parts.guides.visible).toBe(false);
  });

  it('marks the key moments’ days on the paths, for labels', () => {
    const s = buildScene(flat({ marks: [{ hour: 1, body: 'sun', text: '3 Jan' }] }));
    s.update(0);
    s.setView(300, 2, 60, 16 / 9);
    expect(s.labels().marks).toEqual([expect.objectContaining({ text: '3 Jan', visible: true })]);
    s.setGuides(false);
    expect(s.labels().marks).toEqual([expect.objectContaining({ text: '3 Jan', visible: false })]);
  });
});

const globe: GlobeAssets = { color: { low: 'c1.jpg', high: 'c4.jpg' }, normal: { low: 'n1.jpg', high: 'n4.jpg' }, heights: { width: 4, height: 2, metres: new Float32Array(8) }, albedoScale: 0.8, credit: '' };
/** A camera at `position` looking along `look` (straight down by default). */
const at = (position: Vec3, look: Vec3 = [0, -1, 0]) => {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...position), new THREE.Vector3(...position).add(new THREE.Vector3(...look)), new THREE.Vector3(0, 0, -1));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return { position, quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number], fov: 50, shift: [0, 0] as [number, number] };
};

describe('the stand scene in flight', () => {
  it('puts the globe round the site: the Moon’s centre its radius and the site’s height below the site', () => {
    const s = buildScene(flat({ globe, siteHeightM: 190.33 }));
    const m = s.parts.globe!.matrix;
    expect(new THREE.Vector3(0, 0, 0).applyMatrix4(m).y).toBeCloseTo(-(R_MOON_M + 190.33), 3);
    const b = enuBasis(-88.28, -64.31);
    expect(new THREE.Vector3(...b.up).multiplyScalar(R_MOON_M + 190.33).applyMatrix4(m).length()).toBeLessThan(1);
  });

  it('carries the sky with the camera and sees Earth where it is from there, the Sun where it always is', () => {
    const s = buildScene(flat({ globe, siteHeightM: 190.33, earthKm: [384400, 384400, 384400] }));
    s.update(0);
    s.setPose(at([3.0e6, 1.0e6, 0]), 1.6);
    expect(s.parts.sky.position.x).toBeCloseTo(3.0e6, 3);
    // Earth sits in the sky group, which sits on the camera: its place in the group is its direction from the camera.
    const seen = new THREE.Vector3().setFromMatrixPosition(s.parts.earth.matrix).normalize();
    const truth = new THREE.Vector3(...dirAzEl(70, 4)).multiplyScalar(384400e3).add(new THREE.Vector3(0, 2, 0)).sub(new THREE.Vector3(3.0e6, 1.0e6, 0)).normalize();
    expect(seen.angleTo(truth)).toBeLessThan(1e-6);
    // 1,300 km of the camera's offset lies square to Earth's direction: a fifth of a degree of parallax.
    expect(seen.angleTo(new THREE.Vector3(...dirAzEl(70, 4)))).toBeGreaterThan(0.003);
    // The Sun does not move with the camera.
    expect(new THREE.Vector3().copy(s.parts.sun.position).normalize().angleTo(new THREE.Vector3(...dirAzEl(300, 2)))).toBeLessThan(1e-6);
  });

  it('meshes the cap to 205 km with the globe, cut at 200 km in flight and at 125 km once standing, with the skyline ring only standing', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const coarse = s.parts.ground[s.parts.ground.length - 1];
    let reach = 0;
    const p = coarse.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    expect(reach).toBeGreaterThan(200000);
    s.setPose(at([0, 90000, 0]), 1.6);
    expect((coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value).toBe(200000);
    expect(s.parts.ring!.visible).toBe(false);
    s.setView(300, 2, 60, 1.6);
    expect((coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value).toBe(125000);
    expect(s.parts.ring!.visible).toBe(true);
  });

  it('draws the sky and the globe alone before the ground has loaded: no ground, skyline, rocks or lander', () => {
    const s = buildScene(flat({ globe, ground: false, lander: { azDeg: 90, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    expect(s.parts.ground).toHaveLength(0);
    expect(s.parts.ring).toBeNull();
    expect(s.parts.lander).toBeNull();
    expect(s.parts.boulders.children).toHaveLength(0);
    expect(s.parts.globe).not.toBeNull();
  });

  it('keeps the stand view as it was: setView brings the camera back to the eye and the sky to its own size', () => {
    const s = buildScene(flat());
    s.setPose(at([0, 5000, 0]), 1.6);
    s.setView(300, 2, 46, 16 / 9);
    expect([s.camera.position.x, s.camera.position.z]).toEqual([0, 0]);
    expect(s.camera.position.y).toBeCloseTo(2, 6);
    expect(s.parts.sky.position.y).toBeCloseTo(2, 6);
    expect(s.parts.sky.scale.x).toBe(1);
    expect(s.parts.globe).toBeNull();
  });

  it('exposes for the sunlit Moon from space, and as the stand view does at the eye', () => {
    const s = buildScene(flat({ globe, siteHeightM: 0 }));
    s.update(0);
    s.setView(120, 2, 60, 1.6);
    const eye = s.exposure();
    s.setPose(at([0, 7.0e6, 0]), 1.6);
    expect(s.exposure()).toBeCloseTo(1.8, 6);
    s.setView(120, 2, 60, 1.6);
    expect(s.exposure()).toBeCloseTo(eye, 9);
  });

  it('keeps the night’s long-exposure light for the eye: from above, the ground has only the light that is there', () => {
    // Neither the Sun nor Earth in view at the site at hour 2: the eye's night light is on.
    const dark = { ...series, earthEl: Float64Array.from([-3, -3, -3]), earthVisible: Uint8Array.from([0, 0, 0]) } as Series;
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100), series: dark }));
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    s.update(2);
    s.setView(300, 2, 60, 1.6);
    expect(u.uNight.value).toBeGreaterThan(0.3);
    s.setPose(at([0, 90000, 0]), 1.6);
    s.update(2);
    expect(u.uNight.value).toBe(0);
    s.setView(300, 2, 60, 1.6);
    expect(u.uNight.value).toBeGreaterThan(0.3);
  });

  it('draws the measured ground only below 450 km: higher, the globe shows the whole Moon, the pole too', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const cut = (s.parts.globe!.material as THREE.ShaderMaterial).uniforms.uCut;
    s.setPose(at([0, 9.0e5, 0]), 1.6);
    expect(s.parts.ground.every((g) => !g.visible)).toBe(true);
    expect(cut.value).toBeGreaterThan(1);
    s.setPose(at([0, 9.0e4, 0]), 1.6);
    expect(s.parts.ground.every((g) => g.visible)).toBe(true);
    expect(cut.value).toBeCloseTo(Math.cos(200000 / R_MOON_M), 9);
  });

  it('hides a point behind the Moon from a camera in space, and shows one on the near side', () => {
    const s = buildScene(flat({ globe, siteHeightM: 0 }));
    s.setPose(at([0, 4.0e6, 0]), 1.6);
    expect(s.project([0, 0, 0], true).visible).toBe(true); // the site, below the camera
    expect(s.project([0, -2 * R_MOON_M, 0], true).visible).toBe(false); // the far side's pole, behind the Moon
  });
});
