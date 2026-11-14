import type { LunaStatus } from '@/lib/luna/store';

/** Luna's faces, drawn as the LEDs behind her visor. Each has its kaomoji, the way she would type it. */
export type LunaMood = 'sleepy' | 'happy' | 'listening' | 'thinking' | 'speaking' | 'blocked' | 'oops';

/** What face Luna makes for what she is doing (spec 23): asleep while off, all eyes while listening, and so on. */
export function lunaMood(status: LunaStatus): LunaMood {
  switch (status) {
    case 'off':
      return 'sleepy';
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'typing':
      return 'happy';
    case 'blocked':
      return 'blocked';
    case 'offline':
      return 'oops';
  }
}

export const KAOMOJI: Record<LunaMood, string> = {
  sleepy: '(u_u) zz',
  happy: '(^-^)',
  listening: '(o.o)',
  thinking: '(-_-)…',
  speaking: '(^o^)',
  blocked: '(>_<)',
  oops: '(x_x)',
};

const INK = '#16171a';
const SHELL = '#f4f6fa';
const BAND = '#5fb4ff';
const LED = '#8fd3ff';
const RED = '#ff5a6e';

/** The LEDs behind the visor for a mood: on a visor centred at 32, 37. */
function Face({ mood }: { mood: LunaMood }) {
  const line = { stroke: LED, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const blinking = 'origin-center [transform-box:fill-box] animate-[blink_4.2s_ease-in-out_infinite]';
  switch (mood) {
    case 'sleepy':
      return (
        <g opacity="0.75">
          <path d="M22.5 37 q3 2.6 6 0" {...line} />
          <path d="M35.5 37 q3 2.6 6 0" {...line} />
        </g>
      );
    case 'happy':
      return (
        <g>
          <path d="M22.5 39 l3 -4 l3 4" {...line} />
          <path d="M35.5 39 l3 -4 l3 4" {...line} />
        </g>
      );
    case 'listening':
      return (
        <g>
          <rect x="24" y="31" width="3.6" height="11" rx="1.8" fill={LED} className={blinking} />
          <rect x="36.4" y="31" width="3.6" height="11" rx="1.8" fill={LED} className={blinking} />
        </g>
      );
    case 'thinking':
      return (
        <g fill={LED}>
          <circle cx="26" cy="37" r="1.9" />
          <circle cx="32" cy="37" r="1.9" opacity="0.7" />
          <circle cx="38" cy="37" r="1.9" opacity="0.45" />
        </g>
      );
    case 'speaking':
      return (
        <g>
          <path d="M22.5 37.5 l3 -4 l3 4" {...line} />
          <path d="M35.5 37.5 l3 -4 l3 4" {...line} />
          <rect x="29" y="40" width="6" height="2.6" rx="1.3" fill={LED} className="origin-center [transform-box:fill-box] animate-[talk_0.32s_ease-in-out_infinite]" />
        </g>
      );
    case 'blocked':
      return (
        <g fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="32" cy="37" r="5.5" />
          <path d="M28.2 33.2 l7.6 7.6" />
        </g>
      );
    case 'oops':
      return (
        <g stroke={RED} strokeWidth="2.6" strokeLinecap="round">
          <path d="M22.5 33.5 l6 6 M28.5 33.5 l-6 6" />
          <path d="M35.5 33.5 l6 6 M41.5 33.5 l-6 6" />
        </g>
      );
  }
}

/**
 * Luna's pet (spec 23): a little robot rabbit with a Moon-white shell, blue bands, leaf ears and a visor whose LEDs
 * make her face. The face follows what Luna is doing (lunaMood); she floats a little and blinks, and holds still with
 * reduced motion. In a button she wakes up with a ^ ^ while the pointer is on it (`peek`). Decorative: the button or
 * panel around her says it in words. Her 3D self floats at the page's lower left (LunaDock).
 */
export function LunaPet({ mood, size = 32, peek = false, className = '' }: { mood: LunaMood; size?: number; peek?: boolean; className?: string }) {
  const perked = mood === 'listening' || mood === 'speaking';
  const droop = mood === 'sleepy' || mood === 'oops' || mood === 'blocked';
  const earL = droop ? -26 : perked ? -4 : -14;
  const earR = droop ? 26 : perked ? 4 : 14;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" data-mood={mood} className={`shrink-0 overflow-visible ${className}`}>
      <g className="origin-center animate-[float_3.4s_ease-in-out_infinite]">
        {/* Leaf ears that turn with her mood: up while she listens, down while she sleeps. */}
        {[
          { x: 23, a: earL },
          { x: 41, a: earR },
        ].map(({ x, a }) => (
          <g key={x} className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `rotate(${a}deg)`, transformOrigin: `${x}px 24px` }}>
            <path d={`M${x} 24 C ${x - 6} 16, ${x - 4} 6, ${x} 2 C ${x + 4} 6, ${x + 6} 16, ${x} 24 Z`} fill="#eaf3ff" stroke={INK} strokeWidth="1.6" />
            <path d={`M${x} 20 C ${x - 2.4} 15, ${x - 1.6} 9, ${x} 6`} fill="none" stroke="#a9d4ff" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        ))}
        {/* The shell, its blue bands, and the visor. */}
        <ellipse cx="32" cy="37" rx="22.5" ry="17" fill={SHELL} stroke={INK} strokeWidth="1.8" />
        <path d="M14.5 27 Q 10 37 14.5 47" fill="none" stroke={BAND} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M49.5 27 Q 54 37 49.5 47" fill="none" stroke={BAND} strokeWidth="3.4" strokeLinecap="round" />
        <rect x="17.5" y="27.5" width="29" height="19" rx="6.5" fill="#0b0d12" />
        <path d="M21 30 q4 -1.6 9 -1.2" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        {peek && mood === 'sleepy' ? (
          <>
            <g className="transition-opacity duration-200 group-hover:opacity-0">
              <Face mood="sleepy" />
            </g>
            <g className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Face mood="happy" />
            </g>
          </>
        ) : (
          <Face mood={mood} />
        )}
        {mood === 'sleepy' && (
          // A drawn "z", not a letter, so the button's words stay just "Luna".
          <path d="M52 12 h6 l-6 7 h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" className={peek ? 'transition-opacity duration-200 group-hover:opacity-0' : ''} />
        )}
      </g>
    </svg>
  );
}
