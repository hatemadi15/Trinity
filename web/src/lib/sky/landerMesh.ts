import * as THREE from 'three';
import { dirAzEl, type Vec3 } from './frames';
import { LANDER, LEG_ENDS } from './landerShape';

/*
 * The lander drawn beside the site, from the numbers its shadow is cast from (landerShape.ts), with the textures of
 * its foil and its solar panel.
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

/** Crinkled gold foil: a bright amber base with light and dark creases. */
const foilTexture = () =>
  surface(256, 256, (g) => {
    g.fillStyle = '#d9ab4a';
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 140; k++) {
      g.strokeStyle = rnd() > 0.5 ? `rgba(255,226,150,${0.25 + 0.3 * rnd()})` : `rgba(90,60,10,${0.2 + 0.3 * rnd()})`;
      g.lineWidth = 1 + 3 * rnd();
      g.beginPath();
      const x = rnd() * 256, y = rnd() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 90);
      g.stroke();
    }
  });

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
 * A small solar lander, drawn for scale (not measured), from the numbers its shadow is cast from (LANDER):
 * an eight-sided gold foil body with the engine's bell beneath, four splayed legs on the diagonals with pads
 * and struts, a deck with instrument boxes, a camera and a white radiator, an upright solar panel facing the
 * Sun the view opens on, an antenna dish pointing at Earth, and a lamp whose colour shows its power. It
 * stands `distM` from the eye towards `azDeg`, turned so that its +x face looks towards `faceAzDeg`; its
 * local origin is the ground under its centre.
 */
export function buildLander(azDeg: number, distM: number, faceAzDeg: number, earthAzDeg: number, earthElDeg: number) {
  const group = new THREE.Group();
  const a = azDeg * DEG;
  group.position.set(distM * Math.sin(a), 0, -distM * Math.cos(a));
  // Its +x face towards faceAzDeg: three's turn about y by θ points local +x at azimuth 90° − θ.
  group.rotation.y = (90 - faceAzDeg) * DEG;
  const foilMap = foilTexture();
  if (foilMap) {
    // Each of the eight faces shows half the crinkled sheet, not an eighth of it stretched.
    foilMap.wrapS = foilMap.wrapT = THREE.RepeatWrapping;
    foilMap.repeat.set(4, 1);
  }
  // Foil is shiny: it mirrors the black sky and the grey dust, and catches the Sun in bright creases.
  // Rough enough that a facet catching a low Sun shows a soft sheen rather than a bright line, which two
  // readers took for the power light.
  const foil = new THREE.MeshStandardMaterial({ name: 'foil', color: foilMap ? 0xffffff : 0xd4a640, map: foilMap, metalness: 0.75, roughness: 0.55 });
  // The pads are matte, so the feet do not sparkle.
  const pad = new THREE.MeshStandardMaterial({ name: 'pad', color: 0x8d8d88, metalness: 0.15, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3a39e, metalness: 0.6, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xc9c7c2, metalness: 0.05, roughness: 0.8 });
  const cellMap = cellsTexture(), backMap = panelBackTexture();
  const cells = new THREE.MeshStandardMaterial({ color: cellMap ? 0xffffff : 0x1d2b4f, map: cellMap, metalness: 0.35, roughness: 0.28 });
  const panelBack = new THREE.MeshStandardMaterial({ color: backMap ? 0xffffff : 0xb9bcc2, map: backMap, metalness: 0.2, roughness: 0.6 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  /** A round rod from p to q. */
  const rod = (p: Vec3, q: Vec3, r: number, mat: THREE.Material) => {
    const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, P.distanceTo(Q), 8), mat);
    m.position.copy(P).add(Q).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), P.clone().sub(Q).normalize());
    group.add(m);
    return m;
  };
  const L = LANDER;
  // The body: eight-sided (its flat faces towards ±x, ±z and the diagonals), gold foil, a dark base.
  const bodyH = L.body.y1 - L.body.y0;
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.body.r, L.body.r, bodyH, 8, 1, false, Math.PI / 8), [foil, metal, dark]), 0, L.body.y0 + bodyH / 2, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.deck.r, L.deck.r, L.deck.y1 - L.deck.y0, 8, 1, false, Math.PI / 8), metal), 0, (L.deck.y0 + L.deck.y1) / 2, 0);
  const apothem = L.body.r * Math.cos(Math.PI / 8);
  // A white radiator on the -z face, and a dark band of thrusters round the top of the body.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.03), white), 0, L.body.y0 + bodyH * 0.48, -apothem - 0.016);
  for (let k = 0; k < 4; k++) {
    const t = (k * 90 + 45) * DEG;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), dark), Math.sin(t) * (apothem + 0.05), L.body.y1 - 0.12, Math.cos(t) * (apothem + 0.05));
  }
  // The engine's bell under the body.
  const bell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, L.bell.r, L.bell.y1 - L.bell.y0, 20, 1, true), dark), 0, (L.bell.y0 + L.bell.y1) / 2, 0);
  bell.name = 'bell';
  // Legs on the diagonals with round pads, and a strut from each leg back to the body.
  for (const { top, foot } of LEG_ENDS) {
    rod(top, foot, L.legs.r, metal);
    const knee: Vec3 = [top[0] + (foot[0] - top[0]) * 0.5, top[1] + (foot[1] - top[1]) * 0.5, top[2] + (foot[2] - top[2]) * 0.5];
    rod(knee, [top[0] * 0.55, L.body.y0 + 0.05, top[2] * 0.55], 0.022, metal);
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.legs.padR * 0.85, L.legs.padR, L.legs.padH, 18), pad), foot[0], L.legs.padH / 2, foot[2]);
  }
  // Instruments on the deck: a white box and a dark one, and a camera on a short mast.
  L.boxes.forEach((b, i) => add(new THREE.Mesh(new THREE.BoxGeometry(...b.size), i === 0 ? white : dark), ...b.c));
  rod([L.camera.x, L.deck.y1, L.camera.z], [L.camera.x, L.camera.y1, L.camera.z], L.camera.r, metal);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.13), dark), L.camera.x, L.camera.y1 + 0.05, L.camera.z);
  // The solar panel faces the opening Sun: local +z looks 90° right of local +x (faceAzDeg + 90), the Sun is
  // 70° left of local +x, so the panel turns 20° towards +x; its cells are on that +z side.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(...L.panel.size), [metal, metal, metal, metal, cells, panelBack]);
  panel.position.set(...L.panel.c);
  panel.rotation.y = L.panel.yawDeg * DEG;
  group.add(panel);
  rod([0, L.deck.y1, 0], [0, L.panel.c[1], 0], L.panel.mastR, metal);
  // The antenna: a mast, and a shallow dish with its feed, pointing at Earth.
  rod([L.antenna.x, L.deck.y1, L.antenna.z], [L.antenna.x, L.antenna.y1, L.antenna.z], L.antenna.r, metal);
  const bowl = Array.from({ length: 9 }, (_, k) => new THREE.Vector2(0.01 + (k / 8) * L.antenna.dishR, 0.11 * (k / 8) ** 2));
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
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
  const phi = Math.round((((azDeg + 180 - faceAzDeg) % 360) + 360) % 360 / 45) * 45 * DEG;
  const lampPos = new THREE.Vector3(Math.cos(phi) * (apothem + 0.06), L.body.y0 + bodyH * 0.72, Math.sin(phi) * (apothem + 0.06));
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), lamp), lampPos.x, lampPos.y, lampPos.z);
  return { group, lamp, panel, dish, lampPos };
}
