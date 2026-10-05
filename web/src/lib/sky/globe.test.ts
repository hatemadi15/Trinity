import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { enuBasis, meToWorld, type Vec3 } from './frames';
import { GLOBE, globeGeometry, globeHeightAt, globeMargin, heightsTexture, moonToWorld, type GlobeHeights } from './globe';

const R = 1737400;
/** Heights at pixel centres from a function of latitude and longitude (degrees): row 0 north, column 0 at 180° W. */
const flat = (w = 1440, h = 720, f: (lat: number, lon: number) => number = () => 0): GlobeHeights => {
  const metres = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) metres[r * w + c] = f(90 - ((r + 0.5) * 180) / h, -180 + ((c + 0.5) * 360) / w);
  return { width: w, height: h, metres };
};
const dir = (latDeg: number, lonDeg: number): Vec3 => {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};

describe('the globe', () => {
  it('is a sphere of the Moon-fixed frame whose map coordinates run from 180° W and the south pole', () => {
    const g = globeGeometry(8, 4);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    expect(p.count).toBe(9 * 5);
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 0]);
    expect(p.getZ(0)).toBeCloseTo(-1, 6); // the first row is the south pole
    const mid = 2 * 9 + 4; // the equator at longitude 0
    expect(p.getX(mid)).toBeCloseTo(1, 6);
    expect(p.getY(mid)).toBeCloseTo(0, 6);
    expect(p.getZ(mid)).toBeCloseTo(0, 6);
    // Its triangles face outwards: the first of the cell at the equator's row (row 2), longitude 0 (column 4).
    const i = g.getIndex()!, v = (k: number) => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
    const cell = (2 * 8 + 4) * 6;
    const [a, b, c] = [i.getX(cell), i.getX(cell + 1), i.getX(cell + 2)].map(v);
    expect(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).dot(a)).toBeGreaterThan(0);
  });

  it('puts the site on the world’s origin and the Moon’s centre below it, in the site’s frame', () => {
    const b = enuBasis(-88.28, -64.31), m = moonToWorld(b, 190.33);
    const site = new THREE.Vector3(...b.up).multiplyScalar(R + 190.33).applyMatrix4(m);
    expect(site.length()).toBeLessThan(1e-3);
    expect(new THREE.Vector3(0, 0, 0).applyMatrix4(m).y).toBeCloseTo(-(R + 190.33), 3);
    const north = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const want = meToWorld(b, [0, 0, 1]);
    expect(north.x).toBeCloseTo(want[0], 9);
    expect(north.y).toBeCloseTo(want[1], 9);
    expect(north.z).toBeCloseTo(want[2], 9);
  });

  it('reads heights where the maps put them: row 0 north, column 0 at 180° W, wrapping round', () => {
    const h = flat(360, 180, (lat, lon) => lat * 100 + lon);
    expect(globeHeightAt(h, dir(45.5, 10.5))).toBeCloseTo(4560.5, 6); // a pixel's centre: its own value
    // Across the seam the first column (179.5° W) is the last one's neighbour, not the far side's.
    const seam = flat(360, 180, (_lat, lon) => (lon < -179 ? 1000 : 0));
    expect(globeHeightAt(seam, dir(0.5, 179.9))).toBeCloseTo(400, 6);
  });

  it('works out the shadows by the engine’s rule: a level Moon lets a low Sun through, a wall towards it hides it', () => {
    const at = dir(-60, 0);
    // The Sun `deg` above the local horizon at the point, due north of it.
    const sunUp = (deg: number): Vec3 => {
      const up = new THREE.Vector3(...at), north = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z).normalize();
      const s = up.multiplyScalar(Math.sin((deg * Math.PI) / 180)).addScaledVector(north, Math.cos((deg * Math.PI) / 180));
      return [s.x, s.y, s.z];
    };
    expect(globeMargin(flat(), at, sunUp(2))).toBeGreaterThan(0);
    // A wall 3 km high from 1.5° to 2.5° north of the point (45 to 76 km away) stands up to 3° over its horizon.
    const wall = flat(1440, 720, (lat) => (lat > -58.5 && lat < -57.5 ? 3000 : 0));
    expect(globeMargin(wall, at, sunUp(2))).toBeLessThan(0);
    expect(globeMargin(wall, at, sunUp(5))).toBeGreaterThan(0);
  });

  it('turns the heights upside down for the GPU, so the south pole is at the bottom of the texture as in the maps', () => {
    const h = flat(4, 2, (lat) => (lat > 0 ? 7 : -7));
    const t = heightsTexture(h, false);
    const data = t.image.data as Float32Array;
    expect(Array.from(data.slice(0, 4))).toEqual([-7, -7, -7, -7]);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(GLOBE.CUT_M).toBe(455000);
  });
});
