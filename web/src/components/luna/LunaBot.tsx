'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Luna in 3D (spec 23): a little robot rabbit with a white shell, blue bands round her sides, two leaf ears, a black
 * visor whose blue LEDs make her face, noodle arms and a glowing crescent Moon on her chest. Faint sparkles turn
 * round her and a stream of light flows about her. She floats, sways, follows the pointer with her head, blinks, and
 * every few seconds does something of her own: wiggles her ears, looks about, hops with a ^ ^, spins, waves, or
 * shows star eyes. With reduced motion she stands still and only her face changes.
 *
 * The face is drawn on a canvas and laid on the visor, so a face is a few lines of drawing.
 */
export type BotFace = 'idle' | 'happy' | 'blink' | 'sleepy' | 'wide' | 'dots' | 'talk' | 'cross' | 'blocked' | 'stars' | 'focus';

export interface LunaBotState {
  /** The face Luna's state asks for; idle animations and the pointer may change it for a moment. */
  face: BotFace;
  hover: boolean;
  dragging: boolean;
  /** Ears up (listening), down (asleep or troubled) or at rest. */
  ears: 'up' | 'down' | 'rest';
}

export interface LunaBotProps {
  state: { current: LunaBotState };
  reduced: boolean;
  onReady: () => void;
  onFail: (why: string) => void;
}

const LED = '#8fd3ff';
const RED = '#ff5a6e';

/** Draws a face on the visor's canvas: a black rounded screen and its LEDs. `t` animates talking and thinking. */
export function drawFace(ctx: CanvasRenderingContext2D, face: BotFace, t: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const r = H * 0.32;
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, r);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#15181f');
  g.addColorStop(1, '#05060a');
  ctx.fillStyle = g;
  ctx.fill();
  const cx = W / 2, cy = H * 0.52, dx = W * 0.19;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = face === 'cross' || face === 'blocked' ? RED : LED;
  ctx.shadowBlur = H * 0.09;
  ctx.strokeStyle = ctx.fillStyle = face === 'cross' || face === 'blocked' ? RED : LED;
  ctx.lineWidth = H * 0.075;
  const bar = (x: number, h: number) => {
    ctx.beginPath();
    ctx.roundRect(x - H * 0.045, cy - h / 2, H * 0.09, h, H * 0.045);
    ctx.fill();
  };
  const chevron = (x: number, y = cy + H * 0.06) => {
    ctx.beginPath();
    ctx.moveTo(x - H * 0.11, y);
    ctx.lineTo(x, y - H * 0.13);
    ctx.lineTo(x + H * 0.11, y);
    ctx.stroke();
  };
  const star = (x: number, y: number, s: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 === 0 ? s : s * 0.32;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  switch (face) {
    case 'idle':
      bar(cx - dx, H * 0.34);
      bar(cx + dx, H * 0.34);
      break;
    case 'wide':
      bar(cx - dx, H * 0.44);
      bar(cx + dx, H * 0.44);
      break;
    case 'blink':
      for (const x of [cx - dx, cx + dx]) {
        ctx.beginPath();
        ctx.moveTo(x - H * 0.09, cy);
        ctx.lineTo(x + H * 0.09, cy);
        ctx.stroke();
      }
      break;
    case 'happy':
      chevron(cx - dx);
      chevron(cx + dx);
      break;
    case 'talk': {
      chevron(cx - dx, cy);
      chevron(cx + dx, cy);
      const open = 0.35 + 0.65 * Math.abs(Math.sin(t * 11));
      ctx.beginPath();
      ctx.roundRect(cx - H * 0.09, cy + H * 0.13, H * 0.18, H * 0.05 + H * 0.07 * open, H * 0.04);
      ctx.fill();
      break;
    }
    case 'sleepy':
      ctx.globalAlpha = 0.7;
      for (const x of [cx - dx, cx + dx]) {
        ctx.beginPath();
        ctx.moveTo(x - H * 0.1, cy);
        ctx.quadraticCurveTo(x, cy + H * 0.12, x + H * 0.1, cy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 'dots':
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 - i * 0.9));
        ctx.beginPath();
        ctx.arc(cx + (i - 1) * H * 0.2, cy, H * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    case 'focus':
      // The sketch's determined face: bars under slanted brows.
      bar(cx - dx, H * 0.26);
      bar(cx + dx, H * 0.26);
      ctx.lineWidth = H * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx - dx - H * 0.12, cy - H * 0.26);
      ctx.lineTo(cx - dx + H * 0.08, cy - H * 0.19);
      ctx.moveTo(cx + dx + H * 0.12, cy - H * 0.26);
      ctx.lineTo(cx + dx - H * 0.08, cy - H * 0.19);
      ctx.stroke();
      break;
    case 'stars':
      star(cx - dx, cy, H * 0.17 * (0.85 + 0.15 * Math.sin(t * 8)));
      star(cx + dx, cy, H * 0.17 * (0.85 + 0.15 * Math.sin(t * 8 + 1)));
      break;
    case 'cross':
      for (const x of [cx - dx, cx + dx]) {
        ctx.beginPath();
        ctx.moveTo(x - H * 0.1, cy - H * 0.1);
        ctx.lineTo(x + H * 0.1, cy + H * 0.1);
        ctx.moveTo(x + H * 0.1, cy - H * 0.1);
        ctx.lineTo(x - H * 0.1, cy + H * 0.1);
        ctx.stroke();
      }
      break;
    case 'blocked':
      ctx.beginPath();
      ctx.arc(cx, cy, H * 0.2, 0, Math.PI * 2);
      ctx.moveTo(cx - H * 0.14, cy - H * 0.14);
      ctx.lineTo(cx + H * 0.14, cy + H * 0.14);
      ctx.stroke();
      break;
  }
  ctx.shadowBlur = 0;
  // The visor's sheen.
  ctx.beginPath();
  ctx.ellipse(W * 0.3, H * 0.2, W * 0.16, H * 0.06, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
}

/** A 4-pointed sparkle, white at its heart, for the stars about her. */
function sparkleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(200,225,255,0.9)');
  g.addColorStop(1, 'rgba(127,169,255,0)');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, r = i % 2 === 0 ? 32 : 5;
    x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The emblem on her chest: a crescent Moon in a blue ring. */
function emblemTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.shadowColor = '#7fb8ff';
  x.shadowBlur = 10;
  x.strokeStyle = '#5fb4ff';
  x.lineWidth = 9;
  x.beginPath();
  x.arc(64, 64, 50, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#dcecff';
  x.beginPath();
  x.arc(60, 64, 30, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.shadowBlur = 0;
  x.beginPath();
  x.arc(76, 56, 27, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLOW_FRAG = /* glsl */ `
uniform vec3 tint;
uniform float strength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(tint, a * a * strength);
}`;
const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SPARK_VERT = /* glsl */ `
attribute float phase;
attribute float scale;
uniform float time;
uniform float px;
uniform float boost;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.5 + 0.5 * sin(time * (1.4 + fract(phase) * 1.6) + phase * 6.283);
  vA = (0.15 + 0.85 * tw) * (0.55 + boost);
  gl_PointSize = scale * (0.55 + 0.45 * tw) * (1.0 + boost * 0.6) * px * (5.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 tint;
varying float vA;
void main() {
  vec4 c = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(tint * c.rgb, c.a * vA);
}`;

/** An eased 0 → 1 → 0 bump over an idle animation's life. */
const bump = (p: number) => Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI);
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

type Idle = 'wiggle' | 'look' | 'hop' | 'spin' | 'wave' | 'stars';
const IDLES: Idle[] = ['wiggle', 'look', 'hop', 'spin', 'wave', 'stars', 'hop', 'wiggle'];
const IDLE_LEN: Record<Idle, number> = { wiggle: 1.1, look: 2.6, hop: 1.0, spin: 1.5, wave: 2.0, stars: 2.2 };

export default function LunaBot({ state, reduced, onReady, onFail }: LunaBotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onReady, onFail });
  useEffect(() => {
    cb.current = { onReady, onFail };
  }, [onReady, onFail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
      cb.current.onFail(e instanceof Error ? e.message : 'no WebGL');
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    // Framed for her whole height, ears and a hop included.
    camera.position.set(0, 0.72, 8.4);
    camera.lookAt(0, 0.62, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7f93c8, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2.5, 3.5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fa9ff, 2.2);
    rim.position.set(-3, 1.5, -2.5);
    scene.add(rim);

    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    // ---- materials ------------------------------------------------------------
    const shell = keep(new THREE.MeshPhysicalMaterial({ color: 0xf4f6fa, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color(0xbfd8ff) }));
    const band = keep(new THREE.MeshPhysicalMaterial({ color: 0x4fa8ff, roughness: 0.25, clearcoat: 1, emissive: 0x1d5fd6, emissiveIntensity: 0.55 }));
    const earMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xe6f1ff, roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0.94 }));
    const earInner = keep(new THREE.MeshPhysicalMaterial({ color: 0x9fd0ff, roughness: 0.4, emissive: 0x3d7fe0, emissiveIntensity: 0.35 }));
    const ink = keep(new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide }));
    const limb = keep(new THREE.MeshPhysicalMaterial({ color: 0x3b4150, roughness: 0.3, clearcoat: 1, sheen: 0.6, sheenColor: new THREE.Color(0x9fc2ff) }));

    // The outline of a part, as in the sketch: the part's shape again, a little larger, drawn from inside.
    const outlined = (geo: THREE.BufferGeometry, mat: THREE.Material, thick = 1.045) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      const o = new THREE.Mesh(geo, ink);
      o.scale.setScalar(thick);
      g.add(o, m);
      return g;
    };

    const bot = new THREE.Group();
    scene.add(bot);

    // ---- the head --------------------------------------------------------------
    const A = 1.18, B = 0.9, C = 1.0;
    const head = new THREE.Group();
    head.position.y = 0.52;
    bot.add(head);
    const sphere = keep(new THREE.SphereGeometry(1, 64, 48));
    const shellMesh = outlined(sphere, shell, 1.035);
    shellMesh.scale.set(A, B, C);
    head.add(shellMesh);

    // The blue bands, one round each side, where the shell turns away.
    const torus = keep(new THREE.TorusGeometry(1, 0.085, 16, 72));
    for (const side of [-1, 1]) {
      const x = 0.965;
      const k = Math.sqrt(1 - (x / A) ** 2);
      const ring = new THREE.Mesh(torus, band);
      ring.rotation.y = Math.PI / 2;
      ring.scale.set(C * k * 1.01, B * k * 1.01, 1);
      ring.position.x = side * x;
      head.add(ring);
    }

    // The visor: a rounded screen laid on the shell's front, its face drawn on a canvas.
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 384;
    faceCanvas.height = 240;
    const faceCtx = faceCanvas.getContext('2d')!;
    const faceTex = keep(new THREE.CanvasTexture(faceCanvas));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const visorGeo = keep(new THREE.PlaneGeometry(1.5, 0.94, 48, 30));
    const pos = visorGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i) - 0.02;
      pos.setY(i, vy);
      pos.setZ(i, C * Math.sqrt(Math.max(0, 1 - (vx / A) ** 2 - (vy / B) ** 2)) + 0.012);
    }
    visorGeo.computeVertexNormals();
    const visorMat = keep(new THREE.MeshPhysicalMaterial({ map: faceTex, emissiveMap: faceTex, emissive: 0xffffff, emissiveIntensity: 1.25, transparent: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
    head.add(new THREE.Mesh(visorGeo, visorMat));

    // The ears: two leaves on pivots at the crown, a soft blue inside.
    const leaf = keep(new THREE.SphereGeometry(1, 32, 24));
    const ears = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.46, 0.74, 0);
      const ear = outlined(leaf, earMat, 1.08);
      ear.scale.set(0.17, 0.52, 0.075);
      ear.position.y = 0.48;
      const inner = new THREE.Mesh(leaf, earInner);
      inner.scale.set(0.075, 0.34, 0.03);
      inner.position.set(0, 0.47, 0.05);
      pivot.add(ear, inner);
      head.add(pivot);
      return { pivot, side };
    });

    // ---- the body ----------------------------------------------------------------
    const body = outlined(sphere, shell, 1.05);
    body.scale.set(0.5, 0.48, 0.44);
    body.position.y = -0.58;
    bot.add(body);
    const emblem = new THREE.Mesh(keep(new THREE.CircleGeometry(0.19, 48)), keep(new THREE.MeshBasicMaterial({ map: keep(emblemTexture()), transparent: true, toneMapped: false })));
    emblem.position.set(0, -0.56, 0.45);
    bot.add(emblem);
    const capsule = keep(new THREE.CapsuleGeometry(0.07, 0.46, 6, 14));
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, -0.36, 0.02);
      const arm = new THREE.Mesh(capsule, limb);
      arm.position.y = -0.28;
      pivot.add(arm);
      pivot.rotation.z = side * 0.42;
      bot.add(pivot);
      return { pivot, side };
    });
    const legGeo = keep(new THREE.CapsuleGeometry(0.075, 0.12, 6, 12));
    for (const side of [-1, 1]) {
      const leg = outlined(legGeo, shell, 1.12);
      leg.position.set(side * 0.17, -1.1, 0);
      bot.add(leg);
    }

    // ---- the light about her ------------------------------------------------------
    const glowMat = keep(new THREE.ShaderMaterial({ uniforms: { tint: { value: new THREE.Color(0x6f9dff) }, strength: { value: 0.5 } }, vertexShader: UV_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.4, 4.4)), glowMat);
    glow.position.set(0, 0.1, -1.4);
    scene.add(glow);

    // Sparkles: faint stars that turn about her and twinkle.
    const SPARKS = 18;
    const sp = new Float32Array(SPARKS * 3), ph = new Float32Array(SPARKS), sc = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) {
      const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.3, r = 1.45 + Math.random() * 0.75;
      sp.set([Math.cos(a) * r, -0.9 + Math.random() * 2.6, Math.sin(a) * r * 0.6 - 0.2], i * 3);
      ph[i] = Math.random();
      sc[i] = 14 + Math.random() * 20;
    }
    const sparkGeo = keep(new THREE.BufferGeometry());
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sparkGeo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    sparkGeo.setAttribute('scale', new THREE.BufferAttribute(sc, 1));
    const sparkMat = keep(new THREE.ShaderMaterial({
      uniforms: { map: { value: keep(sparkleTexture()) }, tint: { value: new THREE.Color(0xd8e8ff) }, time: { value: 0 }, px: { value: 1 }, boost: { value: 0 } },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const sparkles = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparkles);

    // The flow: a stream of light that runs round her on a tilted ring, bright at its head and fading behind.
    const FLOW = 140;
    const flowPos = new Float32Array(FLOW * 3), flowPh = new Float32Array(FLOW), flowSc = new Float32Array(FLOW);
    for (let i = 0; i < FLOW; i++) {
      flowPh[i] = i / FLOW;
      flowSc[i] = 4 + 12 * Math.pow(i / FLOW, 2);
    }
    const flowGeo = keep(new THREE.BufferGeometry());
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
    flowGeo.setAttribute('phase', new THREE.BufferAttribute(flowPh, 1));
    flowGeo.setAttribute('scale', new THREE.BufferAttribute(flowSc, 1));
    const flowMat = keep(new THREE.ShaderMaterial({
      uniforms: { map: { value: sparkMat.uniforms.map.value }, tint: { value: new THREE.Color(0x8fbfff) }, time: { value: 0 }, px: { value: 1 }, boost: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float phase; attribute float scale; uniform float px; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = 0.12 + 0.95 * phase * phase; gl_PointSize = scale * px * (5.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const flow = new THREE.Points(flowGeo, flowMat);
    flow.rotation.set(0.32, 0, -0.22);
    scene.add(flow);

    // ---- size ---------------------------------------------------------------------------
    const resize = () => {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      sparkMat.uniforms.px.value = flowMat.uniforms.px.value = dpr * (h / 220);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // ---- the pointer: her head follows it -------------------------------------------------
    let lookX = 0, lookY = 0, wantX = 0, wantY = 0;
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      wantX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500));
      wantY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.35)) / 500));
    };
    if (!reduced) window.addEventListener('pointermove', onPointer, { passive: true });

    // ---- the loop -----------------------------------------------------------------------------
    const t0 = performance.now();
    let last = 0;
    let shown: BotFace | null = null;
    let nextBlink = 2.5, blinkUntil = 0;
    let idle: { kind: Idle; at: number } | null = null;
    let nextIdle = 4 + Math.random() * 3;
    let faceDrawnAt = -1;

    const tick = () => {
      const now = (performance.now() - t0) / 1000;
      const t = reduced ? 0 : now;
      const dt = Math.min(0.1, now - last);
      last = now;
      const s = state.current;

      // An idle animation now and then, while nothing else is going on.
      if (!reduced && !idle && now > nextIdle && !s.dragging && (s.face === 'idle' || s.face === 'sleepy')) {
        const kind = IDLES[Math.floor(Math.random() * IDLES.length)];
        idle = { kind, at: now };
      }
      const p = idle ? (now - idle.at) / IDLE_LEN[idle.kind] : 0;
      if (idle && p >= 1) {
        idle = null;
        nextIdle = now + 6 + Math.random() * 6;
      }
      const kind = idle?.kind;

      // The face: what her state asks, unless the pointer, a drag or an idle animation says otherwise; she blinks.
      let face: BotFace = s.face;
      if (s.dragging) face = 'wide';
      else if (s.hover && (face === 'idle' || face === 'sleepy')) face = 'happy';
      else if (kind === 'hop' || kind === 'wave') face = 'happy';
      else if (kind === 'stars') face = 'stars';
      if (!reduced && (face === 'idle' || face === 'wide')) {
        if (now > nextBlink) {
          blinkUntil = now + 0.12;
          nextBlink = now + 2.4 + Math.random() * 3.2;
        }
        if (now < blinkUntil) face = 'blink';
      }
      const animated = face === 'talk' || face === 'dots' || face === 'stars';
      if (face !== shown || (animated && now - faceDrawnAt > 0.06)) {
        drawFace(faceCtx, face, now);
        faceTex.needsUpdate = true;
        shown = face;
        faceDrawnAt = now;
      }

      // Her body: a soft float and sway; a hop, a spin.
      const hop = kind === 'hop' ? bump(p) * 0.45 : 0;
      bot.position.y = (reduced ? 0 : Math.sin(t * 1.25) * 0.08) + hop - 0.05;
      bot.rotation.z = reduced ? 0 : Math.sin(t * 0.9) * 0.04;
      bot.rotation.y = kind === 'spin' ? ease(Math.min(p, 1)) * Math.PI * 2 : 0;

      // Her head follows the pointer, or looks about.
      const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
      const lx = kind === 'look' ? Math.sin(p * Math.PI * 2) * 0.9 : s.dragging ? 0 : wantX;
      const ly = kind === 'look' ? -0.15 : s.dragging ? -0.2 : wantY;
      lookX += (lx - lookX) * k;
      lookY += (ly - lookY) * k;
      head.rotation.y = lookX * 0.5;
      head.rotation.x = lookY * 0.28;
      head.rotation.z = kind === 'wiggle' ? Math.sin(p * Math.PI * 4) * 0.08 : -lookX * 0.06;

      // Her ears: up, down or at rest; flapping in a drag, wiggling now and then.
      const rest = s.ears === 'up' ? 0.06 : s.ears === 'down' ? 0.75 : 0.24;
      for (const { pivot, side } of ears) {
        const wiggle = kind === 'wiggle' ? Math.sin(p * Math.PI * 8 + side) * 0.35 * bump(p) : 0;
        const flap = s.dragging ? Math.sin(now * 18 + side) * 0.25 : 0;
        const breathe = reduced ? 0 : Math.sin(t * 1.25 + 0.6) * 0.04;
        const target = -side * (rest + wiggle + flap + breathe + (s.hover ? -0.1 : 0));
        pivot.rotation.z += (target - pivot.rotation.z) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
        pivot.rotation.x = s.ears === 'down' ? -0.25 : 0;
      }

      // Her arms swing a little; she waves with her right.
      for (const { pivot, side } of arms) {
        let z = side * (0.42 + (reduced ? 0 : Math.sin(t * 1.25 + side) * 0.07));
        if (kind === 'wave' && side === 1) z = 2.3 + Math.sin(p * Math.PI * 6) * 0.35 * bump(p * 1.2);
        if (s.dragging) z = side * (1.1 + Math.sin(now * 16) * 0.2);
        pivot.rotation.z += (z - pivot.rotation.z) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
      }

      // The light about her: sparkles turn, the flow runs, the glow breathes; star eyes brighten them all.
      const boost = kind === 'stars' ? bump(p) : s.hover ? 0.3 : 0;
      sparkMat.uniforms.time.value = t;
      sparkMat.uniforms.boost.value += (boost - sparkMat.uniforms.boost.value) * Math.min(1, dt * 6);
      sparkles.rotation.y = t * 0.12;
      for (let i = 0; i < FLOW; i++) {
        const a = t * 0.9 + flowPh[i] * Math.PI * 1.15;
        flowPos[i * 3] = Math.cos(a) * 1.55;
        flowPos[i * 3 + 1] = Math.sin(a * 2) * 0.08 + 0.05;
        flowPos[i * 3 + 2] = Math.sin(a) * 1.0;
      }
      flowGeo.attributes.position.needsUpdate = true;
      glowMat.uniforms.strength.value = 0.46 + (reduced ? 0 : Math.sin(t * 1.25) * 0.06) + boost * 0.15 + (s.face === 'wide' ? 0.1 : 0);

      renderer.render(scene, camera);
    };

    let raf = 0;
    const loop = () => {
      raf = 0;
      tick();
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', wake);
    tick();
    cb.current.onReady();
    // With reduced motion she is drawn when something changes rather than every frame; a slow tick catches that.
    const slow = reduced ? window.setInterval(tick, 250) : 0;
    if (!reduced) wake();

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(slow);
      ro.disconnect();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pointermove', onPointer);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    };
  }, [state, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />;
}
