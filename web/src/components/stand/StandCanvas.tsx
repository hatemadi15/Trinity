'use client';
import { useEffect, useRef, useState } from 'react';
import type { StandRenderer, StandScene } from '@/lib/sky/standRenderer';

export type RendererLike = Pick<StandRenderer, 'setTime' | 'setView' | 'resize' | 'render' | 'labels' | 'dispose'>;
/** Where to turn the view; a new object turns it again, even to the same place. */
export interface LookTarget { yaw: number; pitch: number; fov: number }

const lerpAngle = (a: number, b: number, f: number) => (a + ((((b - a + 540) % 360) - 180) * f) + 360) % 360;
const LABEL = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px]';

/**
 * The sky from the site, full window. Drag, the wheel and the arrow keys look around; `look` turns the
 * view smoothly; the labels follow the Sun, Earth and the compass points. The shown time glides to the
 * hour at 14 hours a second (faster than Play's 12), so Play sweeps the shadows smoothly; a jump of more
 * than 2 hours is taken at once. On opening, the view settles from the sky down to the horizon in under
 * 4 seconds, unless the system asks for reduced motion.
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
  onFail: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sunRef = useRef<HTMLSpanElement>(null);
  const earthRef = useRef<HTMLSpanElement>(null);
  const compassRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hourRef = useRef(hour);
  const view = useRef({ yaw: startYaw, pitch: reducedMotion ? 2 : 34, fov: 60 });
  const goal = useRef<LookTarget | null>(null);
  const intro = useRef<{ start: number } | null>(reducedMotion ? null : { start: 0 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const failRef = useRef(onFail);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    hourRef.current = hour;
  }, [hour]);
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
    const place = (node: HTMLElement | null, s: { x: number; y: number; visible: boolean }) => {
      if (!node) return;
      node.hidden = !s.visible;
      node.style.left = `${s.x * 100}%`;
      node.style.top = `${s.y * 100}%`;
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
        v.yaw = lerpAngle(v.yaw, g.yaw, 0.08);
        v.pitch += (g.pitch - v.pitch) * 0.08;
        v.fov += (g.fov - v.fov) * 0.08;
        if (Math.abs(((g.yaw - v.yaw + 540) % 360) - 180) < 0.1 && Math.abs(g.pitch - v.pitch) < 0.1 && Math.abs(g.fov - v.fov) < 0.1) goal.current = null;
      }
      r.setView(v.yaw, v.pitch, v.fov);
      r.render();
      const l = r.labels();
      place(sunRef.current, l.sun);
      place(earthRef.current, l.earth);
      l.compass.forEach((c, k) => place(compassRefs.current[k], c));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      r.dispose();
    };
  }, [scene, createRenderer]);

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
        aria-label="The view from the site. Drag or use the arrow keys to look around; plus and minus zoom."
        tabIndex={0}
        className={`fixed inset-0 h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch };
          goal.current = null;
          intro.current = null;
          setDragging(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const k = view.current.fov / (e.currentTarget.clientHeight || window.innerHeight);
          view.current.yaw = (d.yaw - (e.clientX - d.x) * k + 360) % 360;
          view.current.pitch = Math.max(-35, Math.min(85, d.pitch + (e.clientY - d.y) * k));
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onWheel={(e) => turn(0, 0, e.deltaY > 0 ? 1.08 : 0.93)}
        onKeyDown={(e) => {
          const keys: Record<string, [number, number, number?]> = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3], '+': [0, 0, 0.93], '=': [0, 0, 0.93], '-': [0, 0, 1.08] };
          const k = keys[e.key];
          if (!k) return;
          e.preventDefault();
          turn(k[0], k[1], k[2]);
        }}
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <span ref={sunRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#f6b646]`}>
          {sunLabel}
        </span>
        <span ref={earthRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#74adff]`}>
          {earthLabel}
        </span>
        {(['N', 'E', 'S', 'W'] as const).map((letter, k) => (
          <span
            key={letter}
            ref={(node) => {
              compassRefs.current[k] = node;
            }}
            hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[5px] bg-black/60 px-1.5 text-[15px] font-semibold text-[#f2f0ea]"
          >
            {letter}
          </span>
        ))}
      </div>
    </>
  );
}
