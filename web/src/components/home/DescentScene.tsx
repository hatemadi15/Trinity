'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { descentPose, ease, firstFromDisc, globePoint, psSouthKm, R_MOON_KM, type Disc, type FirstMoon } from '@/lib/viz/descentPose';

/**
 * The descent's picture (spec 23.1): one globe, and the camera coming down to a landing site as the page scrolls.
 * The Moon turns, tips its south pole towards us and comes closer; on its one surface lie, each in its place, NASA's
 * Moon from space, the relief map of the pole and the shadow picture of the site, so the view sharpens as it nears
 * and nothing is swapped. Earth and the stars stand behind it, in a layer of their own that does not zoom.
 *
 * `progress` (0 to 1) is read every frame and followed smoothly, so a wheel's steps or a jerky scroll never jolt the
 * picture; the labels in `pins` are moved to their places on the globe. The first screen's Moon and Earth stand where
 * `layout` puts them, clear of the page's words. With reduced motion nothing turns or glides by itself: the picture
 * shows each stage's own view, drawn again only when the progress or the layout changes.
 */
export interface DescentHero {
  lat: number;
  lon: number;
  windowKm: number;
  image: string;
  relief: string;
  reliefHalfKm: number;
}

/** The first screen as the page measured it: the picture's size, and the Moon's and Earth's discs, in px. */
export interface DescentLayout {
  w: number;
  h: number;
  moon: FirstMoon;
  earth: Disc;
}

export interface DescentSceneProps {
  progress: { current: number };
  /** Where the first screen's Moon and Earth stand (Descent measures the words); unset, the scene's own defaults. */
  layout?: { current: DescentLayout | null };
  reduced: boolean;
  hero: DescentHero;
  /** Labels to keep on their points of the globe, by pin: the scene sets each one's transform. */
  pins: { current: Map<string, { el: HTMLElement; lat: number; lon: number }> };
  onReady: () => void;
  onFail: (why: string) => void;
  base?: string;
}

const MOON_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vViewN;
varying vec3 vViewPos;
varying vec2 vUv;
void main() {
  vObj = position;
  vUv = uv;
  vViewN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

/**
 * The Moon's surface: its colour map lit by the Sun with its relief for shading; then, by the pipeline's own south polar
 * stereographic projection worked out per pixel, the relief map of the pole (a round cap, fading at its edge) and the
 * site's shadow picture (a square, the ground round it dimmed so the eye goes to it).
 */
const MOON_FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D bump;
uniform sampler2D relief;
uniform sampler2D siteMap;
uniform vec3 sunDir;
uniform float bumpScale;
uniform float reliefMix;
uniform float siteMix;
uniform float reliefHalfKm;
uniform float siteKm;
uniform vec2 siteXY;
uniform float R;
varying vec3 vObj;
varying vec3 vViewN;
varying vec3 vViewPos;
varying vec2 vUv;
const float PI = 3.141592653589793;

vec3 bumped(vec3 n) {
  vec2 dx = dFdx(vUv), dy = dFdy(vUv);
  float h = texture2D(bump, vUv).x;
  vec2 dh = bumpScale * vec2(texture2D(bump, vUv + dx).x - h, texture2D(bump, vUv + dy).x - h);
  vec3 sx = dFdx(vViewPos), sy = dFdy(vViewPos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}

void main() {
  vec3 n = normalize(vObj);
  // South polar stereographic, from the point's direction: the colatitude from the south pole and the longitude.
  float colat = atan(length(n.xz), -n.y);
  float lon = atan(n.z, -n.x) - PI;
  float rho = 2.0 * R * tan(colat * 0.5);
  vec2 xy = vec2(rho * sin(lon), rho * cos(lon));

  vec3 N = bumped(normalize(vViewN));
  float ndl = max(dot(N, sunDir), 0.0);
  // The map's own crater shading is strong: eased a little, so the whole Moon reads as the Moon and not as a golf ball.
  vec3 albedo = texture2D(map, vUv).rgb;
  albedo = mix(vec3(dot(albedo, vec3(0.333))), albedo, 1.0) * 0.86 + 0.06;
  vec3 col = albedo * (0.05 + 1.3 * ndl);

  vec2 ru = vec2(0.5 + xy.x / (2.0 * reliefHalfKm), 0.5 - xy.y / (2.0 * reliefHalfKm));
  float rm = smoothstep(0.5, 0.38, length(ru - 0.5)) * reliefMix;
  vec3 rel = texture2D(relief, vec2(ru.x, 1.0 - ru.y)).rgb;
  col = mix(col, rel * 1.08, rm);
  // Round the cap the plain globe dims as the map comes in, so the eye goes to the map.
  col *= mix(1.0, 0.5, (1.0 - smoothstep(0.5, 0.38, length(ru - 0.5))) * reliefMix);

  vec2 su = vec2(0.5 + (xy.x - siteXY.x) / siteKm, 0.5 - (xy.y - siteXY.y) / siteKm);
  float e = max(abs(su.x - 0.5), abs(su.y - 0.5));
  float sm = smoothstep(0.5, 0.485, e);
  vec3 sc = texture2D(siteMap, vec2(clamp(su.x, 0.0, 1.0), 1.0 - clamp(su.y, 0.0, 1.0))).rgb;
  col = mix(col, sc, sm * siteMix);
  col *= mix(1.0, 0.38, (1.0 - sm) * siteMix);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Earth: the Blue Marble a little desaturated, its clouds and their shadows, city lights at night, the oceans' glint, its air. */
const EARTH_FRAG = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform sampler2D waterMap;
uniform vec3 sunDir;
uniform float cloudShift;
uniform float fade;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = vec3(0.0, 0.0, 1.0);
  float ndl = dot(n, sunDir);
  float lit = smoothstep(-0.08, 0.22, ndl);
  vec3 day = texture2D(dayMap, vUv).rgb;
  day = mix(vec3(dot(day, vec3(0.299, 0.587, 0.114))), day, 0.82);
  float clouds = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
  float shadow = texture2D(cloudMap, vUv + vec2(cloudShift + 0.0015, 0.0012)).r;
  vec3 col = mix(day * (1.0 - shadow * 0.35), vec3(0.96), clouds * 0.92) * max(ndl, 0.0) * 1.55;
  col += texture2D(nightMap, vUv).rgb * vec3(1.0, 0.82, 0.55) * (1.0 - lit) * (1.0 - clouds) * 0.9;
  vec3 h = normalize(sunDir + v);
  col += vec3(1.0, 0.96, 0.88) * pow(max(dot(n, h), 0.0), 48.0) * texture2D(waterMap, vUv).r * (1.0 - clouds) * 0.65 * lit;
  col += vec3(0.32, 0.58, 1.0) * pow(1.0 - max(dot(n, v), 0.0), 2.2) * (0.15 + 1.1 * smoothstep(-0.25, 0.7, ndl));
  gl_FragColor = vec4(col * fade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const HALO_VERT = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/** A body's glow beyond its disc, on the far side of a larger sphere: nothing at its edge, brightest at the body's. */
const HALO_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 tint;
uniform float strength;
uniform float inner;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float d = clamp(-n.z / inner, 0.0, 1.0);
  float side = 0.25 + 0.75 * smoothstep(-0.5, 0.7, dot(n.xy, sunDir.xy));
  gl_FragColor = vec4(tint * d * d * d * side * strength, 1.0);
  #include <colorspace_fragment>
}`;
const innerFor = (scale: number) => Math.sqrt(1 - 1 / (scale * scale));

/** The Sun, from the upper left and in front: the Moon's face lit, Earth a fat crescent turned to the left. */
const SUN = new THREE.Vector3(-0.62, 0.4, 0.68).normalize();
/** The turn about the polar axis at which, pole towards us, longitude 0 points up, as on the Choose a site map. */
const REST_SPIN = -Math.PI / 2;

/** How quickly the picture catches up with the scroll: the time constant of its glide, in seconds. */
const GLIDE_S = 0.14;

export default function DescentScene({ progress, reduced, hero, pins, layout, onReady, onFail, base = '/hero/textures' }: DescentSceneProps) {
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
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) {
      cb.current.onFail(e instanceof Error ? e.message : 'no WebGL');
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.autoClear = false;

    // Behind: the stars and Earth, in a view that does not zoom.
    const back = new THREE.Scene();
    const backCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    backCam.position.z = 20;
    const starCount = 900;
    const sp = new Float32Array(starCount * 3), sc = new Float32Array(starCount * 3);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < starCount; i++) {
      sp.set([(rand() * 2 - 1) * 3.4, (rand() * 2 - 1) * 3.4, -40], i * 3);
      const b = 0.3 + rand() * 0.7, blue = rand() > 0.85;
      sc.set(blue ? [0.55 * b, 0.7 * b, b] : [b, b, b], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
    back.add(stars);
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: null }, nightMap: { value: null }, cloudMap: { value: null }, waterMap: { value: null }, sunDir: { value: SUN }, cloudShift: { value: 0 }, fade: { value: 1 } },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
    earth.rotation.set(0.18, -1.9, 0.41);
    const earthHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN }, tint: { value: new THREE.Color(0x6f9dff) }, strength: { value: 1.2 }, inner: { value: innerFor(1.1) } }, vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );

    // In front: the Moon, in the view that comes down.
    const front = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.z = 20;
    const siteKm = psSouthKm(hero.lat, hero.lon);
    const moonMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        bump: { value: null },
        relief: { value: null },
        siteMap: { value: null },
        sunDir: { value: SUN },
        bumpScale: { value: 0.12 },
        reliefMix: { value: 0 },
        siteMix: { value: 0 },
        reliefHalfKm: { value: hero.reliefHalfKm },
        siteKm: { value: hero.windowKm },
        siteXY: { value: new THREE.Vector2(siteKm.x, siteKm.y) },
        R: { value: R_MOON_KM },
      },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 192), moonMat);
    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN }, tint: { value: new THREE.Color(0x9aa6ba) }, strength: { value: 0.3 }, inner: { value: innerFor(1.03) } }, vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    moonGlow.scale.setScalar(1.03);
    front.add(moonGlow, moon);
    const sitePoint = new THREE.Vector3(...globePoint(hero.lat, hero.lon));

    let aspect = 1, w = 1, h = 1;
    const resize = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      aspect = w / h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(w, h, false);
      for (const c of [cam, backCam]) {
        c.left = -aspect;
        c.right = aspect;
        c.top = 1;
        c.bottom = -1;
        c.updateProjectionMatrix();
      }
      dirty = true;
    };

    const t0 = performance.now();
    let idle = 0, lastNow = t0, lastP = -1, lastLayout: DescentLayout | null = null, dirty = true, ready = false;
    // The progress the picture shows: it glides after the scroll's, and is the scroll's at once with reduced motion.
    let shown = Math.min(Math.max(progress.current, 0), 1);
    const world = new THREE.Vector3();
    const draw = (now: number) => {
      const target = Math.min(Math.max(progress.current, 0), 1);
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      shown = reduced ? target : shown + (target - shown) * (1 - Math.exp(-dt / GLIDE_S));
      if (Math.abs(target - shown) < 1e-5) shown = target;
      const p = shown;
      // While the first screen rests the Moon turns slowly by itself, slowing to a stop as the page starts to scroll;
      // as the descent goes on that turn winds, gently, to a whole number of turns, so it always ends on the same view.
      if (!reduced) idle += dt * 0.05 * (1 - ease(p / 0.04));
      const view = layout?.current ?? null;
      const first = view && view.w > 0 && view.h > 0 ? firstFromDisc(view.moon, view.w, view.h) : undefined;
      const pose = descentPose(p, aspect, { reliefHalfKm: hero.reliefHalfKm, windowKm: hero.windowKm }, first);
      const idleNow = idle + (Math.round(idle / (2 * Math.PI)) * 2 * Math.PI - idle) * ease(p / 0.82);
      moon.rotation.set(pose.tilt, REST_SPIN + pose.spin + idleNow, 0);
      moon.updateMatrixWorld();

      cam.zoom = pose.zoom;
      cam.updateProjectionMatrix();
      world.copy(sitePoint).applyMatrix4(moon.matrixWorld);
      const wide = aspect >= 1;
      // The first screen: the Moon where the page left it room (right of the words, or under them), then the middle.
      const ox = (-pose.shiftX * aspect) / pose.zoom;
      const oy = -pose.shiftY / pose.zoom;
      cam.position.x = ox + (world.x - ox) * pose.toSite;
      cam.position.y = oy + (world.y - oy) * pose.toSite;

      moonMat.uniforms.reliefMix.value = pose.relief;
      moonMat.uniforms.siteMix.value = pose.site;
      // The relief's shading is for the whole Moon; close in, the map's own shading takes over.
      moonMat.uniforms.bumpScale.value = 0.12 * Math.max(0, 1 - pose.relief * 1.6);
      (moonGlow.material as THREE.ShaderMaterial).uniforms.strength.value = 0.3 * pose.earth;

      // Earth beside the Moon, leaving as the Moon fills the view.
      const t = reduced ? 0 : (now - t0) / 1000;
      earthMat.uniforms.fade.value = pose.earth;
      earthMat.uniforms.cloudShift.value = t * 0.0009;
      earth.rotation.y = -1.9 + t * 0.012;
      // Earth beside the first screen's Moon, where the page found it room (off the lower left limb on a wide screen,
      // the upper right on a tall one); it drifts away from the Moon as it fades.
      const spot = view ? { x: (view.earth.cx - w / 2) / (h / 2), y: (h / 2 - view.earth.cy) / (h / 2), r: view.earth.r / (h / 2) } : null;
      const er = spot ? spot.r : wide ? 0.085 : 0.07;
      earth.scale.setScalar(er);
      earthHalo.scale.setScalar(er * 1.1);
      const ex = spot ? spot.x : wide ? -0.26 : aspect * 0.62, ey = spot ? spot.y : wide ? -0.62 : -0.12;
      const mx = first ? first.nx * aspect : 0, my = first ? first.ny : 0;
      const away = Math.hypot(ex - mx, ey - my) || 1;
      earth.position.set(ex + ((ex - mx) / away) * (1 - pose.earth) * 0.5, ey + ((ey - my) / away) * (1 - pose.earth) * 0.5, 0);
      earthHalo.position.copy(earth.position);
      earth.visible = earthHalo.visible = pose.earth > 0.01;
      (earthHalo.material as THREE.ShaderMaterial).uniforms.strength.value = 1.2 * pose.earth;
      stars.rotation.z = (pose.spin + idleNow) * 0.04;
      stars.material.opacity = 0.85 * (0.35 + 0.65 * pose.earth);

      renderer.clear();
      renderer.render(back, backCam);
      renderer.clearDepth();
      renderer.render(front, cam);

      // The labels, on their points of the globe.
      const halfW = w / 2, halfH = h / 2;
      for (const { el, lat, lon } of pins.current.values()) {
        world.set(...globePoint(lat, lon)).applyMatrix4(moon.matrixWorld);
        const facing = world.z > 0;
        world.project(cam);
        el.style.transform = `translate(${(world.x * halfW + halfW).toFixed(1)}px, ${(-world.y * halfH + halfH).toFixed(1)}px)`;
        el.style.visibility = facing ? 'visible' : 'hidden';
      }
      lastP = target;
      lastLayout = view;
      dirty = false;
    };

    let raf = 0, visible = true;
    const frame = (now: number) => {
      raf = 0;
      if (ready && (!reduced || dirty || progress.current !== lastP || (layout?.current ?? null) !== lastLayout)) draw(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      wake();
    });
    io.observe(canvas);
    document.addEventListener('visibilitychange', wake);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const loader = new THREE.TextureLoader();
    const load = (url: string, srgb: boolean) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(
          url,
          (t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            resolve(t);
          },
          undefined,
          () => reject(new Error(`could not load ${url}`)),
        ),
      );
    let cancelled = false;
    Promise.all([
      load(`${base}/moon.jpg`, true),
      load(`${base}/moon-bump.jpg`, false),
      load(hero.relief, true),
      load(hero.image, true),
      load(`${base}/earth-day.jpg`, true),
      load(`${base}/earth-night.jpg`, true),
      load(`${base}/earth-clouds.jpg`, false),
      load(`${base}/earth-water.jpg`, false),
    ])
      .then(([moonMap, bump, relief, site, day, night, clouds, water]) => {
        if (cancelled) return;
        moonMat.uniforms.map.value = moonMap;
        moonMat.uniforms.bump.value = bump;
        moonMat.uniforms.relief.value = relief;
        moonMat.uniforms.siteMap.value = site;
        for (const t of [relief, site]) {
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          t.generateMipmaps = true;
        }
        clouds.wrapS = THREE.RepeatWrapping;
        earthMat.uniforms.dayMap.value = day;
        earthMat.uniforms.nightMap.value = night;
        earthMat.uniforms.cloudMap.value = clouds;
        earthMat.uniforms.waterMap.value = water;
        back.add(earthHalo, earth);
        ready = true;
        draw(performance.now());
        cb.current.onReady();
        wake();
      })
      .catch((e: unknown) => {
        if (!cancelled) cb.current.onFail(e instanceof Error ? e.message : 'pictures failed');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', wake);
      for (const scene of [back, front]) {
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | undefined;
          if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
          mat?.dispose();
        });
      }
      renderer.dispose();
    };
  }, [progress, reduced, hero, pins, layout, base]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />;
}

