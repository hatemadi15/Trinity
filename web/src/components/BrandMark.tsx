'use client';
import { useEffect, useId, useRef } from 'react';

/** Degrees the Moon turns for each pixel the page scrolls: a full turn every 1,800 px. */
export const TURN_PER_PX = 0.2;

/** Its maria (the dark seas) and craters, drawn on a 32-unit disc centred at 16, 16; the group turns as one. */
const MARIA: [number, number, number, number, number][] = [
  [11, 11, 5.2, 3.6, -20],
  [19.5, 9.5, 3.4, 2.4, 10],
  [14, 19, 3.8, 2.6, 30],
  [21, 18, 2.6, 3.4, 0],
  [8.5, 18.5, 2.2, 1.6, -10],
];
const CRATERS: [number, number, number][] = [
  [17, 24.5, 1.9],
  [23.5, 13.5, 1.3],
  [9.5, 14.5, 1.1],
  [15.5, 6.5, 1],
  [25, 21, 0.9],
  [12, 25, 0.8],
];

/**
 * The Moon with Earth beyond its limb: Earthrise's mark (spec 23). The Moon's face turns as the page scrolls, as a
 * globe turns under a fixed light, so the shading stays put while the seas and craters move. With reduced motion it
 * holds still.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const face = useRef<SVGGElement>(null);
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const turn = () => {
      raf = 0;
      face.current?.setAttribute('transform', `rotate(${(window.scrollY * TURN_PER_PX) % 360} 16 16)`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(turn);
    };
    turn();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="overflow-visible">
      <defs>
        <clipPath id={`disc-${id}`}>
          <circle cx="16" cy="16" r="12.5" />
        </clipPath>
        <radialGradient id={`shade-${id}`} cx="30%" cy="30%" r="85%">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
        <radialGradient id={`earth-${id}`} cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="#cfe0ff" />
          <stop offset="0.55" stopColor="#5f8fff" />
          <stop offset="1" stopColor="#1b3f9e" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#disc-${id})`}>
        <circle cx="16" cy="16" r="12.5" fill="#d7d8da" />
        <g ref={face} data-moon-face="">
          {MARIA.map(([cx, cy, rx, ry, a], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${a} ${cx} ${cy})`} fill="#8e9096" opacity="0.75" />
          ))}
          {CRATERS.map(([cx, cy, r], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="#a5a7ac" />
              <circle cx={cx - r * 0.25} cy={cy - r * 0.25} r={r * 0.6} fill="#f1f1f1" opacity="0.55" />
            </g>
          ))}
        </g>
        <circle cx="16" cy="16" r="12.5" fill={`url(#shade-${id})`} />
      </g>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--line-strong)" strokeWidth="0.6" opacity="0.6" />
      {/* Earth, beyond the limb: the one colour in the mark, with its air's glow. */}
      <circle cx="27.2" cy="5.2" r="5.6" fill="rgb(var(--glow))" opacity="0.22" className="transition-opacity duration-300 group-hover:opacity-50" />
      <circle cx="27.2" cy="5.2" r="3.3" fill={`url(#earth-${id})`} />
    </svg>
  );
}
