import * as THREE from 'three';
import { dirAzEl, type Vec3 } from './frames';
import { LANDER, LEG_ENDS, PODS, TANKS } from './landerShape';

/*
 * The lander drawn beside the site, from the numbers its shadow is cast from (landerShape.ts), with the textures of
 * its foil and its solar panel, and the way its surfaces take the light (LANDER_LIGHT).
 */

const DEG = Math.PI / 180;

/** A texture drawn on a canvas of the given size (repeating), or none outside a browser. */
function surface(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, colour = true): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) return null;
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A point `share` of the way from a to b. */
const lerp3 = (a: Vec3, b: Vec3, share: number): Vec3 => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share];

/** Seeded random numbers (Park and Miller's generator): the same seed gives the same texture. */
const parkMiller = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/**
 * Crinkled foil, over a square tile SIZE pixels wide that wraps and covers TILE_M metres of foil: CREASES folds laid at
 * random, each a straight crease LENGTH pixels long, fading out towards its ends, that the sheet slopes away from on
 * both sides (a ridge or a valley) out to WIDTH pixels, by SLOPE (height over distance). Where they cross, the sheet
 * breaks into small flat facets between sharp creases, as crumpled foil does, so a face catching the Sun shows glints
 * and streaks instead of one even sheen. The colour maps darken the valleys and lighten the ridges by up to SHADE.
 */
const CRINKLE = { SIZE: 256, TILE_M: 0.5, CREASES: 240, LENGTH: [24, 90], WIDTH: [4, 12], SLOPE: [0.06, 0.2], SHADE: 0.08 } as const;

/** The crinkle's normal map (tangent space) and its heights' shade (-1 to 1), from a seed. */
function crinkle(seed: number): { normal: THREE.DataTexture; shade: Float32Array } {
  const { SIZE: N, CREASES, LENGTH, WIDTH, SLOPE } = CRINKLE, rnd = parkMiller(seed);
  const pick = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * rnd();
  const h = new Float32Array(N * N), wrap = (i: number) => ((i % N) + N) % N;
  for (let c = 0; c < CREASES; c++) {
    const cx = N * rnd(), cy = N * rnd(), turn = Math.PI * rnd(), ux = Math.cos(turn), uy = Math.sin(turn);
    const half = pick(LENGTH) / 2, wide = pick(WIDTH), slope = pick(SLOPE) * (rnd() < 0.5 ? -1 : 1), reach = Math.ceil(half + wide);
    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y++) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, along = Math.abs(dx * ux + dy * uy), across = Math.abs(dy * ux - dx * uy);
        if (across >= wide || along >= half) continue;
        // Full along most of the crease, fading out over its last third.
        h[wrap(y) * N + wrap(x)] += slope * (wide - across) * Math.min(1, 3 * (1 - along / half));
      }
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const data = new Uint8Array(N * N * 4), shade = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, sx = (h[y * N + wrap(x + 1)] - h[y * N + wrap(x - 1)]) / 2, sy = (h[wrap(y + 1) * N + x] - h[wrap(y - 1) * N + x]) / 2;
      const n = 1 / Math.hypot(sx, sy, 1);
      data.set([(0.5 - 0.5 * sx * n) * 255, (0.5 - 0.5 * sy * n) * 255, (0.5 + 0.5 * n) * 255, 255], i * 4);
      shade[i] = (2 * (h[i] - lo)) / Math.max(hi - lo, 1e-6) - 1;
    }
  }
  const normal = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;
  normal.generateMipmaps = true;
  normal.anisotropy = 4;
  normal.needsUpdate = true;
  return { normal, shade };
}

/** A foil's colour over the crinkle's tile: `rgb` (sRGB, 0 to 255), each large facet lighter or darker by up to SHADE. */
function foilColour(shade: Float32Array, rgb: [number, number, number]): THREE.DataTexture {
  const data = new Uint8Array(shade.length * 4);
  for (let i = 0; i < shade.length; i++) {
    const k = 1 + CRINKLE.SHADE * shade[i];
    data.set([Math.min(255, rgb[0] * k), Math.min(255, rgb[1] * k), Math.min(255, rgb[2] * k), 255], i * 4);
  }
  const t = new THREE.DataTexture(data, CRINKLE.SIZE, CRINKLE.SIZE, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** The back of the solar panel: a plain pale sheet in a thin frame with one spar, so it never reads as cells. */
const panelBackTexture = () =>
  surface(256, 192, (g) => {
    g.fillStyle = '#9fa1a6';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#6c6e73';
    g.fillRect(0, 0, 256, 5);
    g.fillRect(0, 187, 256, 5);
    g.fillRect(0, 0, 5, 192);
    g.fillRect(251, 0, 5, 192);
    g.fillRect(126, 0, 4, 192);
  });

/** Solar cells: dark blue squares between thin silver lines; the back of the panel is a grey frame. */
const cellsTexture = () =>
  surface(256, 192, (g) => {
    g.fillStyle = '#c9ccd2';
    g.fillRect(0, 0, 256, 192);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      g.fillStyle = (r + c) % 3 === 0 ? '#16264a' : '#1b2d57';
      g.fillRect(4 + c * 31.5, 4 + r * 31, 28.5, 28);
      g.fillStyle = 'rgba(200,210,230,0.25)';
      g.fillRect(4 + c * 31.5, 4 + r * 31 + 13.5, 28.5, 1);
    }
  });

/**
 * How the lander's surfaces take the light, beyond three.js's own. GLINT_MAX is the most any of them shines
 * (luminance, linear, before the exposure), under the bloom pass's threshold (0.985), so no glint of the Sun on foil or
 * metal ever blooms into what reads as a light (only the power light blooms); highlights brighter than GLINT_KNEE are
 * pressed smoothly down towards it (glintCap). DUST is how much more of the sunlit dust below them they take in than
 * the rest of the view (the light all round's lower half, as diffuse and as reflection), by day: their undersides and
 * shaded sides filled, as in photographs of landers on the Moon; at night the dust is not lit and the factor is 1
 * (landerDust).
 */
export const LANDER_LIGHT = { GLINT_MAX: 0.9, GLINT_KNEE: 0.5, DUST: 3 } as const;

/** The dust's fill on the lander for the share of the Sun's disc that is up: 1 with none of it, DUST with all of it. */
export function landerDust(sunFraction: number): number {
  return 1 + (LANDER_LIGHT.DUST - 1) * sunFraction;
}

/**
 * A surface's brightness (luminance) after the cap on glints: unchanged up to GLINT_KNEE, then rising ever more slowly
 * towards GLINT_MAX and never above it, smoothly (just past the knee as steeply as before). The lander's shader does
 * the same to what each of its surfaces sends to the eye (landerLook).
 */
export function glintCap(l: number): number {
  const { GLINT_MAX: top, GLINT_KNEE: knee } = LANDER_LIGHT;
  return l <= knee ? l : knee + (top - knee) * (1 - Math.exp((knee - l) / (top - knee)));
}

/** Gives a lander material the cap on its glints (glintCap) and the dust's fill from below, its factor read from `dust`. */
function landerLook<M extends THREE.MeshStandardMaterial>(m: M, dust: { value: number }): M {
  const knee = LANDER_LIGHT.GLINT_KNEE.toFixed(3), span = (LANDER_LIGHT.GLINT_MAX - LANDER_LIGHT.GLINT_KNEE).toFixed(3);
  m.onBeforeCompile = (s) => {
    s.uniforms.uDust = dust;
    s.fragmentShader = `uniform float uDust;\n${s.fragmentShader}`
      // The light all round, as diffuse and as reflection: its lower half is the dust, which is all of it that is lit.
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tiblIrradiance *= uDust; radiance *= uDust;')
      // The cap, last, on what the surface sends to the eye, as glintCap: its colour scaled to the capped luminance.
      .replace(
        '#include <opaque_fragment>',
        `{ float l = luminance(outgoingLight); if (l > ${knee}) outgoingLight *= (${knee} + ${span} * (1.0 - exp((${knee} - l) / ${span}))) / l; }\n#include <opaque_fragment>`,
      );
  };
  // All the lander's materials are changed alike, so they may share their compiled shaders.
  m.customProgramCacheKey = () => 'lander-look';
  return m;
}

/**
 * A small solar lander, drawn for scale (not measured), from the numbers its shadow is cast from (LANDER): an
 * eight-sided body in crinkled foil, gold on the faces towards ±x and ±z and silver on the diagonals, with a black
 * skirt round its foot and a thin trim up each corner; a white radiator with louvres on the -z face; four propellant
 * tanks under it round the engine's bell; four inverted-tripod legs (a main strut with its shock absorber, two side
 * struts, a dish-shaped pad); a thruster pod with three nozzles over each leg; a deck with payloads of several sizes,
 * a star tracker, an omni antenna and a camera; an upright solar panel in a frame, with its hinge and a brace, facing
 * the Sun the view opens on; an antenna dish pointing at Earth; and a lamp whose colour shows its power. It stands
 * `distM` from the eye towards `azDeg`, turned so that its +x face looks towards `faceAzDeg`; its local origin is the
 * ground under its centre. `dust` is the dust's fill, one value for all its materials but the lamp's: 1 until the
 * hour sets it (landerDust).
 */
export function buildLander(azDeg: number, distM: number, faceAzDeg: number, earthAzDeg: number, earthElDeg: number) {
  const group = new THREE.Group();
  const a = azDeg * DEG;
  group.position.set(distM * Math.sin(a), 0, -distM * Math.cos(a));
  // Its +x face towards faceAzDeg: three's turn about y by θ points local +x at azimuth 90° − θ.
  group.rotation.y = (90 - faceAzDeg) * DEG;
  const dust = { value: 1 };
  const std = (o: THREE.MeshStandardMaterialParameters) => landerLook(new THREE.MeshStandardMaterial(o), dust);
  // The foils: one crinkle for all, its colour maps in gold and silver, and black Kapton for the skirt. Foil is
  // shiny: it mirrors the black sky and the grey dust, and its creases catch the Sun in glints and streaks. The gold is
  // rough enough that a face catching a low Sun shows a soft sheen, not a bright line, which two readers took for the
  // power light.
  const crumple = typeof document === 'undefined' ? null : crinkle(7);
  const goldMap = crumple && foilColour(crumple.shade, [217, 171, 74]), silverMap = crumple && foilColour(crumple.shade, [200, 203, 208]);
  const normalMap = crumple?.normal ?? null, crease = new THREE.Vector2(1, 1);
  const gold = std({ name: 'foil', color: goldMap ? 0xffffff : 0xd4a640, map: goldMap, normalMap, normalScale: crease, metalness: 0.8, roughness: 0.5 });
  const silver = std({ name: 'silver', color: silverMap ? 0xffffff : 0xc8cbd0, map: silverMap, normalMap, normalScale: crease, metalness: 0.9, roughness: 0.36 });
  const kapton = std({ name: 'kapton', color: 0x1c1c1f, normalMap, normalScale: crease, metalness: 0.3, roughness: 0.45 });
  // The pads are matte, so the feet do not sparkle.
  const pad = std({ name: 'pad', color: 0x8d8d88, metalness: 0.15, roughness: 0.85 });
  // Struts, trims and the deck: bare metal, which catches a low Sun along its edges; the deck's rim in flat facets.
  const metal = std({ name: 'metal', color: 0xb4b4b0, metalness: 0.85, roughness: 0.32 });
  const facetMetal = std({ name: 'deck', color: 0xa3a39e, metalness: 0.6, roughness: 0.45, flatShading: true });
  const titanium = std({ name: 'tank', color: 0x9ea1a6, metalness: 0.85, roughness: 0.3 });
  const polished = std({ name: 'louvre', color: 0xd8d9dc, metalness: 1, roughness: 0.22 });
  const dark = std({ name: 'dark', color: 0x2c2c2e, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const white = std({ name: 'white', color: 0xc9c7c2, metalness: 0.05, roughness: 0.8 });
  const cellMap = cellsTexture(), backMap = panelBackTexture();
  const cells = std({ color: cellMap ? 0xffffff : 0x1d2b4f, map: cellMap, metalness: 0.35, roughness: 0.28 });
  const panelBack = std({ color: backMap ? 0xffffff : 0xb9bcc2, map: backMap, metalness: 0.2, roughness: 0.6 });
  // For the sides of a shape that other parts cover: never drawn.
  const hidden = new THREE.MeshBasicMaterial({ name: 'hidden', visible: false });
  const add = (m: THREE.Mesh, x: number, y: number, z: number, to: THREE.Object3D = group) => {
    m.position.set(x, y, z);
    to.add(m);
    return m;
  };
  /** A round rod from p to q (in `to`'s frame), 12-sided so its rims are smooth lines. */
  const rod = (p: Vec3, q: Vec3, r: number, mat: THREE.Material, to: THREE.Object3D = group, sides = 12) => {
    const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, P.distanceTo(Q), sides), mat);
    m.position.copy(P).add(Q).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), P.clone().sub(Q).normalize());
    to.add(m);
    return m;
  };
  /** Turned so that its local +z looks out along the direction phi (radians from +x towards +z). */
  const facing = <T extends THREE.Object3D>(m: T, phi: number): T => {
    m.rotation.y = Math.PI / 2 - phi;
    return m;
  };
  const L = LANDER;
  const bodyH = L.body.y1 - L.body.y0, apothem = L.body.r * Math.cos(Math.PI / 8), side = 2 * L.body.r * Math.sin(Math.PI / 8);
  // The body: its eight-sided prism as its shadow is cast (its flat faces towards ±x, ±z and the diagonals). Only its
  // underside is drawn, dark: the foil faces below are its sides, and the deck covers its top.
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.body.r, L.body.r, bodyH, 8, 1, false, Math.PI / 8), [hidden, hidden, dark]), 0, L.body.y0 + bodyH / 2, 0).name = 'body';
  // Its eight faces, each a flat sheet of crinkled foil with its own piece of the crinkle (its UVs offset at random),
  // the crinkle at its own scale (CRINKLE.TILE_M); gold on the faces towards ±x and ±z, silver on the diagonals. Flat,
  // so a face catching the Sun lights as one sheet broken by its creases, not as one band round a cylinder.
  const pick = parkMiller(3), tile = CRINKLE.TILE_M, skirtH = 0.14;
  for (let k = 0; k < 8; k++) {
    const phi = (k * Math.PI) / 4, geo = new THREE.PlaneGeometry(side, bodyH), uv = geo.getAttribute('uv');
    const du = pick(), dv = pick();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (side / tile) + du, uv.getY(i) * (bodyH / tile) + dv);
    const face = add(facing(new THREE.Mesh(geo, k % 2 === 0 ? gold : silver), phi), Math.cos(phi) * apothem, L.body.y0 + bodyH / 2, Math.sin(phi) * apothem);
    face.name = k % 2 === 0 ? 'foil-gold' : 'foil-silver';
    // A black skirt skirtH high round the foot of the body, 3 mm proud of it, and a thin metal trim up each corner,
    // which a low Sun picks out.
    const skirt = new THREE.PlaneGeometry(side + 0.004, skirtH), suv = skirt.getAttribute('uv');
    for (let i = 0; i < suv.count; i++) suv.setXY(i, suv.getX(i) * (side / tile) + dv, suv.getY(i) * (skirtH / tile) + du);
    add(facing(new THREE.Mesh(skirt, kapton), phi), Math.cos(phi) * (apothem + 0.003), L.body.y0 + skirtH / 2, Math.sin(phi) * (apothem + 0.003));
    const c = phi + Math.PI / 8;
    add(facing(new THREE.Mesh(new THREE.BoxGeometry(0.026, bodyH, 0.026), metal), c), Math.cos(c) * L.body.r, L.body.y0 + bodyH / 2, Math.sin(c) * L.body.r);
  }
  // The deck on top: a plate a little wider than the body, its rim faceted.
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.deck.r, L.deck.r, L.deck.y1 - L.deck.y0, 8, 1, false, Math.PI / 8), facetMetal), 0, (L.deck.y0 + L.deck.y1) / 2, 0);
  // The radiator on the -z face: a white panel, and over its lower part a bank of eight polished louvre blades in a
  // frame, each turned 35° about the vertical. The bank (`lv`) is w by h, its middle y below the panel's and z out
  // from the face.
  const rad = facing(new THREE.Group(), -Math.PI / 2);
  rad.position.set(0, L.body.y0 + bodyH * 0.48, -apothem);
  group.add(rad);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.02), white), 0, 0, 0.012, rad);
  const lv = { w: 0.5, h: 0.3, y: -0.15, z: 0.04 };
  for (const [x, y, w, h] of [[0, lv.y + lv.h / 2, lv.w, 0.014], [0, lv.y - lv.h / 2, lv.w, 0.014], [lv.w / 2, lv.y, 0.014, lv.h], [-lv.w / 2, lv.y, 0.014, lv.h]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), metal), x, y, lv.z, rad);
  }
  for (let k = 0; k < 8; k++) {
    const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.006, lv.h - 0.02, 0.05), polished), -lv.w / 2 + (k + 0.5) * (lv.w / 8), lv.y, lv.z, rad);
    blade.rotation.y = 35 * DEG;
  }
  // The engine's bell under the body.
  const bell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, L.bell.r, L.bell.y1 - L.bell.y0, 20, 1, true), dark), 0, (L.bell.y0 + L.bell.y1) / 2, 0);
  bell.name = 'bell';
  // The propellant tanks round it, each with a dark ring round its middle where it is held, and a strut from its top
  // up to the body's underside.
  for (const t of TANKS) {
    add(new THREE.Mesh(new THREE.SphereGeometry(L.tanks.r, 28, 18), titanium), ...t).name = 'tank';
    add(new THREE.Mesh(new THREE.TorusGeometry(L.tanks.r + 0.004, 0.012, 6, 36).rotateX(Math.PI / 2), dark), ...t);
    rod([t[0], t[1] + L.tanks.r * 0.8, t[2]], [t[0] * 0.9, L.body.y0, t[2] * 0.9], 0.018, metal);
  }
  // The legs: a main strut from high on the diagonal face down to the foot, its shock absorber's sleeve (r 0.05) over
  // its upper 56 % and its piston (r 0.033) below, a dark collar between, and a dark fitting where it meets the face;
  // two side struts from its knee (a dark ball) to the body's lower corners; a ball joint over the pad. The pad is a
  // dish, its rounded underside (`padCurve`, from 4 cm across at the ground out to padR) closed by a flat top `rim`
  // high, padH up.
  const rim = 0.015;
  const padCurve = Array.from({ length: 7 }, (_, k) => {
    const s = k / 6;
    return new THREE.Vector2(0.04 + (L.legs.padR - 0.04) * Math.sin((s * Math.PI) / 2), (L.legs.padH - rim) * s * s);
  });
  padCurve.unshift(new THREE.Vector2(0, 0));
  for (const { top, foot, knee, corners } of LEG_ENDS) {
    const at = (s: number) => lerp3(top, foot, s);
    rod(top, at(0.56), 0.05, metal).name = 'strut';
    rod(at(0.5), foot, 0.033, metal);
    rod(at(0.53), at(0.59), 0.06, dark);
    for (const c of corners) rod(knee, c, L.legs.sideR, metal);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8), dark), ...knee);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), dark), top[0] * (apothem / L.legs.top[0]), top[1], top[2] * (apothem / L.legs.top[0])).rotation.y = Math.atan2(top[0], top[2]);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), metal), ...foot);
    rod([foot[0], 0.02, foot[2]], [foot[0], foot[1], foot[2]], 0.028, metal);
    add(new THREE.Mesh(new THREE.LatheGeometry(padCurve, 28), pad), foot[0], 0, foot[2]).name = 'pad';
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.legs.padR, L.legs.padR, rim, 28), pad), foot[0], L.legs.padH - rim / 2, foot[2]);
  }
  // A thruster pod over each leg, just under the deck's rim: a block with three small nozzles (open cones, 0.055 long),
  // one down and one to either side.
  for (const c of PODS) {
    const pod = facing(new THREE.Group(), Math.atan2(c[2], c[0]));
    pod.position.set(...c);
    group.add(pod);
    const [out, up, across] = L.pods.size;
    add(new THREE.Mesh(new THREE.BoxGeometry(across, up, out), dark), 0, 0, 0, pod).name = 'pod';
    const nozzle = () => new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.055, 12, 1, true), dark);
    add(nozzle(), 0, -up / 2 - 0.027, 0.01, pod);
    for (const s of [-1, 1]) add(nozzle(), s * (across / 2 + 0.027), 0, 0.01, pod).rotation.z = s * (Math.PI / 2);
  }
  // Payloads on the deck (white, dark, gold and silver), a star tracker with its baffle looking up and out (tilted 40°
  // from the vertical towards +x), an omni antenna on a thin mast, and a camera on a short one.
  const payload = [white, dark, gold, silver];
  L.boxes.forEach((b, i) => add(new THREE.Mesh(new THREE.BoxGeometry(...b.size), payload[i]), ...b.c));
  const tr = L.tracker;
  add(new THREE.Mesh(new THREE.BoxGeometry(tr.size, tr.size, tr.size), dark), ...tr.c);
  const baffle = add(new THREE.Mesh(new THREE.CylinderGeometry(tr.baffleR, tr.baffleR * 0.8, tr.baffleL, 14, 1, true), dark), tr.c[0] + 0.05, tr.c[1] + 0.07, tr.c[2]);
  baffle.rotation.z = -40 * DEG;
  rod([L.omni.x, L.deck.y1, L.omni.z], [L.omni.x, L.omni.y1, L.omni.z], L.omni.r, metal);
  add(new THREE.Mesh(new THREE.ConeGeometry(L.omni.tipR, 0.07, 14), white), L.omni.x, L.omni.y1 + 0.03, L.omni.z);
  rod([L.camera.x, L.deck.y1, L.camera.z], [L.camera.x, L.camera.y1, L.camera.z], L.camera.r, metal);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.13), dark), L.camera.x, L.camera.y1 + 0.05, L.camera.z);
  // The solar panel faces the opening Sun: local +z looks 90° right of local +x (faceAzDeg + 90), the Sun is
  // 70° left of local +x, so the panel turns 20° towards +x; its cells are on that +z side. On it, turned with it: a
  // metal frame round it (bars 3 cm wide, 12 mm deeper than the panel) with a spar down its middle, and a hinge where
  // it meets its mast. A brace runs from the deck 0.45 m behind it up to its back, 0.3 m below its middle.
  const [pw, ph, pt] = L.panel.size;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pt), [metal, metal, metal, metal, cells, panelBack]);
  panel.position.set(...L.panel.c);
  panel.rotation.y = L.panel.yawDeg * DEG;
  group.add(panel);
  for (const [x, y, w, h] of [[0, ph / 2, pw + 0.03, 0.03], [0, -ph / 2, pw + 0.03, 0.03], [pw / 2, 0, 0.03, ph], [-pw / 2, 0, 0.03, ph], [0, 0, 0.022, ph]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, pt + 0.012), metal), x, y, -0.004, panel);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), dark), 0, 0, -0.04, panel);
  rod([0, L.deck.y1, 0], [0, L.panel.c[1], 0], L.panel.mastR, metal);
  const back = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), L.panel.yawDeg * DEG);
  rod([back.x * 0.45, L.deck.y1, back.z * 0.45], [back.x * 0.035, L.panel.c[1] - 0.3, back.z * 0.035], 0.016, metal);
  // The antenna: a mast, and a shallow dish with its feed, pointing at Earth.
  rod([L.antenna.x, L.deck.y1, L.antenna.z], [L.antenna.x, L.antenna.y1, L.antenna.z], L.antenna.r, metal);
  const bowl = Array.from({ length: 9 }, (_, k) => new THREE.Vector2(0.01 + (k / 8) * L.antenna.dishR, 0.11 * (k / 8) ** 2));
  const dishMat = std({ color: 0xe9e8e4, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
  const dish = new THREE.Group();
  dish.add(new THREE.Mesh(new THREE.LatheGeometry(bowl, 28), dishMat));
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), metal);
  feed.position.y = 0.11;
  dish.add(feed);
  dish.position.set(L.antenna.x, L.antenna.y1 + 0.08, L.antenna.z);
  const e = dirAzEl(earthAzDeg, Math.max(0, earthElDeg));
  const toEarth = new THREE.Vector3(e[0], e[1], e[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.rotation.y);
  dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toEarth);
  group.add(dish);
  // The power light, on the face that looks most nearly at the eye (the faces are 45 degrees apart; a
  // direction phi from +x towards +z looks at azimuth faceAzDeg + phi), so its name never points through the body.
  // Its own plain material, not capped: it is the one thing on the lander that glows.
  const phi = Math.round((((azDeg + 180 - faceAzDeg) % 360) + 360) % 360 / 45) * 45 * DEG;
  const lampPos = new THREE.Vector3(Math.cos(phi) * (apothem + 0.06), L.body.y0 + bodyH * 0.72, Math.sin(phi) * (apothem + 0.06));
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), lamp), lampPos.x, lampPos.y, lampPos.z);
  return { group, lamp, panel, dish, lampPos, dust };
}
