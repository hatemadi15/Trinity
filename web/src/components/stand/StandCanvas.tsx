'use client';
import { useEffect, useRef, useState } from 'react';
import { crossStars, type StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { compassWord } from '@/lib/viz/ground';

export type RendererLike = Pick<StandRenderer, 'setTime' | 'setView' | 'resize' | 'render' | 'labels' | 'dispose'>;
/** Where to turn the view; a new object turns it again, even to the same place. */
export interface LookTarget { yaw: number; pitch: number; fov: number }

/** Degrees the view rests higher on a portrait screen, so the Sun on the horizon sits below the answer's plate. */
export const portraitLift = (width: number, height: number): number => (height > width ? 3 : 0);

/** The compass strip: 120° of the horizon across 300 px, ticks every 15°, the eight points named; its ends fade, so no letter is cut in half. */
const STRIP_W = 300, PX_PER_DEG = STRIP_W / 120;
const STRIP_FADE = 'linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)';
/** Narrower than this (degrees up and down) the view is zoomed in: the compass says so, and the lander's parts are named. */
const ZOOMED_FOV = 45;
const POINT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TICKS = Array.from({ length: 72 }, (_, k) => -360 + k * 15);

const lerpAngle = (a: number, b: number, f: number) => (a + ((((b - a + 540) % 360) - 180) * f) + 360) % 360;
const LABEL = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px]';

/**
 * The sky from the site, full window. Drag, the wheel and the arrow keys look around; `look` turns the
 * view smoothly; the labels follow the Sun and Earth, and a compass strip shows the heading. The shown time glides to the
 * hour at 14 hours a second (faster than Play's 12), so Play sweeps the shadows smoothly; a jump of more
 * than 2 hours is taken at once. On opening, the view settles from the sky down to the horizon in under
 * 4 seconds, unless the system asks for reduced motion. A line says which way the view faces, and when it
 * is zoomed in; the bright stars carry their names at night and when the view looks up; zoomed in on the
 * lander, its solar panel, dish and power light carry theirs.
 */
export function StandCanvas({
  scene,
  hour,
  look,
  startYaw,
  reducedMotion,
  createRenderer,
  sunLabel,
  earthLabel,
  night,
  onFail,
}: {
  scene: StandScene;
  hour: number;
  look: LookTarget | null;
  startYaw: number;
  reducedMotion: boolean;
  createRenderer: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike;
  sunLabel: string;
  earthLabel: string;
  /** The Sun is hidden at the site: the stars carry their names. */
  night: boolean;
  onFail: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sunRef = useRef<HTMLSpanElement>(null);
  const landerRef = useRef<HTMLSpanElement>(null);
  const partRefs = useRef<Record<'panel' | 'dish' | 'lamp', HTMLSpanElement | null>>({ panel: null, dish: null, lamp: null });
  const earthRef = useRef<HTMLSpanElement>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const facingRef = useRef<HTMLParagraphElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef(hour);
  const nightRef = useRef(night);
  // A tall screen opens wider (80° up and down), so the Sun and the lander both fit across it.
  const view = useRef({ yaw: startYaw, pitch: reducedMotion ? 2 : 34, fov: typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 80 : 60 });
  const goal = useRef<LookTarget | null>(null);
  const intro = useRef<{ start: number } | null>(reducedMotion ? null : { start: 0 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  // Fingers on the canvas, for a two-finger pinch: spreading them narrows the view.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; fov: number } | null>(null);
  const failRef = useRef(onFail);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    hourRef.current = hour;
  }, [hour]);
  useEffect(() => {
    nightRef.current = night;
  }, [night]);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);
  useEffect(() => {
    if (!look) return;
    goal.current = look;
    intro.current = null;
  }, [look]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let r: RendererLike;
    try {
      r = createRenderer(el, scene);
    } catch (e) {
      failRef.current(e instanceof Error ? e.message : String(e));
      return;
    }
    const size = () => r.resize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
    size();
    window.addEventListener('resize', size);
    let shown = hourRef.current;
    let last = performance.now();
    r.setTime(shown);
    let raf = 0;
    // Labels never touch the words: a label whose box meets a panel (data-plate) is hidden.
    let plates: DOMRect[] = [];
    const place = (node: HTMLElement | null, s: { x: number; y: number; visible: boolean } | null) => {
      if (!node) return;
      if (!s || !s.visible) {
        node.hidden = true;
        return;
      }
      node.style.left = `${s.x * 100}%`;
      node.style.top = `${s.y * 100}%`;
      node.hidden = false;
      let b = node.getBoundingClientRect();
      // Kept inside the screen: a label near an edge slides in rather than being cut off.
      const w = el.clientWidth || window.innerWidth;
      const shift = b.right > w - 4 ? b.right - (w - 4) : b.left < 4 ? b.left - 4 : 0;
      if (b.width > 0 && shift !== 0) {
        node.style.left = `calc(${s.x * 100}% - ${shift}px)`;
        b = node.getBoundingClientRect();
      }
      if (b.width > 0 && plates.some((p) => b.right > p.left - 4 && b.left < p.right + 4 && b.bottom > p.top - 4 && b.top < p.bottom + 4)) node.hidden = true;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const d = hourRef.current - shown;
      if (d !== 0) {
        shown = Math.abs(d) > 2 ? hourRef.current : shown + Math.sign(d) * Math.min(Math.abs(d), dt * 14);
        r.setTime(shown);
      }
      const v = view.current;
      const i = intro.current;
      if (i && !drag.current) {
        if (i.start === 0) i.start = now;
        const f = Math.min(1, (now - i.start) / 3800);
        v.pitch = 34 + (2 - 34) * (1 - Math.pow(1 - f, 3));
        if (f >= 1) intro.current = null;
      }
      const g = goal.current;
      if (g) {
        // Eased by the time passed, not the frames drawn: as quick on a slow graphics chip as on a fast one.
        const k = 1 - Math.exp(-dt * 5);
        v.yaw = lerpAngle(v.yaw, g.yaw, k);
        v.pitch += (g.pitch - v.pitch) * k;
        v.fov += (g.fov - v.fov) * k;
        if (Math.abs(((g.yaw - v.yaw + 540) % 360) - 180) < 0.1 && Math.abs(g.pitch - v.pitch) < 0.1 && Math.abs(g.fov - v.fov) < 0.1) goal.current = null;
      }
      const lift = portraitLift(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
      r.setView(v.yaw, Math.max(-35, Math.min(89, v.pitch + lift)), v.fov);
      r.render();
      const l = r.labels();
      plates = [...document.querySelectorAll('[data-plate]')].map((p) => p.getBoundingClientRect()).filter((p) => p.width > 0);
      place(sunRef.current, l.sun);
      place(earthRef.current, l.earth);
      place(landerRef.current, l.lander);
      // Zoomed in on the lander, its parts carry their names.
      const close = v.fov < ZOOMED_FOV;
      for (const k of ['panel', 'dish', 'lamp'] as const) place(partRefs.current[k], close && l.parts ? l.parts[k] : null);
      // Star names at night, or when the view looks well up, where they would not crowd the day's sky.
      const named = nightRef.current || v.pitch > 25;
      l.stars.forEach((st, k) => place(starRefs.current[k], { ...st, visible: st.visible && named }));
      const facing = v.pitch > 60 ? 'Looking up' : `Facing ${compassWord(v.yaw)}${v.fov < ZOOMED_FOV ? ', zoomed in' : ''}`;
      if (facingRef.current && facingRef.current.textContent !== facing) facingRef.current.textContent = facing;
      if (trackRef.current) trackRef.current.style.transform = `translateX(${STRIP_W / 2 - (v.yaw + 360) * PX_PER_DEG}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      r.dispose();
    };
  }, [scene, createRenderer]);

  const release = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setDragging(false);
    }
  };

  const turn = (dYaw: number, dPitch: number, zoom = 1) => {
    const v = view.current;
    goal.current = null;
    intro.current = null;
    v.yaw = (v.yaw + dYaw + 360) % 360;
    v.pitch = Math.max(-35, Math.min(85, v.pitch + dPitch));
    v.fov = Math.max(14, Math.min(75, v.fov * zoom));
  };

  return (
    <>
      <canvas
        ref={canvas}
        role="application"
        aria-label="The view from the site. Drag or use the arrow keys to look around; plus and minus, the wheel or two fingers zoom."
        tabIndex={0}
        className={`fixed inset-0 h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          goal.current = null;
          intro.current = null;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov: view.current.fov };
            drag.current = null;
          } else if (pointers.current.size === 1) {
            drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch };
            setDragging(true);
          }
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = pinch.current;
          if (p && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            view.current.fov = Math.max(14, Math.min(75, (p.fov * p.dist) / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
            return;
          }
          const d = drag.current;
          if (!d) return;
          const k = view.current.fov / (e.currentTarget.clientHeight || window.innerHeight);
          view.current.yaw = (d.yaw - (e.clientX - d.x) * k + 360) % 360;
          view.current.pitch = Math.max(-35, Math.min(85, d.pitch + (e.clientY - d.y) * k));
        }}
        onPointerUp={(e) => release(e.pointerId)}
        onPointerCancel={(e) => release(e.pointerId)}
        onWheel={(e) => turn(0, 0, e.deltaY > 0 ? 1.08 : 0.93)}
        onKeyDown={(e) => {
          const keys: Record<string, [number, number, number?]> = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3], '+': [0, 0, 0.93], '=': [0, 0, 0.93], '-': [0, 0, 1.08] };
          const k = keys[e.key];
          if (!k) return;
          e.preventDefault();
          turn(k[0], k[1], k[2]);
        }}
      />
      <div
        aria-hidden="true"
        data-plate=""
        style={{ width: STRIP_W }}
        className="pointer-events-none fixed bottom-[calc(var(--bar-h,129px)+14px)] left-1/2 -translate-x-1/2 overflow-hidden rounded-[6px] border border-white/15 bg-black/70 text-[#f2f0ea] max-md:bottom-auto max-md:top-[calc(var(--top-h,220px)+8px)]"
      >
        <div className="relative h-7" style={{ maskImage: STRIP_FADE, WebkitMaskImage: STRIP_FADE }}>
          <div ref={trackRef} className="absolute inset-y-0 left-0" style={{ transform: `translateX(${STRIP_W / 2 - (startYaw + 360) * PX_PER_DEG}px)` }}>
            {TICKS.map((d) => {
              const az = ((d % 360) + 360) % 360;
              return az % 45 === 0 ? (
                <span key={d} className="absolute top-1 -translate-x-1/2 text-[14px] font-semibold" style={{ left: (d + 360) * PX_PER_DEG }}>
                  {POINT[az / 45]}
                </span>
              ) : (
                <i key={d} className="absolute bottom-1 h-2 w-px bg-white/45" style={{ left: (d + 360) * PX_PER_DEG }} />
              );
            })}
          </div>
        </div>
        <i className="absolute left-1/2 top-0 h-7 w-0.5 -translate-x-1/2 bg-white" />
        <p ref={facingRef} className="pb-1 text-center text-[15px]">
          {`Facing ${compassWord(startYaw)}`}
        </p>
      </div>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <span ref={sunRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#f6b646]`}>
          {sunLabel}
        </span>
        <span ref={earthRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#74adff]`}>
          {earthLabel}
        </span>
        {scene.lander && (
          <span ref={landerRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#f2f0ea]`}>
            {`The lander, ${Math.round(scene.lander.distM)} m away`}
          </span>
        )}
        {scene.lander &&
          (
            [
              ['panel', 'Solar panel', '-translate-x-1/2 -translate-y-[calc(100%+6px)]'],
              ['dish', 'Dish, aimed at Earth', 'translate-x-3 -translate-y-1/2'],
              ['lamp', 'Power light', '-translate-x-[calc(100%+12px)] -translate-y-1/2'],
            ] as const
          ).map(([k, name, at]) => (
            <span
              key={k}
              ref={(node) => {
                partRefs.current[k] = node;
              }}
              hidden
              className={`${LABEL} ${at} text-[14px] text-[#e4e1da]`}
            >
              {name}
            </span>
          ))}
        {[...(scene.sky.names ?? []).map((n) => n.name), ...(crossStars(scene.sky.names) ? ['Southern Cross'] : [])].map((name, k) => (
          <span
            key={name}
            ref={(node) => {
              starRefs.current[k] = node;
            }}
            hidden
            className="pointer-events-none absolute translate-x-2 -translate-y-1/2 whitespace-nowrap text-[14px] text-[#d7d4cc] [text-shadow:0_0_4px_#000]"
          >
            {name}
          </span>
        ))}
      </div>
    </>
  );
}
