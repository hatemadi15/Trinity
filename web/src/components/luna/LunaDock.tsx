'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { ChunkBoundary } from '@/components/ChunkBoundary';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { lunaStore, type LunaStatus } from '@/lib/luna/store';
import { LunaPanel, lunaPlace } from './LunaButton';
import type { BotFace, LunaBotProps, LunaBotState } from './LunaBot';
import { KAOMOJI, LunaPet, lunaMood } from './LunaPet';

// three.js comes with her, after the page: nothing on this module's import path pulls it in.
const LiveBot = dynamic(() => import('./LunaBot'), { ssr: false });

/** Where a visitor last left her, as px from the window's left and bottom. Kept in this browser only. */
export const LUNA_SPOT_KEY = 'earthrise.luna.spot';
/** A press that moves less than this is a click, not a drag. */
const DRAG_PX = 6;

/** The face her 3D self makes for what she is doing; while she is off she is awake and idle, not asleep. */
export function botFace(status: LunaStatus): BotFace {
  switch (status) {
    case 'off':
      return 'idle';
    case 'ready':
      return 'happy';
    case 'listening':
      return 'wide';
    case 'thinking':
      return 'dots';
    case 'speaking':
      return 'talk';
    case 'typing':
      return 'happy';
    case 'blocked':
      return 'blocked';
    case 'offline':
      return 'cross';
  }
}

/** The stored spot as text, read after hydration (the server has no storage), so the first paint matches the server's. */
function storedSpot(): string | null {
  try {
    return window.localStorage.getItem(LUNA_SPOT_KEY);
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};

export function parseSpot(text: string | null): { x: number; y: number } | null {
  try {
    const v = JSON.parse(text ?? 'null') as { x?: unknown; y?: unknown } | null;
    return v && typeof v.x === 'number' && typeof v.y === 'number' ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}
/** Her box's height at a window width: smaller on a phone. */
const boxHeight = (vw: number) => (vw < 640 ? 146 : 190);

/** Keeps her whole on screen: `x` from the left, `y` from the bottom, for a box `w` by `h`. */
export function clampSpot(x: number, y: number, w: number, h: number, vw: number, vh: number) {
  return { x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)), y: Math.min(Math.max(8, y), Math.max(8, vh - h - 8)) };
}

/**
 * Luna's 3D self at the page's lower left (spec 23). She floats and plays by herself; a press on her turns Luna on or
 * off, as the header's button does, and opens Luna's panel beside her; a drag moves her anywhere on the screen, and
 * this browser remembers where. Over Explore's pinned time bar she rises above it. Without WebGL her drawn pet stands
 * in. A speech bubble says what she is doing, and hello while the pointer is on her.
 */
export function LunaDock() {
  const reduced = useReducedMotion();
  const on = useStore(lunaStore, (s) => s.on);
  const status = useStore(lunaStore, (s) => s.status);
  const at = useStore(lunaPlace, (s) => s.at);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  // Where she was left last time, then wherever she is carried in this page.
  const stored = useSyncExternalStore(noSubscribe, storedSpot, () => null);
  const [moved, setSpot] = useState<{ x: number; y: number } | null>(null);
  const kept = useMemo(() => parseSpot(stored), [stored]);
  const spot = moved ?? kept;
  const [lift, setLift] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; x: number; y: number; moved: boolean; to: { x: number; y: number } | null } | null>(null);
  const bot = useRef<LunaBotState>({ face: botFace(status), hover: false, dragging: false, ears: 'rest' });

  // What the 3D scene reads every frame.
  useEffect(() => {
    bot.current.face = botFace(status);
    bot.current.hover = hover;
    bot.current.dragging = dragging;
    bot.current.ears = status === 'listening' || status === 'speaking' ? 'up' : status === 'blocked' || status === 'offline' ? 'down' : 'rest';
  }, [status, hover, dragging]);

  // Over a bar pinned at the window's foot (Explore's time bar) she stands on it rather than behind it.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const bar = document.querySelector<HTMLElement>('section[aria-label="Time"]');
      const r = bar?.getBoundingClientRect();
      // Only while the bar is at the window's foot: Explore's bar is pinned for its hour-by-hour section alone, and once
      // it has scrolled up with that section she is back on the page's own foot.
      setLift(r && r.top < window.innerHeight && r.bottom >= window.innerHeight - 1 ? Math.max(0, window.innerHeight - r.top) : 0);
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
      mo.disconnect();
    };
  }, []);

  const toggle = () => {
    lunaPlace.setState({ at: 'dock' });
    // During the press, so a browser that wants one first lets her voice play later.
    if (!on) lunaStore.getState().prime();
    lunaStore.getState().setOn(!on);
  };

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button > 0 || !box.current) return;
    const r = box.current.getBoundingClientRect();
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: window.innerHeight - r.bottom - lift, moved: false, to: null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    const r = box.current.getBoundingClientRect();
    d.to = clampSpot(d.x + dx, d.y - dy, r.width, r.height, window.innerWidth, window.innerHeight - lift);
    setSpot(d.to);
  };
  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      setDragging(false);
      try {
        if (d.to) window.localStorage.setItem(LUNA_SPOT_KEY, JSON.stringify(d.to));
      } catch {
        // the spot lasts for this page only
      }
    } else toggle();
  };

  const mood = lunaMood(status);
  const bubble = on ? `${KAOMOJI[mood]}` : hover ? 'Hi, I’m Luna ^ ^' : null;
  const left = spot ? spot.x : undefined;
  const bottom = (spot ? spot.y : 16) + lift;
  // Her panel opens above her, or below her when there is no room above (she has been carried up the screen); and
  // to her left when she stands near the right edge.
  const room = spot !== null && typeof window !== 'undefined' ? { above: window.innerHeight - bottom - boxHeight(window.innerWidth), right: window.innerWidth - spot.x } : null;
  const below = room !== null && room.above < 330;
  const toLeft = room !== null && room.right < 380;

  return (
    <div
      ref={box}
      data-luna-dock=""
      className={`no-print fixed z-40 h-[190px] w-[156px] max-sm:h-[146px] max-sm:w-[120px] ${spot ? '' : 'left-3 sm:left-5'} ${dragging ? '' : 'transition-[bottom] duration-300'}`}
      style={{ left, bottom }}
    >
      {bubble && (
        <p
          aria-hidden="true"
          className="mono pointer-events-none absolute bottom-[80%] left-[64%] whitespace-nowrap rounded-full border border-line-strong bg-surface px-3 py-1 text-[14px] text-ink shadow-[0_0_24px_-8px_rgb(var(--glow)/var(--glow-strength))]"
        >
          {bubble}
        </p>
      )}
      <button
        type="button"
        aria-label={on ? 'Luna is on: press to turn her off' : 'Talk to Luna'}
        aria-pressed={on}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className={`block h-full w-full touch-none rounded-full ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {failed ? (
          <span className="grid h-full w-full place-items-center">
            <LunaPet mood={on ? mood : hover ? 'happy' : 'sleepy'} size={88} />
          </span>
        ) : (
          <ChunkBoundary fallback={null} onError={() => setFailed(true)}>
            <Bot state={bot} reduced={reduced} onReady={() => {}} onFail={() => setFailed(true)} />
          </ChunkBoundary>
        )}
      </button>
      {on && at === 'dock' && (
        <LunaPanel
          className={`absolute z-50 w-[min(360px,calc(100vw-24px))] rounded-2xl border border-line-strong bg-surface p-4 text-left text-[15px] text-ink shadow-[0_0_0_1px_rgb(var(--glow)/0.15),0_24px_60px_-20px_rgb(var(--glow)/var(--glow-strength))] ${toLeft ? 'right-0' : 'left-0'} ${below ? 'top-full mt-2' : 'bottom-full mb-10'}`}
        />
      )}
    </div>
  );
}

function Bot(props: LunaBotProps) {
  return <LiveBot {...props} />;
}
