'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The home page's title card (spec 23): Earth rising over the Moon's limb, as Apollo 8 saw it in 1968. Both bodies
 * are NASA's pictures on spheres lit by one Sun: the Moon from LRO's camera with its relief for shading, Earth from
 * the Blue Marble with its clouds, its city lights on the night side, the Sun's glint on the oceans and the blue of
 * its air. It is drawn with an orthographic camera, as both bodies are far enough away to show no perspective, so
 * the layout is set in screen terms for any shape of window.
 *
 * `progress` is how far the page has scrolled into the arrival, in screens (read every frame): Earth climbs, the
 * Moon turns under it, and once the card has faded (progress past 1) the scene stops drawing. With reduced motion
 * it draws one still frame for each progress it is given.
 */
export interface EarthriseProps {
  progress: { current: number };
  reduced: boolean;
  onReady: () => void;
  onFail: (why: string) => void;
  /** Where the textures are served; the tests point it elsewhere. */
  base?: string;
}

/** Where the card puts each body, in the camera's units: the view is 2 tall and 2 × aspect wide, centred on 0, 0. */
export function earthriseLayout(aspect: number) {
  const wide = aspect >= 1;
  // The Moon: a disc wider than the window, its top a little below the middle, so its limb arcs across the foot.
  const moonR = wide ? Math.max(1.25 * aspect, 1.6) : 0.75 * aspect + 0.4;
  const moonTop = wide ? -0.22 : -0.36;
  const moonY = moonTop - moonR;
  // Earth: right of centre, just clearing the limb at that point, as large as a title card wants it.
  const earthR = wide ? 0.13 : 0.09;
  const earthX = wide ? 0.42 * aspect : 0.6 * aspect;
  const limbAtEarth = moonY + Math.sqrt(Math.max(moonR * moonR - earthX * earthX, 0));
  const earthY = limbAtEarth + earthR * 0.55;
  return { moonR, moonY, earthR, earthX, earthY };
}

const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform sampler2D waterMap;
uniform vec3 sunDir;
uniform float cloudShift;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = vec3(0.0, 0.0, 1.0);
  float ndl = dot(n, sunDir);
  float lit = smoothstep(-0.08, 0.22, ndl);
  vec3 day = texture2D(dayMap, vUv).rgb;
  // A little less saturated than the photograph, so the blue reads as the page's one colour.
  float grey = dot(day, vec3(0.299, 0.587, 0.114));
  day = mix(vec3(grey), day, 0.82);
  float clouds = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
  float shadow = texture2D(cloudMap, vUv + vec2(cloudShift + 0.0015, 0.0012)).r;
  vec3 surface = day * (1.0 - shadow * 0.35);
  vec3 col = mix(surface, vec3(0.96), clouds * 0.92) * max(ndl, 0.0) * 1.55;
  // The night side: city lights where there are no clouds.
  vec3 night = texture2D(nightMap, vUv).rgb;
  col += night * vec3(1.0, 0.82, 0.55) * (1.0 - lit) * (1.0 - clouds) * 0.9;
  // The Sun's glint on the oceans.
  float water = texture2D(waterMap, vUv).r;
  vec3 h = normalize(sunDir + v);
  col += vec3(1.0, 0.96, 0.88) * pow(max(dot(n, h), 0.0), 48.0) * water * (1.0 - clouds) * 0.65 * lit;
  // The air: thin blue at the edge of the disc, brightest on the day side.
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  col += vec3(0.32, 0.58, 1.0) * fres * (0.15 + 1.1 * smoothstep(-0.25, 0.7, ndl));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const HALO_VERT = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * A body's glow beyond its disc, drawn on the far side of a larger sphere: nothing at that sphere's edge, brightest
 * against the body's own edge (`inner`, the depth of the far side there), and stronger on the lit side.
 */
const HALO_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 tint;
uniform float strength;
uniform float inner;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float d = clamp(-n.z / inner, 0.0, 1.0);
  float rim = d * d * d;
  float side = 0.25 + 0.75 * smoothstep(-0.5, 0.7, dot(n.xy, sunDir.xy));
  gl_FragColor = vec4(tint * rim * side * strength, 1.0);
  #include <colorspace_fragment>
}`;
/** The depth of a halo's far side where it meets the body, for a halo `scale` times the body's size. */
const innerFor = (scale: number) => Math.sqrt(1 - 1 / (scale * scale));

/** The Sun, from the upper left and a little in front: the Moon's face lit, Earth a fat crescent turned to the left. */
const SUN = new THREE.Vector3(-0.8, 0.34, 0.5).normalize();

export default function EarthriseScene({ progress, reduced, onReady, onFail, base = '/hero/textures' }: EarthriseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const done = useRef({ onReady, onFail });
  useEffect(() => {
    done.current = { onReady, onFail };
  }, [onReady, onFail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) {
      done.current.onFail(e instanceof Error ? e.message : 'no WebGL');
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 20);

    // The stars: faint points behind both bodies, a few of them blue.
    const starCount = 700;
    const pos = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < starCount; i++) {
      pos.set([(rand() * 2 - 1) * 3.2, (rand() * 2 - 1) * 1.2, -40], i * 3);
      const b = 0.35 + rand() * 0.65, blue = rand() > 0.85;
      colors.set(blue ? [0.55 * b, 0.7 * b, b] : [b, b, b], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
    scene.add(stars);

    const loader = new THREE.TextureLoader();
    const load = (file: string, srgb: boolean) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(
          `${base}/${file}`,
          (t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            resolve(t);
          },
          undefined,
          () => reject(new Error(`could not load ${file}`)),
        ),
      );

    const sun = new THREE.DirectionalLight(0xffffff, 2.7);
    sun.position.copy(SUN).multiplyScalar(10);
    scene.add(sun);
    // Earthshine: the faint blue light Earth throws on the Moon's dark side.
    scene.add(new THREE.AmbientLight(0x9db8ff, 0.05));

    const moonGeo = new THREE.SphereGeometry(1, 192, 128);
    const moonMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moon);

    const earthGeo = new THREE.SphereGeometry(1, 96, 64);
    const sunView = SUN.clone();
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: null }, nightMap: { value: null }, cloudMap: { value: null }, waterMap: { value: null }, sunDir: { value: sunView }, cloudShift: { value: 0 } },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    // Earth turned so the Atlantic and Africa face us at first, its axis tipped as it is.
    earth.rotation.set(0.18, -1.9, 0.41);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sunView }, tint: { value: new THREE.Color(0x6f9dff) }, strength: { value: 1.25 }, inner: { value: innerFor(1.09) } },
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    // A faint glow over the Moon's limb, the light the eye expects around a bright disc on black.
    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sunView }, tint: { value: new THREE.Color(0x9aa6ba) }, strength: { value: 0.22 }, inner: { value: innerFor(1.025) } },
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(moonGlow);

    let w = 1, h = 1, aspect = 1;
    let layout = earthriseLayout(1);
    const place = () => {
      layout = earthriseLayout(aspect);
      moon.scale.setScalar(layout.moonR);
      moon.position.set(0, layout.moonY, 0);
      moonGlow.scale.setScalar(layout.moonR * 1.025);
      moonGlow.position.copy(moon.position);
      earth.scale.setScalar(layout.earthR);
      halo.scale.setScalar(layout.earthR * 1.09);
    };
    const resize = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      aspect = w / h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(w, h, false);
      camera.left = -aspect;
      camera.right = aspect;
      camera.top = 1;
      camera.bottom = -1;
      camera.updateProjectionMatrix();
      place();
      if (reduced) draw(performance.now());
    };

    // The pointer leans the view a little, as a card in the hand.
    let leanX = 0, leanY = 0, wantX = 0, wantY = 0;
    const onPointer = (e: PointerEvent) => {
      wantX = (e.clientX / window.innerWidth - 0.5) * 2;
      wantY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced) window.addEventListener('pointermove', onPointer, { passive: true });

    const t0 = performance.now();
    let ready = false;
    let last = t0;
    const draw = (now: number) => {
      const p = Math.min(Math.max(progress.current, 0), 1.2);
      const t = reduced ? 0 : (now - t0) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 3);
      leanX += (wantX - leanX) * k;
      leanY += (wantY - leanY) * k;
      // The Moon turns under Earth as the page scrolls, and a little with time.
      moon.rotation.set(-0.35 + p * 0.55, 1.2 + t * 0.004 + leanX * 0.02, 0);
      earth.position.set(layout.earthX + leanX * 0.012, layout.earthY + p * 0.42 - leanY * 0.01, -5);
      halo.position.copy(earth.position);
      earth.rotation.y = -1.9 + t * 0.012;
      earthMat.uniforms.cloudShift.value = t * 0.0009;
      stars.position.set(-leanX * 0.03, -leanY * 0.02 + p * 0.08, 0);
      renderer.render(scene, camera);
    };

    let raf = 0, visible = true;
    const frame = (now: number) => {
      raf = 0;
      if (progress.current < 1.05) draw(now);
      if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (ready && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      wake();
    });
    io.observe(canvas);
    document.addEventListener('visibilitychange', wake);
    // With reduced motion the frame is drawn again when the page scrolls, as nothing moves by itself.
    const onScroll = () => {
      if (reduced && ready && progress.current < 1.05) draw(performance.now());
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let cancelled = false;
    Promise.all([load('moon.jpg', true), load('moon-bump.jpg', false), load('earth-day.jpg', true), load('earth-night.jpg', true), load('earth-clouds.jpg', false), load('earth-water.jpg', false)])
      .then(([moonMap, bump, day, night, clouds, water]) => {
        if (cancelled) return;
        moonMat.map = moonMap;
        moonMat.bumpMap = bump;
        moonMat.bumpScale = 2.2;
        moonMat.needsUpdate = true;
        for (const t of [clouds]) t.wrapS = THREE.RepeatWrapping;
        earthMat.uniforms.dayMap.value = day;
        earthMat.uniforms.nightMap.value = night;
        earthMat.uniforms.cloudMap.value = clouds;
        earthMat.uniforms.waterMap.value = water;
        scene.add(halo);
        scene.add(earth);
        ready = true;
        draw(performance.now());
        done.current.onReady();
        wake();
      })
      .catch((e: unknown) => {
        if (!cancelled) done.current.onFail(e instanceof Error ? e.message : 'textures failed');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose();
          if (x instanceof THREE.ShaderMaterial) for (const u of Object.values(x.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
          x.dispose();
        }
      });
      renderer.dispose();
    };
  }, [progress, reduced, base]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />;
}
