import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Series } from '@/lib/engine/metrics';
import type { SkyAssets } from '@/lib/data/sky';
import type { GlobeAssets } from '@/lib/data/globe';
import { R_MOON_M } from '@/lib/engine/constants';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { NIGHT } from './shaders';
import { LANDER_LIGHT } from './landerMesh';
import { LANDER, LEG_ENDS } from './landerShape';
import { BOULDERS } from './boulders';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { bounceShare, buildScene, lookUpTarget, shadowOnGround, threesOwnTextures, toTextureHeights, type StandScene } from './standRenderer';
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
/** As levels(), with the arrival's cap: 961 cells of 960 m, reaching 460 km each way from the site. */
function wideLevels() {
  const [cap, context, window] = levels();
  return [{ ...cap, heights: new Float32Array(961 * 961).fill(100), width: 961, height: 961, siteCol: 480, siteRow: 480 }, context, window];
}

describe('the stand scene', () => {

  it('lights the rocks and the lander at night from the sky above, tops lighter than sides, and only faintly by day', () => {
    const night = { ...series, sunEl: Float64Array.from([-3, -3, -3]), sunFraction: Float64Array.from([0, 0, 0]), earthEl: Float64Array.from([-6, -6, -6]), earthVisible: Uint8Array.from([0, 0, 0]) } as Series;
    const s = buildScene(flat({ series: night, lander: { azDeg: 60, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    const fill = s.parts.landerFill as THREE.HemisphereLight;
    expect(fill).toBeInstanceOf(THREE.HemisphereLight);
    expect(fill.groundColor.getHex()).toBe(0x060607);
    expect(fill.intensity).toBeCloseTo(0.03 + NIGHT.SKY * 0.35, 6);
    // The sunlit dust's fill in the lander's shade: none at night, three times the rest of the view by day.
    expect(s.parts.landerDust!.value).toBe(1);
    const day = buildScene(flat({ lander: { azDeg: 60, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    day.update(0);
    expect((day.parts.landerFill as THREE.HemisphereLight).intensity).toBeCloseTo(0.03, 6);
    expect(day.parts.landerDust!.value).toBe(LANDER_LIGHT.DUST);
    expect(buildScene(flat()).parts.landerDust).toBeNull();
  });
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
    const holes = s.parts.ground.map((g) => (g.material as THREE.ShaderMaterial).uniforms.uHoleR.value as number);
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

  it('stores heights outside every level as a finite value below the shadow rule’s cut-off, in half floats too', () => {
    const out = toTextureHeights(Float32Array.from([12.5, -1e6]), true) as Uint16Array;
    expect(THREE.DataUtils.fromHalfFloat(out[0])).toBeCloseTo(12.5, 2);
    const outside = THREE.DataUtils.fromHalfFloat(out[1]);
    expect(Number.isFinite(outside)).toBe(true);
    expect(outside).toBeLessThan(SHADOW.OUTSIDE_BELOW_M);
  });

  it('names the lander over its top whenever it is in view, however it is turned and wherever it stands round you', () => {
    // The lander stands where the view opens (16.3), turned by the landing hour's Sun: every turn, on either side.
    const hidden: string[] = [];
    for (let face = 0; face < 360; face += 15)
      for (const at of [0, 25, 335]) {
        const s = buildScene(flat({ lander: { azDeg: at, distM: 16, powered: Uint8Array.from([1, 1, 1]), faceAzDeg: face } }));
        s.update(0);
        s.setView(0, 2, 60, 16 / 9);
        const l = s.labels();
        if (l.landerBox && !l.lander!.visible) hidden.push(`turned ${face}°, at ${at}°`);
      }
    expect(hidden).toEqual([]);
  });

  it('names the lander over its top when it stands up a slope from you, as on a hillside', () => {
    // A cone 40 % steep round the site: the lander, 16 m out, stands about 6 m higher than your feet.
    const n = 1024, cell = 20, mid = (n - 1) / 2;
    const heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = 100 + 0.4 * cell * Math.hypot(c - mid, r - mid);
    const level = { heights, width: n, height: n, pxM: cell, siteCol: mid, siteRow: mid };
    const s = buildScene(flat({ field: terrainField([level], -64.31, 100), lander: { azDeg: 0, distM: 16, powered: Uint8Array.from([1, 1, 1]), faceAzDeg: 45 } }));
    s.update(0);
    s.setView(0, 10, 60, 16 / 9);
    const l = s.labels();
    expect(l.landerBox).not.toBeNull();
    expect(l.lander!.visible).toBe(true);
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

  it('gives the box round the lander on the screen, for the labels to keep off its body, and none when it is out of view', () => {
    const s = buildScene(flat({ lander: { azDeg: 0, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(0);
    s.setView(0, 0, 60, 16 / 9);
    const l = s.labels(), box = l.landerBox!;
    expect(box).toBeTruthy();
    // Every corner of every part of the lander lies in it, and it is no wider than the lander's legs and panel.
    s.root.updateMatrixWorld(true);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    s.parts.lander!.traverse((o) => {
      const p = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute('position') : null;
      for (let k = 0; p && k < p.count; k++) {
        const q = new THREE.Vector3().fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld).project(s.camera);
        left = Math.min(left, (q.x + 1) / 2);
        right = Math.max(right, (q.x + 1) / 2);
        top = Math.min(top, (1 - q.y) / 2);
        bottom = Math.max(bottom, (1 - q.y) / 2);
      }
    });
    expect(box.left).toBeLessThanOrEqual(left);
    expect(box.right).toBeGreaterThanOrEqual(right);
    expect(box.top).toBeLessThanOrEqual(top);
    expect(box.bottom).toBeGreaterThanOrEqual(bottom);
    expect(box.right - box.left).toBeLessThan(1.6 * (right - left));
    expect(box.bottom - box.top).toBeLessThan(1.3 * (bottom - top));
    // Its name sits over the box, its parts in it.
    expect(l.lander!.y).toBeLessThanOrEqual(box.top);
    for (const p of Object.values(l.parts!)) expect(p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom).toBe(true);
    // Behind the camera, or no lander: none.
    s.setView(180, 0, 60, 16 / 9);
    expect(s.labels().landerBox).toBeNull();
    expect(buildScene(flat()).labels().landerBox).toBeNull();
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
    expect(guideBands(s)).toHaveLength(5); // the Sun solid and faint, Earth solid and faint, the level line
    // The Sun's bands pass through the hour's direction: the middle of their first pair of corners.
    for (const b of [band(s, SUN_BAND, false), band(s, SUN_BAND, true)]) {
      const p = b.geometry.getAttribute('position');
      const mid = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2);
      expect(elevationDeg(mid)).toBeCloseTo(2, 2);
      expect(p.count).toBe(2 * series.hours);
    }
  });

  it('draws the faint bands and the rings through the near ground and the hills alike, the level horizon only where it clears them, at their own angular sizes, and the lander after them, so it covers them', () => {
    const s = buildScene(flat({ lander: { azDeg: 300, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(2); // the Sun hidden: its ring shows
    s.setView(300, 2, 60, 16 / 9);
    s.root.updateMatrixWorld(true);
    const eye = s.camera.position;
    const world = (b: THREE.Mesh, k: number) => new THREE.Vector3().fromBufferAttribute(b.geometry.getAttribute('position'), k).applyMatrix4(b.matrixWorld);
    // Not tested against the depth of what is drawn before them: the slope a few metres uphill hides them no more than
    // the far hills do, so the labels that name them always point at them.
    for (const b of [band(s, SUN_BAND, true), band(s, EARTH_BAND, true)]) {
      expect(basic(b).depthTest).toBe(false);
      // 0.15 degrees tall.
      expect(THREE.MathUtils.radToDeg(world(b, 0).sub(eye).angleTo(world(b, 1).sub(eye)))).toBeCloseTo(0.15, 4);
    }
    // The level horizon is tested against what is drawn before it: the hills hide it, as both readers asked (16.3).
    expect(basic(levelBand(s)).depthTest).toBe(true);
    expect(THREE.MathUtils.radToDeg(world(levelBand(s), 0).sub(eye).angleTo(world(levelBand(s), 1).sub(eye)))).toBeCloseTo(0.15, 4);
    // The solid bands stay on the sky, beyond the far skyline (200 km), which hides them where the hills do.
    for (const b of [band(s, SUN_BAND, false), band(s, EARTH_BAND, false)]) {
      expect(basic(b).depthTest).toBe(true);
      expect(world(b, 0).distanceTo(eye)).toBeGreaterThan(250000);
    }
    // The rings, at their own angular sizes.
    expect(s.parts.markers.sun.visible).toBe(true);
    for (const [ring, deg] of [[s.parts.markers.sun, 1.6], [s.parts.markers.earth, 2.8]] as const) {
      expect((ring.material as THREE.SpriteMaterial).depthTest).toBe(false);
      const away = new THREE.Vector3().setFromMatrixPosition(ring.matrixWorld).distanceTo(eye);
      const size = new THREE.Vector3().setFromMatrixScale(ring.matrixWorld).x;
      expect(THREE.MathUtils.radToDeg(2 * Math.atan(size / 2 / away))).toBeCloseTo(deg, 6);
    }
    // The lander draws after every guide, so it covers them where it stands in front of them; solid, and tested against
    // the depth of the ground drawn before it, so the hills still hide it as they hide the rest.
    const lander = drawn(s.parts.lander!);
    expect(lander.length).toBeGreaterThan(20);
    // Every part of it drawn with the solid things, the guides as well (blended over what is drawn before them, by the
    // same sum as three.js's normal blending): a lander drawn in three.js's transparent pass went missing from the
    // arrival's view after the flight had passed over the cap.
    for (const part of lander) expect(part.material.transparent).toBe(false);
    for (const guide of [...drawn(s.parts.guides), ...drawn(s.parts.rings)]) {
      expect(guide.material.transparent).toBe(false);
      expect(guide.material.blending).toBe(THREE.CustomBlending);
    }
    for (const part of lander) {
      expect([part.material.opacity, part.material.depthTest, part.material.depthWrite]).toEqual([1, true, true]);
      for (const guide of [...drawn(s.parts.guides), ...drawn(s.parts.rings)]) expect(drawsAfter(part, guide)).toBe(true);
      for (const ground of [...s.parts.ground, s.parts.ring!].flatMap(drawn)) {
        expect(ground.material.depthWrite).toBe(true);
        expect(drawsAfter(part, ground)).toBe(true);
      }
    }
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

  it('keeps the rings on hidden bodies with the labels, apart from the guides, and with them by default as the arrival has them', () => {
    const s = buildScene(flat());
    s.update(2); // none of the Sun in view: its ring shows
    s.setGuides(false, true, true);
    expect(s.parts.guides.visible).toBe(false);
    expect(s.parts.rings.visible).toBe(true);
    expect(s.parts.markers.sun.visible).toBe(true);
    expect(s.parts.markers.sun.parent).toBe(s.parts.rings);
    s.setGuides(true, true, false);
    expect(s.parts.guides.visible).toBe(true);
    expect(s.parts.rings.visible).toBe(false);
    s.setGuides(false);
    expect(s.parts.rings.visible).toBe(false);
    s.setGuides(true, false);
    expect(s.parts.rings.visible).toBe(true);
  });

  it('names the level horizon at the left-most stretch of it in view that clears the hills, 3 degrees or more long, and nowhere when none does', () => {
    // A hill 2 degrees high from 240 to 290 degrees round; elsewhere the skyline lies half a degree below level.
    const el = Array.from({ length: 720 }, (_, k) => (k / 2 >= 240 && k / 2 < 290 ? 2 : -0.5));
    const s = buildScene(flat({ mask: { az0: 0, step: 0.5, el } }));
    s.update(0);
    s.setView(300, 2, 60, 16 / 9); // the view from about 254 to 346 degrees round
    const at = s.labels().level!;
    expect(at.visible).toBe(true);
    // At the hill's right foot, 290 degrees, within half a degree (the scan's step, and the mask's nearest sample).
    const foot = (az: number) => {
      const p = new THREE.Vector3(...dirAzEl(az, 0)).multiplyScalar(1000).add(s.camera.position).project(s.camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    };
    expect(at.x).toBeGreaterThanOrEqual(foot(289.5).x);
    expect(at.x).toBeLessThanOrEqual(foot(290.5).x);
    expect(at.y).toBeCloseTo(foot(290).y, 2);
    // A crater: the skyline above level all round, so no stretch of the line shows.
    const deep = buildScene(flat({ mask: { az0: 0, step: 0.5, el: new Array(720).fill(1) } }));
    deep.update(0);
    deep.setView(300, 2, 60, 16 / 9);
    expect(deep.labels().level ?? null).toBeNull();
    // A stretch shorter than 3 degrees is no place for a name: an open notch 2 degrees wide in the hill.
    const notch = Array.from({ length: 720 }, (_, k) => (k / 2 >= 300 && k / 2 < 302 ? -0.5 : 2));
    const n = buildScene(flat({ mask: { az0: 0, step: 0.5, el: notch } }));
    n.update(0);
    n.setView(300, 2, 60, 16 / 9);
    expect(n.labels().level ?? null).toBeNull();
    // None with the guides hidden, or with the level horizon left out.
    s.setGuides(false);
    expect(s.labels().level ?? null).toBeNull();
    s.setGuides(true, false);
    expect(s.labels().level ?? null).toBeNull();
  });

  it('marks the key moments’ days on the paths, for labels', () => {
    const s = buildScene(flat({ marks: [{ hour: 1, body: 'sun', text: '3 Jan' }] }));
    s.update(0);
    s.setView(300, 2, 60, 16 / 9);
    expect(s.labels().marks).toEqual([expect.objectContaining({ text: '3 Jan', visible: true })]);
    s.setGuides(false);
    expect(s.labels().marks).toEqual([expect.objectContaining({ text: '3 Jan', visible: false })]);
  });

  it('names each path on a stretch of it that shows: in view, clear of the fading ends, above the level horizon and away from its body, and only with the guides', () => {
    // The Sun goes once round in the month, 2 degrees above and below the level horizon by turns; Earth loops round
    // 70 degrees, 4 degrees up.
    const sunAz = (h: number) => (300 + (h * 360) / 708.73) % 360, sunEl = (h: number) => 2 * Math.sin((2 * Math.PI * h) / 120);
    const earthAz = (h: number) => 70 + 7 * Math.sin((2 * Math.PI * h) / 655), earthEl = (h: number) => 4 + 6 * Math.cos((2 * Math.PI * h) / 680);
    const s = buildScene(flat({ series: hourly(1000, sunAz, sunEl, earthAz, earthEl) }));
    s.update(10); // the month drawn: hours 0 to 708
    s.setView(300, 2, 60, 16 / 9);
    const [sun, earth] = s.labels().pathNames!;
    expect([sun.text, earth.text]).toEqual(["Sun's path this month", "Earth's path this month"]);
    expect(sun.body).toBe('sun');
    expect(sun.visible).toBe(true);
    // On the Sun's path, in the month drawn but clear of the day fading at either end, above the level horizon, and
    // 10 degrees or more from the Sun itself, whose own label names it.
    const h = hourOnPath(s, sun, sunAz, sunEl, 1000);
    expect(h).toBeGreaterThanOrEqual(24);
    expect(h).toBeLessThanOrEqual(708 - 24);
    expect(sunEl(h)).toBeGreaterThan(0);
    expect(THREE.MathUtils.radToDeg(new THREE.Vector3(...dirAzEl(sunAz(h), sunEl(h))).angleTo(new THREE.Vector3(...dirAzEl(sunAz(10), sunEl(10)))))).toBeGreaterThanOrEqual(10);
    expect(Math.abs(sun.x - 0.5)).toBeLessThan(0.4);
    // Earth's loop is behind the camera: no name; facing it, its name on it.
    expect(earth.visible).toBe(false);
    s.setView(70, 4, 60, 16 / 9);
    const e = s.labels().pathNames![1];
    expect(e.visible).toBe(true);
    expect(earthEl(hourOnPath(s, e, earthAz, earthEl, 1000))).toBeGreaterThan(0);
    // Hidden with the words.
    s.setGuides(false);
    expect(s.labels().pathNames!.map((n) => n.visible)).toEqual([false, false]);
  });

  it('names the paths above their lines when asked, as the arrival shows them: Earth’s over the top of its loop, the Sun’s away from Earth’s loop', () => {
    // Earth loops 14 degrees round 70, from 5 below level to 7 above; the Sun skims the horizon once round.
    const sunAz = (h: number) => (300 + (h * 360) / 708.73) % 360, sunEl = (h: number) => 1.5 + Math.sin((2 * Math.PI * h) / 120);
    const earthAz = (h: number) => 70 + 7 * Math.sin((2 * Math.PI * h) / 655), earthEl = (h: number) => 1 + 6 * Math.cos((2 * Math.PI * h) / 680);
    const s = buildScene(flat({ series: hourly(1000, sunAz, sunEl, earthAz, earthEl) }));
    s.update(340); // Earth at the foot of its loop, the Sun at 113 degrees
    s.setView(70, 3, 60, 16 / 9);
    const [sun, earth] = s.labels({ above: true }).pathNames!;
    // Earth's at the loop's top, so none of the loop runs through the name over it.
    expect(earth.visible).toBe(true);
    expect(earthEl(hourOnPath(s, earth, earthAz, earthEl, 1000))).toBeGreaterThan(5.5);
    // The Sun's 12 degrees or more round from any of Earth's loop, so it is never read as naming the loop.
    expect(sun.visible).toBe(true);
    const az = sunAz(hourOnPath(s, sun, sunAz, sunEl, 1000));
    expect(az < 63 - 12 || az > 77 + 12).toBe(true);
  });

  it('gathers the paths’ names towards the middle it is given, as the arrival asks for the side its words leave free', () => {
    const sunAz = (h: number) => (300 + (h * 360) / 708.73) % 360;
    const s = buildScene(flat({ series: hourly(1000, sunAz, () => 2, () => 70, () => 4) }));
    s.update(10);
    s.setView(300, 2, 60, 16 / 9);
    const middle = s.labels({ above: true }).pathNames![0], right = s.labels({ above: true, middle: 0.72 }).pathNames![0];
    expect(right.visible).toBe(true);
    expect(Math.abs(right.x - 0.72)).toBeLessThan(0.05);
    expect(right.x).toBeGreaterThan(middle.x + 0.1);
  });

  it('dots each path where the hills hide it, as the chart below dots the hidden Sun: the faint band in dashes, the solid band whole', () => {
    const s = buildScene(flat({ series: hourly(100, (h) => (300 + h * 0.5) % 360, () => 2, (h) => 70 + h * 0.05, () => 4) }));
    const on = (b: THREE.Mesh) => pieces(b).map((t) => t.length > 0);
    const faintSun = on(band(s, SUN_BAND, true)), solidSun = on(band(s, SUN_BAND, false)), faintEarth = on(band(s, EARTH_BAND, true));
    // The Sun's in dashes two hours long (about a degree), Earth's, slower, sixteen hours long.
    expect(faintSun.slice(0, 8)).toEqual([true, true, false, false, true, true, false, false]);
    expect(faintEarth.slice(0, 33)).toEqual(Array.from({ length: 33 }, (_, h) => Math.floor(h / 16) % 2 === 0));
    expect(solidSun.slice(0, 8).every(Boolean)).toBe(true);
    // The level horizon all round, whole.
    expect(on(levelBand(s)).every(Boolean)).toBe(true);
  });

  it('hides the level horizon alone when asked, as the arrival does, the paths still shown', () => {
    const s = buildScene(flat());
    s.setGuides(true, false);
    expect(levelBand(s).visible).toBe(false);
    expect(pathBands(s).every((b) => b.visible)).toBe(true);
    s.setGuides(true);
    expect(levelBand(s).visible).toBe(true);
  });

  it('names a path on a stretch of it the lander does not hide', () => {
    // The lander due north, 16 m away; the Sun's path passes behind it, 2 degrees up, the Sun itself far round.
    const sunAz = (h: number) => (100 + (h * 360) / 708.73) % 360;
    const s = buildScene(flat({ lander: { azDeg: 0, distM: 16, powered: new Uint8Array(1000).fill(1) }, series: hourly(1000, sunAz, () => 2, () => 70, () => 4) }));
    s.update(10);
    s.setView(0, 2, 60, 16 / 9);
    const l = s.labels(), box = l.landerBox!, sun = l.pathNames![0];
    expect(sun.visible).toBe(true);
    expect(hourOnPath(s, sun, sunAz, () => 2, 1000)).toBeGreaterThanOrEqual(0);
    expect(sun.x < box.left || sun.x > box.right || sun.y < box.top || sun.y > box.bottom).toBe(true);
    // Still as near the middle of the view as that allows.
    expect(Math.min(Math.abs(sun.x - box.left), Math.abs(sun.x - box.right))).toBeLessThan(0.01);
  });

  it('names a path below the level horizon where all of it in view is, as through a dip in the skyline', () => {
    // From a high point the skyline lies 3 degrees below level all round, and the Sun circles a degree below level.
    const mask = { az0: 0, step: 0.5, el: new Array(720).fill(-3) };
    const sunAz = (h: number) => (300 + (h * 360) / 708.73) % 360;
    const s = buildScene(flat({ mask, series: hourly(800, sunAz, () => -1, () => 70, () => 4) }));
    s.update(10);
    s.setView(300, 0, 60, 16 / 9);
    const sun = s.labels().pathNames![0];
    expect(sun.visible).toBe(true);
    expect(hourOnPath(s, sun, sunAz, () => -1, 800)).toBeGreaterThanOrEqual(24);
  });

  it('shows a moment’s chip only while its hour lies on the stretch of path drawn', () => {
    const s = buildScene(flat({ series: hourly(1000, (h) => (300 + (h * 360) / 708.73) % 360, () => 2, () => 70, () => 4), marks: [{ hour: 900, body: 'sun', text: 'late' }] }));
    // Facing where the Sun stands at hour 900 both times.
    s.setView((300 + (900 * 360) / 708.73) % 360, 2, 60, 16 / 9);
    s.update(10); // the stretch drawn: hours 0 to 708
    expect(s.labels().marks![0].visible).toBe(false);
    s.update(800); // now round hour 800, up to the period's end
    expect(s.labels().marks![0].visible).toBe(true);
  });

  it('draws one synodic month of each path round the hour, so a period longer than a month never shows a path twice', () => {
    // 30 days: longer than the 708.7 hours from one new Moon to the next, after which the Sun's path comes round
    // again a little higher or lower and reads as two lines.
    const s = buildScene(flat({ series: hourly(720, (h) => (300 + (h * 360) / 708.73) % 360, (h) => 2 - h / 700, (h) => 70 + h / 100, (h) => 4 + Math.sin(h / 50)) }));
    for (const t of [2, 360.4, 717.6]) {
      s.update(t);
      for (const b of pathBands(s)) {
        // The hours at the two ends of the pieces drawn, six indices an hour: a whole month, never more, round the hour.
        const first = b.geometry.drawRange.start / 6, last = first + b.geometry.drawRange.count / 6;
        expect(last - first).toBeLessThan(708.73);
        expect(last - first).toBeGreaterThanOrEqual(708);
        expect(first).toBeLessThanOrEqual(t);
        expect(last).toBeGreaterThanOrEqual(t);
      }
    }
    // A period of a month or less draws whole; the level horizon goes all round whatever the hour.
    const short = buildScene(flat());
    short.update(1);
    for (const b of pathBands(short)) expect(b.geometry.drawRange).toEqual({ start: 0, count: 6 * (series.hours - 1) });
    const level = levelBand(s);
    expect(level.geometry.drawRange.count).toBeGreaterThanOrEqual(level.geometry.getIndex()!.count);
  });

  it('fades each path out over the first and last day of the month drawn, as the month follows the hour, so its two ends meeting read as no break or step', () => {
    const s = buildScene(flat({ series: hourly(1000, (h) => (300 + (h * 360) / 708.73) % 360, () => 2, (h) => 70 + Math.sin(h / 50), () => 4) }));
    const alpha = (b: THREE.Mesh, h: number) => {
      const c = b.geometry.getAttribute('color');
      return [c.getW(2 * h), c.getW(2 * h + 1)];
    };
    // Round hour 10 the month drawn is hours 0 to 708; round hour 800, hours 291 to 999.
    for (const [t, first, last] of [[10, 0, 708], [800, 291, 999]]) {
      s.update(t);
      for (const b of pathBands(s)) {
        expect(b.geometry.drawRange.start / 6).toBe(first);
        expect(basic(b).vertexColors).toBe(true);
        expect(alpha(b, first)).toEqual([0, 0]);
        expect(alpha(b, last)).toEqual([0, 0]);
        expect(alpha(b, first + 12)[0]).toBeCloseTo(0.5, 6);
        expect(alpha(b, last - 6)[1]).toBeCloseTo(0.25, 6);
        expect(alpha(b, first + 24)).toEqual([1, 1]);
        expect(alpha(b, (first + last) / 2)).toEqual([1, 1]);
        // White corners: the band keeps its own colour.
        const c = b.geometry.getAttribute('color');
        expect([c.getX(2 * first + 2), c.getY(2 * first + 2), c.getZ(2 * first + 2)]).toEqual([1, 1, 1]);
      }
    }
    // The colours and opacities stay: the Sun's amber and Earth's blue, solid and faint.
    expect(pathBands(s).map((b) => [basic(b).color.getHex(), basic(b).opacity])).toEqual([[SUN_BAND, 0.9], [SUN_BAND, 0.3], [EARTH_BAND, 0.9], [EARTH_BAND, 0.3]]);
  });

  it('draws nothing of a path below the level horizon, where it would run under the ground, and all of it above', () => {
    // The Sun circles once in two days, dipping 3 degrees below the level horizon and coming back; Earth stays 4
    // degrees up for a day, then lies just under the horizon, where its band's upper edge would peek over it.
    const sunEl = (h: number) => 3 * Math.cos((2 * Math.PI * (h + 0.87)) / 48), earthEl = (h: number) => (h < 24 ? 4 : -0.05);
    const s = buildScene(flat({ series: hourly(48, (h) => (h * 7.5) % 360, sunEl, (h) => 70 + h / 2, earthEl) }));
    s.update(0);
    const [sun, sunFaint, earth, earthFaint] = pathBands(s);
    for (const [b, el, dash] of [[sun, sunEl, 0], [sunFaint, sunEl, 2], [earth, earthEl, 0], [earthFaint, earthEl, 16]] as const) {
      const drawn = pieces(b);
      // No triangle drawn wholly below the level horizon, not even where the path goes down through it...
      expect(drawn.flat().filter((t) => t.every((v) => v.y < 0))).toHaveLength(0);
      drawn.forEach((tris, i) => {
        // ... nothing of an hour's piece whose two ends both lie below it, and the whole of each piece above it (the
        // faint bands' in their dashes).
        if (el(i) < 0 && el(i + 1) < 0) expect(tris).toHaveLength(0);
        if (el(i) > 0 && el(i + 1) > 0) expect(tris).toHaveLength(inDash(dash, i) ? 2 : 0);
      });
    }
  });

  it('keeps a path where it shows below the level horizon, through a dip in the skyline: there it is in the sky, not under the ground', () => {
    // From a high point the skyline can dip below level: here 2 degrees deep from 60 to 100 degrees round. Earth
    // lies 1 degree below level, from 50 to 110 degrees round.
    const mask = { az0: 0, step: 0.5, el: Array.from({ length: 720 }, (_, k) => (k * 0.5 >= 60 && k * 0.5 <= 100 ? -2 : 0)) };
    const earthAz = (h: number) => 50 + 1.25 * h;
    const s = buildScene(flat({ mask, series: hourly(48, (h) => 300 + h / 10, () => 2, earthAz, () => -1) }));
    s.update(0);
    for (const [b, dash] of [[pathBands(s)[2], 0], [pathBands(s)[3], 16]] as const) {
      pieces(b).forEach((tris, i) => {
        // In the dip, where Earth shows, its path draws (the faint band in its dashes); on either side, under the
        // ground, nothing.
        if (earthAz(i) > 61 && earthAz(i + 1) < 99) expect(tris).toHaveLength(inDash(dash, i) ? 2 : 0);
        if (earthAz(i + 1) < 59 || earthAz(i) > 101) expect(tris).toHaveLength(0);
      });
    }
  });
});

/** A series of `hours` hours with the Sun and Earth along the given azimuths and heights, both in view all the while. */
function hourly(hours: number, sunAz: (h: number) => number, sunEl: (h: number) => number, earthAz: (h: number) => number, earthEl: (h: number) => number): Series {
  const of = (f: (h: number) => number) => Float64Array.from({ length: hours }, (_, h) => f(h));
  return { i0: 0, hours, sunAz: of(sunAz), sunEl: of(sunEl), earthAz: of(earthAz), earthEl: of(earthEl), sunFraction: of(() => 1), earthVisible: new Uint8Array(hours).fill(1), sunAu: of(() => 1) } as Series;
}
type Built = ReturnType<typeof buildScene>;
const basic = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial;
/** The guides' bands, wherever they hang in the guides' group. */
const guideBands = (s: Built) => {
  const out: THREE.Mesh[] = [];
  s.parts.guides.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
/** The Sun's band and Earth's, by their colours. */
const SUN_BAND = 0xf6b646, EARTH_BAND = 0x74adff;
/** A path's band: solid (over the hills) or faint (through them). */
const band = (s: Built, colour: number, faint: boolean) => guideBands(s).find((b) => basic(b).color.getHex() === colour && (basic(b).opacity < 0.5) === faint)!;
/** The guides' four path bands, in order: the Sun's solid and faint, Earth's solid and faint. */
const pathBands = (s: Built) => [band(s, SUN_BAND, false), band(s, SUN_BAND, true), band(s, EARTH_BAND, false), band(s, EARTH_BAND, true)];
/** The level horizon's band, white all round. */
const levelBand = (s: Built) => guideBands(s).find((b) => basic(b).color.getHex() === 0xffffff)!;
/** The hour of a path whose place on the screen a label marks, or -1 when it marks none. */
const hourOnPath = (s: Built, at: { x: number; y: number }, az: (h: number) => number, el: (h: number) => number, hours: number) => {
  for (let h = 0; h < hours; h++) {
    const p = new THREE.Vector3(...dirAzEl(az(h), el(h))).multiplyScalar(1000).add(s.camera.position).project(s.camera);
    if (Math.abs((p.x + 1) / 2 - at.x) < 1e-6 && Math.abs((1 - p.y) / 2 - at.y) < 1e-6) return h;
  }
  return -1;
};
/**
 * What three.js draws for each mesh and sprite in an object, one for each of its materials, with what sorts it: the
 * renderOrder of the group round it (the nearest THREE.Group above it), its own, and its material.
 */
type Drawn = { object: THREE.Object3D; material: THREE.Material; group: number };
const drawn = (o: THREE.Object3D): Drawn[] => {
  const out: Drawn[] = [];
  o.traverse((x) => {
    if (!(x as THREE.Mesh).isMesh && !(x as THREE.Sprite).isSprite) return;
    let group = 0;
    for (let p = x.parent; p; p = p.parent) {
      if ((p as THREE.Group).isGroup) {
        group = p.renderOrder;
        break;
      }
    }
    const m = (x as THREE.Mesh).material;
    for (const material of Array.isArray(m) ? m : [m]) out.push({ object: x, material, group });
  });
  return out;
};
/**
 * Whether three.js draws `a` after `b`, as its render lists sort them: everything solid first, then everything
 * transparent; within each, by the renderOrder of the group round it, then by its own. (Only then by distance, which
 * this leaves out: two that tie on those count as neither after the other.)
 */
const drawsAfter = (a: Drawn, b: Drawn) => {
  const key = (d: Drawn) => [d.material.transparent ? 1 : 0, d.group, d.object.renderOrder];
  const [x, y] = [key(a), key(b)];
  const i = x.findIndex((v, k) => v !== y[k]);
  return i >= 0 && x[i] > y[i];
};
/** Whether an hour's piece of a band drawn in dashes `dash` hours long (0: whole) falls in a dash, not a gap. */
const inDash = (dash: number, i: number) => dash === 0 || Math.floor(i / dash) % 2 === 0;
/** Each hour's piece of a band, as its triangles that draw anything (those with an area), each as its three corners. */
const pieces = (b: THREE.Mesh) => {
  const p = b.geometry.getAttribute('position'), index = b.geometry.getIndex()!;
  return Array.from({ length: index.count / 6 }, (_, i) =>
    [0, 3]
      .map((o) => [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, index.getX(6 * i + o + j))))
      .filter((t) => new THREE.Triangle(t[0], t[1], t[2]).getArea() > 0),
  );
};

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

  it('meshes the cap to 205 km with the globe, the ring beyond it cut at 455 km in flight, and the cap at 125 km once standing, with the skyline only standing', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const coarse = s.parts.ground[2], ring = s.parts.ground[3];
    let reach = 0;
    const p = coarse.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    expect(reach).toBeGreaterThan(200000);
    const farCut = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms.uFarCut.value;
    s.setPose(at([0, 90000, 0]), 1.6);
    expect(farCut(coarse)).toBeGreaterThan(1e8);
    expect(farCut(ring)).toBe(455000);
    expect(s.parts.ring!.visible).toBe(false);
    s.setView(300, 2, 60, 1.6);
    expect(farCut(coarse)).toBe(125000);
    expect(s.parts.ring!.visible).toBe(true);
    // The skyline is the eye's own horizon: 60 m up, the near crests already drop below it, so it waits for the last metres.
    s.setPose(at([0, 60, 0]), 1.6);
    expect(farCut(coarse)).toBeGreaterThan(1e8);
    expect(s.parts.ring!.visible).toBe(false);
    s.setPose(at([0, 5, 0]), 1.6);
    expect(farCut(coarse)).toBe(125000);
    expect(s.parts.ring!.visible).toBe(true);
  });

  it('casts no one’s shadow in flight: the arrival’s camera is not a person standing at the site', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    for (const g of s.parts.ground) expect(((g as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uViewer.value.x).toBeGreaterThan(1e6);
    // Standing in the stand view, your own shadow at your feet.
    const stand = buildScene(flat({ field: terrainField(levels(), -64.31, 100) }));
    for (const g of stand.parts.ground) expect(((g as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uViewer.value.x).toBe(0);
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

  it('draws the measured ground only below 1600 km: higher, the globe shows the whole Moon, the pole too', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const cut = (s.parts.globe!.material as THREE.ShaderMaterial).uniforms.uCut;
    s.setPose(at([0, 2.0e6, 0]), 1.6);
    expect(s.parts.ground.every((g) => !g.visible)).toBe(true);
    expect(cut.value).toBeGreaterThan(1);
    // Over the pole for the month's sweep, 900 km up: the measured ground, the globe only beyond 455 km.
    s.setPose(at([0, 9.0e5, 0]), 1.6);
    expect(s.parts.ground.every((g) => g.visible)).toBe(true);
    expect(cut.value).toBeCloseTo(Math.cos(455000 / R_MOON_M), 9);
  });

  it('gives the shadows no bounce from the sunlit dust round the eye once aloft, so the night side far off stays black', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const u = (s.parts.ground[0].material as THREE.ShaderMaterial).uniforms;
    s.update(0); // the Sun up at the site
    s.setView(300, 2, 60, 1.6);
    expect(u.uBounce.value).toBeGreaterThan(0);
    s.setPose(at([0, 9.0e4, 0]), 1.6);
    expect(u.uBounce.value).toBe(0);
  });

  it('turns the globe’s colour beside the measured ground into the ground’s own grey, so the cut leaves no step in brightness', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const g = (s.parts.globe!.material as THREE.ShaderMaterial);
    expect(g.fragmentShader).toMatch(/mix\(vec3\(0\.17, 0\.164, 0\.156\)[^;]*uBlendM/);
    s.setPose(at([0, 9.0e5, 0]), 1.6);
    expect(g.uniforms.uBlendM.value).toBe(455000);
    s.setPose(at([0, 9.0e6, 0]), 1.6);
    expect(g.uniforms.uBlendM.value).toBeLessThan(0);
  });

  it('lights the night side faintly by Earth from the air, the measured ground and the globe alike, so it reads as ground and their join shows no ring', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100), series: hourly(3, () => 300, () => -5, () => 70, () => -6) }));
    const ground = (s.parts.ground[2].material as THREE.ShaderMaterial).uniforms, sphere = (s.parts.globe!.material as THREE.ShaderMaterial).uniforms;
    s.update(0); // the Sun and Earth both below the site's horizon
    s.setView(300, 2, 60, 1.6);
    expect(ground.uEarthshine.value).toBe(0); // standing: Earth is down here
    s.setPose(at([0, 9.0e5, 0]), 1.6);
    // From the air each slope takes Earth's light as it faces Earth; the globe the same, by the same rule.
    expect(ground.uEarthshine.value).toBeGreaterThan(0);
    expect(sphere.uEarthshine.value).toBeCloseTo(ground.uEarthshine.value, 9);
    expect((s.parts.globe!.material as THREE.ShaderMaterial).fragmentShader).toContain('uEarthshine * 0.9 * mue / (mue + mu)');
  });

  it('draws the far craters on every level of the measured ground, the near detail on the finest alone, and neither when the view is set to fast', () => {
    const full = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const u = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms;
    expect(full.parts.ground.map((g) => u(g).uFarDetail.value)).toEqual([1, 1, 1, 1]);
    expect(full.parts.ground.map((g) => u(g).uDetail.value)).toEqual([1, 0, 0, 0]);
    const fast = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100), quality: 'fast' }));
    expect(fast.parts.ground.map((g) => u(g).uFarDetail.value)).toEqual([0, 0, 0, 0]);
  });

  it('meshes the cap out to 455 km in flight, the part beyond 205 km as a ring of cells twice as wide, so the pole view is all measured ground', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(wideLevels(), -64.31, 100) }));
    expect(s.parts.ground).toHaveLength(4);
    const ring = s.parts.ground[3], inner = s.parts.ground[2];
    const p = ring.geometry.getAttribute('position');
    let reach = 0;
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    expect(reach).toBeGreaterThan(455000);
    expect(p.count).toBeLessThan(300000); // 1920 m cells: a quarter of the 960 m grid's
    const farCut = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms.uFarCut.value;
    s.setPose(at([0, 9.0e5, 0]), 1.6);
    expect(farCut(ring)).toBe(455000);
    expect(farCut(inner)).toBeGreaterThan(1e8); // the ring carries on from its edge
    // Standing: the inner cap to 125 km and the far skyline, as in the stand view; no ring.
    s.setView(300, 2, 60, 1.6);
    expect(farCut(inner)).toBe(125000);
    expect(ring.visible).toBe(false);
  });

  it('draws the faint bands and the rings through the ground at the arrival’s end too, the level horizon only where it clears the hills, at their own angular sizes where the sky is scaled up round the camera, and the lander after them', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, lander: { azDeg: 300, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    s.update(2);
    // Standing at the eye, looking north.
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, -1), new THREE.Vector3(0, 1, 0)));
    s.setPose({ position: [0, 2, 0], quaternion: [q.x, q.y, q.z, q.w], fov: 60, shift: [0, 0] }, 1.6);
    expect(s.parts.sky.scale.x).toBeGreaterThan(10);
    s.root.updateMatrixWorld(true);
    const eye = s.camera.position;
    const world = (b: THREE.Mesh, k: number) => new THREE.Vector3().fromBufferAttribute(b.geometry.getAttribute('position'), k).applyMatrix4(b.matrixWorld);
    for (const b of [band(s, SUN_BAND, true), band(s, EARTH_BAND, true)]) {
      expect(basic(b).depthTest).toBe(false);
      expect(THREE.MathUtils.radToDeg(world(b, 0).sub(eye).angleTo(world(b, 1).sub(eye)))).toBeCloseTo(0.15, 4);
    }
    // The level horizon is tested against what is drawn before it here too, the hills hiding it (16.3).
    expect(basic(levelBand(s)).depthTest).toBe(true);
    expect(THREE.MathUtils.radToDeg(world(levelBand(s), 0).sub(eye).angleTo(world(levelBand(s), 1).sub(eye)))).toBeCloseTo(0.15, 4);
    expect((s.parts.markers.sun.material as THREE.SpriteMaterial).depthTest).toBe(false);
    const away = new THREE.Vector3().setFromMatrixPosition(s.parts.markers.sun.matrixWorld).distanceTo(eye);
    const size = new THREE.Vector3().setFromMatrixScale(s.parts.markers.sun.matrixWorld).x;
    expect(THREE.MathUtils.radToDeg(2 * Math.atan(size / 2 / away))).toBeCloseTo(1.6, 6);
    // The solid bands stay with the sky, far beyond the measured ground.
    const solid = band(s, SUN_BAND, false);
    expect(world(solid, 0).distanceTo(eye)).toBeGreaterThan(1e6);
    // The lander covers them here as in the stand view.
    for (const part of drawn(s.parts.lander!)) for (const guide of [...drawn(s.parts.guides), ...drawn(s.parts.rings)]) expect(drawsAfter(part, guide)).toBe(true);
  });

  it('hides a point behind the Moon from a camera in space, and shows one on the near side', () => {
    const s = buildScene(flat({ globe, siteHeightM: 0 }));
    s.setPose(at([0, 4.0e6, 0]), 1.6);
    expect(s.project([0, 0, 0], true).visible).toBe(true); // the site, below the camera
    expect(s.project([0, -2 * R_MOON_M, 0], true).visible).toBe(false); // the far side's pole, behind the Moon
  });
});

describe('what a renderer that goes gives back', () => {
  it('finds the textures three hands to the materials itself and keeps for the page (its shading table), once each', () => {
    const table = new THREE.DataTexture(new Uint16Array(16 * 16 * 2), 16, 16), own = new THREE.Texture();
    const metal = new THREE.MeshStandardMaterial(), foil = new THREE.MeshStandardMaterial({ map: own }), plain = new THREE.ShaderMaterial();
    const root = new THREE.Scene();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), metal), new THREE.Mesh(new THREE.BoxGeometry(), [foil, plain]));
    // The renderer's own uniforms for each material, as three keeps them: the table on the physically based ones.
    const uniforms = new Map<object, unknown>([
      [metal, { uniforms: { dfgLUT: { value: table } } }],
      [foil, { uniforms: { dfgLUT: { value: table }, map: { value: own } } }],
    ]);
    const found = threesOwnTextures(root, { get: (o: object) => uniforms.get(o) ?? {} });
    expect(found).toEqual([table]);
  });
});
